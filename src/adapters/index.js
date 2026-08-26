import { parseClaudeTranscript } from './claude.js';

export function parseTranscript(filePath, source = 'claude') {
  const normalized = source.toLowerCase();
  if (normalized === 'claude' || normalized === 'claude-code') {
    return parseClaudeTranscript(filePath);
  }
  if (normalized === 'codex') {
    throw new Error('Codex adapter is planned for the next milestone; use --source claude for now.');
  }
  throw new Error(`Unsupported source: ${source}`);
}
