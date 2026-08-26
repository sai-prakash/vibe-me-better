import path from 'node:path';

function compactOutput(output = '') {
  const firstLine = output.split(/\r?\n/).find((line) => line.trim());
  if (!firstLine) return null;
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
}

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)}K`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)}M`;
  return `${(bytes / 1024 ** 3).toFixed(1)}G`;
}

function shortProjectKey(key = '') {
  return key.length <= 54 ? key : `…${key.slice(-53)}`;
}

export function formatScanResult(result) {
  const lines = [];
  lines.push('Vibe Lint');
  lines.push(`Session: ${result.source} · ${path.basename(result.filePath)}`);
  lines.push('');

  if (result.incidents.length === 0) {
    lines.push('No V001 contradictions found.');
    lines.push(`Normalized events analyzed: ${result.eventCount}`);
    lines.push('Run `vibe inspect <session.jsonl>` to see verification coverage.');
    return lines.join('\n');
  }

  lines.push(`${result.incidents.length} incident${result.incidents.length === 1 ? '' : 's'} found`);
  lines.push('');

  result.incidents.forEach((incident, index) => {
    const commandEvidence = incident.evidence.find((item) => item.type === 'verification_command');
    const resultEvidence = incident.evidence.find((item) => item.type === 'verification_result');
    lines.push(`${index + 1}. [${incident.evidenceClass}] ${incident.detectorId} ${incident.detectorName}`);
    lines.push(`   ${incident.summary}`);
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
  });

  return lines.join('\n').trimEnd();
}

export function formatInspection(result) {
  const lines = [
    'Vibe Inspect',
    `Session: ${result.source} · ${path.basename(result.filePath)}`,
    '',
    'Evidence coverage',
    `  Raw JSONL records:      ${result.rawLineCount}`,
    `  Normalized events:      ${result.eventCount}`,
    `  Assistant messages:     ${result.assistantMessages}`,
    `  Tool calls:             ${result.toolCalls}`,
    `  Bash calls:             ${result.bashCalls}`,
    `  File mutation calls:    ${result.fileMutationCalls}`,
    `  Linked subagents:       ${result.subagents.length}`,
  ];

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
    'Main  Sub   Size    Project',
    '────  ───   ─────   ──────────────────────────────────────────────────────',
  ];

  for (const project of corpus.projects) {
    lines.push(
      `${String(project.mainSessions.length).padStart(4)}  ${String(project.subagents.length).padStart(3)}   ${formatBytes(project.sizeBytes).padStart(5)}   ${shortProjectKey(project.projectKey)}`,
    );
  }

  if (corpus.projects.length === 0) lines.push('(no Claude transcripts found)');
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
    `V001 incidents: ${result.totals.incidents}`,
  ];

  if (result.totals.errors > 0) lines.push(`Parse errors: ${result.totals.errors}`);
  lines.push('');

  const withIncidents = result.sessions.filter((session) => session.incidents.length > 0);
  if (withIncidents.length === 0) {
    lines.push(`No V001 contradictions found across ${result.totals.scannedSessions} transcript${result.totals.scannedSessions === 1 ? '' : 's'}.`);
    lines.push('Use `vibe inspect <session.jsonl>` for evidence coverage before treating zero findings as a clean bill of health.');
    return lines.join('\n');
  }

  for (const session of withIncidents) {
    lines.push(`${session.incidents.length} · ${session.sessionType} · ${path.basename(session.filePath)}`);
    lines.push(`    project: ${shortProjectKey(session.projectKey)}`);
    for (const incident of session.incidents) {
      lines.push(`    [${incident.evidenceClass}] ${incident.detectorId} ${incident.detectorName}`);
    }
  }

  return lines.join('\n');
}
