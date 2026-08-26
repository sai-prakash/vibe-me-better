import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectTranscript } from '../src/inspect.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => path.join(here, 'fixtures', 'claude', name);

test('inspect explains a contradicted verification claim with coverage counts', () => {
  const result = inspectTranscript(fixture('failing-tests-then-claim.jsonl'));

  assert.equal(result.rawLineCount, 3);
  assert.equal(result.eventCount, 3);
  assert.equal(result.toolCalls, 1);
  assert.equal(result.bashCalls, 1);
  assert.equal(result.verification.total, 1);
  assert.equal(result.verification.byOutcome.fail, 1);
  assert.equal(result.verification.byKind.test.fail, 1);
  assert.equal(result.claims.total, 1);
  assert.equal(result.claims.contradicted, 1);
  assert.equal(result.claims.supported, 0);
});

test('inspect distinguishes supported claims from contradictions', () => {
  const result = inspectTranscript(fixture('passing-tests-then-claim.jsonl'));

  assert.equal(result.verification.total, 1);
  assert.equal(result.verification.byOutcome.pass, 1);
  assert.equal(result.claims.total, 1);
  assert.equal(result.claims.supported, 1);
  assert.equal(result.claims.contradicted, 0);
});
