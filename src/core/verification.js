const COMMAND_PATTERNS = {
  test: [
    /(^|\s)(npm|pnpm|yarn|bun)\s+(run\s+)?test\b/i,
    /(^|\s)pytest\b/i,
    /(^|\s)python(?:3)?\s+-m\s+pytest\b/i,
    /(^|\s)cargo\s+test\b/i,
    /(^|\s)go\s+test\b/i,
    /(^|\s)dotnet\s+test\b/i,
    /(^|\s)mvn(?:w)?\s+.*\btest\b/i,
    /(^|\s)gradle(?:w)?\s+.*\btest\b/i,
  ],
  lint: [
    /(^|\s)(npm|pnpm|yarn|bun)\s+(run\s+)?lint\b/i,
    /(^|\s)eslint\b/i,
    /(^|\s)ruff\s+check\b/i,
  ],
  build: [
    /(^|\s)(npm|pnpm|yarn|bun)\s+(run\s+)?build\b/i,
    /(^|\s)cargo\s+build\b/i,
    /(^|\s)go\s+build\b/i,
    /(^|\s)dotnet\s+build\b/i,
  ],
};

const CLAIM_PATTERNS = [
  {
    kind: 'test',
    regex: /\b(?:all\s+)?tests?\s+(?:are\s+)?(?:passing|pass(?:ed)?)\b|\btest\s+suites?\s+(?:are\s+)?(?:passing|pass(?:ed)?)\b/i,
  },
  {
    kind: 'lint',
    regex: /\blint(?:ing)?\s+(?:is\s+|checks?\s+are\s+)?(?:passing|passes|passed|clean)\b/i,
  },
  {
    kind: 'build',
    regex: /\bbuild\s+(?:is\s+)?(?:passing|passes|passed|succeeds|succeeded|successful)\b/i,
  },
];

export function classifyVerificationCommand(command = '') {
  for (const [kind, patterns] of Object.entries(COMMAND_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(command))) return kind;
  }
  return null;
}

export function extractVerificationClaims(text = '') {
  const claims = [];
  for (const definition of CLAIM_PATTERNS) {
    const match = text.match(definition.regex);
    if (match) {
      claims.push({
        kind: definition.kind,
        text: match[0],
        index: match.index ?? 0,
      });
    }
  }
  return claims;
}
