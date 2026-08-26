import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanTranscript } from '../src/scan.js';
import { detectClaimWithoutEvidence } from '../src/detectors/v001-claim-without-evidence.js';
import {
  classifyVerificationCommand,
  extractVerificationClaims,
  inferVerificationOutcome,
  shellCommandSegments,
} from '../src/core/verification.js';

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

test('real Claude commands classify deno, node test runner, vitest, and jest as tests', () => {
  assert.equal(classifyVerificationCommand('npx --yes deno@2.4.4 test foo_test.ts'), 'test');
  assert.equal(classifyVerificationCommand('node --test test/runtime-source-parity.test.mjs'), 'test');
  assert.equal(classifyVerificationCommand('npx vitest run'), 'test');
  assert.equal(classifyVerificationCommand('jest --runInBand'), 'test');
});

test('verification classifier only considers executable shell segments', () => {
  assert.equal(
    classifyVerificationCommand('git add test/runtime-source-parity.test.mjs && git commit -m "tests updated"'),
    null,
  );
  assert.equal(
    classifyVerificationCommand('cat > report.md <<\'EOF\'\nnode --test fake.test.js\nEOF'),
    null,
  );
  assert.equal(
    classifyVerificationCommand('SDD=.superpowers/sdd/run cat >> progress.md <<\'EOF\'\ntest(\'not a shell command\', () => {})\nEOF'),
    null,
  );
  assert.equal(classifyVerificationCommand('cd renderer && npm test'), 'test');
  assert.equal(classifyVerificationCommand('set -e\necho checking\nnode --test test/a.test.mjs'), 'test');
});

test('shell segmentation preserves quoted grep pipes and strips heredoc bodies', () => {
  const segments = shellCommandSegments('node --test test/a.test.mjs 2>&1 | grep "^pass\\|^fail"');
  assert.equal(segments[0], 'node --test test/a.test.mjs 2>&1');
  assert.equal(segments[1], 'grep "^pass\\|^fail"');

  const heredoc = shellCommandSegments('cat > x <<\'EOF\'\nnpm test\nEOF\ngit status');
  assert.deepEqual(heredoc, ["cat > x <<'EOF'", 'git status']);
});

test('stdout failure summary overrides a non-error shell status', () => {
  const observation = inferVerificationOutcome({
    output: 'ok | 14 passed | 1 failed (39ms)',
    exitCode: null,
    isError: false,
  });

  assert.equal(observation.outcome, 'fail');
  assert.equal(observation.source, 'output-summary');
});

test('V001 catches a masked upstream test failure from real Claude-style output', () => {
  const events = [
    {
      kind: 'tool.call',
      sequence: 0,
      toolUseId: 'real-1',
      command: 'npx --yes deno@2.4.4 test foo_test.ts 2>&1 | tail -6; npm run test:content',
      rawRef: { line: 10 },
    },
    {
      kind: 'tool.result',
      sequence: 1,
      toolUseId: 'real-1',
      exitCode: null,
      isError: false,
      output: 'ok | 14 passed | 1 failed (39ms)',
      rawRef: { line: 11 },
    },
    {
      kind: 'message.assistant',
      sequence: 2,
      text: 'All tests are passing.',
      rawRef: { line: 12 },
    },
  ];

  const incidents = detectClaimWithoutEvidence(events);
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].evidence[1].outcomeSource, 'output-summary');
});

test('quoted rejected success claims are not treated as assistant success claims', () => {
  const text = 'So Task 4\'s Step 5 "GREEN, all tests pass" claim is not true — the suite does not compile, and one test fails.';
  assert.deepEqual(extractVerificationClaims(text), []);

  const events = [
    {
      kind: 'tool.call',
      sequence: 0,
      toolUseId: 'real-2',
      command: 'node --test test/runtime-source-parity.test.mjs',
      rawRef: { line: 20 },
    },
    {
      kind: 'tool.result',
      sequence: 1,
      toolUseId: 'real-2',
      exitCode: null,
      isError: false,
      output: 'ℹ pass 14\nℹ fail 1',
      rawRef: { line: 21 },
    },
    {
      kind: 'message.assistant',
      sequence: 2,
      text,
      rawRef: { line: 22 },
    },
  ];

  assert.equal(detectClaimWithoutEvidence(events).length, 0);
});

test('real passing summaries remain clean', () => {
  assert.equal(inferVerificationOutcome({ output: 'ok | 62 passed | 0 failed (193ms)' }).outcome, 'pass');
  assert.equal(inferVerificationOutcome({ output: 'ℹ pass 12\nℹ fail 0' }).outcome, 'pass');
});
