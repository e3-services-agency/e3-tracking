# Journeys QA System Fix

## 1. Issues Identified
- **QA Run naming inconsistency:** QA run selectors and the “QA Run Details” sidebar were showing **raw IDs** instead of a human-readable run name.
- **Homepage QA runs bug:** The Journeys homepage showed **“0 QA runs”** even when QA runs existed for a journey.
- **Missing QA Run status system:** There was no derived overall QA run status (PASSED/FAILED/PENDING) shown anywhere.
- **UI inconsistency across contexts:** Local builder views and shared read-only views did not present the same naming/status semantics.

## 2. Root Causes
- **Naming inconsistency (ID fallback):**
  - The QA DAL reconstructs run objects by initializing `name: r.id`, and only overwrites from the `__run_meta__` marker payload when it contains a valid `meta.name`.
  - When that marker payload is missing/partial/invalid for a run, `run.name` remains the ID, and the UI used `run.name` for display.
  - Source: `src/backend/dal/qa.dal.ts` (run reconstruction: `name: r.id`, then `__run_meta__` parsing).
  - Fix strategy: **do not rely on `run.name` being correct**. Instead, centralize display naming using the reconstructed `createdAt` timestamp.

- **Homepage “0 QA runs” bug (data mismatch):**
  - The homepage uses `useJourneys()` → `useJourneys.ts` mapping, but the mapping hard-coded `qaRuns: []` and did not use any QA data returned by `GET /api/journeys`.
  - The backend `GET /api/journeys` endpoint previously returned only the base journey row list (`JourneyDAL.listJourneys`) with **no QA run count or latest run payload**.
  - Source:
    - `src/features/journeys/hooks/useJourneys.ts` (`qaRuns: []` in `mapJourneyRowToUi`)
    - `src/backend/routes/journeys.ts` (`router.get('/', ...)` returned only the journeys list)
  - Fix strategy: update `GET /api/journeys` to return:
    - `qaRunsCount`
    - `latestQARun` (reconstructed, for deriving status)

- **Missing derived QA status:**
  - The UI only tracked **per-node** verification statuses (Pending/Passed/Failed) and displayed counts, but there was no single derived computation for an overall run status.
  - Source: existing UI logic in `src/features/journeys/editor/JourneyCanvas.tsx` used per-node verification counts and had no “overall status” model.
  - Fix strategy: centralize derived status computation using a single shared utility.

## 3. Implemented Fixes
- **Centralized QA Run naming**
  - Added `formatQARunName(timestamp)` and `getQARunDisplayName(qaRun)` in:
    - `src/features/journeys/lib/qaRunUtils.ts`
  - Enforced display everywhere relevant:
    - `src/features/journeys/editor/JourneyCanvas.tsx` (QA Run Details + QA Mode overlay)
    - `src/pages/Journeys.tsx` (QA run selector dropdown)
    - `src/pages/SharedJourneyView.tsx` (shared QA selector dropdown)
  - Required format is exactly: **`QA Run YYYY-MM-DD HH:MM`** (UTC-based for stability).

- **Centralized QA Run status system**
  - Added:
    - `computeQARunStatus(stepStatuses)`
    - `computeQARunStatusForRun(qaRun)` (uses the run’s saved node snapshot to identify step nodes)
  - Priority rules are applied:
    - FAILED (highest)
    - PENDING
    - PASSED
  - Used across contexts:
    - `src/features/journeys/editor/JourneyCanvas.tsx`
    - `src/pages/JourneysList.tsx`
    - `src/pages/SharedJourneyView.tsx`

- **Homepage fix (QA run count + latest derived status)**
  - Backend now reconstructs homepage QA summary per journey:
    - Added `getJourneyQARunsCountAndLatest()` in `src/backend/dal/qa.dal.ts`
    - Updated `GET /api/journeys` in `src/backend/routes/journeys.ts` to return:
      - `qaRunsCount`
      - `latestQARun`
  - Frontend now renders:
    - Correct QA runs count from `journey.qaRunsCount`
    - A new **“QA Status”** column computed from `journey.latestQARun`
  - Source updates:
    - `src/features/journeys/hooks/useJourneys.ts`
    - `src/pages/JourneysList.tsx`

- **Pending-step warning modal before saving QA**
  - Added `JourneyPendingQAWarnModal`:
    - `src/features/journeys/overlays/JourneyPendingQAWarnModal.tsx`
  - Updated the “Save QA” action in:
    - `src/features/journeys/editor/JourneyCanvas.tsx`
  - Behavior:
    - If the active QA run contains **any step with Pending status**, the modal is shown.
    - Saving proceeds (warning does not prevent persistence).

## 4. Data Model Changes
- **API shape changes (runtime contract) for `GET /api/journeys`:**
  - Each journey object now includes:
    - `qaRunsCount: number`
    - `latestQARun: QARun | null` (includes saved `nodes` snapshot + `verifications`)
- **No new DB columns were added for status.**
  - Derived QA run status is computed client-side from:
    - step node IDs in `latestQARun.nodes`
    - per-node verification statuses in `latestQARun.verifications`

## 5. Risks & Edge Cases
- **Marker payload gaps:**
  - If marker payloads in `qa_run_payloads` are missing/invalid (e.g. no `__run_nodes__`), the derived status falls back to **PENDING**.
- **Partial verifications:**
  - If a step node ID exists in the run snapshot but the step has no verification record, it is treated as **Pending** (as required).
- **Performance:**
  - `GET /api/journeys` now reconstructs one QA run payload per journey. This loads only the latest run, but still adds per-journey work (risk if there are many journeys).
- **Backwards compatibility:**
  - Naming no longer depends on `run.name` being correct; it is derived from timestamps. This makes old runs display correctly without requiring DB migrations.

## 6. Validation Checklist
- Homepage:
  - Journeys table shows the correct **QA runs count** for each journey.
  - New **QA Status** column shows FAILED/PENDING/PASSED for the latest run.
  - Status does not break when a run snapshot or verification payload is partially missing.
- Builder:
  - QA run selector shows names in format `QA Run YYYY-MM-DD HH:MM`.
  - “QA Run Details” sidebar shows the same formatted run name everywhere.
  - QA status in the sidebar/overlay reflects derived status rules.
  - Clicking “Save QA” triggers the pending warning modal if pending steps exist, and still saves QA successfully.
- Shared view:
  - Shared QA dropdown shows formatted run names and derived statuses.
  - Shared QA is read-only and displays the same status logic.
- No regression:
  - Share URLs and implementation brief export still work (no changes to export HTML generation logic).

## 7. Follow-up Adjustments (Current Task)
- Fixed QA side-panel codegen regression by rehydrating `codegenSnippets` into QA snapshot trigger nodes during `useJourneyCanvas` QA remap.
- Added Save QA confirmation modal with explicit loading state (spinner + disabled action while request is in-flight).
- Added End QA confirmation modal with hard blocker when pending steps exist:
  - End QA button disabled if `hasPendingStepsForRun(activeQARun)` is true.
  - Modal also blocks confirm action and explains why.
- Unified mode dropdowns with iconized entries and naming:
  - `Design Mode` iconized with `PenTool`
  - `Docs Mode` iconized with `FileText` (replaces “Implementation Brief” wording in mode UI)
  - QA run entries display lock/open state (`Lock`, `LockOpen`) and status chips.
- Added node-level QA status chip in side panel (visible in read-only/shared context too).
- Prevented Active QA codegen 404 fallback by guaranteeing real `prefetchedSnippets` for selected trigger nodes in `JourneyCanvas`:
  - first use node-local `data.codegenSnippets` from selected node payload
  - fallback to matching trigger nodes in the base journey nodes array by node id/event id
  - in Active QA mode, suppress fallback event fetch when no prefetched snippets are resolved (no mock strings are injected).
- QA runs in dropdowns are now sorted latest-to-oldest (`createdAt` descending) in both app and shared mode menus.
- QA Run Details cleanup: removed the redundant boxed “QA Summary” header container; actions are rendered cleanly without the extra wrapper.
- End QA modal copy updated exactly to:
  - "Ending this QA run is permanent. The QA run will be locked into read-only mode so it can be previewed but not edited."
- QA run names/dates now use local browser timezone formatting in `qaRunUtils.ts` (no UTC display).
- After successful End QA save, local run state is updated with `endedAt` immediately so mode dropdown lock state switches without refresh.
- QA Summary moved to the top of QA Run Details and visually enhanced with `CircleDashed` (total), `CheckCircle2` (passed), and `XCircle` (failed) inline counts.

