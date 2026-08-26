import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectRepeatedFailureLoop,
  fingerprintFailure,
  normalizeVerificationCommand,
} from '../src/detectors/v002-repeated-failure-loop.js';
import { scanTranscript } from '../src/scan.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function call(sequence, id, command = 'npm test') {
  return {
    kind: 'tool.call',
    sequence,
    toolUseId: id,
    toolName: 'Bash',
    command,
    timestamp: `2026-08-27T00:${String(sequence).padStart(2, '0')}:00Z`,
    rawRef: { path: '/tmp/session.jsonl', line: sequence + 1 },
  };
}

function result(sequence, id, output, exitCode = 1) {
  return {
    kind: 'tool.result',
    sequence,
    toolUseId: id,
    exitCode,
    isError: exitCode !== 0,
    output,
    timestamp: `2026-08-27T00:${String(sequence).padStart(2, '0')}:30Z`,
    rawRef: { path: '/tmp/session.jsonl', line: sequence + 1 },
  };
}

function edit(sequence, id) {
  return {
    kind: 'tool.call',
    sequence,
    toolUseId: id,
    toolName: 'Edit',
    input: { file_path: 'src/app.js' },
    rawRef: { path: '/tmp/session.jsonl', line: sequence + 1 },
  };
}

const sameFailure = 'AssertionError: expected 42 but received 41\n    at /Users/sai/code/app/test.js:17:9';

test('V002 detects the same failed verification three times with edits between attempts', () => {
  const events = [
    call(0, 't1'), result(1, 't1', sameFailure), edit(2, 'e1'),
    call(3, 't2'), result(4, 't2', sameFailure), edit(5, 'e2'),
    call(6, 't3'), result(7, 't3', sameFailure),
  ];

  const incidents = detectRepeatedFailureLoop(events);
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].detectorId, 'V002');
  assert.equal(incidents[0].evidenceClass, 'B');
  assert.equal(incidents[0].attempts, 3);
  assert.equal(incidents[0].evidence.length, 3);
});

test('V002 stays quiet for only two repeated failed attempts', () => {
  const events = [
    call(0, 't1'), result(1, 't1', sameFailure), edit(2, 'e1'),
    call(3, 't2'), result(4, 't2', sameFailure),
  ];
  assert.equal(detectRepeatedFailureLoop(events).length, 0);
});

test('V002 treats a changed failure fingerprint as progress, not a loop', () => {
  const events = [
    call(0, 't1'), result(1, 't1', sameFailure), edit(2, 'e1'),
    call(3, 't2'), result(4, 't2', 'TypeError: cannot read properties of undefined'), edit(5, 'e2'),
    call(6, 't3'), result(7, 't3', sameFailure), edit(8, 'e3'),
    call(9, 't4'), result(10, 't4', sameFailure),
  ];
  assert.equal(detectRepeatedFailureLoop(events).length, 0);
});

test('V002 requires a structured code mutation between repeated failures', () => {
  const events = [
    call(0, 't1'), result(1, 't1', sameFailure),
    call(2, 't2'), result(3, 't2', sameFailure),
    call(4, 't3'), result(5, 't3', sameFailure),
  ];
  assert.equal(detectRepeatedFailureLoop(events).length, 0);
});

test('a passing verification resets the repeated-failure cluster', () => {
  const events = [
    call(0, 't1'), result(1, 't1', sameFailure), edit(2, 'e1'),
    call(3, 't2'), result(4, 't2', sameFailure), edit(5, 'e2'),
    call(6, 't3'), result(7, 't3', '15 passed | 0 failed', 0), edit(8, 'e3'),
    call(9, 't4'), result(10, 't4', sameFailure), edit(11, 'e4'),
    call(12, 't5'), result(13, 't5', sameFailure),
  ];
  assert.equal(detectRepeatedFailureLoop(events).length, 0);
});

test('generic pass/fail counts alone are not treated as a same-failure fingerprint', () => {
  assert.equal(fingerprintFailure('14 passed | 1 failed'), null);
});

test('verification command fingerprint removes output-only piping noise', () => {
  assert.equal(
    normalizeVerificationCommand('npm test 2>&1 | tail -6'),
    normalizeVerificationCommand('npm test'),
  );
});

test('full Claude transcript scan emits V002 through the normal scan pipeline', () => {
  const fixture = path.join(here, 'fixtures', 'claude', 'repeated-failure-loop.jsonl');
  const scan = scanTranscript(fixture);
  assert.equal(scan.detectorCounts.V001, 0);
  assert.equal(scan.detectorCounts.V002, 1);
  assert.equal(scan.incidents.length, 1);
  assert.equal(scan.incidents[0].attempts, 3);
});
