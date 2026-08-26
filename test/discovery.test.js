import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  discoverClaudeCorpus,
  encodeClaudeProjectPath,
  findClaudeSubagentsForTranscript,
} from '../src/discovery/claude.js';

test('Claude project path encoding follows documented non-alphanumeric replacement', () => {
  const encoded = encodeClaudeProjectPath('/Users/sai/code/vibe-me-better');
  assert.equal(encoded, '-Users-sai-code-vibe-me-better');
});

test('Claude corpus discovery separates parent sessions from subagents', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-claude-'));
  try {
    const project = path.join(root, 'projects', '-Users-sai-code-app');
    const session = 'session-123';
    const parent = path.join(project, `${session}.jsonl`);
    const subagents = path.join(project, session, 'subagents');
    fs.mkdirSync(subagents, { recursive: true });
    fs.writeFileSync(parent, '{}\n');
    fs.writeFileSync(path.join(subagents, 'agent-a.jsonl'), '{}\n');
    fs.writeFileSync(path.join(subagents, 'agent-b.jsonl'), '{}\n');

    const corpus = discoverClaudeCorpus({ CLAUDE_CONFIG_DIR: root });
    assert.equal(corpus.totals.projects, 1);
    assert.equal(corpus.totals.mainSessions, 1);
    assert.equal(corpus.totals.subagents, 2);
    assert.equal(corpus.projects[0].mainSessions[0].type, 'main');
    assert.equal(corpus.projects[0].subagents[0].type, 'subagent');

    const linked = findClaudeSubagentsForTranscript(parent);
    assert.equal(linked.length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Claude corpus discovery is empty when projects root does not exist', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-claude-empty-'));
  try {
    const corpus = discoverClaudeCorpus({ CLAUDE_CONFIG_DIR: root });
    assert.deepEqual(corpus.totals, {
      projects: 0,
      mainSessions: 0,
      subagents: 0,
      sizeBytes: 0,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
