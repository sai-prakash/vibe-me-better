import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectTranscript } from '../src/inspect.js';
import { formatInspection } from '../src/format.js';

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
  assert.equal(result.failures.failed, 1);
});

test('inspect distinguishes supported claims from contradictions', () => {
  const result = inspectTranscript(fixture('passing-tests-then-claim.jsonl'));

  assert.equal(result.verification.total, 1);
  assert.equal(result.verification.byOutcome.pass, 1);
  assert.equal(result.claims.total, 1);
  assert.equal(result.claims.supported, 1);
  assert.equal(result.claims.contradicted, 0);
  assert.equal(result.failures.failed, 0);
});

test('inspect --failures data exposes receipts and repeated groups', () => {
  const result = inspectTranscript(fixture('repeated-failure-loop.jsonl'), { includeFailures: true });

  assert.equal(result.failures.failed, 3);
  assert.equal(result.failures.fingerprintable, 3);
  assert.equal(result.failures.repeatedGroups, 1);
  assert.equal(result.failures.items.length, 3);
  assert.equal(result.behavior.repeatedFailureLoops, 1);

  const formatted = formatInspection(result);
  assert.match(formatted, /Command failure evidence/);
  assert.match(formatted, /Repeated failure groups/);
  assert.match(formatted, /Failed command receipts/);
  assert.match(formatted, /V002 loops \(>=3\):\s+1/);
});
