import { parseTranscript } from './adapters/index.js';
import { detectClaimWithoutEvidence } from './detectors/v001-claim-without-evidence.js';

export function scanTranscript(filePath, { source = 'claude' } = {}) {
  const parsed = parseTranscript(filePath, source);
  const incidents = [
    ...detectClaimWithoutEvidence(parsed.events),
  ];

  return {
    source: parsed.source,
    filePath: parsed.filePath,
    diagnostics: parsed.diagnostics,
    eventCount: parsed.events.length,
    incidents,
  };
}
