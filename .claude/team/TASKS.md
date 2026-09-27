# Task backlog

Status flow and rules in the `board-protocol` skill. Task IDs `T-<phase>-<nn>`. Phase 0 = setup, audit, plan. Detailed acceptance criteria for phase 1 live in `reports/PLAN-2026-09-24.md` section "Phase 1 task proposals"; the sections below list only deltas and additions decided after the plan (D-25, D-26, D-27).

| ID | Phase | Title | Owner | Depends on | Status | Acceptance |
|----|-------|-------|-------|------------|--------|------------|
| T-0-01 | 0 | Scaffold agents, skills, team files, CLAUDE.md | supervisor | - | DONE | see below |
| T-0-02 | 0 | Read-only repository audit | repo-auditor | T-0-01 | DONE | see below |
| T-0-03 | 0 | Target model and phased plan | architect | T-0-02 | DONE | see below |
| T-0-04 | 0 | User approval of plan, phase 1 tasks adopted | supervisor | T-0-03 | DONE | see below |
| T-1-01 | 1 | SQLite persistence, schema v1, dev server, vitest, domain definitions module | implementer | T-0-04 | DONE | plan + delta |
| T-1-02 | 1 | Local auth mode, local file store, Workspace to Project rename, Client entity, remove Supabase | implementer | T-1-01 | DONE | plan + delta |
| T-1-03 | 1 | Remove journeys, QA overlay, legacy store, metrics; project-scope HTML documentation export | implementer | T-1-02 | DONE | plan + delta |
| T-1-CP | 1 | Checkpoint report to user after T-1-03 | supervisor | T-1-03 | DONE | see below |
| T-1-04 | 1 | Property and Event in the new model: allowed values, scope, role, required, payload key, expiration, card fields | implementer | T-1-02 | DONE | plan + delta |
| T-1-05 | 1 | Variant with discriminator conditions and StandardEventMapping; remove old EventVariant | implementer | T-1-04 | DONE | plan + delta |
| T-1-06 | 1 | IdentityRule, ConsentCategory, Catalog extensions: API and tables | implementer | T-1-02 | DONE | plan + delta |
| T-1-07 | 1 | UseCaseTemplate, UseCase, ordered Requirement: API and tables | implementer | T-1-05 | DONE | plan + delta |
| T-1-08 | 1 | Shared diff primitives; data mapping and expiration settings import with diff and export | implementer | T-1-05, T-1-06 | DONE | plan + delta |
| T-1-09 | 1 | QaRun, Observation, Finding; customer events export import; definition-vs-observations comparison | implementer | T-1-08 | DONE | plan + delta |
| T-1-10 | 1 | CLAUDE.md code-derived sections, .env.example, docs/QA-LOCAL.md | docs-writer | T-1-03 | DONE | plan + delta |
| T-1-EXIT | 1 | Phase 1 exit: full qa-roundtrip on merged agent-setup, docs refresh, post-merge fixes, report to user | supervisor | T-1-09 | DONE | see below |
| T-2-00 | 2 | Phase 2 plan: target model deltas, task list from the seed, decision records | architect | T-1-EXIT | DONE | see below |
| T-2-01 | 2 | Event class custom/sdk/platform, class lists and SDK default properties, engine skips non-custom, Vite watch ignore | implementer | T-2-00 | DONE | see below |
| T-2-02 | 2 | Data Manager meta columns, type mapping module, customers parser, import with diff and byte-equivalent export | implementer | T-2-01 | DONE | see below |
| T-2-03 | 2 | Data Manager events parser, import with diff (collisions, class deselection, source rule), export with passthrough, Import page | implementer | T-2-02 | DONE | see below |
| T-2-04 | 2 | Multi-comparison orchestrator, batched resolver, comparison 4 definition vs Data Manager | implementer | T-2-03 | DONE | see below |
| T-2-05 | 2 | Comparisons 1 and 2 engines, mapping snapshot, preview findings for pasted mapping | implementer | T-2-04 | DONE | see below |
| T-2-06 | 2 | Rules domain: table, item schema, tolerance settings, operator registry, evaluator, templates, DAL and API | implementer | T-2-01 | DONE | see below |
| T-2-07 | 2 | Rules integration: engine wiring, rounding_drift via template, data-mapping import proposes the template, rules and item schema UI | implementer | T-2-04, T-2-06 | DONE | see below |
| T-2-08 | 2 | document.service EventCard, certification, coverage grid, tracking-document.json, docs/TRACKING-DOCUMENT.md | implementer | T-2-05, T-2-07 | DONE | see below |
| T-2-09 | 2 | Event card page, certified column, findings and QA runs page additions | implementer | T-2-08 | QA | see below |
| T-2-10 | 2 | MCP server: dependencies, stdio process, tools, .mcp.json, docs/MCP.md smoke test | implementer | T-2-08 | QA | see below |
| T-2-11 | 2 | Use case narrative generation, QA run export, use case coverage | implementer | T-2-01 | DONE | see below |
| T-2-12 | 2 | Identity alignment: identifier_name, transformations, sdk_call, identity codegen, ASCII validation | implementer | T-2-01 | DONE | see below |
| T-2-13 | 2 | Docs refresh: CLAUDE.md, docs/DOMAIN.md, docs/QA-LOCAL.md, qa-roundtrip scenario 8 correction proposal | docs-writer | T-2-09, T-2-10, T-2-11, T-2-12 | TODO | see below |
| T-2-EXIT | 2 | Phase 2 exit: qa-roundtrip 1 to 8 plus MCP smoke on merged agent-setup, report to user | supervisor | T-2-13 | TODO | see below |

Parallelism: T-1-03, T-1-04 and T-1-06 may run concurrently in separate worktrees after T-1-02 merges. Everything else is sequential per the dependency column.

## Acceptance criteria

### T-0-01
- All seven agents in `.claude/agents/`, seven skills in `.claude/skills/`, team files in `.claude/team/`, fixtures in `samples/`, root `CLAUDE.md` with placeholders for code-derived sections.

### T-0-02
- `reports/AUDIT-<date>.md` following the `repo-audit` template, every claim with path:line, gap table against CONTEXT.md section 4, explicit refactor-or-rebuild recommendation.

### T-0-03
- `reports/PLAN-<date>.md` following the `refactor-plan` template; decision records appended; phase 1 tasks proposed in this table's format; phase 1 includes core model plus import of all three fixtures with diff.

### T-0-04
- User approved the plan on 2026-09-24 with both standing authorisations (commit per accepted task and merge into `agent-setup`; report per phase plus a checkpoint after T-1-03). D-25, D-26, D-27 recorded. Phase 1 rows adopted.

### T-1-01 delta (in addition to the plan section)
- `0001_core.sql` also creates `clients` (id, key unique, name, bloomreach_account_id, notes, timestamps) and `projects.client_id NOT NULL` FK plus `projects.bloomreach_project_token`, `bloomreach_api_base_url`, `bloomreach_project_url` (D-27).
- `src/domain/enums.ts` implements D-25: priority `critical|high|medium|low`; event status `planned|in_review|implemented|ignored`; finding kinds incl. `missing_event|unexpected_event|unmapped_catalog`; severities; expiration units.
- `src/domain/bloomreach.ts` exposes seed lists (standard events with field lists, `main_columns`, standard customer properties, standard consent keys, known system event types per D-25 Q5) as extensible arrays, not closed unions (D-26). Project-level additions are stored in `projects.standard_event_additions_json` and `projects.consent_key_additions_json`.
- `.gitignore` gains `data/`.

### T-1-02 delta
- `/api/clients` CRUD (list, create, update; delete only when no projects). `POST /api/projects` requires `client_id`. `GET /api/projects` returns projects with their client; the switcher groups by client.
- Project settings form edits the three Bloomreach identifiers and the client.
- Local user name resolution per D-25 Q8: `E3_LOCAL_USER_NAME`, else git `user.name`, else "Local user".
- qa-tester: create a client, create two projects under it, switch between them, data stays separate.

### T-1-03 delta
- Carried from T-1-02 review: `src/pages/Events.tsx` `handleDelete` must surface non-ok responses like Properties and Catalogs do; `files.route.test.ts` dot-segment case must assert status 400 and code `INVALID_PATH`; `0004` migration `DROP INDEX` gets `IF EXISTS`.
- Worktree rule: implementers running in parallel worktrees do not edit `.claude/team/*`; they return the handoff text and the supervisor posts it.

### T-1-CP checkpoint
- Supervisor posts a report to the user after T-1-03 merges: app boots via the `e3-tracking` launch entry with no network, old code is gone (grep for `supabase`, `journey`, `qaOverlay`, `xyflow` in `src/` returns nothing), test summary line, list of what is intentionally rough until T-1-09. No new phase 1 task starts before the user acknowledges, except T-1-04 and T-1-06 which may already be in progress in parallel.

### T-1-04 delta
- Priority and status selects use the D-25 values from `enums.ts`.
- Property bundles remain functional after the Property model changes (D-26).
- Move `PROPERTY_DATA_TYPES` and data formats (incl. `money`) from `src/types/schema.ts` into `src/domain/enums.ts`; add event_sources kind and QaRun environment there too (reviewer finding on T-1-01).

### T-1-05 delta
- `StandardEventMapping.standard_event` accepts seed keys plus `projects.standard_event_additions_json`; the Standard events page has an "add standard event" form (key, field list) writing to that column (D-26).

### T-1-06 delta
- `ConsentCategory.standard_key` accepts seed keys plus project additions; the page has an "add standard consent key" form (D-26).
- Add identity_type and catalog mapping_role enums to `src/domain/enums.ts` (reviewer finding on T-1-01). T-1-07 adds UseCase type/status and Requirement status the same way.
- Catalog field rename is missing in the UI (add and delete only); add inline rename with 409 surfaced (qa-tester observation on T-1-02).
- Decide and set `ON DELETE` for `identity_rules.source_id` (SET NULL) and `identity_rules.trigger_event_id` (SET NULL) via migration.

### T-1-08 delta
- Data mapping import must not reject unknown `standard_events` keys or unknown `consents` keys; it proposes them as project additions in the diff (D-26). Export writes project additions back.

### T-1-09 delta
- Known system event types from `bloomreach.ts` do not raise `unexpected_event` (D-25 Q5). `missing_event` severity depends on run kind (agent session error, export paste warning). Rounding tolerance 0.01 on `money` properties.
- Correction to the plan's engine test: on the fixture, `unexpected_event` fires only for `paper_catalogue` and `loyalty_update`; `campaign`, `survey`, `support_ticket`, `managed_endpoint` are suppressed as known system types.

### T-1-EXIT
- qa-tester runs qa-roundtrip scenarios 1 to 7 on agent-setup from the main tree (scenario 6 CSV deferred to phase 3; scenario 7 as resolve and reopen of a type mismatch until certification display lands in phase 2). First run 2026-09-25 01:27: all round trips PASS, FAIL on two post-merge display bugs (Standard events mapped columns show dashes; QA runs page shows empty state) plus an unreproduced cold-boot burst of 500s. Fix branch `task/T-1-EXIT-fixes` off agent-setup, then re-sweep, then report.

### T-2-00
- `reports/PLAN-PHASE2-<date>.md` following the refactor-plan template scoped to phase 2; covers seed items 1 to 7 and 3b, D-28 to D-30, the carry-over notes; each task sized for one implementer invocation with acceptance criteria; decision records for non-obvious choices; open questions for the user.

### Phase 2 seed (for the architect, in priority order)
1. Data Manager customers and events import with diff, byte-equivalent export, `bloomreach_meta_json` per entity, comparison 4 definition vs Data Manager (D-28). Fixtures in samples/.
2. Comparisons 1 and 2, severity table applied end to end, certification derived and displayed, coverage grid.
3. Event card page and the machine-readable tracking document JSON.
3b. Validation rules layer per D-30: item schema on list properties, event and variant scoped rules (arithmetic, membership, bound, cross-event), project money tolerance (percentage plus floor), e164_phone format, new finding kinds, seed rule templates for cart_update and refund purchases, rules shown on the event card; the existing purchase vs purchase_item rule migrated to the rule layer.
4. MCP server (D-11, D-19) with the tool surface from the domain-model skill; expected-payload tool returns item schemas and rules.
5. Use case narrative generation, QA run export as customer events JSON, Vite watch ignore for `.claude/**`.
7. Event class `custom | sdk | platform` per D-29 replacing the custom|system type; comparison engine validates custom events only (existing suppression kept); Data Manager import deselects sdk and platform events by default; known system type list in bloomreach.ts kept current from samples/bloomreach-system-events-reference.md. No system event attribute validation.
6. Identity model alignment with Bloomreach semantics (see samples/bloomreach-identity-reference.md): identity rule gains identifier name, transformation (lowercase, trim), SDK call (identify, update, anonymize), and the re-identification rule; codegen emits identify and update snippets from identity rules; the comparison engine treats the SDK default properties os, browser, device, location as expected on frontend observations and validates event and property names are ASCII and within the 255 limits.

### Phase 2 carry-over notes (from phase 1 reviews, none blocking)
- findings.qa_run_id ON DELETE CASCADE should become SET NULL before a DELETE /qa-runs route exists (T-1-09 LOW B).
- Recompute re-resolves every observation with per-observation DAL reads (N+1); batch it when phase 2 adds comparisons 1 and 2.
- Run-filtered findings omit rows whose newest producing observation is in another run (non-sticky pointer semantics, documented).
- Import planner plan-time discriminator checks miss three cases that apply rejects cleanly; expiration variant create swallows ConflictError; blocked promotion leaves the add-allowed-value item.
- Template rows never resolved are labelled (removed) not (unresolved); no UI field for use case code; ProjectSettings disabled expiration with count 0; unstyled identity and consent docs tables; three local enum validators to fold into validators.ts; colour lint fails on a pre-existing file; Properties list re-sorts on save while the editor is open.

### T-1-10 delta
- `docs/QA-LOCAL.md` names the launch entry `e3-tracking` from `.claude/launch.json` (D-25 Q9) and documents `E3_LOCAL_USER_NAME`, `E3_DB_PATH`, `E3_PROJECT_KEY`.

### T-1-07 delta
- Carried from T-1-05 review: wrap event rename and property rename together with their variant regeneration in one db.transaction (event.dal.ts and property.dal.ts); remove the stale "sorted by property name" comment in variant.dal.ts and the unused propertyNameById parameter in domain/variants.ts.
- Add UseCase type and status and Requirement status enums to src/domain/enums.ts.

### T-1-09 delta (carried findings)
- From T-1-08 review: plan-time discriminator checks miss an unlinked property on an event with two discriminators, a context-linked property, and a duplicate attribute in one filter (apply 400s cleanly); expiration variant create still swallows ConflictError; blocked promotion leaves the add-allowed-value item in preview. From T-1-07 review: unresolved template rows are labelled (removed) rather than (unresolved). From T-1-07 QA: no UI field for use case code. Fix in T-1-09 only if touched; otherwise list in the phase 1 exit report.
- From T-1-EXIT review: propertyOrder tests do not constrain the rename and delete cases; StandardEvents load lacks catch/finally (thrown fetch leaves Loading forever) and non-ok responses show dashes silently; loadingState comment claims a spinner that is not rendered, stale rows visible across filter and project change; Properties page lacks the Loading state treatment.

### Phase 2 tasks
Detailed acceptance criteria per task live in `reports/PLAN-PHASE2-2026-09-25.md` section "Phase 2 task proposals". Parallelism: after T-2-01 merges, T-2-02, T-2-06, T-2-11 and T-2-12 may run in parallel worktrees; after T-2-08, T-2-09 and T-2-10 may run in parallel. Migration numbers are pre-assigned per D-39. Worktree rule applies.
- From T-2-12 review: identity codegen dedupe keeps the first rule by sort_order; prefer the identify rule or union transformations (fold into T-2-13 or T-2-10 touch).
- From T-2-06 review: rule message non-string -> 500 and tolerance_value non-number accepted; add finite-number and string checks (T-2-07). Arithmetic aggregate over an absent list evaluates as 0 while cross_event skips; decide in T-2-07.
- From T-2-02 review: unknown Data Manager type on an existing non-string property exports the app type, drifting from meta; surface in T-2-04 comparison 4.
- From T-2-11 review: comparison.service and customerEventsExportImport still use the uncached resolver; switch to createEventResolver in T-2-04/T-2-08.
- From T-2-03 review (D-41 amendment): description and example values edited in the app after import should also be pushed on export; give them their own reference in link meta (T-2-04 or T-2-13). Skipped property items gated by anyOf should produce one warning. Raise vitest testTimeout to 15s or mark the two slow Data Manager tests (T-2-04).
- T-2-05 delta from T-2-04 review: comparison 4 must exclude SDK_DEFAULT_PROPERTIES from unexpected_property and unmapped_property (engine-wide rule); comparison 4 unexpected_property severity is info per D-37 (flip the two literals); unknown Data Manager types report as a warning kind, not an unconditional type_mismatch error; one recompute loads events once via the shared snapshot.ts; tighten the two weak test assertions. Also: qa-roundtrip skill note that the customer events passthrough export carries the app project key in `project`.
- Follow-ups from T-2-05 review (phase 2 or 3): deleting a variant leaves its standard event mapping with variant_id null, silently turning it into an unfiltered mapping; deleteVariant should refuse (409 MAPPING_IN_USE) or clear the mapping with a warning, and comparison 1 should flag an empty-filter mapping whose event has discriminator values hinting at that standard key. Deferred comparison rows: preview-only expiration_mismatch in comparison 1; comparison 2 unmapped_standard_event when a filter never matches any observation. qa-roundtrip scenario 4 text must add the money retype before the mapping apply (or a second preview) so the purchase_items_total rule is proposed; evaluate.test.ts comment cites a non-existent integration test; errors.ts doc typo.
- From T-2-08 QA round 2: no per-finding resolve or dismiss action exists (routes/findings.ts is GET only; findings auto-resolve only when recompute stops reproducing the fingerprint); T-2-09 resolved toggle covers it. No route to edit or delete a single observation; phase 3 candidate.
