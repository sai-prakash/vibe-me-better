import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJsonl } from '../src/core/jsonl.js';

test('JSONL reader preserves valid records and reports malformed lines', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-jsonl-'));
  const file = path.join(dir, 'session.jsonl');
  fs.writeFileSync(file, '{"type":"assistant"}\nnot-json\n{"type":"user"}\n');

  const result = readJsonl(file);
  assert.equal(result.records.length, 2);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].line, 2);
  assert.equal(result.diagnostics[0].code, 'INVALID_JSONL');
});
