# e3-tracking

In-house web app for Bloomreach Engagement migration intake, use-case data mapping, per-event documentation, automated QA, and export. Owner: E3 Services (Ján Pan). Replaces the Google Sheet plus Apps Script workflow entirely, with no legacy compatibility.

## Start here
- Product context and rules: `.claude/team/CONTEXT.md` (authoritative)
- Decisions: `.claude/team/DECISIONS.md`
- Backlog: `.claude/team/TASKS.md`
- Message board: `.claude/team/BOARD.md` (append-only; see the `board-protocol` skill)
- Fixtures for QA: `.claude/team/samples/`
- Agents: `.claude/agents/` (supervisor, repo-auditor, architect, implementer, reviewer, qa-tester, docs-writer)
- Skills: `.claude/skills/` (board-protocol, repo-audit, domain-model, refactor-plan, implement-task, review-checklist, qa-roundtrip)

## Working rules
- Branch `agent-setup` is the integration branch. Tasks on `task/<TASK-ID>-<slug>`. Never work on or merge to `main` without the user.
- Commit only when the user asks.
- Simplified UI during the agent build phase (D-07). No design work unless a task says so.
- Every Bloomreach JSON import shows a diff and needs confirmation (D-04).
- Variants = event plus discriminator conditions; contexts never create variants (D-03).
- Local-first: the app runs and is tested fully on localhost before any remote deployment (D-09).

## Stack and tooling
<!-- TODO(docs-writer, after T-0-02): framework, language, package manager, node version -->

## Run locally
<!-- TODO(docs-writer, after T-0-02): install, dev server command, port, launch.json entry name -->

## Test and lint
<!-- TODO(docs-writer, after T-0-02): commands and expectations -->

## Build and deploy
<!-- TODO(docs-writer, after T-0-02): build command, hosting, env var names only -->

## Repository structure
<!-- TODO(docs-writer, after T-0-02): top-level folders and what lives where -->

## Domain quick reference
See the `domain-model` skill. Core entities: Project, Event, Property, EventProperty (role normal/discriminator/context), Variant, CustomerProperty, IdentityRule, Catalog, ConsentCategory, UseCaseTemplate, UseCase, Requirement, Observation, Finding.
