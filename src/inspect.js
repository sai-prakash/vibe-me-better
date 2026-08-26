import fs from 'node:fs';
import { parseTranscript } from './adapters/index.js';
import {
  classifyVerificationCommand,
  extractVerificationClaims,
  inferVerificationOutcome,
} from './core/verification.js';
import {
  collectFailureAttempts,
  detectRepeatedFailureLoop,
} from './detectors/v002-repeated-failure-loop.js';
import {
  claudeTranscriptIdentity,
  findClaudeSubagentsForTranscript,
} from './discovery/claude.js';

function rawLineCount(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return text.split(/\r?\n/).filter((line) => line.trim()).length;
}

export function inspectTranscript(filePath, { source = 'claude', includeFailures = false } = {}) {
  const parsed = parseTranscript(filePath, source);
  const identity = source === 'claude' ? claudeTranscriptIdentity(parsed.filePath) : null;
  const calls = new Map();
  const verificationRuns = [];
  const toolCallsByName = {};
  const claims = [];

  for (const event of parsed.events) {
    if (event.kind === 'tool.call') {
      const name = event.toolName ?? 'unknown';
      toolCallsByName[name] = (toolCallsByName[name] ?? 0) + 1;
      if (event.toolUseId) calls.set(event.toolUseId, event);
      continue;
    }

    if (event.kind === 'tool.result') {
      const call = calls.get(event.toolUseId);
      if (!call) continue;
      const kind = classifyVerificationCommand(call.command ?? '');
      if (!kind) continue;
      const outcome = inferVerificationOutcome(event);
      verificationRuns.push({
        kind,
        command: call.command,
        outcome: outcome.outcome,
        outcomeSource: outcome.source,
        outcomeEvidence: outcome.evidence,
        callEvent: call.rawRef,
        resultEvent: event.rawRef,
        sequence: event.sequence,
      });
      continue;
    }

    if (event.kind !== 'message.assistant' || !event.text) continue;
    for (const claim of extractVerificationClaims(event.text)) {
      const candidate = [...verificationRuns]
        .reverse()
        .find((run) => run.kind === claim.kind && run.sequence < event.sequence);

      let status = 'unknown';
      if (candidate?.outcome === 'pass') status = 'supported';
      if (candidate?.outcome === 'fail') status = 'contradicted';

      claims.push({
        ...claim,
        status,
        event: event.rawRef,
        verification: candidate ?? null,
      });
    }
  }

  const byOutcome = { pass: 0, fail: 0, unknown: 0 };
  const byKind = {};
  for (const run of verificationRuns) {
    byOutcome[run.outcome] = (byOutcome[run.outcome] ?? 0) + 1;
    byKind[run.kind] ??= { total: 0, pass: 0, fail: 0, unknown: 0 };
    byKind[run.kind].total += 1;
    byKind[run.kind][run.outcome] += 1;
  }

  const claimSummary = { total: claims.length, supported: 0, contradicted: 0, unknown: 0 };
  for (const claim of claims) claimSummary[claim.status] += 1;

  const repeatedFailureLoops = detectRepeatedFailureLoop(parsed.events);
  const commandRuns = collectFailureAttempts(parsed.events);
  const failedRuns = commandRuns.filter((run) => run.outcome === 'fail');
  const fingerprintable = failedRuns.filter((run) => run.failure);
  const groupCounts = new Map();
  for (const run of fingerprintable) {
    const key = `${run.family}|${run.failure.hash}`;
    const existing = groupCounts.get(key) ?? {
      family: run.family,
      failureFingerprint: run.failure.hash,
      failure: run.failure.label,
      count: 0,
    };
    existing.count += 1;
    groupCounts.set(key, existing);
  }
  const repeatedGroups = [...groupCounts.values()]
    .filter((group) => group.count >= 2)
    .sort((a, b) => b.count - a.count);

  return {
    source: parsed.source,
    filePath: parsed.filePath,
    sessionId: identity?.sessionId ?? null,
    sessionRef: identity?.sessionRef ?? null,
    sessionType: identity?.type ?? null,
    parentSessionId: identity?.parentSessionId ?? null,
    projectKey: identity?.projectKey ?? null,
    rawLineCount: rawLineCount(parsed.filePath),
    eventCount: parsed.events.length,
    diagnostics: parsed.diagnostics,
    assistantMessages: parsed.events.filter((event) => event.kind === 'message.assistant').length,
    toolCalls: parsed.events.filter((event) => event.kind === 'tool.call').length,
    toolResults: parsed.events.filter((event) => event.kind === 'tool.result').length,
    toolCallsByName,
    bashCalls: toolCallsByName.Bash ?? 0,
    fileMutationCalls: (toolCallsByName.Edit ?? 0) + (toolCallsByName.Write ?? 0) + (toolCallsByName.NotebookEdit ?? 0),
    verification: {
      total: verificationRuns.length,
      byOutcome,
      byKind,
      runs: verificationRuns,
      unknownRuns: includeFailures
        ? verificationRuns.filter((run) => run.outcome === 'unknown')
        : [],
    },
    claims: {
      ...claimSummary,
      items: claims,
    },
    failures: {
      bashRuns: commandRuns.length,
      failed: failedRuns.length,
      fingerprintable: fingerprintable.length,
      repeatedGroups: repeatedGroups.length,
      groups: repeatedGroups,
      items: includeFailures
        ? failedRuns.map((run) => ({
          family: run.family,
          kind: run.kind,
          command: run.call.command,
          failureFingerprint: run.failure?.hash ?? null,
          failure: run.failure?.label ?? null,
          resultEvent: run.result.rawRef,
        }))
        : [],
    },
    behavior: {
      repeatedFailureLoops: repeatedFailureLoops.length,
      loops: repeatedFailureLoops,
    },
    subagents: source === 'claude' ? findClaudeSubagentsForTranscript(parsed.filePath) : [],
  };
}
