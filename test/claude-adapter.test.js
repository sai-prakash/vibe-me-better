import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseClaudeTranscript } from '../src/adapters/claude.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => path.join(here, 'fixtures', 'claude', name);

test('Claude adapter pairs useful fields into normalized events', () => {
  const parsed = parseClaudeTranscript(fixture('failing-tests-then-claim.jsonl'));
  assert.equal(parsed.diagnostics.length, 0);
  assert.equal(parsed.events.length, 3);

  const [call, result, message] = parsed.events;
  assert.equal(call.kind, 'tool.call');
  assert.equal(call.command, 'npm test');
  assert.equal(result.kind, 'tool.result');
  assert.equal(result.exitCode, 1);
  assert.equal(result.isError, true);
  assert.equal(message.kind, 'message.assistant');
  assert.match(message.text, /tests are passing/i);
});
