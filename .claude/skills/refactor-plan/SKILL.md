---
name: refactor-plan
description: How to write the target model, phased plan, decision records, and phase-1 task proposals for e3-tracking. Load when planning architecture or writing to DECISIONS.md.
---

# Refactor plan

## Plan document
Write to `.claude/team/reports/PLAN-<yyyy-mm-dd>.md`:

```
# Plan <date>
## Target data model (entities, fields, relations, enums; reference domain-model skill, state deviations)
## Storage and API shape
## Import / export contracts (one subsection per Bloomreach format, plus CSV and full JSON backup)
## Three-way comparison engine design
## UI surface for the agent phase (simplified, list what exists per entity)
## Phases (each: goal, scope, out of scope, exit criteria testable by qa-tester)
## Phase 1 task proposals (TASKS.md format)
## Open questions for the user
```

## Phase rules
- Every phase ends with the app runnable and a QA round trip possible.
- Phase 1 must deliver the core model plus import of all three Bloomreach fixtures with a visible diff, even if the UI is a plain table.
- Keep the use-case library empty but modelled.
- No legacy compatibility work in any phase.

## Decision records
Append to `.claude/team/DECISIONS.md`:

```
## D-<nn> <title>
Date: <yyyy-mm-dd>  Status: accepted | superseded by D-<mm>
Context: <why a decision was needed>
Decision: <what was chosen>
Consequences: <what follows, what it rules out>
```

Number sequentially. Never delete; supersede.
