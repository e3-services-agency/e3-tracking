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
| T-2-09 | 2 | Event card page, certified column, findings and QA runs page additions | implementer | T-2-08 | DONE | see below |
| T-2-10 | 2 | MCP server: dependencies, stdio process, tools, .mcp.json, docs/MCP.md smoke test | implementer | T-2-08 | DONE | see below |
| T-2-11 | 2 | Use case narrative generation, QA run export, use case coverage | implementer | T-2-01 | DONE | see below |
| T-2-12 | 2 | Identity alignment: identifier_name, transformations, sdk_call, identity codegen, ASCII validation | implementer | T-2-01 | DONE | see below |
| T-2-13 | 2 | Docs refresh: CLAUDE.md, docs/DOMAIN.md, docs/QA-LOCAL.md, qa-roundtrip scenario 8 correction proposal | docs-writer | T-2-09, T-2-10, T-2-11, T-2-12 | DONE | see below |
| T-2-EXIT | 2 | Phase 2 exit: qa-roundtrip 1 to 8 plus MCP smoke on merged agent-setup, report to user | supervisor | T-2-13 | DONE | see below |
| T-3-00 | 3 | Phase 3 and 4 plan: model deltas, contracts, task lists, decision records | architect | T-2-EXIT | DONE | see below |
| T-3-01 | 3 | ChangeLog table, actor context, DAL write helper; wired into event, event property, property and variant mutations; history API | implementer | T-3-00 | DONE | see below |
| T-3-02 | 3 | ChangeLog on every other entity, import batch tagging, MCP actor, History panels and History page | implementer | T-3-01 | DONE | see below |
| T-3-03 | 3 | CSV export per entity: csv.ts headers, service, routes, Settings export block | implementer | T-3-00 | DONE | see below |
| T-3-04 | 3 | Full JSON backup export with embedded files | implementer | T-3-01 | DONE | see below |
| T-3-05 | 3 | Restore backup as new project: preview/apply, id remap, files, template re-link, UI | implementer | T-3-04 | DONE | see below |
| T-3-06 | 3 | Use case library: format with tags (D-57), parser, import preview/apply, export, instantiate with code, templates page with facet filters and prerequisites card, sample library | implementer | T-3-00 | DONE | see below |
| T-3-10 | 3 | Library resolution: mapping step (D-55), catalog_attribute and consent requirement targets (D-57), matrix and coverage updates, project industry field, MCP list/instantiate tools | implementer | T-3-06 | DONE | see below |
| T-3-07 | 3 | QA evidence maintenance and carried fixes: observation edit/delete, run delete, variant delete guard, identity codegen dedupe, open review items | implementer | T-3-00 | DONE | see below |
| T-3-08 | 3 | Dead-code sweep per the verified list, schema.ts reduction, legacy docs removal | implementer | T-3-02, T-3-03, T-3-05, T-3-07, T-3-10 | DONE | see below |
| T-3-09 | 3 | Docs refresh: CLAUDE.md, docs/DOMAIN.md, docs/EXPORTS.md (CSV, backup, library formats), docs/QA-LOCAL.md, qa-roundtrip scenario text for 6, 9, 10, 11 | docs-writer | T-3-08 | DONE | see below |
| T-3-EXIT | 3 | Phase 3 exit: qa-roundtrip 1 to 11 plus MCP smoke on merged agent-setup, report to user | supervisor | T-3-09 | DONE | see below |
| T-4-00 | 4 | Property definitions (D-58): migration 0021, DAL, link definition_id, comparison, card and document, exports and imports, Properties page, MCP, backup/CSV | implementer | T-3-EXIT | DONE | see below |
| T-4-01 | 4 | Share token: migration, DAL and service, requireShare middleware, public document/HTML/file routes, Settings share block | implementer | T-4-00 | DONE | see below |
| T-4-02 | 4 | Comments model: migration, DAL, internal API, requirement id stability, Comments page | implementer | T-4-00 | DONE | see below |
| T-4-03 | 4 | Shared documentation view reusing the event card renderer; EventCard triggers; public frontend route | implementer | T-4-01 | DONE | see below |
| T-4-04 | 4 | Comments in both views: shared comment routes, CommentsPanel on events, properties, use cases, requirements, shared view forms with access gating | implementer | T-4-02, T-4-03 | DONE | see below |
| T-4-05 | 4 | Docs refresh: docs/SHARING.md, CLAUDE.md, docs/QA-LOCAL.md, qa-roundtrip scenarios 12, 13 and 14 text | docs-writer | T-4-04, T-4-06 | DONE | see below |
| T-4-06 | 4 | Use case activation status and Bloomreach asset links (D-56): migration 0020, DAL, routes, use case page section, Activation page with readiness warning, docs HTML, shared view, backup and CSV columns; initiative export import if samples/bloomreach-initiative-export.json exists | implementer | T-4-03 | TODO | see below |
| T-4-07 | 4 | Use case library extension: templates for the Use Case Center catalog from samples/br-docs (second library file, tags, prerequisites per D-55/D-57), parser-validated, imported in T-4-EXIT | implementer | T-3-EXIT | IN_PROGRESS | see below |
| T-4-08 | 4 | Use Case Center template import (D-59): pnpUseCase converter, vocabulary alignment, templates page accepts pnp JSON, generated seed from samples/br-pnp replacing hand-authored duplicates, docs/LIBRARY.md regenerated | implementer | T-4-07 | DONE | see below |
| T-4-09 | 4 | Getting started: project checklist computed from data, empty states with next step on every page, in-app Help page rendering the docs, glossary tooltips from one glossary file | implementer | T-4-04 | DONE | see below |
| T-4-10 | 4 | Internal-only comments and per-link comment visibility (D-49 amendment 2): migration 0024, comment DAL/routes, shared route filtering, CommentsPanel checkbox and badge, share modal setting, backup/CSV, docs/SHARING.md | implementer | T-4-04 | DONE | see below |
| T-4-11 | 4 | Sandbox content. Part A (now): lean curated sandbox from a hand-written seed (Bloomreach required/recommended events + 2 custom, standard properties, system customer properties with hints, SDK defaults, variants, 3 use cases with narratives, consents by channel, identity rules, comments, 2 trigger screenshots, a QA run with findings per family; < 1 MB; big fixtures stay in tests). Part B (blocked on user: D-61 catalogs per market, D-62 sources + method, consent list): catalogs GB/CZ, sources, alignment checks | implementer | T-4-10 | DONE | see board 2026-10-05 |
| T-4-12 | 4 | UI consistency pass: one page layout rule, no nested scrollers, "Add to project" wording, requirements matrix rework, certification block on the card, "Open shared view" button, glossary tooltip sweep | implementer | T-4-10 | DONE | see board 2026-09-29 |
| T-4-13 | 4 | Help unification: merge the Documentation knowledge base into Help (Guide / Reference / Glossary), GFM table rendering, copy as Markdown on docs, event cards and use cases | implementer | T-4-10 | DONE | see board 2026-09-29 |
| T-4-14 | 4 | Shared view UX: events collapsed by default, anchors and copy-link, sticky event header, expand/collapse all, codegen tabs with copy buttons (also on the internal card), left navigation with scroll position, trigger block with gallery; tables full width on wide screens, hide empty sections (no rules, no use cases, derived metrics []) on the client view, payload key as the primary property column | implementer | T-4-12 | DONE | see board 2026-09-29 |
| T-4-15 | 4 | Backlog fixes: strip share_token from the backup export, create-project modal validation message | implementer | T-4-10 | DONE | see board 2026-09-29 |
| T-4-16 | 4 | Shared view follow-ups: collapsible nav groups, section links that work, per-row comment counts with on-demand threads (requirements, event cards) | implementer | T-4-14 | DONE | see board 2026-09-29 |
| T-4-17 | 4 | Codegen v2 (D-63): migration 0025 (event implementation_method + dl_event_name, property kind + derivation rule), namespaced dataLayer snippets with reset, brPayload helper and GTM template export, Web SDK new/legacy tabs, Tracking API default for server-side events, SDK events show emitting call + default properties, property kinds on cards/documents/shared view, comparison rules for state lists, bundle picker in the event editor | implementer | T-4-16 | DONE | see D-63 |
| T-4-18 | 4 | Shared view polish: one global expand/collapse pair plus per-section toggles, nav group rows toggle on label click, sticky section and group headers with handover | implementer | T-4-16 | DONE | see board 2026-09-29 |
| T-4-19 | 4 | Shared view content polish: wrap long cells (findings message, field map), readable example values (no escaped JSON; investigate double-encoded array examples from the Data Manager import), standard event mappings rework (per mapping a two-column field list, unmapped fields shown as such, not '-> dash'), richer findings summary (by severity, by comparison, top events, link to Findings), Bloomreach brand accent (#FFD500 as a CSS variable) on sdk/platform badges, event properties table fits the card on wide screens (column set per view, no horizontal scroller) | implementer | T-4-17 | DONE | see board 2026-09-29 |
| T-4-20 | 4 | Property categories (D-64): classifyProperty, migration 0027 override, system customer formats as hints and checks, grouped Properties section on the shared view with sticky group headers, Properties page filter, tracking document/CSV/HTML/Markdown, Catalogs section on the shared page, sidebar icons on the shared page | implementer | T-4-19 | DONE | see D-64 |
| T-4-21 | 4 | Shared view sections as nav groups with leaves (use cases grouped by the existing use_cases.type (marketing | transactional, USE_CASE_TYPES); the add-to-project dialog asks for the type, defaulting from the template's channels since pnp templates arrive as marketing; consents by channel; one leaf per mapping; findings by comparison with affected events); findings summary by kind family (schema, values, arithmetic, consistency, coverage, Data Manager) with human labels, explanations and next steps; glossary tooltips for comparison names and finding kinds on the shared page, HTML and Markdown | implementer | T-4-20 | DONE | see board 2026-09-30 |
| T-4-22 | 4 | Shared and internal view utilities: copy-name buttons on every entity name; category badges on properties (Bloomreach accent for system customer and SDK default); cross-reference links (used-in events, property rows, catalog fields, requirement targets) using the existing anchors; naming convention project setting (D-65: snake_case default, kebab-case, camelCase; system items excluded; editor warning + comparison-1 finding naming_violation, migration 0028) | implementer | T-4-21 | DONE | see board 2026-09-30 |
| T-5-00 | 5 | Containerization (D-66, local only): multi-stage Dockerfile, Express serves dist/ with SPA fallback, MCP entrypoint, docker-compose with data volume and nightly backup job, health check, .dockerignore, docs/DEPLOY.md runbook, QA scenarios against the local container | implementer | T-4-11 | DONE | see D-66 |
| T-4-23 | 4 | Codegen and data fixes (user review 2026-10-06): Web SDK snippet uses brweb.track; Tracking API customer_ids from the project's hard id (identity rules) with a comment + link https://documentation.bloomreach.com/data-hub/reference/tracking-api-overview; items example includes a variant entry and derived variant_ids/variant_list; standard-event dropdown only on discriminator allowed values; use case narrative markdown rendered on the shared page; "properties that look up into this catalog" shown on every catalog of the kind (products_cz, variants_cz) | implementer | T-5-00 | IN_PROGRESS | see board 2026-10-06 |
| T-4-24 | 4 | UI polish (user review 2026-10-06): hover hints on fields/columns; one badge vocabulary with icons for class/category/priority/status (sdk+platform yellow) across all pages; rule builder "must be present in" and other editor text sizing; nested definition rows under a property in the event editor; History full-page modal option with a remembered preference; trigger images drag-and-drop, multiple images per trigger, multiple triggers; variants/categories collapsible by one toggle; search on Events and Properties; column sorting on main tables; requirements matrix icons/colours per target kind | implementer | T-4-23 | TODO | see board 2026-10-06 |
| T-4-25 | 4 | Shared view (user review 2026-10-06): requirement rows show target type and every target is clickable (variants, consents, catalog attributes); "Not tied to an event" findings group clickable with its findings and explanations | implementer | T-4-23 | TODO | see board 2026-10-06 |
| T-4-EXIT | 4 | Phase 4 exit: qa-roundtrip 1 to 13 plus MCP smoke on merged agent-setup, report to user | supervisor | T-4-05 | DONE | see below |

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
7. Event class `custom | sdk | platform` per D-29 replacing the custom|system type; comparison engine validates custom events only (existing suppression kept); Data Manager import deselects sdk and platform events by default; known system type list in bloomreach.ts kept current from samples/br-docs/reference/bloomreach-system-events-reference.md. No system event attribute validation.
6. Identity model alignment with Bloomreach semantics (see samples/br-docs/reference/bloomreach-identity-reference.md): identity rule gains identifier name, transformation (lowercase, trim), SDK call (identify, update, anonymize), and the re-identification rule; codegen emits identify and update snippets from identity rules; the comparison engine treats the SDK default properties os, browser, device, location as expected on frontend observations and validates event and property names are ASCII and within the 255 limits.

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
- Phase 3 and 4 acceptance sections live in .claude/team/reports/PLAN-PHASE3-4-2026-09-27.md; decisions D-44..D-57.
- From T-2-EXIT QA: the two Data Manager import textareas need a file-upload input (164 KB single-line JSON is impractical to paste); phase 3 UI touch or T-3-09 note. docs/QA-LOCAL.md certification section must say cart_update starts at no (open_errors: 2) after the retype recipe; use checkout or a fresh project for the yes -> no -> yes probe (T-3-09).
- Use Case Center documentation in samples/br-docs covers the center chapters, requirements, FAQ and compound value use cases; not yet covered: email, web personalisation, omnichannel, analytics, paid media and mobile messaging use case chapters. A later library extension reads them when the user adds them.
- From T-3-03 review: deleteEvent does not delete the event rules (GET /rules returns orphans with a raw event id); clean rules in deleteEvent (T-3-07 follow-up or phase 3 sweep).
- From T-3-01 review (FAIL 2026-09-27 23:27, board entry): ERROR keyset `before` cursor on `changed_at` alone drops rows sharing the millisecond (46 of 60 DAL, 1716 of 1746 route); use a composite `(changed_at, id)` cursor with a same-millisecond paging test. WARNING `limit=1.5` -> 500 datatype mismatch; WARNING `deleteEvent` cascade writes no variant/mapping delete rows (variants in the fix round, mappings and identity rules in T-3-02); WARNING `updateEvent` with only `source_ids` writes no row. INFO identity columns in create/delete diffs; double `getPropertyById` per link in `replaceEventProperties`; T-3-07 also edits `deleteVariant` (no textual conflict, verify after merge).
- T-3-09: qa-roundtrip scenario 4 open-findings baseline on the merged tree is 77 (40 error / 37 warning), not 75; update the skill text.
- From T-3-05 review: bodies over the 20 MB json limit on ordinary routes return 500 INTERNAL_ERROR instead of 413 (entity.too.large unmapped in the error handler); map it (T-3-08 or phase 4 touch).
- From T-3-05 pre-QA fix: RestoreBackupForm reloads immediately on success and never shows apply warnings[]; surface them before navigating (phase 4 UI touch).
- From T-3-02 QA: the History page Batch id filter needs the full UUID but the page shows only 8 characters; expose the full id (title or click to copy) or accept a prefix match (phase 4 UI touch or T-3-09 note).
- From T-3-EXIT re-check: the full-chain baseline shows 77 or 78 open findings (one missing_event warning varies); investigate the source of the one-count drift when touching comparison 3 next (phase 4 or 5).
- 2026-09-28: the user added the full Use Case Center documentation to samples/br-docs (101 pages in seven section folders: about-use-case-center, analytics, compound-value, email, mobile-messaging, omnichannel, paid-media, web-personalization; references under reference/). The earlier note about six missing chapters is closed. T-4-07 library extension started.
- From T-4-00 review: the HTML documentation export has no per-property definition list (only the inline per-event definition); T-4-03 renders the properties section from tracking document properties[].definitions[].
- From T-4-03 QA: a malformed percent escape in any app URL (/tracking-plan/shared/%ZZ) crashes Vite dev and vite preview before the app runs; the deploy target serves dist/ via static rewrites. Verify on the real host at phase 5 deployment; add a server-side 400 if the host decodes too.
- (closed, T-4-15) backup.json share_token: already null with a test; no change needed.
- Test timeouts under load: backup.service.test.ts, backupRestore.service.test.ts and the document snapshot test exceed the 15 s default when two suites run concurrently; set a per-file testTimeout (60-90 s) for those files.
- Flaky test: full vitest runs on agent-setup occasionally report 1 failure (1460/1461, 1456/1457) with a clean re-run; identify the test (run with the default reporter until it reproduces) and fix the isolation issue.
- (closed, T-4-13 QA) T-4-15 modal browser check PASS on the merged tree.
- Sandbox data (for T-4-11): UC-01..03 in the bundled backup have no narrative and blank requirement statuses; the generator should regenerate narratives and run coverage so the sandbox use cases look finished.
- From T-5-00 re-review: backupJobMain.ts has no SIGTERM handler, so `docker compose stop` leaves the SQLite WAL/SHM behind (recovered on next start); add closeDb on SIGTERM and soften the DEPLOY.md sentence.
- From T-4-11B review/QA: property editor fetches one GET /catalogs/:id per catalog on open (N+1); the data-mapping export shows null main/variant catalogs on a project without an imported mapping snapshot (derive the catalog roles from the catalogs table when no snapshot exists); explicit client_web is indistinguishable from the default when a Tracking API source is added later (consider a tri-state).
- From T-4-11A QA: requirement `status` stays null for resolved requirements (only gaps get `gap`) -- decide whether resolved requirements should store `resolved`; purchase card shows "0 observed cell(s)" under Coverage while Freshness counts 2 observations; a server_api event still lists SDK default properties under Implementation; two sandboxes share the display name "Acme EU (sandbox)" (suffix the name like the key).
- From T-4-20 QA: the property editor has no control to map an event property to a catalog field (only the API PATCH mapped_catalog_id / mapped_catalog_field_id works); add the picker with T-4-11 / D-61 catalogs.
- From T-4-19 QA: an array property with an example prints a scalar in the expected payload ("product_ids": "2023" instead of ["2023"]); `POST .../import/data-manager-events/apply` with a body missing `payload` returns 500 INTERNAL_ERROR instead of 400; descriptions imported quoted from the Data Manager stay quoted ("Loyal").
- From T-4-17 re-review: name-based inference is case-sensitive in TS but SQL LIKE is not (PRODUCT_IDS backfilled by 0025, not inferred at create); docs/TRACKING-DOCUMENT.md must say datalayer_path is null for non-client_web events.
- From T-4-17 QA: no UI to create a property bundle (Properties page only assigns to existing bundles); the Add bundle picker is missing from the event create form.
- From T-4-17 review: (a) state-list check 'ids match catalog lookup keys' (D-63 item 4) not implemented, do with T-4-11/D-61 catalogs; (b) `%refund%` method heuristic matches any name containing refund; (c) identity push (`bloomreach.customer_ids`) not shown in the dataLayer/GTM snippets; (d) kind inference for imported properties (Data Manager, data-mapping) only happens in the migration backfill; (e) new Web SDK config key and some system-event wording written from memory, verify against current Bloomreach docs.
- From the user's sandbox review (2026-09-29): (a) event card certification is only a small header badge; add a prominent certification block with the reasons and what would flip it, plus the glossary tooltip; (b) Settings share block gains an "Open shared view" button (preview what the client sees) next to the copy link; (c) the sandbox generator adds sample comments (client comment via share on cart_update, an internal reply, an internal-only note after T-4-10, one requirement comment) -- do (c) together with the T-4-10 sandbox backup regeneration.
- From T-4-09 QA/review: create-project modal silently no-ops when the key is empty (add a validation message); getting-started shows 2/9 on an empty project (client_and_project, property_types_reviewed vacuously true), consider requiring at least one property; sandbox create offers no client choice (D-60 says chosen client or auto Sandboxes); empty-state flashes before the first fetch on Events/Properties/Catalogs/IdentityRules/ConsentCategories/UseCases (add a loading guard); comparison_run step = any finding row exists (a clean run never completes it); a backup taken of a sandbox restores as a sandbox (document in EXPORTS.md); glossary tooltip sweep beyond the first three spots (Properties Definition, Events Variant, Findings Acknowledged, UseCases Activation after T-4-06).
- From T-4-08 QA: the project-create modal once ignored the first submit (key field empty); check ProjectShellContext create form in T-4-09.
