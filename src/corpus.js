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
          filePath: item.filePath,
          eventCount: result.eventCount,
          diagnostics: result.diagnostics,
          incidents: result.incidents,
        });
      } catch (error) {
        errors.push({
          projectKey: project.projectKey,
          sessionType: item.type,
          filePath: item.filePath,
          error: error.message,
        });
      }
    }
  }

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
      errors: errors.length,
    },
    sessions,
    errors,
  };
}
