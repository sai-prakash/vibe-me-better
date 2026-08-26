const SEGMENT_PATTERNS = {
  test: [
    /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test(?::[\w.-]+)?\b/i,
    /^(?:npx\s+(?:--yes\s+)?deno(?:@[\w.-]+)?|deno)\s+test\b/i,
    /^node\s+--test\b/i,
    /^(?:npx\s+(?:--yes\s+)?|pnpm\s+exec\s+|yarn\s+)?(?:jest|vitest)\b/i,
    /^pytest\b/i,
    /^python(?:3)?\s+-m\s+pytest\b/i,
    /^cargo\s+test\b/i,
    /^go\s+test\b/i,
    /^dotnet\s+test\b/i,
    /^mvn(?:w)?\b.*\btest\b/i,
    /^gradle(?:w)?\b.*\btest\b/i,
  ],
  lint: [
    /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?lint(?::[\w.-]+)?\b/i,
    /^eslint\b/i,
    /^ruff\s+check\b/i,
  ],
  build: [
    /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?build(?::[\w.-]+)?\b/i,
    /^cargo\s+build\b/i,
    /^go\s+build\b/i,
    /^dotnet\s+build\b/i,
  ],
};

const CLAIM_PATTERNS = [
  {
    kind: 'test',
    regex: /\b(?:all\s+)?tests?\s+(?:are\s+)?(?:passing|pass(?:ed)?)\b|\btest\s+suites?\s+(?:are\s+)?(?:passing|pass(?:ed)?)\b/i,
  },
  {
    kind: 'test',
    regex: /\b(?:test\s+)?suites?\s+(?:is\s+|are\s+)?green\b/i,
  },
  {
    kind: 'lint',
    regex: /\blint(?:ing)?\s+(?:is\s+|checks?\s+are\s+)?(?:passing|passes|passed|clean|green)\b/i,
  },
  {
    kind: 'build',
    regex: /\bbuild\s+(?:is\s+)?(?:passing|passes|passed|succeeds|succeeded|successful|green)\b/i,
  },
];

function stripHeredocBodies(command = '') {
  const lines = String(command).split(/\r?\n/);
  const kept = [];
  let delimiter = null;

  for (const line of lines) {
    if (delimiter) {
      if (line.trim() === delimiter) delimiter = null;
      continue;
    }

    kept.push(line);
    const match = line.match(/<<-?\s*["']?([A-Za-z_][A-Za-z0-9_]*)["']?/);
    if (match) delimiter = match[1];
  }

  return kept.join('\n');
}

function splitShellSegments(command = '') {
  const text = stripHeredocBodies(command);
  const segments = [];
  let current = '';
  let quote = null;
  let escaped = false;

  const push = () => {
    const value = current.trim();
    if (value) segments.push(value);
    current = '';
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      current += char;
      escaped = true;
      continue;
    }

    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      current += char;
      quote = char;
      continue;
    }

    if (char === '\n' || char === ';' || char === '|') {
      push();
      if ((char === '|' && next === '|') || (char === '&' && next === '&')) index += 1;
      continue;
    }

    if (char === '&' && next === '&') {
      push();
      index += 1;
      continue;
    }

    current += char;
  }

  push();
  return segments;
}

function normalizeExecutableSegment(segment = '') {
  let value = String(segment).trim().replace(/^[({!]+\s*/, '');

  value = value.replace(/^(?:env\s+)?(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)+/, '');
  value = value.replace(/^command\s+/, '');
  value = value.replace(/^timeout\s+(?:-\S+\s+)*\d+(?:\.\d+)?[smhd]?\s+/, '');
  return value.trim();
}

export function shellCommandSegments(command = '') {
  return splitShellSegments(command)
    .map(normalizeExecutableSegment)
    .filter(Boolean);
}

function classifySegment(segment = '') {
  for (const [kind, patterns] of Object.entries(SEGMENT_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(segment))) return kind;
  }
  return null;
}

function claimIsNegated(text, match) {
  const index = match.index ?? 0;
  const before = text.slice(Math.max(0, index - 32), index);
  const after = text.slice(index + match[0].length, index + match[0].length + 96);
  const context = text.slice(Math.max(0, index - 64), index + match[0].length + 120);

  if (/\b(?:not|never|no)\s*$/i.test(before)) return true;
  if (/^\s*(?:["'`”’]\s*)?(?:claim\s+)?(?:is|was)\s+(?:not\s+true|false)\b/i.test(after)) return true;
  if (/\bclaim\s+(?:is|was)\s+(?:not\s+true|false)\b/i.test(context)) return true;
  if (/\b(?:not|never)\s+(?:actually\s+)?(?:passing|passed|green|successful|true)\b/i.test(context)) return true;

  return false;
}

function collectCountSummaries(output) {
  const summaries = [];
  const definitions = [
    {
      regex: /(\d+)\s+passed\s*[|/]\s*(\d+)\s+failed/gi,
      passed: 1,
      failed: 2,
    },
    {
      regex: /\bpass\s+(\d+)[\s\S]{0,120}?\bfail\s+(\d+)/gi,
      passed: 1,
      failed: 2,
    },
  ];

  for (const definition of definitions) {
    for (const match of output.matchAll(definition.regex)) {
      summaries.push({
        index: match.index ?? 0,
        passed: Number(match[definition.passed]),
        failed: Number(match[definition.failed]),
        text: match[0],
      });
    }
  }

  return summaries.sort((a, b) => a.index - b.index);
}

export function classifyVerificationCommand(command = '') {
  for (const segment of shellCommandSegments(command)) {
    const kind = classifySegment(segment);
    if (kind) return kind;
  }
  return null;
}

export function inferVerificationOutcome({ output = '', exitCode = null, isError = false } = {}) {
  const summaries = collectCountSummaries(String(output));
  if (summaries.length > 0) {
    const last = summaries[summaries.length - 1];
    return {
      outcome: last.failed > 0 ? 'fail' : 'pass',
      source: 'output-summary',
      evidence: last.text,
    };
  }

  const text = String(output);
  const foundErrors = text.match(/\bFound\s+(\d+)\s+errors?\.?/i);
  if (foundErrors && Number(foundErrors[1]) > 0) {
    return {
      outcome: 'fail',
      source: 'output-summary',
      evidence: foundErrors[0],
    };
  }

  if (/\bALL\s+CONTRACTS\s+GREEN\b/i.test(text) || /\bTESTS\+TYPECHECK\s+GREEN\b/i.test(text)) {
    return {
      outcome: 'pass',
      source: 'output-marker',
      evidence: text.match(/\b(?:ALL\s+CONTRACTS\s+GREEN|TESTS\+TYPECHECK\s+GREEN)\b/i)?.[0] ?? null,
    };
  }

  if (isError === true || (Number.isInteger(exitCode) && exitCode !== 0)) {
    return {
      outcome: 'fail',
      source: 'tool-status',
      evidence: Number.isInteger(exitCode) ? `exit ${exitCode}` : 'tool marked error',
    };
  }

  if (exitCode === 0) {
    return {
      outcome: 'pass',
      source: 'tool-status',
      evidence: 'exit 0',
    };
  }

  return {
    outcome: 'unknown',
    source: 'insufficient-evidence',
    evidence: null,
  };
}

export function extractVerificationClaims(text = '') {
  const claims = [];
  for (const definition of CLAIM_PATTERNS) {
    const match = text.match(definition.regex);
    if (!match || claimIsNegated(text, match)) continue;

    claims.push({
      kind: definition.kind,
      text: match[0],
      index: match.index ?? 0,
    });
  }
  return claims;
}
