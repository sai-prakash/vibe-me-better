import fs from 'node:fs';

export function readJsonl(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const lines = source.split(/\r?\n/);
  const records = [];
  const diagnostics = [];

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (!raw.trim()) continue;

    try {
      records.push({ value: JSON.parse(raw), line: index + 1 });
    } catch (error) {
      diagnostics.push({
        line: index + 1,
        code: 'INVALID_JSONL',
        message: error.message,
      });
    }
  }

  return { records, diagnostics };
}
