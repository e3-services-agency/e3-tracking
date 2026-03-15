# Journeys Feature — Current State Analysis

**Purpose:** Frontend implementation analysis before migrating Journeys to the Express/PostgreSQL backend. No code changes; use this to align the backend schema with existing UI capabilities.

---

## 1. The Data Structure

### 1.1 Journey store shape (Zustand)

**Location:** `src/types.ts` (lines 158–164), `src/store.tsx` (journeys live inside `TrackingPlanData`).

**Exact TypeScript shape:**

```ts
interface Journey {
  id: string;
  name: string;
  nodes: any[];   // React Flow Node<JourneyFlowNode> — see below
  edges: any[];   // React Flow Edge
  qaRuns?: QARun[];
}
```

- **Where it lives:** `TrackingPlanData.journeys` (array). On branches, the same shape lives in `Branch.draftData.journeys`; the active dataset is from `useActiveData()` (main or current branch’s draft).
- **Mutators:** `addJourney`, `updateJourney`, `deleteJourney` in the store. `updateJourney(id, { nodes, edges })` or `updateJourney(id, { qaRuns })` is used to persist layout and QA runs.

### 1.2 Node types and linking (React Flow)

**Node type definitions:** `src/features/journeys/nodes/types.ts`.

All nodes extend React Flow’s `Node<TData, TType>`. Shared base and types:

- **Base:** `BaseJourneyNodeData`: `activeQARunId`, `qaVerification`, `pendingProofs`.
- **Step (screenshot step):** `JourneyStepNodeData` → `JourneyStepFlowNode`  
  - `type: 'journeyStepNode'`  
  - `data`: `label`, `description`, `imageUrl?` (data URL string), `url?` (step URL for testing).
- **Trigger (event):** `TriggerNodeData` → `TriggerFlowNode`  
  - `type: 'triggerNode'`  
  - `data`: `description`, `connectedEvent: ConnectedEventData | null`  
  - `ConnectedEventData`: `eventId`, `variantId?`, `name`, `variantName?`, `description?` (links to Events in the same TrackingPlanData).
- **Note:** `NoteNodeData` → `NoteFlowNode`  
  - `type: 'noteNode'`  
  - `data`: `text`.
- **Annotation (bounding box):** `AnnotationNodeData` → `AnnotationFlowNode`  
  - `type: 'annotationNode'`  
  - `data`: `color` (hex string).  
  - **Position/size:** Not in `data`; they come from the React Flow node’s `position` and `style`: `position: { x, y }`, `style: { width, height }`.

**Linking step ↔ trigger:**

- **Edges:** `edges` are React Flow `Edge[]` (e.g. `{ id, source, target, sourceHandle?, targetHandle? }`). Connection is by `source`/`target` node ids. No separate “journey_events” table in the frontend; the graph is the link.
- **Trigger → Event:** Trigger nodes hold `connectedEvent: { eventId, variantId?, name, variantName?, description? }`. Events are read from `useActiveData().events` (same workspace/branch). So the link is by **event id + optional variant id** stored in node data; there is no separate junction table in memory.

**Exact in-memory node shape (for persistence):**

- Each item in `journey.nodes` is a React Flow node, e.g.:
  - `id`, `type`, `position: { x, y }`, `data: { ... }`, and optionally `style: { width, height }` (used for annotation nodes).
- Step nodes: `data.imageUrl` is a **base64 data URL** (screenshot inlined). No separate “screenshot asset” id.
- Annotation nodes: Bounding box is **position + style.width/height** in flow coordinates.

---

## 2. The Visual Editor

### 2.1 Files and responsibilities

| Concern | File(s) | What they do |
|--------|---------|----------------|
| **Canvas + React Flow** | `src/features/journeys/editor/JourneyCanvas.tsx` | Renders `<ReactFlow>`, node types, controls, minimap, background. Wires `useJourneyCanvas` (nodes/edges, connect, drag, tools). |
| **Canvas state + layout persist** | `src/features/journeys/hooks/useJourneyCanvas.ts` | `useNodesState` / `useEdgesState` seeded from `journey.nodes` / `journey.edges`. Syncs back via `updateJourney(journey.id, { nodes, edges })` on “Save Layout”. Handles add step/trigger/note, connect-from-handle, **annotation draw**, QA run snapshot, verification updates. |
| **Step node (screenshot)** | `src/features/journeys/nodes/JourneyStepNode.tsx` | Label, description, URL, **image upload** (file input), **paste image** (clipboard). Renders `data.imageUrl` or upload/paste UI. In QA mode: “Upload Proofs” (multiple files) → `pendingProofs`. |
| **Trigger node (event link)** | `src/features/journeys/nodes/TriggerNode.tsx` | Description, “Connect Event” dropdown (search over `useActiveData().events` + variants). Stores `connectedEvent`. In QA mode: upload proofs. |
| **Annotation (bounding box)** | `src/features/journeys/nodes/AnnotationNode.tsx` | Resizable rectangle: `NodeResizer` when not QA mode. Visual: `style.borderColor`/`backgroundColor` from `data.color`. Size/position from node `position` + `style.width` / `style.height`. |
| **Drawing new annotations** | `JourneyCanvas.tsx` + `useJourneyCanvas.ts` | Tool `annotation`: overlay with `onMouseDown` → `beginAnnotationDraw`, `onMouseMove` → `updateAnnotationDraw`, `onMouseUp`/`onMouseLeave` → `finishAnnotationDraw`. New node created with `position` and `style: { width, height }` updated during drag. |

### 2.2 Screenshot upload and storage

- **Where:** `JourneyStepNode.tsx` (and paste in the same component).
- **How:** File input or paste → `FileReader.readAsDataURL(file)` → `updateNodeData({ imageUrl })` (so **base64 data URL** stored in node `data`).
- **Where it’s stored:** In the journey’s React Flow `nodes` array, on the step node’s `data.imageUrl`. Persisted when the user clicks “Save Layout” (`updateJourney(journey.id, { nodes, edges })`).

### 2.3 Bounding box / highlight area

- **Rendering:** `AnnotationNode.tsx`: a div with `NodeResizer` (when not QA mode); size/position come from React Flow node `position` and `style.width` / `style.height`.
- **Drawing:** In `useJourneyCanvas.ts`, `beginAnnotationDraw` creates a new `annotationNode` with `position` and `style: { width: 1, height: 1 }`. `updateAnnotationDraw` updates that node’s `position` and `style.width`/`height` from the drag rectangle in flow coordinates. `finishAnnotationDraw` commits or removes the node if too small.
- So the “bounding box” is **fully described by** the annotation node’s `id`, `type: 'annotationNode'`, `position`, `style`, and `data.color`.

---

## 3. The QA Data

### 3.1 Where it’s stored

- **Journey level:** `Journey.qaRuns?: QARun[]`.
- **Each run:** `QARun` has `verifications: Record<string, QAVerification>` (key = node id), plus optional `nodes`/`edges` (snapshot of layout for that run), `testingProfiles`, and metadata (`name`, `createdAt`, `testerName`, `environment`, `overallNotes`).

### 3.2 QARun and QAVerification shape (`src/types.ts`)

```ts
interface QARun {
  id: string;
  name: string;
  createdAt: string;
  testerName?: string;
  environment?: string;
  overallNotes?: string;
  testingProfiles?: TestingProfile[];
  nodes?: any[];   // Snapshot of journey.nodes at run start
  edges?: any[];
  verifications: Record<string, QAVerification>;
}

interface QAVerification {
  nodeId: string;
  status: QAStatus;  // 'Pending' | 'Passed' | 'Failed'
  notes?: string;
  proofText?: string;           // Manual pasted text/JSON (e.g. payload)
  proofs?: QAProof[];           // Uploaded images + text/JSON files
  testingProfileIds?: string[];
  extraTestingProfiles?: TestingProfile[];
}

interface QAProof {
  id: string;
  name: string;
  type: 'image' | 'text' | 'json';
  content: string;   // Data URL for images; raw string for text/json
  createdAt: string;
}
```

### 3.3 Expected/actual JSON and test data

- **No separate “expected vs actual” in the UI.** The backend plan’s `qa_run_payloads` (e.g. `expected_json` / `actual_json`) does not exist in the frontend types.
- **What exists:**
  - **proofText:** Single optional string on `QAVerification` (“manual JSON payload pasted by tester”).
  - **proofs:** Array of `QAProof`. Each has `type` and `content`. For trigger payloads, content is often JSON or text (paste or “Upload Payload”); for step/trigger screenshots, `type: 'image'`, `content`: data URL.
- **Where it’s edited:**
  - **Trigger payload:** In `JourneyCanvas.tsx` (QA sidebar), “Trigger Proof Payload”: textarea (`payloadDraft`), “Add Payload” (builds a text `QAProof` and appends to `verification.proofs`), and “Upload Payload” (file → `readFileAsContent` → `QAProof` with content string). So “expected/actual” would need to be derived or added (e.g. one proof as expected, one as actual, or a dedicated expected/actual pair in the backend).
- **Run snapshot:** When a QA run is started (`JourneyStartQARunModal` → `handleStartQARun` in `Journeys.tsx`), the run is created with `nodes: JSON.parse(JSON.stringify(selectedJourney.nodes))` and `edges: JSON.parse(JSON.stringify(selectedJourney.edges))`. So the run keeps a **copy** of nodes/edges at start; layout changes in the canvas during the run are to that copy until “Save QA” runs `updateJourney(selectedJourney.id, { qaRuns: [...] })`, which persists the whole `qaRuns` array again (nodes/edges on the run are not diffed; they’re replaced).

---

## 4. Migration Risks (Zustand → async useJourneys API)

### 4.1 Data flow today

- **Read:** `useActiveData().journeys` → one journey selected by id → `journey.nodes`, `journey.edges`, `journey.qaRuns` passed into `useJourneyCanvas`.
- **Write:** `updateJourney(journey.id, { nodes, edges })` or `updateJourney(journey.id, { qaRuns })` — synchronous Zustand update; no loading states.

### 4.2 High‑risk areas

1. **Drag-and-drop and layout**
   - React Flow’s `onNodesChange` / `onEdgesChange` run on every drag/resize/connect. Today they update local `nodes`/`edges` state; “Save Layout” then does a single `updateJourney(id, { nodes, edges })`.
   - **Risk:** If the parent re-renders with **new journey from server** (e.g. after a refetch), `useJourneyCanvas` has a `useEffect` that resets `nodes`/`edges` from `journey.nodes`/`journey.edges`. So **refetching while the user is dragging** could overwrite in-progress layout. Mitigation: avoid refetch during active edit, or only merge server state after “Save” and keep local dirty state until then.

2. **Active annotation drawing**
   - State: `annotationStart`, `draftAnnotationId` in `useJourneyCanvas`; new node is added on mousedown and updated on mousemove.
   - **Risk:** If `journey` is replaced mid-draw (e.g. refetch), the effect that syncs from `journey.nodes` could remove the draft annotation or reset nodes. Mitigation: same as above; don’t replace `journey` from server while tool is `annotation` and `draftAnnotationId` is set, or keep drawing state local and commit at “Save Layout”.

3. **Pending proofs (unsaved uploads)**
   - Proofs are added to `node.data.pendingProofs` (in-memory). “Save Pending Proofs” merges them into `activeQARun.verifications[nodeId].proofs` and then `updateJourney(..., { qaRuns })`.
   - **Risk:** If the run or journey is refetched before “Save Pending Proofs”, `pendingProofs` lives only in React state; the refetched run won’t have them. Mitigation: treat pending proofs as local-only until saved; avoid refetch of that run until after save or surface a “you have unsaved proofs” guard.

4. **QA run snapshot (nodes/edges)**
   - Each QA run stores a full copy of `nodes` and `edges`. Saving QA runs does a full `updateJourney(id, { qaRuns })`.
   - **Risk:** With an API, “Save QA” might PATCH only verifications; if the backend stores run layout separately, the client must still send or retain the run’s `nodes`/`edges` snapshot so the backend can store it (e.g. for handoff/PDF). The frontend today expects `qaRun.nodes` / `qaRun.edges` to be present when entering QA mode.

5. **Step node imageUrl (base64)**
   - Screenshots are stored as data URLs in `nodes[].data.imageUrl`. Large payloads.
   - **Risk:** Backend will likely want URLs (e.g. Supabase Storage) instead of inline base64. Migration path: either keep accepting base64 in API and move to URLs later, or add an upload step before save that returns a URL and replace `imageUrl` with that URL. UI must handle loading state and possibly two shapes (legacy base64 vs URL).

6. **Trigger → Event reference**
   - Trigger nodes store `connectedEvent: { eventId, variantId?, name, variantName?, description? }`. Events are from `useActiveData().events`.
   - **Risk:** With an API, events may be loaded separately (e.g. `useEvents()`). Trigger node payloads must remain keyed by `eventId` (and optionally `variantId`) so the backend can resolve to event records; the optional `name`/`variantName`/`description` are for display/serialization. Backend schema for “journey trigger” should store at least `event_id` (and optionally variant) so the UI can re-resolve event details from the events API.

7. **Connect-from-handle menu**
   - When user drags from a handle and drops on the pane, `menuPos` is set and a context menu appears (“Add Step” / “Add Trigger”). Creating the new node and edge uses `setNodes`/`setEdges` and local state.
   - **Risk:** Same as (1): a refetch that updates `journey` could reset nodes/edges and close the menu or leave an inconsistent graph. Prefer not refetching while this menu is open or while the user is drawing.

### 4.3 Summary of migration safeguards

- **Optimistic or local-first layout:** Keep `nodes`/`edges` in local state during editing; send to API only on “Save Layout” (and optionally debounce or batch).
- **Refetch discipline:** After “Save Layout” or “Save QA”, refetch journey (or that run); avoid refetch while user is drawing an annotation, dragging, or has the connect menu open.
- **QA run identity:** When starting a QA run via API, the server returns the run id; the client must use that id and merge verification updates without overwriting the run’s `nodes`/`edges` snapshot.
- **Screenshots:** Plan for moving from base64 in `imageUrl` to stored URLs; API or upload flow should support at least one of these and the UI should handle both during transition.
- **Expected/actual payloads:** Backend’s `qa_run_payloads` (expected_json / actual_json) is not yet in the UI. Either add UI for “expected vs actual” and map it to that table, or store current proof content (e.g. single payload or first proof) as “actual” and leave “expected” for a later feature.

---

## 5. File reference summary

| Area | Path |
|------|------|
| Journey / QA types | `src/types.ts` (Journey, QARun, QAVerification, QAProof, TestingProfile) |
| Node data types | `src/features/journeys/nodes/types.ts` |
| Store (Zustand) | `src/store.tsx` (addJourney, updateJourney, deleteJourney; journeys inside TrackingPlanData) |
| Canvas state + persist | `src/features/journeys/hooks/useJourneyCanvas.ts` |
| Canvas UI | `src/features/journeys/editor/JourneyCanvas.tsx` |
| Step node (screenshot) | `src/features/journeys/nodes/JourneyStepNode.tsx` |
| Trigger node (event) | `src/features/journeys/nodes/TriggerNode.tsx` |
| Annotation node (box) | `src/features/journeys/nodes/AnnotationNode.tsx` |
| Note node | `src/features/journeys/nodes/NoteNode.tsx` |
| Proof helpers | `src/features/journeys/lib/proofs.ts` (readFileAsContent, buildProofFromFile) |
| Start QA run | `src/features/journeys/overlays/JourneyStartQARunModal.tsx`; `src/pages/Journeys.tsx` (handleStartQARun) |
| Handoff serialization | `src/lib/serializeHandoffData.ts` (serializeJourney, serializeQARun, serializeVerification) |
| Journeys list page | `src/pages/JourneysList.tsx` |
| Journey editor page | `src/pages/Journeys.tsx` |

This document should be used to align the backend schema (journeys, journey_nodes/edges, qa_runs, qa_run_evidence, qa_run_payloads, and any step/trigger/annotation representation) with the current frontend so that a future `useJourneys` API hook can replace the Zustand store without breaking the visual editor or QA flows.
