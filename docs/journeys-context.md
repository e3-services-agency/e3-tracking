# Journeys Feature Context

## 1. Purpose
- **What the Journeys feature does (from code):** Provides an interactive “tracking plan journey” builder using React Flow with node types like steps, triggers, notes, and drawable annotations. Users can persist the canvas, upload step screenshots, connect triggers to events, and run a QA workflow per journey with node-level verifications and proofs.
- **Product/business purpose (inferred from code):** Lets teams turn an implementation/tracking plan into developer-ready documentation by (a) rendering a public shared view and (b) generating a standalone “implementation brief” HTML export from the journey canvas + event property attachments.
- **Main user flows (from routes + components):**
  - **Builder (authenticated):** `src/pages/Journeys.tsx` renders `JourneyCanvas` and uses `useJourneyCanvas` to save canvas + QA.
  - **Canvas save:** `PUT /api/journeys/:id/canvas` persists React Flow nodes/edges into `journeys.canvas_nodes_json` / `journeys.canvas_edges_json`.
  - **Share (public):** UI enables sharing via `POST/PATCH /api/journeys/:id/share`, then public URLs render via `src/pages/SharedJourneyView.tsx` and `/api/shared/journeys/...` endpoints.
  - **Implementation brief export:** shared views call `GET /api/shared/journeys/journey/:id/export/html` and render returned `text/html` in an iframe.
  - **QA runs (in-app):** QA runs are created/selected in the builder; persisted via `PUT /api/journeys/:id/qa` and loaded via `GET /api/journeys/:id/qa`.
  - **QA runs (shared):** shared view loads QA runs + verifications via the same `qa` DAL reconstruction logic on the backend.

## 2. File Map
This file map is based on direct code inspection of the Journeys feature folder plus the concrete routing/API entrypoints we found in the repository.

### Feature files
- `src/features/journeys/editor/JourneyCanvas.tsx`: Main Journey builder UI, including QA side panel/overlay and proof/verifications rendering (gated by `readOnly || qaLocked`).
- `src/features/journeys/hooks/useJourneyCanvas.ts`: Core canvas persistence + QA snapshot save/load logic; also injects `readOnly` into node `data` when remapping QA snapshots.
- `src/features/journeys/hooks/useJourneysApi.ts`: Frontend API helpers for journeys (canvas save, share toggle, QA persistence, export).
- `src/features/journeys/hooks/useJourneys.ts`: Fetches journeys list for the active workspace (`GET /api/journeys`).
- `src/features/journeys/nodes/types.ts`: Journeys node data shapes and union typing used by React Flow nodes + QA attachments.
- `src/features/journeys/nodes/JourneyStepNode.tsx`: Step node UI, including screenshot upload and image rendering with special handling for legacy/proxy URLs.
- `src/features/journeys/nodes/TriggerNode.tsx`: Trigger node UI for connecting events and rendering trigger/QA related verification UI.
- `src/features/journeys/nodes/AnnotationNode.tsx`: Annotation node drawing/resizing UI; uses CSS variables `--annotation-*` for highlight palette.
- `src/features/journeys/nodes/NoteNode.tsx`: Sticky note node UI.
- `src/features/journeys/nodes/NodeHandles.tsx`: React Flow handle config and per-node UI affordances.
- `src/features/journeys/overlays/JourneyQuickAddMenu.tsx`: Context menu overlay for quick node addition.
- `src/features/journeys/overlays/JourneyStartQARunModal.tsx`: “Start New QA Run” modal UI; current UX disables editable fields and removes Environment input.
- `src/features/journeys/overlays/JourneyPendingQAWarnModal.tsx`: Warning modal shown when attempting to save QA while some steps are still Pending.
- `src/features/journeys/overlays/JourneyProofViewer.tsx`: Proof viewer modal for fullscreen proof content.
- `src/features/journeys/lib/journeyImageStorage.ts`: Uploads step screenshots to backend image endpoint (`POST /api/journeys/:id/images`) using `x-workspace-id`.
- `src/features/journeys/lib/proofs.ts`: Reads/normalizes uploaded proof files into `QAProof` objects for storage in node verifications.
- `src/features/journeys/lib/qaRunUtils.ts`: Centralized QA Run naming formatter + derived QA status calculation used across UI and shared views.
- `src/features/journeys/lib/index.ts`: Barrel export for Journeys libs.
- `src/features/journeys/editor/index.ts`: Barrel export for editor.
- `src/features/journeys/nodes/index.ts`: Barrel export for nodes.
- `src/features/journeys/hooks/index.ts`: Barrel export for hooks.
- `src/features/journeys/overlays/index.ts`: Barrel export for overlays.
- `src/features/journeys/page/index.ts`: Placeholder barrel export.
- `src/features/journeys/qa/index.ts`: Placeholder barrel export.
- `src/features/journeys/qa/` (inferred): QA surface is currently driven from `Journeys.tsx` + `JourneyCanvas` rather than a dedicated QA module (inference based on inspected folder contents).

### Routes/pages
- `src/App.tsx`: Detects share URLs and routes public share/brief views to `SharedJourneyView` / `SharedJourneyBriefView`.
- `src/components/layout/Layout.tsx`: App layout + workspace deep-link handling (`/w/<workspace_key>/...`) and route syncing for `/journeys` pages.
- `src/pages/Journeys.tsx`: Builder page for a selected journey; wires canvas + QA selector + share toggle + “End QA” locking.
- `src/pages/JourneysList.tsx`: Entry screen that lists journeys and creates/deletes journeys (calls journeys API helpers).
- `src/pages/SharedJourneyView.tsx`: Public read-only shared view; renders `JourneyCanvas` and the implementation brief/QA modes via URL state.
- `src/pages/SharedJourneyBriefView.tsx`: Public brief viewer that fetches HTML and renders it in an iframe.

### Services/api (backend contracts)
- `src/backend/app.ts`: Express app that mounts `/api/journeys` and `/api/shared`, replacing some serverless functions with Express routes (includes `/api/health`).
- `src/backend/routes/journeys.ts`: Authenticated endpoints for canvas save, images upload, share enable/disable, export HTML (internal), QA persistence/load, and validation.
- `src/backend/routes/shared.ts`: Public share endpoints for journey read-only data, images streaming, implementation brief HTML, and QA run reconstruction.
- `src/backend/dal/journey.dal.ts`: DAL for `journeys` CRUD + saving canvas JSON + syncing `journey_events` from trigger nodes.
- `src/backend/dal/qa.dal.ts`: DAL for persisting QA runs (meta + snapshot + per-node verifications) and reconstructing frontend `QARun` objects for public/shared views.
- `src/backend/dal/event.dal.ts`: DAL for event and attached property details used by snippet building and export.
- `src/backend/services/codegen.service.ts`: Generates the 3 event code snippet styles (dataLayer, bloomreach SDK, bloomreach tracking API).
- `src/backend/services/export.service.ts`: Standalone HTML implementation brief generator (steps + screenshots + payload examples + annotation overlays).
- `src/lib/handoff/generateHandoff.ts`: Builds/assembles the “handoff” content from serialized data (used by broader export flows).
- `src/lib/serializeHandoffData.ts`: Serializes tracking plan data + journeys + QA into a portable structure used by handoff/export templates.
- `src/lib/handoff/htmlUtils.ts`: HTML utility helpers used by handoff generation.

### Store/state
- `src/store.tsx`: Zustand store; holds `mainData.journeys` and workspace selection state (`activeWorkspaceId` UUID + `activeWorkspaceKey` short key).

### Types/schemas/contracts
- `src/types.ts`: Frontend types (especially `QARun`, `QAVerification`, `QAProof`, Journey node typing).
- `src/types/schema.ts`: Backend schema row typings that mirror SQL tables.
- `supabase/migrations/0001_initial_schema.sql`: Establishes `journeys`, `qa_runs`, `qa_run_payloads`, and RLS policies (incl. share-related columns).
- `supabase/migrations/0002_journeys_canvas_columns.sql`: Adds `journeys.canvas_nodes_json`, `journeys.canvas_edges_json`, and `journeys.testing_instructions_markdown`.
- `supabase/migrations/0007_security_and_membership.sql`: Security/membership policies that gate ownership and access patterns.

### Utils/constants
- `src/lib/api.ts`: `fetchWithAuth` wrapper; special-cases `FormData` to avoid incorrect `Content-Type`.
- `src/config/env.ts`: `API_BASE` and `SUPABASE_URL` for building public Storage URLs.
- `src/index.css`: Tailwind theme tokens and `--annotation-*` palette used by annotation nodes.

### Serverless wrapper endpoints (Vercel filesystem routes)
- `api/[...path].ts`: Catch-all that forwards to Express with `/tracking-plan` prefix normalization.
- `api/journeys/[id].ts`, `api/journeys/[id]/canvas.ts`, `api/journeys/[id]/images.ts`, `api/journeys/[id]/share.ts`, `api/journeys/[id]/export/html.ts`, `api/journeys/[id]/qa.ts`: Dedicated wrappers for deep method+path routing reliability.
- `api/journeys/[id]/images/[encodedPath].ts`: Streams uploaded journey images (object path decoding).
- `api/shared/journeys/[token].ts`, `api/shared/journeys/journey/[id].ts`, `api/shared/journeys/journey/[id]/export/html.ts`, `api/shared/journeys/journey/[id]/images/[encodedPath].ts`: Dedicated public shared view wrappers.

### Tests
- None found explicitly for Journeys in the inspected repo paths.

## 3. Architecture & Data Flow
1. **Workspace & routing entry**
   - The app uses a URL prefix `'/w/<workspace_key>/'` to resolve the workspace UUID internally (via Supabase `workspaces` query in `Layout.tsx`).
   - Journeys builder routes then render under that workspace context.
2. **Canvas state creation and persistence**
   - The builder maintains React Flow nodes/edges in `useJourneyCanvas` and renders via `JourneyCanvas`.
   - On “Save Layout”, `PUT /api/journeys/:id/canvas` is called with `{ nodes, edges }` and `x-workspace-id`.
   - Backend `saveJourneyCanvas` writes:
     - `journeys.canvas_nodes_json` and `journeys.canvas_edges_json`
     - syncs `journey_events` from `triggerNode` nodes by extracting `connectedEvent.eventId`.
3. **Screenshot/image upload lifecycle**
   - Step node uploads screenshots via `POST /api/journeys/:id/images` (multipart `FormData`, `x-workspace-id` header).
   - Client logic migrates legacy/proxy image URLs to public Storage URLs before saving canvas QA data (so `<img>` works without auth).
   - Export and shared endpoints also include URL rewriting logic to ensure images resolve in public contexts.
4. **Share + public rendering**
   - Sharing is enabled/disabled via authenticated `POST/PATCH /api/journeys/:id/share` (sets `share_token` in DB).
   - Public shared endpoints are:
     - `GET /api/shared/journeys/:token` and `GET /api/shared/journeys/journey/:id`
   - `SharedJourneyView` consumes returned JSON:
     - `nodes` + `edges` (with image URLs rewritten to `/api/shared/.../images/...`)
     - `eventSnippets` (built server-side from event properties)
     - `qaRuns` (reconstructed from `qa_runs` + `qa_run_payloads`)
5. **QA run persistence + locking**
   - QA runs are persisted via `PUT /api/journeys/:id/qa`.
   - Backend `qa.dal.ts` stores, per run:
     - meta in `qa_run_payloads` using marker node IDs
     - snapshot nodes/edges similarly
     - per-node verifications JSON in `qa_run_payloads`
   - Frontend “End QA” persists `endedAt` for the active run and uses `qaLocked` in UI to gate edits.
6. **Implementation brief export**
   - Export HTML is served at:
     - authenticated internal (builder) and public shared route equivalents.
   - `export.service.ts` builds standalone HTML:
     - renders step screenshots
     - places annotation overlay divs on top of screenshots
     - generates payload examples + property detail tables from event properties.

### Key dependencies
- React Flow (`@xyflow/react`) for canvas + nodes/edges.
- Zustand store for journey data + workspace selection.
- Supabase (DB + Storage) for storing journey JSON snapshots and QA payload snapshots.
- Express backend routes for contracts; Vercel wrappers forward requests with prefix normalization.

### Important assumptions (based on code)
- Step screenshots and proof images are intended to be reachable via public Storage URLs so public `<img>` tags do not require auth (this is an explicit architectural change reflected by migration/rewriting helpers).
- QA run snapshots encode enough node state and metadata to reconstruct verifications and node render state in shared mode.
- Shared view image URLs are rewritten to the shared image proxy endpoint for consistent public access.

## 4. Current Implementation Status
- **Implemented (confirmed by code):**
  - Canvas save and trigger-node-to-`journey_events` syncing.
  - Screenshot upload endpoint and client/server URL rewriting for public rendering.
  - Public shared journeys (`/share/...`) with selectable view modes (journey vs implementation brief vs QA runs).
  - QA run persistence + reconstruction for shared views (`PUT/GET /api/journeys/:id/qa` + `qa.dal.ts`).
  - Centralized QA Run naming + derived QA status (PASSED/FAILED/PENDING) used consistently in builder, shared view, and homepage.
  - Pending-step warning modal shown before saving QA runs.
  - “Implementation Brief” HTML export generation with annotation overlay support.
  - QA locking UX (“End QA”) with `endedAt` persisted and UI gated read-only behavior.
- **Looks partial/incomplete (inference based on code inspection):**
  - QA stats/progress values are derived in UI (`stats: total/passed/failed/pending`) rather than stored as first-class DB fields; if verifications are missing/malformed for older runs, stats can be inconsistent.
  - Some export/handoff code paths embed inline styles and colors directly in HTML (`export.service.ts` and `serializeHandoffData.ts` include hard-coded inline colors), which may drift from semantic token design. (inference; based on observed inline style usage in inspected files).
- **Fragile/risky areas:**
  - Public image rendering depends on correct URL normalization/deduplication across save/display/export/shared routes.
  - QA persistence uses `qa_run_payloads` with marker node IDs for meta/nodes/edges; if any marker logic changes, reconstruction can break.
  - Vercel routing reliability relies on dedicated function wrappers for deep PUT/GET routes (and also on function-count constraints on the Hobby plan). (inference; supported by presence of wrapper files and historical deployment failure context in the project.)

## 5. Decisions Already Reflected in Code
- **Workspace key in URL:** App uses `/w/<workspace_key>/...` rather than putting raw UUID in URLs, resolving to UUID via Supabase with RLS checks.
- **Share architecture:** Public share is token-based or journey-id-based and returns fully hydrated JSON including rewritten image URLs + prebuilt `eventSnippets` + `qaRuns`.
- **Image accessibility principle:** Prefer public Storage objects so public renderers (shared view and exported HTML) do not require auth headers.
- **QA snapshot persistence model:** Store run metadata, nodes snapshot, edges snapshot, and per-node verification JSON inside `qa_run_payloads` (marker-based reconstruction).
- **Export approach:** Standalone HTML without external dependencies, enabling easy sharing/handover.
- **UX gating:** `readOnly` and `qaLocked` are combined into `effectiveReadOnly` and injected into node `data` during QA snapshot remapping so nested node components respect read-only.

## 6. Open Problems / Gaps
- **Potential reconstruction gaps (inference):** Older QA runs or partially saved runs may not have all marker payloads/meta fields, which can produce missing QA UI elements in shared view.
- **Annotation rendering coupling (confirmed by inspection):** Canvas annotation rendering and exported annotation overlays rely on annotation node sizing and CSS/styling consistency; if annotation node styling changes, export alignment can drift.
- **Routing/function-limit risk (inference):** More serverless wrappers increase function count; if new endpoints are added, deployment may again hit the Hobby plan limit.
- **No explicit automated tests (confirmed by scan):** No unit/integration tests found for Journeys flows, so regressions in persistence/reconstruction/image URLs are mainly caught via manual QA.

## 7. Next Recommended Steps
1. **Create a regression checklist** that covers the highest-risk invariants (image URL normalization + QA reconstruction + share rendering).
2. **Verify public share end-to-end**:
   - open `/share/journey/:id` and ensure images load
   - switch to QA run view and verify trigger node code snippets appear
   - open `/share/journey/:id/brief` and verify annotation overlays appear on screenshots.
3. **Verify QA locking persistence**:
   - click “End QA” and reload the shared and internal journey to ensure all nodes are truly read-only.
4. **Harden QA marker reconstruction** by validating marker presence and logging structured backend errors when meta/nodes/edges markers are missing (reduces silent failures).
5. **Add lightweight tests** for: URL normalization helpers and `qa.dal.ts` reconstruction parsing (marker-based).

## 8. Resume Instructions For Future Context Windows
- **Start here:** `src/pages/Journeys.tsx` and `src/features/journeys/editor/JourneyCanvas.tsx`.
- **Follow the persistence:** `src/features/journeys/hooks/useJourneyCanvas.ts` → `src/features/journeys/hooks/useJourneysApi.ts` → backend `src/backend/routes/journeys.ts` → DAL `src/backend/dal/journey.dal.ts` + `src/backend/dal/qa.dal.ts`.
- **Follow public share:** `src/pages/SharedJourneyView.tsx` → backend `src/backend/routes/shared.ts` → `src/backend/dal/qa.dal.ts` + image URL rewriting in `routes/shared.ts`.
- **Do not break:**
  - the marker-based QA payload reconstruction contract in `qa.dal.ts`
  - the public image URL rewriting contract used by shared view and exported HTML
  - `qaLocked/effectiveReadOnly` gating so shared views remain non-editable.
- **Verify before changes:**
  - Saving canvas updates `journeys.canvas_nodes_json` and trigger events sync.
  - Uploading step screenshots produces a public URL that is reachable without auth.
  - Shared view returns `eventSnippets` and `qaRuns` (no missing fields).

## 9. Change Log Snapshot
- **Current checkpoint (as of this context capture):**
  - QA run persistence exists end-to-end (`PUT/GET /api/journeys/:id/qa`) and shared view loads `qaRuns`.
  - “End QA” sets `endedAt` and UI uses it to lock QA editing (`qaLocked` → `effectiveReadOnly`).
  - Implementation brief export supports annotation overlays and payload examples.
  - Share uses unified public endpoints and rewrites step image URLs for public access.
  - Image upload/save flow includes client-side and export-time normalization for legacy proxy URLs so images render in public contexts.
  - `GET /api/journeys` now returns `qaRunsCount` + `latestQARun` to power homepage QA count/status.
  - QA naming and derived status are computed from `createdAt` + step verification statuses via `qaRunUtils.ts` (single source of truth).
  - QA side-panel codegen regression was fixed by rehydrating `codegenSnippets` into QA snapshot trigger nodes in `useJourneyCanvas` during active run node remap.
  - Save QA and End QA now use explicit confirmation modals; End QA is blocked while pending steps exist.
  - Mode dropdowns were unified to iconized Design/Docs/QA entries; QA entries show lock/open icons and color-coded status chips.
  - Floating “QA Mode Active” canvas overlay was removed; QA status/stats/actions now live in the QA Run Details panel.
  - Tester field is now locked in QA Run Details and auto-populated from authenticated user email when missing on active run.
  - Codegen side panel now resolves real snippets from base `journey.nodes` (by trigger node id/event id) and does not inject placeholder snippet strings.
  - QA run display names now render in local browser timezone; mode dropdown lock state updates immediately after successful End QA (local state mutation with `endedAt`).
  - QA Summary section is positioned at the top of QA Run Details and uses icon-enhanced counts for total/passed/failed.
  - Active QA remap now also restores missing trigger `connectedEvent` (and optional `eventId`/`eventName`) from base journey nodes, fixing cases where side panel showed “Select an event to see code snippets.”
  - QA Run Details Save/End actions are pinned in a fixed bottom footer outside the scroll region, so they remain visible regardless of form length/testing profile count.

