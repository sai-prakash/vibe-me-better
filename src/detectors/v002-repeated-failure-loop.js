import crypto from 'node:crypto';
import {
  classifyVerificationCommand,
  inferVerificationOutcome,
} from '../core/verification.js';

export const detector = {
  id: 'V002',
  name: 'REPEATED_FAILURE_LOOP',
  version: 1,
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

function normalizeFailureLine(line) {
  return line
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/(?:\/[^/\s:]+)+\/([^/\s:]+)(?=:\d|\s|$)/g, '$1')
    .replace(/:(\d+):(\d+)/g, ':#:#')
    .replace(/\b\d+(?:\.\d+)?ms\b/gi, '<duration>')
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
    .filter((line) => /\b(error|failed|failure|assert(?:ion)?|exception|typeerror|referenceerror|syntaxerror|cannot|not found|expected|actual|ts\d{4})\b/i.test(line))
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

function attemptEvidence(attempt, index) {
  return {
    type: 'repeated_failure_attempt',
    attempt: index + 1,
    command: attempt.call.command,
    commandFingerprint: hash(attempt.commandFingerprint),
    failureFingerprint: attempt.failure.hash,
    failure: attempt.failure.label,
    output: attempt.result.output,
    callEvent: attempt.call.rawRef,
    resultEvent: attempt.result.rawRef,
    timestamp: attempt.result.timestamp,
  };
}

export function detectRepeatedFailureLoop(events, { threshold = 3 } = {}) {
  const calls = new Map();
  const mutations = [];
  const runs = [];

  for (const event of events) {
    if (event.kind === 'tool.call') {
      if (event.toolUseId) calls.set(event.toolUseId, event);
      if (MUTATION_TOOLS.has(event.toolName)) mutations.push(event.sequence);
      continue;
    }

    if (event.kind !== 'tool.result') continue;
    const call = calls.get(event.toolUseId);
    if (!call) continue;
    const kind = classifyVerificationCommand(call.command ?? '');
    if (!kind) continue;

    const outcome = inferVerificationOutcome(event);
    const failure = outcome.outcome === 'fail' ? fingerprintFailure(event.output) : null;
    runs.push({
      kind,
      call,
      result: event,
      outcome: outcome.outcome,
      commandFingerprint: normalizeVerificationCommand(call.command ?? ''),
      failure,
    });
  }

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
      summary: `The same ${cluster.kind} failure fingerprint repeated ${attempts.length} times with code edits between attempts.`,
      kind: cluster.kind,
      attempts: attempts.length,
      commandFingerprint: hash(cluster.commandFingerprint),
      failureFingerprint: cluster.failureHash,
      failure: attempts[0].failure.label,
      durationMs: durationMs(attempts),
      evidence: attempts.map(attemptEvidence),
    });
  }

  for (const run of runs) {
    const key = run.commandFingerprint;
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
        commandFingerprint: run.commandFingerprint,
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
        commandFingerprint: run.commandFingerprint,
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
