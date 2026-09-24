---
name: board-protocol
description: How agents post to the team message board and update task status in .claude/team. Load before any write to BOARD.md or TASKS.md.
---

# Board protocol

Two files, both in `.claude/team/`. Append-only board, mutable task table.

## BOARD.md
Append an entry at the end. Never edit earlier entries. Format:

```
### <yyyy-mm-dd hh:mm> | <from-agent> -> <to-agent or ALL> | <KIND> | <TASK-ID or ->
<one paragraph, or a short list>
```

KIND is one of:
- `INFO` general update
- `HANDOFF` implementer finished, ready for review (use the handoff template from `implement-task`)
- `PASS` / `FAIL` reviewer or qa-tester verdict
- `BLOCKED` cannot proceed, state what is needed and from whom
- `DECISION` a decision was taken, also recorded in DECISIONS.md
- `QUESTION` for the user, supervisor relays it

Get the timestamp with `date "+%Y-%m-%d %H:%M"`.

## TASKS.md
One row per task in the table. Columns: ID, Phase, Title, Owner, Depends on, Status, Acceptance (link to the detail section below the table).

Status values, in order: `TODO`, `IN_PROGRESS`, `REVIEW`, `QA`, `DONE`, `BLOCKED`.

Only the owner moves a task to `REVIEW`. Only the reviewer moves it to `QA` or back to `IN_PROGRESS`. Only the qa-tester or supervisor moves it to `DONE`.

Task IDs are `T-<phase>-<nn>`, for example `T-1-03`.

## Rules
- Post before you start a task (`INFO`, "starting T-1-03") and when you stop for any reason.
- One entry per event. Do not batch a day of work into one entry.
- Quote file paths with line numbers. Never paste large code blocks on the board.
