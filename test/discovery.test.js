import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeClaudeProjectPath } from '../src/discovery/claude.js';

test('Claude project path encoding follows documented non-alphanumeric replacement', () => {
  const encoded = encodeClaudeProjectPath('/Users/sai/code/vibe-me-better');
  assert.equal(encoded, '-Users-sai-code-vibe-me-better');
});
