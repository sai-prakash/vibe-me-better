import path from 'node:path';

function compactOutput(output = '') {
  const firstLine = output.split(/\r?\n/).find((line) => line.trim());
  if (!firstLine) return null;
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
}

export function formatScanResult(result) {
  const lines = [];
  lines.push('Vibe Lint');
  lines.push(`Session: ${result.source} · ${path.basename(result.filePath)}`);
  lines.push('');

  if (result.incidents.length === 0) {
    lines.push('No V001 contradictions found.');
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
    const output = compactOutput(resultEvidence?.output);
    if (output) lines.push(`   Output: ${output}`);
    if (incident.claim?.event?.line) {
      lines.push(`   Claim: ${path.basename(incident.claim.event.path)}:${incident.claim.event.line}`);
    }
    lines.push('');
  });

  return lines.join('\n').trimEnd();
}
