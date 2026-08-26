import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyFailureDomain,
  collectFailureAttempts,
  commandFamily,
  detectRepeatedFailureLoop,
  fingerprintFailure,
  normalizeVerificationCommand,
} from '../src/detectors/v002-repeated-failure-loop.js';
import { formatScanResult } from '../src/format.js';
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
const blocker = 'stealth/ox-alpha is temporarily unavailable (timed out), so auto mode cannot determine the safety of Bash right now.';

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
  assert.equal(incidents[0].loopType, 'failed_fix_retry');
  assert.equal(incidents[0].failureDomain, 'verification');
  assert.equal(incidents[0].attempts, 3);
  assert.equal(incidents[0].evidence.length, 3);
});

test('V002 detects repeated non-verification Bash failures in the same command family', () => {
  const failure = 'Error: project ref not found for deployment target';
  const events = [
    call(0, 'd1', 'supabase functions deploy pipeline-worker'), result(1, 'd1', failure), edit(2, 'e1'),
    call(3, 'd2', 'supabase functions deploy review-worker'), result(4, 'd2', failure), edit(5, 'e2'),
    call(6, 'd3', 'supabase functions deploy health'), result(7, 'd3', failure),
  ];

  const incidents = detectRepeatedFailureLoop(events);
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].commandFamily, 'command:supabase:functions');
  assert.equal(incidents[0].kind, 'command');
});

test('V002 surfaces repeated external blockers even when no code mutation could occur', () => {
  const command = 'git add .gitignore && git commit -m "chore"';
  const events = [
    call(0, 'b1', command), result(1, 'b1', blocker),
    call(2, 'b2', command), result(3, 'b2', blocker),
    call(4, 'b3', command), result(5, 'b3', blocker),
    call(6, 'b4', command), result(7, 'b4', blocker),
  ];

  const incidents = detectRepeatedFailureLoop(events);
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].loopType, 'blocked_retry');
  assert.equal(incidents[0].failureDomain, 'external_blocker');
  assert.equal(incidents[0].commandFamily, 'command:git:add');
  assert.equal(incidents[0].attempts, 4);
});

test('ordinary repeated failures still require a structured code mutation', () => {
  const events = [
    call(0, 't1'), result(1, 't1', sameFailure),
    call(2, 't2'), result(3, 't2', sameFailure),
    call(4, 't3'), result(5, 't3', sameFailure),
  ];
  assert.equal(detectRepeatedFailureLoop(events).length, 0);
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

test('a successful generic command resets a command failure cluster', () => {
  const command = 'supabase functions deploy health';
  const failure = 'Error: project ref not found';
  const events = [
    call(0, 'd1', command), result(1, 'd1', failure), edit(2, 'e1'),
    call(3, 'd2', command), result(4, 'd2', failure), edit(5, 'e2'),
    call(6, 'd3', command), result(7, 'd3', 'Deployed successfully', 0), edit(8, 'e3'),
    call(9, 'd4', command), result(10, 'd4', failure), edit(11, 'e4'),
    call(12, 'd5', command), result(13, 'd5', failure),
  ];
  assert.equal(detectRepeatedFailureLoop(events).length, 0);
});

test('generic pass/fail counts alone are not treated as a same-failure fingerprint', () => {
  assert.equal(fingerprintFailure('14 passed | 1 failed'), null);
});

test('failure domains distinguish external blockers, environment failures, and verification failures', () => {
  assert.equal(classifyFailureDomain(blocker), 'external_blocker');
  assert.equal(classifyFailureDomain('(eval):1: command not found: ffprobe'), 'environment');
  assert.equal(classifyFailureDomain('TS2339 [ERROR]: property queued does not exist', { verificationKind: 'test' }), 'verification');
});

test('environment and tool failures produce stable fingerprints', () => {
  assert.ok(fingerprintFailure('npm error code ETARGET\nnpm error notarget No matching version found for deno@2.4.5'));
  assert.ok(fingerprintFailure('(eval):1: command not found: timeout'));
  assert.ok(fingerprintFailure(blocker));
});

test('verification command fingerprint removes output-only piping noise', () => {
  assert.equal(
    normalizeVerificationCommand('npm test 2>&1 | tail -6'),
    normalizeVerificationCommand('npm test'),
  );
});

test('command family uses executable segments instead of filenames or heredoc content', () => {
  assert.equal(commandFamily('npm test 2>&1 | tail -6'), 'test:npm');
  assert.equal(commandFamily('npm test -- --runInBand'), 'test:npm');
  assert.equal(commandFamily('supabase functions deploy health'), 'command:supabase:functions');
  assert.equal(commandFamily('supabase functions deploy review-worker'), 'command:supabase:functions');
  assert.equal(commandFamily('printf "x" >> .gitignore && git add .gitignore && git commit -m "chore"'), 'command:git:add');
  assert.equal(commandFamily('git add test/runtime-source-parity.test.mjs'), 'command:git:add');
});

test('failure collector exposes domain for failed Bash evidence', () => {
  const events = [
    call(0, 'x1', 'timeout 10 npm test'),
    result(1, 'x1', '(eval):1: command not found: timeout'),
  ];
  const runs = collectFailureAttempts(events);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].outcome, 'fail');
  assert.equal(runs[0].domain, 'environment');
  assert.ok(runs[0].failure);
});

test('full Claude transcript scan emits and formats V002 through the normal scan pipeline', () => {
  const fixture = path.join(here, 'fixtures', 'claude', 'repeated-failure-loop.jsonl');
  const scan = scanTranscript(fixture);
  assert.equal(scan.detectorCounts.V001, 0);
  assert.equal(scan.detectorCounts.V002, 1);
  assert.equal(scan.incidents.length, 1);
  assert.equal(scan.incidents[0].attempts, 3);

  const formatted = formatScanResult(scan);
  assert.match(formatted, /V002 REPEATED_FAILURE_LOOP/);
  assert.match(formatted, /Attempts: 3/);
  assert.match(formatted, /Failure domain:/);
  assert.match(formatted, /Receipts:/);
});
