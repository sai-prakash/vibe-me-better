import path from 'node:path';
import { readJsonl } from '../core/jsonl.js';

function contentBlocks(message) {
  if (!message) return [];
  if (typeof message.content === 'string') {
    return [{ type: 'text', text: message.content }];
  }
  return Array.isArray(message.content) ? message.content : [];
}

function textFromToolResult(block) {
  if (typeof block?.content === 'string') return block.content;
  if (!Array.isArray(block?.content)) return '';
  return block.content
    .map((item) => (typeof item === 'string' ? item : item?.text ?? ''))
    .filter(Boolean)
    .join('\n');
}

function exitCodeFromResult(record, block) {
  const structured = record?.toolUseResult;
  const candidates = [
    structured?.exitCode,
    structured?.exit_code,
    record?.exitCode,
    record?.exit_code,
  ];

  for (const candidate of candidates) {
    if (Number.isInteger(candidate)) return candidate;
    if (typeof candidate === 'string' && /^-?\d+$/.test(candidate)) return Number(candidate);
  }

  const text = [
    textFromToolResult(block),
    typeof structured === 'string' ? structured : '',
    structured?.stderr ?? '',
  ].join('\n');
  const match = text.match(/(?:Error:\s*)?Exit code\s+(-?\d+)/i);
  if (match) return Number(match[1]);

  if (block?.is_error === true) return 1;
  return null;
}

function eventBase(record, sourcePath, line, sequence) {
  return {
    schemaVersion: 1,
    source: 'claude-code',
    sessionId: record.sessionId ?? record.session_id ?? null,
    timestamp: record.timestamp ?? null,
    sequence,
    rawRef: {
      path: sourcePath,
      line,
      uuid: record.uuid ?? null,
    },
  };
}

export function parseClaudeTranscript(filePath) {
  const resolvedPath = path.resolve(filePath);
  const { records, diagnostics } = readJsonl(resolvedPath);
  const events = [];
  let sequence = 0;

  for (const { value: record, line } of records) {
    const blocks = contentBlocks(record.message);

    if (record.type === 'assistant') {
      for (const block of blocks) {
        if (block?.type === 'text' && block.text) {
          events.push({
            ...eventBase(record, resolvedPath, line, sequence++),
            kind: 'message.assistant',
            text: block.text,
          });
        }

        if (block?.type === 'tool_use') {
          events.push({
            ...eventBase(record, resolvedPath, line, sequence++),
            kind: 'tool.call',
            toolUseId: block.id ?? null,
            toolName: block.name ?? null,
            input: block.input ?? {},
            command: block.name === 'Bash' ? block.input?.command ?? '' : null,
          });
        }
      }
    }

    if (record.type === 'user') {
      for (const block of blocks) {
        if (block?.type !== 'tool_result') continue;
        const exitCode = exitCodeFromResult(record, block);
        events.push({
          ...eventBase(record, resolvedPath, line, sequence++),
          kind: 'tool.result',
          toolUseId: block.tool_use_id ?? null,
          isError: block.is_error === true || (Number.isInteger(exitCode) && exitCode !== 0),
          exitCode,
          output: textFromToolResult(block),
        });
      }
    }
  }

  return {
    source: 'claude-code',
    filePath: resolvedPath,
    events,
    diagnostics,
  };
}
