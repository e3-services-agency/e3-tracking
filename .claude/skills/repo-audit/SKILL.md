---
name: repo-audit
description: Procedure and report template for the read-only audit of the e3-tracking repository against CONTEXT.md. Load when asked to audit, map, or assess the codebase.
---

# Repo audit

Read-only. Measure the code against `.claude/team/CONTEXT.md`.

## Procedure
1. Inventory: top-level layout, package manifests, build tooling, frameworks, runtime targets, deploy config, CI. Note versions.
2. Data model: find every type, schema, or table that represents events, properties, variants, use cases, identity, customer properties, catalogs, consents, expiration, projects or clients. Record where they live and how they relate.
3. Persistence: where data is stored, how it is loaded and saved, and any dependency on Google Sheets or Apps Script.
4. Import/export: every path that reads or writes Bloomreach JSON, CSV, or Sheet data. Note which of the three formats in CONTEXT.md are covered.
5. UI: pages and main components, what each edits, how enums and dropdowns are defined.
6. QA overlay: what `qaOverlayInjection` and related code do, how frontend events are captured, what is compared against what.
7. Tests: what exists, what runs, whether it passes. Run the suite if it needs no network and no secrets.
8. Git history: last 30 commits, hot files, to understand recent direction.
9. Gap analysis: for each capability in CONTEXT.md section 4 "Required capabilities", mark Present, Partial, or Missing with evidence.
10. Risk list: anything that would break when Sheets support is removed, plus security or data-loss risks noticed in passing.

## Report template
Write to `.claude/team/reports/AUDIT-<yyyy-mm-dd>.md`:

```
# Audit <date>
## Summary (10 lines max)
## Stack and tooling
## Data model as implemented
## Persistence and Sheet dependency
## Import / export coverage
## UI map
## QA overlay
## Tests
## Gap analysis (table: capability | status | evidence)
## Risks
## Recommendation: refactor core or rebuild core, with reasons
```

Every claim needs a `path:line` reference. Say "not found" rather than guessing.
