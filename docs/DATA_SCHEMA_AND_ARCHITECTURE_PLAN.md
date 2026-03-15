# Data Schema & Relational Architecture Plan (Stabilization Phase)

**Scope:** Core data foundation for Agency Handoff & QA Platform. Schema and API contract only; no React/UI implementation.

**Goals:** Multi-tenant workspace isolation, strict data lineage, defensive relational design, soft deletes for historical QA reports, and a structure that serializes cleanly to PDF handoff.

---

## 1. Relational Audit & Cascade Safety

### 1.1 Design principles

- **Every entity** is scoped by `workspace_id`. No cross-workspace reads/writes.
- **Soft deletes** everywhere: `deleted_at TIMESTAMP NULL`. Rows are never physically deleted so that:
  - Historical QA runs still reference the correct property/event names.
  - Agency handoff PDFs and reports remain consistent for past deliveries.
- **No hard FK cascades** that delete rows. Deletes are logical (SET `deleted_at`). Application code enforces consistency (e.g. “don’t allow delete if in use” or “soft-delete and keep join rows for history”).

### 1.2 Core tables (SQLite/PostgreSQL-compatible)

| Table | Purpose | Key columns | Soft delete |
|-------|---------|-------------|-------------|
| `workspaces` | Tenant root | `id`, `name`, `created_at`, `updated_at`, `deleted_at` | Yes |
| `workspace_settings` | Global audit rules (naming, forbidden words, required props) | `workspace_id` (FK), `audit_rules_json` (JSON), `created_at`, `updated_at` | No (1:1 with workspace; delete with workspace) |
| `sources` | Where data comes from (Web, iOS, Android, Backend) | `id`, `workspace_id` (FK), `name`, `color`, `created_at`, `updated_at`, `deleted_at` | Yes |
| `properties` | Event/User/System properties | `id`, `workspace_id` (FK), `context` (enum), `name`, `description`, `category`, `pii_status`, `data_type`, `data_format`, `is_list`, `example_values_json`, `name_mappings_json`, `created_at`, `updated_at`, `deleted_at` | Yes |
| `property_sources` | Property ↔ Source (M:N) | `property_id` (FK), `source_id` (FK), `created_at` | No; when property/source soft-deleted, keep row for lineage |
| `events` | Tracked user actions | `id`, `workspace_id` (FK), `name`, `description`, `triggers_markdown`, `created_at`, `updated_at`, `deleted_at` | Yes |
| `event_sources` | Event ↔ Source (M:N) | `event_id` (FK), `source_id` (FK), `created_at` | No |
| **event_properties** | Event ↔ Property + presence | `event_id` (FK), `property_id` (FK), `presence` (enum: Always sent \| Sometimes sent \| Never sent), `created_at`, `updated_at` | No; preserve for history |
| `journeys` | User flow for handoff | `id`, `workspace_id` (FK), `name`, `description`, `developer_instructions_markdown`, `created_at`, `updated_at`, `deleted_at` | Yes |
| `journey_events` | Journey ↔ ordered Events (M:N + order) | `journey_id` (FK), `event_id` (FK), `sort_order` (INT), `created_at` | No; keep for history when event/journey soft-deleted |
| `qa_runs` | QA validation run per journey | `id`, `journey_id` (FK), `status` (Pass/Fail), `created_at`, `updated_at`, `deleted_at` | Yes |
| `qa_run_evidence` | Visual evidence URLs (Supabase) | `id`, `qa_run_id` (FK), `image_url` (TEXT), `sort_order`, `created_at` | No |
| `qa_run_payloads` | Expected vs actual JSON for validation | `id`, `qa_run_id` (FK), `node_id` (TEXT), `expected_json` (TEXT), `actual_json` (TEXT), `created_at` | No |

**Property context enum:** `event_property` | `user_property` | `system_property`  
**PII status enum:** `none` | `sensitive` | `highly_sensitive`  
**Data type enum:** `string` | `integer` | `float` | `boolean` | `object` | `list`  
**Presence enum:** `always_sent` | `sometimes_sent` | `never_sent`

### 1.3 What happens when a Property is deleted?

- **Soft delete:** `UPDATE properties SET deleted_at = NOW() WHERE id = ? AND workspace_id = ?`.
- **event_properties:** Rows are **kept**. They still reference `property_id` and `event_id`. For reads:
  - **Current state (UI):** Filter `WHERE p.deleted_at IS NULL` so deleted properties don’t appear in “current” event definitions.
  - **Historical/export:** When generating a past QA report or handoff PDF, you can either:
    - Resolve property name from `properties` at report time (including soft-deleted) for display, or
    - Store a snapshot of “property name at run time” on `qa_runs` or a snapshot table if you need full historical fidelity without joining to `properties`.
- **Cascade:** No `ON DELETE CASCADE`. Application logic decides whether to allow soft-delete (e.g. block if property is referenced by a journey with QA runs, or allow and rely on `deleted_at` filtering).

### 1.4 Indexes (recommended)

- All `workspace_id` columns: `(workspace_id)` or `(workspace_id, deleted_at)`.
- **properties:** `(workspace_id, context, name)` UNIQUE WHERE `deleted_at IS NULL` (enforce unique name per workspace + context for live rows).
- **events:** `(workspace_id, name)` UNIQUE WHERE `deleted_at IS NULL`.
- **event_properties:** `(event_id, property_id)` UNIQUE.
- **journey_events:** `(journey_id, sort_order)`.
- **qa_runs:** `(journey_id, created_at)`.
- **qa_run_evidence:** `(qa_run_id, sort_order)`.

---

## 2. Workspace Isolation & Audit Rules

### 2.1 Enforcing workspace isolation at Express layer

- **Every request** that touches data must have a **resolved workspace** (e.g. from JWT, session, or `X-Workspace-Id` header after auth).
- **Middleware:** After auth, attach `workspaceId` to `req` (e.g. `req.workspaceId`). Reject with 403 if missing or invalid.
- **Per-route:** All DB reads/writes include `workspace_id` in the predicate:
  - `SELECT * FROM events WHERE workspace_id = ? AND deleted_at IS NULL`
  - `INSERT INTO events (..., workspace_id) VALUES (..., ?)`
  - `UPDATE events SET ... WHERE id = ? AND workspace_id = ?`
- **Join tables:** Enforce workspace indirectly: only allow `event_id` / `property_id` / `source_id` / `journey_id` that belong to `req.workspaceId` (e.g. by joining through the parent table or checking parent row’s `workspace_id` in a single transaction).

### 2.2 Validating against Workspace Audit Rules (e.g. naming)

- **Storage:** `workspace_settings.audit_rules_json` holds rules such as:
  - `eventNaming`: `"snake_case"` | `"camelCase"` | `"PascalCase"` | etc.
  - `propertyNaming`: same options.
  - `forbiddenWords`: string[].
  - `requireEventDescription` / `requirePropertyDescription`: boolean.
- **Validation at API level:** Before `INSERT`/`UPDATE` of `events` or `properties`:
  1. Load `workspace_settings` for `req.workspaceId`.
  2. Parse `audit_rules_json` and run validators (same logic as current `src/lib/audit.ts`).
  3. If event name is `camelCase` but rule is `snake_case`, return **400** with a clear message: e.g. `Event name must follow snake_case (e.g. checkout_completed).`
  4. Do not persist invalid payloads; no silent override.

This keeps validation **server-side and consistent** for all clients (UI, future imports, API consumers).

---

## 3. Storage & Payloads (Supabase + QA runs)

### 3.1 Storing Supabase Storage URLs in `qa_run_evidence`

- **Column:** `image_url TEXT NOT NULL` (or `url`). Store only the **public URL string** returned by Supabase Storage (e.g. after upload in the client or via a signed upload API).
- **Safety:** Validate before insert:
  - Must be a string.
  - Must match a strict allowlist: your Supabase project URL base (e.g. `https://<project_ref>.supabase.co/storage/v1/object/public/...`). Reject any other origin to avoid SSRF or abuse.
  - Optional: max length (e.g. 2048) to avoid abuse.
- **No binary in DB:** Store only the URL; the actual file lives in Supabase. No BLOB in SQLite/Postgres.

### 3.2 Malformed JSON in payload validation

- **Columns:** `expected_json` and `actual_json` in `qa_run_payloads` are **TEXT**. They are “developer-provided” payloads for comparison.
- **On save:** Validate that the string is **valid JSON** (e.g. `JSON.parse` in Node). If invalid:
  - Return **400** with message like: `Invalid JSON in expected_json` or `Invalid JSON in actual_json`.
  - Do not store invalid JSON; avoid breaking downstream comparison or export.
- **Optional:** Store a **normalized** form (e.g. re-serialized with sorted keys) for stable diffing; still store only valid JSON.

---

## 4. Export Strategy (PDF handoff)

- The relational structure **serializes cleanly** to a printable format:
  - **Workspace** → header/metadata.
  - **Workspace settings / audit rules** → “Governance” section.
  - **Sources** → list; **Properties** (with context, type, constraints, name mappings) → table; **Events** (with triggers, attached properties + presence) → table; **Event ↔ Property** → derived from `event_properties` + `properties` + `events`.
  - **Journeys** → list with steps (from `journey_events` order) and **QA runs** with status, evidence URLs (as links or embedded images), and payload comparison (expected vs actual).
- **Existing handoff shape** in `SerializedHandoffData` (and related types in `src/lib/serializeHandoffData.ts`) already mirrors this: events, properties, journeys, QA runs, audit summary. The **DB schema is built so that a single “export” query (or a small set of queries per workspace) can fill that DTO. No schema change needed for PDF export; the export service reads from the relational model and maps to the existing serialized format.

---

## 5. Step-by-step: Database Tables and Join Tables

1. **workspaces** – create first; all other tables reference it.
2. **workspace_settings** – one row per workspace; audit rules JSON.
3. **sources** – `workspace_id` FK; soft delete.
4. **properties** – `workspace_id` FK; enums and JSON columns as above; soft delete.
5. **property_sources** – join table; FKs to `properties`, `sources`; no soft delete on join.
6. **events** – `workspace_id` FK; soft delete.
7. **event_sources** – join table; FKs to `events`, `sources`.
8. **event_properties** – join table; `event_id`, `property_id`, `presence` enum; no soft delete.
9. **journeys** – `workspace_id` FK; soft delete.
10. **journey_events** – join table; `journey_id`, `event_id`, `sort_order`.
11. **qa_runs** – `journey_id` FK; `status`; soft delete.
12. **qa_run_evidence** – `qa_run_id` FK; `image_url`, `sort_order`.
13. **qa_run_payloads** – `qa_run_id` FK; `node_id`, `expected_json`, `actual_json`.

All tables: `id` (UUID or auto-increment), `created_at`, `updated_at`; where specified, `deleted_at` for soft delete.

---

## 6. Strict TypeScript Interfaces (schema contract)

See **`src/types/schema.ts`** (or the “Phase 1 schema” section in `src/types.ts`) for interfaces that mirror the tables and enums above. Use these for:

- API request/response DTOs.
- DB layer (e.g. row types).
- Validation inputs.

UI can keep using the existing `TrackingPlanData` / `Event` / `Property` shapes until the API is implemented; then either map API responses to those or migrate the frontend to the schema types.
