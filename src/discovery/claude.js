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

function fileInfo(filePath, type, projectKey) {
  const stat = fs.statSync(filePath);
  return {
    filePath,
    type,
    projectKey,
    sizeBytes: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

function findJsonlRecursively(root, predicate = () => true) {
  if (!fs.existsSync(root)) return [];
  const results = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl') && predicate(fullPath)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

export function findClaudeSubagentsForTranscript(filePath) {
  const resolved = path.resolve(filePath);
  const sessionId = path.basename(resolved, '.jsonl');
  const subagentRoot = path.join(path.dirname(resolved), sessionId, 'subagents');

  return findJsonlRecursively(subagentRoot)
    .map((subagentPath) => fileInfo(subagentPath, 'subagent', path.basename(path.dirname(resolved))))
    .sort((a, b) => a.mtimeMs - b.mtimeMs);
}

export function discoverClaudeCorpus(env = process.env) {
  const projectsRoot = path.join(claudeConfigDir(env), 'projects');
  if (!fs.existsSync(projectsRoot)) {
    return {
      projectsRoot,
      projects: [],
      totals: { projects: 0, mainSessions: 0, subagents: 0, sizeBytes: 0 },
    };
  }

  const projects = fs.readdirSync(projectsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const projectKey = entry.name;
      const projectDir = path.join(projectsRoot, projectKey);
      const mainSessions = fs.readdirSync(projectDir, { withFileTypes: true })
        .filter((candidate) => candidate.isFile() && candidate.name.endsWith('.jsonl'))
        .map((candidate) => fileInfo(path.join(projectDir, candidate.name), 'main', projectKey));

      const subagents = findJsonlRecursively(
        projectDir,
        (candidate) => candidate.split(path.sep).includes('subagents'),
      ).map((candidate) => fileInfo(candidate, 'subagent', projectKey));

      const all = [...mainSessions, ...subagents];
      return {
        projectKey,
        projectDir,
        mainSessions: mainSessions.sort((a, b) => b.mtimeMs - a.mtimeMs),
        subagents: subagents.sort((a, b) => b.mtimeMs - a.mtimeMs),
        sizeBytes: all.reduce((sum, item) => sum + item.sizeBytes, 0),
        lastActivityMs: all.reduce((latest, item) => Math.max(latest, item.mtimeMs), 0),
      };
    })
    .filter((project) => project.mainSessions.length > 0 || project.subagents.length > 0)
    .sort((a, b) => b.sizeBytes - a.sizeBytes);

  return {
    projectsRoot,
    projects,
    totals: {
      projects: projects.length,
      mainSessions: projects.reduce((sum, project) => sum + project.mainSessions.length, 0),
      subagents: projects.reduce((sum, project) => sum + project.subagents.length, 0),
      sizeBytes: projects.reduce((sum, project) => sum + project.sizeBytes, 0),
    },
  };
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
