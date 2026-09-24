# Task backlog

Status flow and rules in the `board-protocol` skill. Task IDs `T-<phase>-<nn>`. Phase 0 = setup, audit, plan.

| ID | Phase | Title | Owner | Depends on | Status | Acceptance |
|----|-------|-------|-------|------------|--------|------------|
| T-0-01 | 0 | Scaffold agents, skills, team files, CLAUDE.md | supervisor | - | DONE | see below |
| T-0-02 | 0 | Read-only repository audit | repo-auditor | T-0-01 | TODO | see below |
| T-0-03 | 0 | Target model and phased plan | architect | T-0-02 | TODO | see below |
| T-0-04 | 0 | User approval of plan, phase 1 tasks adopted | supervisor | T-0-03 | TODO | see below |

## Acceptance criteria

### T-0-01
- All seven agents in `.claude/agents/`, seven skills in `.claude/skills/`, team files in `.claude/team/`, fixtures in `samples/`, root `CLAUDE.md` with placeholders for code-derived sections.

### T-0-02
- `reports/AUDIT-<date>.md` following the `repo-audit` template, every claim with path:line, gap table against CONTEXT.md section 4, explicit refactor-or-rebuild recommendation.

### T-0-03
- `reports/PLAN-<date>.md` following the `refactor-plan` template; decision records appended; phase 1 tasks proposed in this table's format; phase 1 includes core model plus import of all three fixtures with diff.

### T-0-04
- User has approved the plan on the board; phase 1 rows added to this table with owners and criteria.
