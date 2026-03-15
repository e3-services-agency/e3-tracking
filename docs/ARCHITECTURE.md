# Architecture — E3 Tracking Implementation Portal

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React 19, TypeScript | UI and state; type-safe components and hooks. |
| **Build** | Vite 6 | Dev server, HMR, and production bundling. |
| **Styling** | Tailwind CSS 4 (@tailwindcss/vite) | Utility-first CSS, theme variables, responsive layout. |
| **UI** | Radix UI (Slot), Lucide React, class-variance-authority, tailwind-merge | Accessible primitives, icons, variant styling. |
| **State** | Zustand | Global app state (tracking plan data, branches, settings). |
| **Canvas** | React Flow (@xyflow/react) | Visual journey builder (nodes, edges, minimap, controls). |
| **Backend** | Express 4 | REST API, workspace-scoped routes, middleware. |
| **Database** | Supabase (PostgreSQL) | Workspaces, events, properties, journeys, QA runs; RLS for multi-tenant isolation. |
| **Other** | dotenv, uuid, papaparse, motion | Env config, IDs, CSV, animations. |

The frontend runs as a SPA; the backend serves the API and (optionally) the built static assets. All data access is workspace-scoped via headers or auth context.

---

## Database Schema

The schema follows a **workspace-rooted hierarchy** with soft deletes for audit and history. No hard `ON DELETE CASCADE`; application logic enforces consistency.

### High-Level Hierarchy

```
Workspaces
  ├── workspace_settings (audit rules, 1:1)
  ├── Sources
  ├── Properties (event_property | user_property | system_property)
  │     └── property_sources (M:N with sources)
  ├── Events
  │     ├── event_sources (M:N with sources)
  │     └── event_properties (event ↔ property + presence)
  ├── Journeys
  │     ├── journey_events (ordered event refs for triggers)
  │     ├── canvas_nodes_json, canvas_edges_json (React Flow state)
  │     ├── testing_instructions_markdown, share_token, type_counts
  │     └── qa_runs
  │           ├── qa_run_evidence
  │           └── qa_run_payloads
```

### Core Tables (Summary)

- **workspaces** — Tenant root; `id`, `name`, timestamps, `deleted_at`.
- **workspace_settings** — `workspace_id` (FK), `audit_rules_json` (naming conventions, required fields, etc.).
- **sources** — `workspace_id`, `name`, `color`; soft delete.
- **properties** — `workspace_id`, `context`, `name`, `description`, `category`, `pii_status`, `data_type`, `data_format`, `is_list`, `example_values_json`, `name_mappings_json`; soft delete.
- **events** — `workspace_id`, `name`, `description`, `triggers_markdown`; soft delete.
- **event_properties** — `event_id`, `property_id`, `presence` (always_sent | sometimes_sent | never_sent); no soft delete (kept for history).
- **journeys** — `workspace_id`, `name`, `description`, `developer_instructions_markdown`, `canvas_nodes_json`, `canvas_edges_json`, `testing_instructions_markdown`, `share_token`, `type_counts` (JSONB); soft delete.
- **journey_events** — `journey_id`, `event_id`, `sort_order`; derived from trigger nodes when saving canvas.
- **qa_runs** — `journey_id`, `status` (pass | fail); soft delete.
- **qa_run_evidence** — `qa_run_id`, `image_url`, `sort_order`.
- **qa_run_payloads** — `qa_run_id`, `node_id`, `expected_json`, `actual_json`.

All tables that store workspace-owned data use **Row Level Security (RLS)** keyed off `app.workspace_id` set per request.

---

## Code Generation Logic

Code generation lives in **`src/backend/services/codegen.service.ts`**. It produces three snippet styles from an event name and its attached properties (with presence).

### Inputs

- **Event name** (e.g. `"purchase"`, `"page_view"`).
- **Attached properties** with **presence**: `always_sent` | `sometimes_sent` | `never_sent`. Only `always_sent` and `sometimes_sent` are included in snippets; `never_sent` is omitted.

### Outputs (per event)

1. **dataLayer** — GTM-style push:
   - `window.dataLayer.push({ event: '<event_name>', <prop>: '<value>', ... });`
   - Sometimes-sent properties get a `// Optional:` comment above the line.

2. **Bloomreach SDK** — Web SDK call:
   - `exponea.track('<event_name>', { <prop>: '<value>', ... });`
   - Same optional commenting for sometimes-sent properties.

3. **Bloomreach API** — Server-side / REST:
   - JSON body: `customer_ids`, `event_type`, `properties` (and optional comment listing sometimes-sent props).
   - cURL example for `POST .../track/v2/projects/{token}/customers/events` with Basic auth and JSON body.

### Usage

- **API:** `GET /api/events/:id/codegen` loads the event and its attached properties, then returns `{ dataLayer, bloomreachSdk, bloomreachApi }`.
- **Export:** For each trigger in the journey export, the service uses `buildCodegenSnippetsFromPresence(eventName, alwaysSent, sometimesSent)` (same logic, presence expressed as two arrays) and injects the three snippets into the “Implementation examples” section of the HTML.

Property names are taken from the event’s attached properties; placeholder values (e.g. `<value>`) are used so implementers can replace them with real variables or literals.
