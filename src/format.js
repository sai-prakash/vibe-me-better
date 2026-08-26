import path from 'node:path';

function compactOutput(output = '') {
  const firstLine = output.split(/\r?\n/).find((line) => line.trim());
  if (!firstLine) return null;
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
}

function compactCommand(command = '') {
  const flat = String(command).replace(/\s+/g, ' ').trim();
  return flat.length > 110 ? `${flat.slice(0, 107)}...` : flat;
}

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)}K`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)}M`;
  return `${(bytes / 1024 ** 3).toFixed(1)}G`;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return null;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function shortProjectKey(key = '') {
  return key.length <= 54 ? key : `…${key.slice(-53)}`;
}

function addSessionIdentity(lines, result, indent = '') {
  if (result.sessionRef) lines.push(`${indent}Ref: ${result.sessionRef}`);
  if (result.sessionId) lines.push(`${indent}Session ID: ${result.sessionId}`);
  if (result.sessionType) lines.push(`${indent}Type: ${result.sessionType}`);
  if (result.parentSessionId) lines.push(`${indent}Parent: ${result.parentSessionId}`);
}

function countsText(counts = {}) {
  return `V001=${counts.V001 ?? 0} · V002=${counts.V002 ?? 0}`;
}

function formatIncident(lines, incident, index) {
  lines.push(`${index + 1}. [${incident.evidenceClass}] ${incident.detectorId} ${incident.detectorName}`);
  lines.push(`   ${incident.summary}`);

  if (incident.detectorId === 'V001') {
    const commandEvidence = incident.evidence.find((item) => item.type === 'verification_command');
    const resultEvidence = incident.evidence.find((item) => item.type === 'verification_result');
    lines.push(`   Command: ${commandEvidence?.command ?? 'unknown'}`);
    lines.push(`   Exit: ${resultEvidence?.exitCode ?? (resultEvidence?.isError ? 'error' : 'unknown')}`);
    if (resultEvidence?.outcomeSource) {
      lines.push(`   Evidence: ${resultEvidence.outcomeSource}${resultEvidence.outcomeEvidence ? ` · ${resultEvidence.outcomeEvidence}` : ''}`);
    }
    const output = compactOutput(resultEvidence?.output);
    if (output) lines.push(`   Output: ${output}`);
    if (incident.claim?.event?.line) {
      lines.push(`   Claim: ${path.basename(incident.claim.event.path)}:${incident.claim.event.line}`);
    }
    lines.push('');
    return;
  }

  if (incident.detectorId === 'V002') {
    const first = incident.evidence[0];
    lines.push(`   Attempts: ${incident.attempts}`);
    lines.push(`   Loop type: ${incident.loopType ?? 'unknown'}`);
    lines.push(`   Failure domain: ${incident.failureDomain ?? first?.failureDomain ?? 'unknown'}`);
    lines.push(`   Family: ${incident.commandFamily ?? first?.commandFamily ?? 'unknown'}`);
    lines.push(`   Failure: ${incident.failure}`);
    lines.push(`   Command: ${compactCommand(first?.command ?? 'unknown')}`);
    lines.push(`   Failure fingerprint: ${incident.failureFingerprint}`);
    const duration = formatDuration(incident.durationMs);
    if (duration) lines.push(`   Span: ${duration}`);
    lines.push('   Receipts:');
    for (const attempt of incident.evidence) {
      const location = attempt.resultEvent?.line
        ? `${path.basename(attempt.resultEvent.path)}:${attempt.resultEvent.line}`
        : 'unknown';
      lines.push(`     #${attempt.attempt} ${location}`);
    }
    lines.push('');
    return;
  }

  lines.push('');
}

export function formatScanResult(result) {
  const lines = [];
  lines.push('Vibe Lint');
  lines.push(`Session: ${result.source} · ${path.basename(result.filePath)}`);
  addSessionIdentity(lines, result);
  lines.push(`Detectors: ${countsText(result.detectorCounts)}`);
  lines.push('');

  if (result.incidents.length === 0) {
    lines.push('No Vibe incidents found.');
    lines.push(`Normalized events analyzed: ${result.eventCount}`);
    lines.push(`Run \`vibe inspect ${result.sessionRef ?? '<session>'} --failures\` to audit failure evidence.`);
    return lines.join('\n');
  }

  lines.push(`${result.incidents.length} incident${result.incidents.length === 1 ? '' : 's'} found`);
  lines.push('');
  result.incidents.forEach((incident, index) => formatIncident(lines, incident, index));
  return lines.join('\n').trimEnd();
}

export function formatInspection(result) {
  const lines = [
    'Vibe Inspect',
    `Session: ${result.source} · ${path.basename(result.filePath)}`,
  ];
  addSessionIdentity(lines, result);
  lines.push(
    '',
    'Evidence coverage',
    `  Raw JSONL records:      ${result.rawLineCount}`,
    `  Normalized events:      ${result.eventCount}`,
    `  Assistant messages:     ${result.assistantMessages}`,
    `  Tool calls:             ${result.toolCalls}`,
    `  Bash calls:             ${result.bashCalls}`,
    `  File mutation calls:    ${result.fileMutationCalls}`,
    `  Linked subagents:       ${result.subagents.length}`,
  );

  if (result.subagents.length > 0) {
    lines.push('', 'Linked subagents');
    for (const subagent of result.subagents) {
      lines.push(`  ${subagent.sessionRef}  ${subagent.sessionId}`);
    }
  }

  const tools = Object.entries(result.toolCallsByName).sort((a, b) => b[1] - a[1]);
  if (tools.length > 0) {
    lines.push('', 'Tool calls');
    for (const [name, count] of tools.slice(0, 12)) {
      lines.push(`  ${name.padEnd(20)} ${count}`);
    }
  }

  lines.push('', 'Verification');
  lines.push(`  Total runs:             ${result.verification.total}`);
  lines.push(`  Passed:                 ${result.verification.byOutcome.pass}`);
  lines.push(`  Failed:                 ${result.verification.byOutcome.fail}`);
  lines.push(`  Unknown:                ${result.verification.byOutcome.unknown}`);

  for (const [kind, summary] of Object.entries(result.verification.byKind)) {
    lines.push(`  ${kind.padEnd(10)} ${summary.total} total · ${summary.pass} pass · ${summary.fail} fail · ${summary.unknown} unknown`);
  }

  lines.push('', 'Verification claims');
  lines.push(`  Total:                  ${result.claims.total}`);
  lines.push(`  Supported:              ${result.claims.supported}`);
  lines.push(`  Contradicted:           ${result.claims.contradicted}`);
  lines.push(`  Unknown/no evidence:    ${result.claims.unknown}`);

  lines.push('', 'Command failure evidence');
  lines.push(`  Bash results paired:    ${result.failures.bashRuns}`);
  lines.push(`  Clear failures:         ${result.failures.failed}`);
  lines.push(`  Fingerprintable:        ${result.failures.fingerprintable}`);
  lines.push(`  External blockers:      ${result.failures.externalBlockers}`);
  lines.push(`  Repeated groups (>=2):  ${result.failures.repeatedGroups}`);
  lines.push(`  V002 loops (>=3):       ${result.behavior.repeatedFailureLoops}`);
  lines.push(`    blocked retries:      ${result.behavior.blockedRetryLoops}`);
  lines.push(`    failed-fix retries:   ${result.behavior.failedFixRetryLoops}`);

  const domains = Object.entries(result.failures.domainCounts ?? {}).sort((a, b) => b[1] - a[1]);
  if (domains.length > 0) {
    lines.push('', 'Failure domains');
    for (const [domain, count] of domains) {
      lines.push(`  ${domain.padEnd(20)} ${count}`);
    }
  }

  if (result.failures.groups.length > 0) {
    lines.push('', 'Repeated failure groups');
    for (const group of result.failures.groups.slice(0, 10)) {
      lines.push(`  ${group.count}× ${group.domain} · ${group.family} · ${group.failureFingerprint}`);
      lines.push(`     ${group.failure}`);
    }
  }

  if (result.failures.items.length > 0) {
    lines.push('', 'Failed command receipts');
    for (const item of result.failures.items.slice(0, 30)) {
      const location = item.resultEvent?.line
        ? `${path.basename(item.resultEvent.path)}:${item.resultEvent.line}`
        : 'unknown';
      lines.push(`  ${location} · ${item.domain ?? 'unknown'} · ${item.family} · ${item.failureFingerprint ?? 'no-fingerprint'}`);
      lines.push(`     ${compactCommand(item.command)}`);
      if (item.failure) lines.push(`     ${item.failure}`);
    }
    if (result.failures.items.length > 30) {
      lines.push(`  … ${result.failures.items.length - 30} more (use --json for all)`);
    }
  }

  if (result.verification.unknownRuns.length > 0) {
    lines.push('', 'Unknown verification receipts');
    for (const run of result.verification.unknownRuns.slice(0, 20)) {
      const location = run.resultEvent?.line
        ? `${path.basename(run.resultEvent.path)}:${run.resultEvent.line}`
        : 'unknown';
      lines.push(`  ${location} · ${run.kind} · ${compactCommand(run.command)}`);
    }
    if (result.verification.unknownRuns.length > 20) {
      lines.push(`  … ${result.verification.unknownRuns.length - 20} more (use --json for all)`);
    }
  }

  if (result.diagnostics.length > 0) {
    lines.push('', `Parser diagnostics: ${result.diagnostics.length}`);
  }

  return lines.join('\n');
}

export function formatCorpusInventory(corpus) {
  const lines = [
    'Vibe Sessions',
    `Claude root: ${corpus.projectsRoot}`,
    '',
    `Projects: ${corpus.totals.projects} · Main: ${corpus.totals.mainSessions} · Subagents: ${corpus.totals.subagents} · Size: ${formatBytes(corpus.totals.sizeBytes)}`,
    '',
    'Projects',
    'Main  Sub   Size    Project',
    '────  ───   ─────   ──────────────────────────────────────────────────────',
  ];

  for (const project of corpus.projects) {
    lines.push(
      `${String(project.mainSessions.length).padStart(4)}  ${String(project.subagents.length).padStart(3)}   ${formatBytes(project.sizeBytes).padStart(5)}   ${shortProjectKey(project.projectKey)}`,
    );
  }

  if (corpus.projects.length === 0) {
    lines.push('(no Claude transcripts found)');
    return lines.join('\n');
  }

  lines.push('', 'Sessions');
  for (const project of corpus.projects) {
    const sessions = [...project.mainSessions, ...project.subagents]
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    for (const session of sessions) {
      lines.push(`${session.sessionRef}  ${session.type.padEnd(8)}  ${formatBytes(session.sizeBytes).padStart(6)}  ${session.sessionId}`);
      lines.push(`    project: ${shortProjectKey(session.projectKey)}`);
      if (session.parentSessionId) lines.push(`    parent:  ${session.parentSessionId}`);
    }
  }

  lines.push('', 'Pick any session with:');
  lines.push('  vibe inspect <ref|session-id>');
  lines.push('  vibe scan <ref|session-id>');
  return lines.join('\n');
}

export function formatBulkScan(result) {
  const lines = [
    'Vibe Lint · Claude corpus',
    '',
    `Projects: ${result.totals.projects}`,
    `Parent sessions scanned: ${result.totals.scannedMainSessions}`,
    `Subagents scanned: ${result.totals.scannedSubagents}`,
    `Normalized events: ${result.totals.events}`,
    `Incidents: ${result.totals.incidents}`,
    `V001 incidents: ${result.totals.detectorCounts?.V001 ?? 0}`,
    `V002 incidents: ${result.totals.detectorCounts?.V002 ?? 0}`,
  ];

  if (result.totals.errors > 0) lines.push(`Parse errors: ${result.totals.errors}`);

  lines.push('', 'Sessions scanned');
  for (const session of result.sessions) {
    lines.push(
      `${session.sessionRef}  ${session.sessionType.padEnd(8)}  events=${String(session.eventCount).padStart(5)}  ${countsText(session.detectorCounts)}  ${session.sessionId}`,
    );
  }

  lines.push('');
  const withIncidents = result.sessions.filter((session) => session.incidents.length > 0);
  if (withIncidents.length === 0) {
    lines.push(`No Vibe incidents found across ${result.totals.scannedSessions} transcript${result.totals.scannedSessions === 1 ? '' : 's'}.`);
    lines.push('Pick a ref above and run `vibe inspect <ref> --failures` to audit the failed commands Vibe considered.');
    return lines.join('\n');
  }

  lines.push('Incidents');
  for (const session of withIncidents) {
    lines.push(`${session.incidents.length} · ${session.sessionType} · ${session.sessionRef} · ${session.sessionId}`);
    lines.push(`    project: ${shortProjectKey(session.projectKey)}`);
    for (const incident of session.incidents) {
      lines.push(`    [${incident.evidenceClass}] ${incident.detectorId} ${incident.detectorName} · ${incident.title}`);
    }
  }

  return lines.join('\n');
}
