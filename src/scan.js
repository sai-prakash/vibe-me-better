import { parseTranscript } from './adapters/index.js';
import { detectClaimWithoutEvidence } from './detectors/v001-claim-without-evidence.js';
import { claudeTranscriptIdentity } from './discovery/claude.js';

export function scanTranscript(filePath, { source = 'claude' } = {}) {
  const parsed = parseTranscript(filePath, source);
  const identity = source === 'claude' ? claudeTranscriptIdentity(parsed.filePath) : null;
  const incidents = [
    ...detectClaimWithoutEvidence(parsed.events),
  ];

  return {
    source: parsed.source,
    filePath: parsed.filePath,
    sessionId: identity?.sessionId ?? null,
    sessionRef: identity?.sessionRef ?? null,
    sessionType: identity?.type ?? null,
    parentSessionId: identity?.parentSessionId ?? null,
    projectKey: identity?.projectKey ?? null,
    diagnostics: parsed.diagnostics,
    eventCount: parsed.events.length,
    incidents,
  };
}
