import crypto from 'node:crypto';
import {
  classifyVerificationCommand,
  inferVerificationOutcome,
} from '../core/verification.js';

export const detector = {
  id: 'V002',
  name: 'REPEATED_FAILURE_LOOP',
  version: 2,
};

const MUTATION_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);
const MAX_GAP_MS = 30 * 60 * 1000;

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
}

export function normalizeVerificationCommand(command = '') {
  return String(command)
    .replace(/\s+2>&1/g, ' ')
    .replace(/\s*\|\s*(?:tail|head|grep)\b[^;&]*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function cleanCommand(command = '') {
  return normalizeVerificationCommand(command)
    .replace(/^set\s+-[a-z]+\s*;\s*/i, '')
    .replace(/^cd\s+[^;&]+\s*&&\s*/i, '')
    .trim();
}

export function commandFamily(command = '') {
  const normalized = cleanCommand(command);
  const verificationKind = classifyVerificationCommand(normalized);
  if (verificationKind) {
    if (/\bdeno(?:@[^\s]+)?\s+test\b/i.test(normalized)) return `${verificationKind}:deno`;
    if (/\bnode\s+--test\b/i.test(normalized)) return `${verificationKind}:node`;
    if (/\bvitest\b/i.test(normalized)) return `${verificationKind}:vitest`;
    if (/\bjest\b/i.test(normalized)) return `${verificationKind}:jest`;
    if (/\bpnpm\b/i.test(normalized)) return `${verificationKind}:pnpm`;
    if (/\byarn\b/i.test(normalized)) return `${verificationKind}:yarn`;
    if (/\bnpm\b/i.test(normalized)) return `${verificationKind}:npm`;
    return verificationKind;
  }

  const packageCommand = normalized.match(/\b(npm|pnpm|yarn)\s+(?:run\s+)?([^\s;&|]+)/i);
  if (packageCommand) return `command:${packageCommand[1].toLowerCase()}:${packageCommand[2].toLowerCase()}`;

  const npxCommand = normalized.match(/\bnpx\s+(?:--yes\s+)?([^\s;&|]+)(?:\s+([^\s;&|]+))?/i);
  if (npxCommand) {
    const executable = npxCommand[1].replace(/@[^\s]+$/, '').toLowerCase();
    return `command:npx:${executable}${npxCommand[2] ? `:${npxCommand[2].toLowerCase()}` : ''}`;
  }

  const common = normalized.match(/\b(git|supabase|docker|python3?|node|deno|curl|gh)\s+([^\s;&|]+)/i);
  if (common) return `command:${common[1].toLowerCase()}:${common[2].toLowerCase()}`;

  const generic = normalized.match(/(?:^|[;&]\s*)([a-z0-9_.\/-]+)(?:\s+([^\s;&|]+))?/i);
  if (!generic) return 'command:bash';
  const executable = generic[1].split('/').at(-1)?.toLowerCase() ?? 'bash';
  const subcommand = generic[2]?.toLowerCase();
  return `command:${executable}${subcommand ? `:${subcommand}` : ''}`;
}

function normalizeFailureLine(line) {
  return line
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/(?:\/[^/\s:]+)+\/([^/\s:]+)(?=:\d|\s|$)/g, '$1')
    .replace(/:(\d+):(\d+)/g, ':#:#')
    .replace(/\b\d+(?:\.\d+)?ms\b/gi, '<duration>')
    .replace(/\b(?:pid|port)\s*[=:]\s*\d+\b/gi, '$1=<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function fingerprintFailure(output = '') {
  const lines = String(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\d+\s+passed\s*[|/]\s*\d+\s+failed/i.test(line))
    .filter((line) => !/^ℹ\s*(?:pass|fail)\s+\d+/i.test(line));

  const salient = lines
    .filter((line) => /\b(error|failed|failure|assert(?:ion)?|exception|typeerror|referenceerror|syntaxerror|cannot|not found|no such file|no matches found|expected|actual|unavailable|timed out|timeout|etarget|no matching version|ts\d{4}|found\s+\d+\s+errors?)\b/i.test(line))
    .map(normalizeFailureLine)
    .filter(Boolean)
    .slice(0, 3);

  if (salient.length === 0) return null;
  const text = salient.join('\n');
  return {
    hash: hash(text),
    text,
    label: salient[0],
  };
}

function parseTime(timestamp) {
  if (!timestamp) return null;
  const value = Date.parse(timestamp);
  return Number.isFinite(value) ? value : null;
}

function durationMs(attempts) {
  const first = parseTime(attempts[0]?.call.timestamp);
  const last = parseTime(attempts.at(-1)?.result.timestamp);
  if (first === null || last === null || last < first) return null;
  return last - first;
}

function clearCommandOutcome(event, verificationKind) {
  if (verificationKind) return inferVerificationOutcome(event).outcome;
  if (Number.isInteger(event.exitCode)) return event.exitCode === 0 ? 'pass' : 'fail';
  if (event.isError === true) return 'fail';
  return 'unknown';
}

export function collectFailureAttempts(events) {
  const calls = new Map();
  const runs = [];

  for (const event of events) {
    if (event.kind === 'tool.call') {
      if (event.toolUseId) calls.set(event.toolUseId, event);
      continue;
    }
    if (event.kind !== 'tool.result') continue;

    const call = calls.get(event.toolUseId);
    if (!call || call.toolName !== 'Bash') continue;

    const verificationKind = classifyVerificationCommand(call.command ?? '');
    const outcome = clearCommandOutcome(event, verificationKind);
    const failure = outcome === 'fail' ? fingerprintFailure(event.output) : null;
    runs.push({
      kind: verificationKind ?? 'command',
      family: commandFamily(call.command ?? ''),
      call,
      result: event,
      outcome,
      failure,
    });
  }

  return runs;
}

function attemptEvidence(attempt, index) {
  return {
    type: 'repeated_failure_attempt',
    attempt: index + 1,
    command: attempt.call.command,
    commandFamily: attempt.family,
    failureFingerprint: attempt.failure.hash,
    failure: attempt.failure.label,
    output: attempt.result.output,
    callEvent: attempt.call.rawRef,
    resultEvent: attempt.result.rawRef,
    timestamp: attempt.result.timestamp,
  };
}

export function detectRepeatedFailureLoop(events, { threshold = 3 } = {}) {
  const mutations = events
    .filter((event) => event.kind === 'tool.call' && MUTATION_TOOLS.has(event.toolName))
    .map((event) => event.sequence);
  const runs = collectFailureAttempts(events);
  const incidents = [];
  const active = new Map();

  function finalize(cluster) {
    if (!cluster || cluster.attempts.length < threshold) return;
    const attempts = cluster.attempts;
    incidents.push({
      detectorId: detector.id,
      detectorName: detector.name,
      detectorVersion: detector.version,
      evidenceClass: 'B',
      title: `${cluster.kind} failure repeated ${attempts.length} times`,
      summary: `The same failure fingerprint repeated ${attempts.length} times in the ${cluster.family} command family with code edits between attempts.`,
      kind: cluster.kind,
      commandFamily: cluster.family,
      attempts: attempts.length,
      failureFingerprint: cluster.failureHash,
      failure: attempts[0].failure.label,
      durationMs: durationMs(attempts),
      evidence: attempts.map(attemptEvidence),
    });
  }

  for (const run of runs) {
    const key = run.family;
    const current = active.get(key);

    if (run.outcome !== 'fail' || !run.failure) {
      finalize(current);
      active.delete(key);
      continue;
    }

    if (!current || current.failureHash !== run.failure.hash) {
      finalize(current);
      active.set(key, {
        kind: run.kind,
        family: run.family,
        failureHash: run.failure.hash,
        attempts: [run],
      });
      continue;
    }

    const previous = current.attempts.at(-1);
    const mutated = mutations.some(
      (sequence) => sequence > previous.result.sequence && sequence < run.call.sequence,
    );
    const previousTime = parseTime(previous.result.timestamp);
    const currentTime = parseTime(run.call.timestamp);
    const gapTooLarge = previousTime !== null && currentTime !== null
      ? currentTime - previousTime > MAX_GAP_MS
      : false;

    if (!mutated || gapTooLarge) {
      finalize(current);
      active.set(key, {
        kind: run.kind,
        family: run.family,
        failureHash: run.failure.hash,
        attempts: [run],
      });
      continue;
    }

    current.attempts.push(run);
  }

  for (const cluster of active.values()) finalize(cluster);
  return incidents;
}
