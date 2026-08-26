# Vibe Lint — Architecture v0.1

## Architectural promise

Agent-specific formats stop at the adapter boundary. Detectors operate only on Vibe's versioned normalized events.

```text
Claude transcript ─┐
Codex rollout    ───┼─> adapters ─> VibeEvent[] ─> detectors ─> Incident[] ─> CLI / JSON
Future sources   ───┘
```

## Milestone 1 implemented here

```text
Claude JSONL
   ↓
Claude adapter
   ↓
VibeEvent[]
   ↓
V001 CLAIM_WITHOUT_EVIDENCE
   ↓
Class A evidence-backed incident
   ↓
vibe scan / vibe last
```

### VibeEvent v1 fields used today

- `schemaVersion`
- `source`
- `sessionId`
- `timestamp`
- `sequence`
- `kind`
- `rawRef` (`path`, `line`, source UUID)
- event-specific payload such as `text`, `toolUseId`, `toolName`, `command`, `exitCode`, `output`

The schema is deliberately minimal. New adapters may add fields, but detectors must not read source-specific raw JSON.

## Trust model

### Class A — proven

Direct contradiction between an explicit claim and direct machine evidence. V001 currently emits only Class A findings.

Example:

```text
Bash: npm test
Exit code: 1
Assistant: "All tests are passing now."
```

### Class B — high confidence

Reserved for V002 repeated failure loops.

### Class C — heuristic

Reserved for V004 possible diff/scope spill.

## Privacy

The current core performs no network calls and has no runtime dependencies. It reads a user-selected local transcript (or the latest Claude transcript for the current project) and prints results locally.

## Claude evidence source

Claude Code documents session transcripts as JSONL under `~/.claude/projects/<project>/<session-id>.jsonl`. Each line can represent messages, tool calls, tool results, or metadata. The adapter intentionally tolerates missing/unknown fields and keeps line-level provenance.

## Next milestone

1. Characterize the current Codex rollout JSONL format with fixtures.
2. Implement the Codex adapter against the same event contract.
3. Add V002 repeated-failure-loop detection.
4. Add feedback storage only after the detector output is stable enough to review.
