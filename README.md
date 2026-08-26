# vibe-me-better / Vibe Lint

**Evidence-backed linting for AI coding sessions.**

Vibe Lint is not another vibe score or session dashboard. It reads local coding-agent evidence, detects a small set of costly workflow failures, and shows the receipts.

Current build: **Claude corpus inspector + V001**.

```text
Claude transcripts + subagents
        ↓
corpus discovery / evidence inspector
        ↓
normalized events
        ↓
V001 detector
        ↓
evidence-backed incidents
```

## What works today

- Discovers Claude Code projects, parent sessions, and subagent JSONL transcripts under `~/.claude/projects`.
- Parses Claude Code JSONL locally and keeps line-level provenance.
- Normalizes assistant messages, tool calls, and tool results into a source-independent event stream.
- Detects `V001 CLAIM_WITHOUT_EVIDENCE` when an explicit test/build/lint success claim contradicts matching verification evidence.
- Understands real verification shapes including `npm test`, `node --test`, Deno tests, Jest, Vitest, compound commands, and output summaries such as `14 passed | 1 failed`.
- Inspects evidence coverage so zero findings are explainable.
- Scans the entire local Claude corpus, including subagents.
- Requires no runtime dependencies, API key, account, or network access.

## Install locally

Requires Node.js 20+.

```bash
git clone https://github.com/sai-prakash/vibe-me-better.git
cd vibe-me-better
npm test
npm link
```

## Commands

Inventory all locally recorded Claude sessions:

```bash
vibe sessions
```

Inspect one real session before interpreting detector results:

```bash
vibe inspect ~/.claude/projects/<project>/<session>.jsonl
```

Or inspect the latest Claude session for the current repository:

```bash
vibe inspect --last
```

Scan one transcript:

```bash
vibe scan ~/.claude/projects/<project>/<session>.jsonl
```

Scan the entire Claude corpus, including subagents:

```bash
vibe scan --all
```

Parent sessions only:

```bash
vibe scan --all --no-subagents
```

Every command supports machine-readable output where applicable:

```bash
vibe sessions --json
vibe inspect ~/.claude/projects/<project>/<session>.jsonl --json
vibe scan --all --json
```

## Why `inspect` matters

`No V001 contradictions found` is not the same as `nothing went wrong`.

`vibe inspect` explains the denominator:

```text
Vibe Inspect

Evidence coverage
  Raw JSONL records:      1330
  Tool calls:             219
  Bash calls:             140
  Linked subagents:       4

Verification
  Total runs:             38
  Passed:                 29
  Failed:                 6
  Unknown:                3

Verification claims
  Total:                  8
  Supported:              8
  Contradicted:           0
  Unknown/no evidence:    0
```

Those numbers are illustrative; Vibe reports the values from your own transcript.

## Product rules

1. Receipts before rhetoric.
2. Deterministic evidence before LLM judgement.
3. Heuristics must never be presented like proof.
4. Cross-agent is an architecture requirement; Claude Code + Codex are the MVP integrations.
5. Local-first by default.
6. Zero findings must expose evidence coverage, not imply a clean bill of health.

## Docs

- [Product requirements](./docs/PRODUCT_REQUIREMENTS.md)
- [Product clarity / decision guide](./docs/PRODUCT_CLARITY.md)
- [Architecture](./docs/ARCHITECTURE.md)

## Planned next

- `V002 REPEATED_FAILURE_LOOP`, driven by real repeated-failure fingerprints rather than repeated-command counts.
- Codex rollout adapter against the same normalized event contract.
- `.vibe/policy.yml` + `V003 POLICY_VIOLATION`.
- `V004 POSSIBLE_DIFF_SPILL` only as a clearly-labelled heuristic.

The project stays intentionally small until dogfooding proves the incidents are trustworthy and useful.
