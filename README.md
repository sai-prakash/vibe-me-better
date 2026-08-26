# vibe-me-better / Vibe Lint

**Evidence-backed linting for AI coding sessions.**

Vibe Lint is not another vibe score or session dashboard. It reads local coding-agent evidence, detects a small set of costly workflow failures, and shows the receipts.

Current build: **Milestone 1 — Claude Code + V001**.

```text
Claude transcript → normalized events → V001 detector → evidence-backed incident
```

## What works today

- Parses Claude Code JSONL transcripts locally.
- Normalizes assistant messages, tool calls, and tool results into a source-independent event stream.
- Detects `V001 CLAIM_WITHOUT_EVIDENCE` when a success claim such as “all tests are passing” directly contradicts a failed matching verification command.
- Emits Class A evidence including the command, exit code, output, and transcript line provenance.
- Finds the latest Claude Code session for the current repository with `vibe last`.
- Requires no runtime dependencies, API key, account, or network access.

## Try it

Requires Node.js 20+.

```bash
npm test
node ./bin/vibe.js scan ./test/fixtures/claude/failing-tests-then-claim.jsonl
```

Or from a repository you have used with Claude Code:

```bash
node /path/to/vibe-me-better/bin/vibe.js last
```

Machine-readable output:

```bash
node ./bin/vibe.js scan ./session.jsonl --json
```

## Example

```text
Vibe Lint
Session: claude-code · failing-tests-then-claim.jsonl

1 incident found

1. [A] V001 CLAIM_WITHOUT_EVIDENCE
   Assistant claimed "All tests are passing" after a failing test command.
   Command: npm test
   Exit: 1
   Output: Error: Exit code 1
```

## Product rules

1. Receipts before rhetoric.
2. Deterministic evidence before LLM judgement.
3. Heuristics must never be presented like proof.
4. Cross-agent is an architecture requirement; Claude Code + Codex are the MVP integrations.
5. Local-first by default.

## Docs

- [Product requirements](./docs/PRODUCT_REQUIREMENTS.md)
- [Product clarity / decision guide](./docs/PRODUCT_CLARITY.md)
- [Architecture](./docs/ARCHITECTURE.md)

## Planned next

- Codex rollout adapter.
- `V002 REPEATED_FAILURE_LOOP`.
- `.vibe/policy.yml` + `V003 POLICY_VIOLATION`.
- `V004 POSSIBLE_DIFF_SPILL` only as a clearly-labelled heuristic.

The project is intentionally small until real-session dogfooding proves the incidents are trustworthy and useful.
