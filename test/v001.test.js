import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanTranscript } from '../src/scan.js';
import { detectClaimWithoutEvidence } from '../src/detectors/v001-claim-without-evidence.js';

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

test('V001 uses the latest matching verification result, avoiding stale failures', () => {
  const events = [
    { kind: 'tool.call', sequence: 0, toolUseId: 't1', command: 'npm test', rawRef: { line: 1 } },
    { kind: 'tool.result', sequence: 1, toolUseId: 't1', exitCode: 1, isError: true, rawRef: { line: 2 } },
    { kind: 'tool.call', sequence: 2, toolUseId: 't2', command: 'npm test', rawRef: { line: 3 } },
    { kind: 'tool.result', sequence: 3, toolUseId: 't2', exitCode: 0, isError: false, rawRef: { line: 4 } },
    { kind: 'message.assistant', sequence: 4, text: 'All tests are passing.', rawRef: { line: 5 } },
  ];

  assert.equal(detectClaimWithoutEvidence(events).length, 0);
});

test('V001 matches the claim to its verification category', () => {
  const events = [
    { kind: 'tool.call', sequence: 0, toolUseId: 'b1', command: 'npm run build', rawRef: { line: 1 } },
    { kind: 'tool.result', sequence: 1, toolUseId: 'b1', exitCode: 2, isError: true, output: 'build failed', rawRef: { line: 2 } },
    { kind: 'message.assistant', sequence: 2, text: 'The build succeeded.', rawRef: { line: 3 } },
  ];

  const incidents = detectClaimWithoutEvidence(events);
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].claim.kind, 'build');
});
