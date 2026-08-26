# Vibe Lint — Product Clarity & Decision Guide v1.0

**Date:** 27 August 2026

> **Remember this:** We are not building an analytics product. We are building a local linter for AI coding sessions. It catches a small set of costly, evidence-backed failures, shows the receipts, and eventually turns repeat failures into guardrails.

## User promise

After a coding session, run one command and see only the few things that deserve review — with enough evidence to decide whether Vibe is right.

## First user

A developer who repeatedly uses Claude Code or Codex on real repositories and gives the agent enough autonomy that mistakes can hide inside long sessions.

## Exact MVP

```text
$ vibe last

[A] V001 Claim contradicted by verification
[B] V002 Repeated failure loop
[A] V003 Explicit policy violation
[C] V004 Possible diff/scope spill
```

Every incident shows evidence. The user labels it **YES / MEH / WRONG**.

## Certainty

- **A — Proven:** direct evidence + explicit condition.
- **B — High confidence:** strong pattern with limited interpretation.
- **C — Heuristic:** useful suspicion requiring review.

Never render C like A. Roast tone never overrides truth labels.

## Cross-agent means architecture, not six MVP integrations

```text
Claude adapter ─┐
Codex adapter  ─┼→ normalized events → detectors → incidents
Future adapters ─┘
```

## Rules

- `.vibe/policy.yml` = canonical machine-checkable policy.
- CLAUDE.md / AGENTS.md = context + candidate constraints.
- Ambiguous natural-language rules never silently become hard policy.
- Future LLM extraction may propose rules only with user approval.

## We are NOT building

- History/search app.
- Universal vibe score.
- Model leaderboard.
- Prompt tutor.
- Cloud-first transcript ingestion.
- Dashboard-first product.
- Automatic rule rewriting.
- Full skill marketplace.

## Why this is distinct

AM I GOOD AT VIBE already covers cross-agent roast/score. VibeCoding Observer already covers retrospective local diagnostics. SpecStory Lore already mines sessions into skills. Our wedge is a very small incident-lint contract with explicit evidence classes and a path from confirmed failures to enforcement.

## Build order

1. CLI + config + event schema.
2. Claude/Codex fixture adapters.
3. V001.
4. V002.
5. Dogfood and tune.
6. Structured policy + V003.
7. V004 as heuristic.
8. Feedback/evaluation on 50+ real sessions.
9. Only then: hooks → patterns → rule promotion → roast/share.

## Long-term loop

```text
OBSERVE → PROVE → YOU CONFIRM → PATTERN → POLICY → GUARD → VERIFY
```

## What proves it deserves to exist

Trusted, repeated, actionable incidents on real coding sessions — not stars, dashboards, naming, or a clever landing page.
