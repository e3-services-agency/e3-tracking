---
name: implement-task
description: Branching, commit, definition-of-done, and handoff format for implementing a task from TASKS.md. Load before writing any application code.
---

# Implement a task

## Setup
1. `git checkout agent-setup` (and `git pull --ff-only` if a remote tracks it).
2. `git checkout -b task/<TASK-ID>-<slug>`.
3. Post `INFO starting <TASK-ID>` on the board.

## While working
- Commit only when the user has asked for commits; otherwise leave changes uncommitted and say so in the handoff.
- Follow the `domain-model` skill. Enums, discriminators, and finding kinds come from one shared definition module.
- No visual polish. Plain tables and forms are fine.
- Every import shows a diff and requires confirmation before applying.
- Update or add tests for changed logic. Run the full suite. Paste the summary line of the result in the handoff, including failures.
- Do not widen scope. If you discover something out of scope, post an `INFO` on the board and continue.

## Definition of done
- Acceptance criteria in TASKS.md all met and each one verifiable by the qa-tester in the browser or by a test.
- No new console errors on the touched pages.
- Types compile, lint passes, tests pass, or the handoff states exactly what fails and why.
- No dependency on Google Sheets or Apps Script introduced.

## Handoff template (post on BOARD.md as HANDOFF)
```
Task: <TASK-ID> <title>
Branch: task/<id>-<slug>
Changed: <list of files with one line each>
How to verify: <numbered steps for qa-tester>
Tests: <command> -> <result line>
Known gaps: <or "none">
Decisions needed: <or "none">
```
Then set the task status to `REVIEW`.
