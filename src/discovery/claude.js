import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function encodeClaudeProjectPath(cwd) {
  return path.resolve(cwd).replace(/[^A-Za-z0-9]/g, '-');
}

export function claudeConfigDir(env = process.env) {
  return env.CLAUDE_CONFIG_DIR
    ? path.resolve(env.CLAUDE_CONFIG_DIR)
    : path.join(os.homedir(), '.claude');
}

export function findLatestClaudeTranscript(cwd = process.cwd(), env = process.env) {
  const projectsRoot = path.join(claudeConfigDir(env), 'projects');
  const projectDir = path.join(projectsRoot, encodeClaudeProjectPath(cwd));

  if (!fs.existsSync(projectDir)) return null;

  const candidates = fs.readdirSync(projectDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => {
      const filePath = path.join(projectDir, entry.name);
      return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return candidates[0]?.filePath ?? null;
}
