# vibe-me-better / Vibe Lint

**Evidence-backed linting for AI coding sessions.**

Vibe Lint is not another vibe score or session dashboard. It reads local coding-agent evidence, detects a small set of costly workflow failures, and shows the receipts.

Current build: **Claude corpus inspector + stable session refs + V001 + V002**.

```text
Claude transcripts + subagents
        ↓
corpus discovery / stable refs / evidence inspector
        ↓
normalized events
        ↓
V001 claim contradiction
V002 repeated failure loop
        ↓
evidence-backed incidents
```

## What works today

- Discovers Claude Code projects, parent sessions, and subagent JSONL transcripts under `~/.claude/projects`.
- Gives every transcript a compact stable Vibe ref such as `v_4a91c2e87d3ff7ad` while preserving Claude's native session ID.
- Resolves a transcript by filesystem path, Vibe ref, full Claude session ID, or unique session-ID prefix.
- Parses Claude Code JSONL locally and keeps line-level provenance.
- Normalizes assistant messages, tool calls, and tool results into a source-independent event stream.
- Detects `V001 CLAIM_WITHOUT_EVIDENCE` when an explicit test/build/lint success claim contradicts matching verification evidence.
- Detects `V002 REPEATED_FAILURE_LOOP` when the same verification failure fingerprint survives at least three attempts with structured code edits between attempts.
- V002 is deliberately Class B: a passing verification, changed failure, missing code edit, generic pass/fail count, or long gap breaks the loop.
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

Inventory all locally recorded Claude sessions and get pickable refs:

```bash
vibe sessions
```

Example inventory row:

```text
v_4a91c2e87d3ff7ad  main  5.9M  95b63c43-8fb0-4b77-b5a6-6f82fdf4f09c
```

Inspect using the compact ref:

```bash
vibe inspect v_4a91c2e87d3ff7ad
```

The full native Claude session ID also works:

```bash
vibe inspect 95b63c43-8fb0-4b77-b5a6-6f82fdf4f09c
```

And a unique ID prefix works for convenience:

```bash
vibe inspect 95b63c43
```

Filesystem paths remain supported:

```bash
vibe inspect ~/.claude/projects/<project>/<session>.jsonl
```

Scan one session by the same selectors:

```bash
vibe scan v_4a91c2e87d3ff7ad
vibe scan 95b63c43
```

Or inspect/scan the latest Claude session for the current repository:

```bash
vibe inspect --last
vibe last
```

Scan the entire Claude corpus, including subagents:

```bash
vibe scan --all
```

The bulk output lists every scanned ref, type, event count, V001 count, V002 count, and native session ID so any row can immediately be inspected.

Parent sessions only:

```bash
vibe scan --all --no-subagents
```

Every command supports machine-readable output where applicable:

```bash
vibe sessions --json
vibe inspect v_4a91c2e87d3ff7ad --json
vibe scan --all --json
```

## Session identity

Vibe intentionally keeps two identifiers:

- **Claude session ID** — the native transcript filename/agent identifier for provenance.
- **Vibe ref** — a compact deterministic ref derived from the Claude project, session type, parent ID (for subagents), and native session ID.

This means two subagents both named `agent-a` can still be selected unambiguously by their different Vibe refs. If a native ID or prefix is ambiguous, Vibe refuses to guess and asks for the Vibe ref.

## Why `inspect` matters

`No Vibe incidents found` is not the same as `nothing went wrong`.

`vibe inspect` explains the denominator:

```text
Vibe Inspect
Ref: v_4a91c2e87d3ff7ad
Session ID: 95b63c43-8fb0-4b77-b5a6-6f82fdf4f09c
Type: main

Evidence coverage
  Raw JSONL records:      1330
  Tool calls:             197
  Bash calls:             140
  Linked subagents:       4

Verification
  Total runs:             33
  Passed:                 12
  Failed:                 10
  Unknown:                11
```

Those numbers are illustrative; Vibe reports the values from your own transcript.

## V002 trust contract

V002 does **not** mean “the same command ran three times.” It requires all of the following:

1. the command is a recognized verification command;
2. the verification failed;
3. Vibe can extract a salient failure fingerprint (not just `14 passed | 1 failed`);
4. the normalized command matches the previous attempt;
5. the salient failure fingerprint matches the previous attempt;
6. a structured `Edit`, `Write`, or `NotebookEdit` happened between attempts;
7. the pattern reaches at least three failed attempts;
8. a pass, changed failure, missing edit, or >30 minute gap resets the cluster.

Because fingerprinting still involves deterministic normalization, V002 is reported as **Class B** rather than Class A.

## Product rules

1. Receipts before rhetoric.
2. Deterministic evidence before LLM judgement.
3. Heuristics must never be presented like proof.
4. Cross-agent is an architecture requirement; Claude Code + Codex are the MVP integrations.
5. Local-first by default.
6. Zero findings must expose evidence coverage, not imply a clean bill of health.
7. Every corpus result must be individually addressable by a stable selector.

## Docs

- [Product requirements](./docs/PRODUCT_REQUIREMENTS.md)
- [Product clarity / decision guide](./docs/PRODUCT_CLARITY.md)
- [Architecture](./docs/ARCHITECTURE.md)

## Planned next

- Dogfood V002 against real parent and subagent sessions; tune only from false-positive/false-negative evidence.
- Codex rollout adapter against the same normalized event contract.
- `.vibe/policy.yml` + `V003 POLICY_VIOLATION`.
- `V004 POSSIBLE_DIFF_SPILL` only as a clearly-labelled heuristic.

The project stays intentionally small until dogfooding proves the incidents are trustworthy and useful.
