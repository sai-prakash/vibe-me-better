import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanTranscript } from './scan.js';
import { findLatestClaudeTranscript, claudeConfigDir } from './discovery/claude.js';
import { formatScanResult } from './format.js';

const HELP = `vibe — evidence-backed linting for AI coding sessions

Usage:
  vibe scan <transcript.jsonl> [--source claude] [--json]
  vibe last [--json]
  vibe doctor
  vibe help

Current milestone:
  Claude Code transcript ingestion + V001 CLAIM_WITHOUT_EVIDENCE.
`;

function parseFlags(args) {
  const values = [];
  let source = 'claude';
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--source') {
      source = args[index + 1] ?? source;
      index += 1;
      continue;
    }
    values.push(arg);
  }
  return { values, source, json };
}

function printResult(result, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatScanResult(result)}\n`);
  }
}

export function runCli(argv = process.argv.slice(2)) {
  const [command = 'help', ...rest] = argv;

  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(HELP);
    return 0;
  }

  if (command === 'scan') {
    const { values, source, json } = parseFlags(rest);
    const filePath = values[0];
    if (!filePath) throw new Error('scan requires a transcript path.');
    if (!fs.existsSync(filePath)) throw new Error(`Transcript not found: ${filePath}`);
    printResult(scanTranscript(filePath, { source }), json);
    return 0;
  }

  if (command === 'last') {
    const { json } = parseFlags(rest);
    const transcript = findLatestClaudeTranscript(process.cwd());
    if (!transcript) {
      throw new Error(`No Claude Code transcript found for ${process.cwd()} under ${claudeConfigDir()}/projects.`);
    }
    printResult(scanTranscript(transcript, { source: 'claude' }), json);
    return 0;
  }

  if (command === 'doctor') {
    const configDir = claudeConfigDir();
    process.stdout.write([
      'Vibe doctor',
      `Node: ${process.version}`,
      `CWD: ${process.cwd()}`,
      `Claude config: ${configDir}`,
      `Claude config exists: ${fs.existsSync(configDir) ? 'yes' : 'no'}`,
      `Package root: ${path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')}`,
      '',
    ].join('\n'));
    return 0;
  }

  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}
