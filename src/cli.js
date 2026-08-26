import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanTranscript } from './scan.js';
import { scanClaudeCorpus } from './corpus.js';
import { inspectTranscript } from './inspect.js';
import {
  claudeConfigDir,
  discoverClaudeCorpus,
  findLatestClaudeTranscript,
} from './discovery/claude.js';
import {
  formatBulkScan,
  formatCorpusInventory,
  formatInspection,
  formatScanResult,
} from './format.js';

const HELP = `vibe — evidence-backed linting for AI coding sessions

Usage:
  vibe scan <transcript.jsonl> [--source claude] [--json]
  vibe scan --all [--json] [--no-subagents]
  vibe inspect <transcript.jsonl> [--json]
  vibe inspect --last [--json]
  vibe sessions [--json]
  vibe last [--json]
  vibe doctor
  vibe help

Current milestone:
  Claude corpus inventory + evidence inspector + V001 across parent/subagent transcripts.
`;

function parseFlags(args) {
  const values = [];
  let source = 'claude';
  let json = false;
  let all = false;
  let last = false;
  let includeSubagents = true;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--all') {
      all = true;
      continue;
    }
    if (arg === '--last') {
      last = true;
      continue;
    }
    if (arg === '--no-subagents') {
      includeSubagents = false;
      continue;
    }
    if (arg === '--source') {
      source = args[index + 1] ?? source;
      index += 1;
      continue;
    }
    values.push(arg);
  }
  return { values, source, json, all, last, includeSubagents };
}

function printResult(result, json, formatter) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatter(result)}\n`);
  }
}

function requireTranscript(filePath) {
  if (!filePath) throw new Error('A transcript path is required.');
  if (!fs.existsSync(filePath)) throw new Error(`Transcript not found: ${filePath}`);
  return filePath;
}

export function runCli(argv = process.argv.slice(2)) {
  const [command = 'help', ...rest] = argv;

  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(HELP);
    return 0;
  }

  if (command === 'scan') {
    const { values, source, json, all, includeSubagents } = parseFlags(rest);
    if (all) {
      printResult(scanClaudeCorpus({ includeSubagents }), json, formatBulkScan);
      return 0;
    }

    const filePath = requireTranscript(values[0]);
    printResult(scanTranscript(filePath, { source }), json, formatScanResult);
    return 0;
  }

  if (command === 'inspect') {
    const { values, source, json, last } = parseFlags(rest);
    const filePath = last
      ? findLatestClaudeTranscript(process.cwd())
      : values[0];

    if (last && !filePath) {
      throw new Error(`No Claude Code transcript found for ${process.cwd()} under ${claudeConfigDir()}/projects.`);
    }

    printResult(inspectTranscript(requireTranscript(filePath), { source }), json, formatInspection);
    return 0;
  }

  if (command === 'sessions') {
    const { json } = parseFlags(rest);
    printResult(discoverClaudeCorpus(), json, formatCorpusInventory);
    return 0;
  }

  if (command === 'last') {
    const { json } = parseFlags(rest);
    const transcript = findLatestClaudeTranscript(process.cwd());
    if (!transcript) {
      throw new Error(`No Claude Code transcript found for ${process.cwd()} under ${claudeConfigDir()}/projects.`);
    }
    printResult(scanTranscript(transcript, { source: 'claude' }), json, formatScanResult);
    return 0;
  }

  if (command === 'doctor') {
    const configDir = claudeConfigDir();
    const corpus = discoverClaudeCorpus();
    process.stdout.write([
      'Vibe doctor',
      `Node: ${process.version}`,
      `CWD: ${process.cwd()}`,
      `Claude config: ${configDir}`,
      `Claude config exists: ${fs.existsSync(configDir) ? 'yes' : 'no'}`,
      `Claude sessions: ${corpus.totals.mainSessions} main + ${corpus.totals.subagents} subagents`,
      `Package root: ${path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')}`,
      '',
    ].join('\n'));
    return 0;
  }

  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}
