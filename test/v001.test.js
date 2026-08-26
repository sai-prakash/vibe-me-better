import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanTranscript } from '../src/scan.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => path.join(here, 'fixtures', 'claude', name);

test('V001 emits Class A when test success claim contradicts failed test command', () => {
  const result = scanTranscript(fixture('failing-tests-then-claim.jsonl'));
  assert.equal(result.incidents.length, 1);
  const incident = result.incidents[0];
  assert.equal(incident.detectorId, 'V001');
  assert.equal(incident.evidenceClass, 'A');
  assert.equal(incident.evidence[0].command, 'npm test');
  assert.equal(incident.evidence[1].exitCode, 1);
});

test('V001 stays quiet when verification succeeded', () => {
  const result = scanTranscript(fixture('passing-tests-then-claim.jsonl'));
  assert.equal(result.incidents.length, 0);
});

test('V001 does not treat unrelated command failures as failed test evidence', () => {
  const result = scanTranscript(fixture('unrelated-failure-then-test-claim.jsonl'));
  assert.equal(result.incidents.length, 0);
});
