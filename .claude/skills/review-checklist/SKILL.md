---
name: review-checklist
description: Review criteria for task branches in e3-tracking. Load before reviewing any diff.
---

# Review checklist

Apply every item. Report only real findings, ranked by severity, each with `path:line`, what breaks, and a concrete input.

## Correctness
- Does the change do what the task's acceptance criteria say, fully?
- Edge cases: empty imports, duplicate event names, properties with no type, variants referencing non-discriminators, values outside enums, events past expiration.
- Type handling of Bloomreach values that arrive as strings.

## Domain fit
- Matches the `domain-model` skill: roles, variant rules, finding kinds, certified status logic.
- No variant modelled as a separate event.
- Use cases keep the template/instance split.
- No Google Sheets or Apps Script dependency.

## Data safety
- Imports diff before apply. No silent overwrite. No data loss on failed import.
- Exports round-trip: export then import yields no diff.

## Code quality
- Enums and allowed values defined once.
- No dead code left from the Sheet era in touched files.
- Tests cover the new logic and actually assert behaviour.
- No secrets, no hardcoded project IDs.

## Process
- Branch off `agent-setup`, not `main`.
- Handoff report complete and truthful (re-run the tests yourself).

Verdict: `PASS` or `FAIL` on the board. FAIL for any severity-error finding.
