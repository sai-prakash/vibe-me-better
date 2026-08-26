import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  discoverClaudeCorpus,
  resolveClaudeSession,
} from '../src/discovery/claude.js';
import {
  formatBulkScan,
  formatCorpusInventory,
} from '../src/format.js';

function createSession(project, sessionId, subagentName = null) {
  const parent = path.join(project, `${sessionId}.jsonl`);
  fs.writeFileSync(parent, '{}\n');
  if (subagentName) {
    const subagentDir = path.join(project, sessionId, 'subagents');
    fs.mkdirSync(subagentDir, { recursive: true });
    fs.writeFileSync(path.join(subagentDir, `${subagentName}.jsonl`), '{}\n');
  }
  return parent;
}

test('Claude sessions get stable refs and can be resolved by ref, full ID, or unique prefix', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-session-ref-'));
  try {
    const project = path.join(root, 'projects', '-Users-sai-code-social-engine');
    fs.mkdirSync(project, { recursive: true });
    createSession(project, '95b63c43-8fb0-4b77-b5a6-6f82fdf4f09c', 'agent-a');
    createSession(project, '89dc85e6-2e86-4e50-a9ce-6d6043949084', 'agent-a');

    const env = { CLAUDE_CONFIG_DIR: root };
    const corpus = discoverClaudeCorpus(env);
    const main = corpus.projects[0].mainSessions.find((item) => item.sessionId.startsWith('95b63c43'));
    const subagents = corpus.projects[0].subagents;

    assert.match(main.sessionRef, /^v_[a-f0-9]{16}$/);
    assert.equal(resolveClaudeSession(main.sessionRef, env).filePath, main.filePath);
    assert.equal(resolveClaudeSession(main.sessionId, env).filePath, main.filePath);
    assert.equal(resolveClaudeSession('95b63c43', env).filePath, main.filePath);

    assert.equal(subagents.length, 2);
    assert.notEqual(subagents[0].sessionRef, subagents[1].sessionRef);
    assert.ok(subagents.every((item) => item.parentSessionId));
    assert.throws(
      () => resolveClaudeSession('agent-a', env),
      /Ambiguous Claude session selector/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('session inventory and bulk scan formatting expose pickable refs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-session-format-'));
  try {
    const project = path.join(root, 'projects', '-Users-sai-code-app');
    fs.mkdirSync(project, { recursive: true });
    createSession(project, '95b63c43-8fb0-4b77-b5a6-6f82fdf4f09c');
    const env = { CLAUDE_CONFIG_DIR: root };
    const corpus = discoverClaudeCorpus(env);
    const session = corpus.projects[0].mainSessions[0];

    const inventory = formatCorpusInventory(corpus);
    assert.match(inventory, new RegExp(session.sessionRef));
    assert.match(inventory, /95b63c43-8fb0-4b77-b5a6-6f82fdf4f09c/);
    assert.match(inventory, /vibe inspect <ref\|session-id>/);

    const bulk = formatBulkScan({
      totals: {
        projects: 1,
        scannedMainSessions: 1,
        scannedSubagents: 0,
        scannedSessions: 1,
        events: 42,
        incidents: 0,
        errors: 0,
      },
      sessions: [{
        sessionRef: session.sessionRef,
        sessionId: session.sessionId,
        sessionType: 'main',
        eventCount: 42,
        incidents: [],
        projectKey: session.projectKey,
      }],
    });
    assert.match(bulk, new RegExp(session.sessionRef));
    assert.match(bulk, /events=\s*42/);
    assert.match(bulk, /vibe inspect <ref>/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
