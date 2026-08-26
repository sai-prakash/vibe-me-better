#!/usr/bin/env node
import { runCli } from '../src/cli.js';

try {
  const code = runCli();
  process.exitCode = code;
} catch (error) {
  process.stderr.write(`vibe: ${error.message}\n`);
  process.exitCode = 1;
}
