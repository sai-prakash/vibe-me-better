# Vibe Lint — Product Requirements Document v1.0

**Status:** Build-ready baseline  
**Date:** 27 August 2026  
**Working name:** Vibe Lint

> **Product:** A local-first, cross-agent session linter that detects provable or clearly qualified failures in AI coding workflows, shows the evidence, learns which findings the developer agrees with, and later converts repeated failures into portable guardrails.

## Locked MVP

- CLI-first; no dashboard/account/cloud requirement.
- Claude Code + Codex adapters.
- Versioned normalized event model.
- Read-only git context.
- Four detectors: V001 claim-without-evidence, V002 repeated-failure loop, V003 machine-checkable policy violation, V004 possible diff/scope spill.
- Evidence class A (proven), B (high confidence), C (heuristic).
- Every incident has evidence + provenance + detector version.
- YES / MEH / WRONG local review labels.
- Core requires no LLM and no network.

## Non-goals

- Session-history browser.
- Universal vibe/productivity score.
- Model leaderboard.
- Prompt tutor.
- Cloud sync/team admin in MVP.
- Automatic enforcement of ambiguous natural-language instructions.
- Social/roast layer before detector trust is proven.

## CLI

```text
vibe init
vibe doctor
vibe last
vibe scan [session]
vibe show <incident>
vibe review
vibe policy check
```

## Detector contracts

### V001 — CLAIM_WITHOUT_EVIDENCE
Compare completion/success claims with configured/observed verification evidence. A direct contradiction such as “all tests pass” vs a matching command exit code 1 can be Class A. Missing verification is only a hard finding when policy explicitly requires it.

### V002 — REPEATED_FAILURE_LOOP
Default threshold: 3 attempts with the same meaningful normalized failure fingerprint. Class B by default. Do not merge failures merely because they share a non-zero exit code.

### V003 — POLICY_VIOLATION
Canonical machine-readable source: `.vibe/policy.yml`. Candidate rules may be discovered from CLAUDE.md / AGENTS.md, but only mechanically recognizable/unambiguous rules can become hard policy without user confirmation.

### V004 — POSSIBLE_DIFF_SPILL
Heuristic review signal. Use file/change categories, explicit path/task context, high-risk areas, dependencies/config/migrations, and configurable breadth thresholds. It is Class C by default and must not be worded as a proven violation.

## Architecture

```text
Claude adapter ─┐
Codex adapter  ─┼→ normalized events → context enrichers → detectors → incidents → CLI/JSON
Future adapters ─┘
                                    ↘ local feedback/index
```

## Policy v0

```yaml
version: 1
policies:
  - id: no-dependency-changes
    type: dependency_change
    action: flag
  - id: protect-migrations
    type: protected_paths
    paths: ["db/migrations/**"]
    action: flag
verification:
  commands: ["npm test", "npm run lint"]
detectors:
  loop:
    attempts: 3
  diff_spill:
    warn_file_count: 15
```

## Evaluation gates

Targets to validate, not current performance claims:

- ≥95% precision on labelled Class A dogfood findings before any blocking behavior.
- ≥60% of displayed findings labelled YES.
- ≥50 real sessions across Claude Code + Codex before calling detector behavior stable.
- At least 5/10 target users voluntarily rerun the tool after one week.

## Post-MVP

1. Live Claude hooks for proven Class A policy checks.
2. Cross-session confirmed-pattern aggregation.
3. Rule promotion.
4. Portable guard mapping per agent.
5. Roast/share UX.
6. Team/CI policy mode.

## Kill criteria

Stop or radically pivot if 50+ real sessions mostly yield noisy/obvious findings, users frequently dispute the evidence, or findings are “interesting” but do not alter supervision behavior.

## Current references

- Claude Code hooks: https://code.claude.com/docs/en/hooks
- Codex agent loop: https://openai.com/index/unrolling-the-codex-agent-loop/
- Codex source/history: https://github.com/openai/codex/blob/main/codex-rs/message-history/src/lib.rs
- VibeCoding Observer: https://github.com/HaipingShi/vibecoding-observer
- SpecStory Lore: https://specstory.com/lore
- AM I GOOD AT VIBE: https://marketplace.visualstudio.com/items?itemName=amigoodatvibe.amigoodatvibe
