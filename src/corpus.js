import { discoverClaudeCorpus } from './discovery/claude.js';
import { scanTranscript } from './scan.js';

export function scanClaudeCorpus({ env = process.env, includeSubagents = true } = {}) {
  const corpus = discoverClaudeCorpus(env);
  const sessions = [];
  const errors = [];

  for (const project of corpus.projects) {
    const files = [
      ...project.mainSessions,
      ...(includeSubagents ? project.subagents : []),
    ];

    for (const item of files) {
      try {
        const result = scanTranscript(item.filePath, { source: 'claude' });
        sessions.push({
          projectKey: project.projectKey,
          sessionType: item.type,
          sessionId: item.sessionId,
          sessionRef: item.sessionRef,
          parentSessionId: item.parentSessionId,
          filePath: item.filePath,
          sizeBytes: item.sizeBytes,
          eventCount: result.eventCount,
          detectorCounts: result.detectorCounts,
          diagnostics: result.diagnostics,
          incidents: result.incidents,
        });
      } catch (error) {
        errors.push({
          projectKey: project.projectKey,
          sessionType: item.type,
          sessionId: item.sessionId,
          sessionRef: item.sessionRef,
          parentSessionId: item.parentSessionId,
          filePath: item.filePath,
          error: error.message,
        });
      }
    }
  }

  const detectorCounts = sessions.reduce((totals, session) => {
    for (const [id, count] of Object.entries(session.detectorCounts ?? {})) {
      totals[id] = (totals[id] ?? 0) + count;
    }
    return totals;
  }, { V001: 0, V002: 0 });

  return {
    source: 'claude-code',
    projectsRoot: corpus.projectsRoot,
    totals: {
      ...corpus.totals,
      scannedSessions: sessions.length,
      scannedMainSessions: sessions.filter((session) => session.sessionType === 'main').length,
      scannedSubagents: sessions.filter((session) => session.sessionType === 'subagent').length,
      events: sessions.reduce((sum, session) => sum + session.eventCount, 0),
      incidents: sessions.reduce((sum, session) => sum + session.incidents.length, 0),
      detectorCounts,
      errors: errors.length,
    },
    sessions,
    errors,
  };
}
