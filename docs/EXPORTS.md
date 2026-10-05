# Exports

The plain-file exports the app produces, alongside the Bloomreach bridge formats. Every export is
export-only unless stated otherwise (D-01: the app is the system of record, so there is no CSV
import; the backup and use case library formats do have an import/apply side, since they are the
app's own formats, not Bloomreach's).

## CSV export per entity (D-46, capability 9)

`GET /api/projects/:id/export/csv` lists every entity with its current row count; `GET
/api/projects/:id/export/csv/:entity` downloads one entity as `text/csv; charset=utf-8` with
`Content-Disposition: attachment; filename="<projectKey>-<entity>-<yyyymmdd>.csv"`. Settings page,
"Export" block, has one button per entity plus "Download all" (sequential downloads, no zip
dependency).

Conventions, enforced by `src/domain/csv.ts`'s `CSV_ENTITIES` (the one declared header list per
entity — the service, the route and the Settings page all read this, so they cannot drift) and
`src/backend/services/csvExport.service.ts`:
- ids sit alongside resolved names (`event_id` + `event_name`, and so on) so files join in a
  spreadsheet.
- JSON columns (`allowed_values_json`, `conditions_json`, ...) are exported as compact JSON
  strings, never re-shaped into extra CSV columns.
- booleans render as `true`/`false`; timestamps stay ISO strings.
- UTF-8 with a BOM, CRLF line endings (`papaparse.unparse`) — Excel opens the file correctly, and
  the BOM is stripped by any CSV reader.
- row order matches the corresponding table page (name, `sort_order`, or timestamp descending).
- soft-deleted rows are excluded.
- there is no CSV import; the app is the system of record (D-01).

`change_log` (T-3-01) and `comments` (T-4-02) both export real rows; the CSV route list has been
complete since T-3-03, each entity's export starting the moment its own task's migration lands.

### Headers

| entity | headers |
|---|---|
| `events` | id, name, business_name, class, implementation_method, dl_event_name, category, status, certified, priority, description, purpose, page, trigger_text, grain, identity_note, owner_business, owner_technical, expiration_json, not_suitable_for, agent_instructions, derived_metrics_json, tags_json, property_count, variant_count, created_at, updated_at |
| `properties` | id, scope, name, category, property_category, category_override, description, data_type, data_formats_json, pii, property_type, allowed_values_json, example_values_json, item_schema_json, kind, derivation_json, bloomreach_customer_property, priority, status, notes, created_at, updated_at |
| `property_definitions` (D-58) | id, property_id, property_name, name, description, allowed_values_json, formats_json, example_values_json, using_events |
| `event_properties` | event_id, event_name, property_id, property_name, role, required, payload_key, priority, status, source_id, source_name, definition_id, definition_name, sort_order |
| `variants` | id, event_id, event_name, name, description, conditions_json, conditions_text, expiration_json, standard_event |
| `standard_event_mappings` | id, standard_event, event_id, event_name, variant_id, variant_name, field_map_json |
| `identity_rules` | id, identifier_name, identity_type, name, description, sdk_call, transformations_json, trigger_event_id, trigger_event_name, trigger_text, value_rule, example, owner, source_name, tracker, priority, status, sort_order |
| `catalogs` | id, name, description, mapping_role, client_name, purpose, catalog_type, owner, source_system, sync_method, update_frequency, priority, status, kind, market, language, version, live_at |
| `sources` (D-62) | id, name, system, method, color, is_default |
| `catalog_fields` | id, catalog_id, catalog_name, name, description, data_type, is_lookup_key, is_searchable, is_required, client_field_name, bloomreach_column, purpose, field_family, item_level, priority, status |
| `consent_categories` | id, name, description, standard_key, status, sort_order |
| `use_cases` | id, code, name, type, description, priority, status, owner, notes, template_id, template_code, requirement_count, narrative, activation, assets_json, internal_notes, internal_url |
| `requirements` | id, use_case_id, use_case_code, use_case_name, sort_order, target_kind, target_label, event_name, variant_name, property_name, level, status, note |
| `rules` | id, event_id, event_name, variant_name, kind, name, message, expression_text, tolerance_mode, tolerance_value, report_kind, severity, enabled, version |
| `qa_runs` | id, kind, actor, environment, started_at, finished_at, archived, customer_id, observation_count, notes |
| `observations` | id, qa_run_id, source, event_type, event_name, variant_name, timestamp, timestamp_iso, page_url, properties_json, context_values_json, captured_at |
| `findings` | id, comparison, kind, severity, status, event_name, variant_name, property_name, message, expected_json, actual_json, first_seen_at, last_seen_at, resolved_at, resolved_by |
| `change_log` | id, changed_at, actor, source, batch_id, entity_type, entity_id, entity_label, action, diff_json |
| `comments` (D-49) | id, entity_type, entity_id, entity_label, author_name, via_share, internal_only, body, created_at, resolved_at, resolved_by |

Note on `observations.timestamp`: it is exported as the **raw epoch-seconds value** (e.g.
`1778232949.3897672`), not an ISO string, so the CSV still joins with a raw
`customer-events-export.json` on the same field; `timestamp_iso` sits right next to it with the
human-readable form (empty when `timestamp` is null).

`use_cases.activation`/`assets_json` are declared ahead of the columns actually existing — D-56
adds them in phase 4 (T-4-06) — so the header list has been the stable contract since T-3-03; the
export service emits `''`/`'[]'` for both until then.

`use_cases.internal_notes`/`internal_url` (D-59 amendment 2, T-4-08) are the only `use_cases`
columns deliberately excluded from the tracking document, the documentation HTML export and every
MCP tool output — CSV (an operator-only export, not client-facing) is the one place they do appear.

## Full JSON backup and restore (D-45, capability 1)

`GET /api/projects/:id/export/backup.json` produces one self-contained file (also the "Download
backup" button on the Settings page):

```
{
  format: 'e3-tracking-backup', version: 1, exported_at, app: { schema_migration: '0029' },
  client: { key, name, bloomreach_account_id, notes },              // reference only, never restored
  project: { ...every projects column except id, client_id },        // share_token/share_access always null
  use_case_templates: [...],  // referenced templates, full rows, re-linked by code on restore
  sources, properties, property_definitions, events, event_sources, event_properties, variants,
  standard_event_mappings, identity_rules, catalogs, catalog_fields, consent_categories, use_cases,
  requirements, rules, property_bundles, property_bundle_items, qa_runs, observations, findings,
  change_log, comments,
  files: [{ path, mime, base64 }],   // every file referenced by triggers_json image_path or client_logo_path
  files_missing: [],                  // paths referenced but not found on disk
  warnings: [],                       // malformed *_json cells kept as raw strings, reported here
}
```

Every array holds full DAL rows with JSON columns parsed; every table's *live* columns are read
through `PRAGMA table_info` rather than a hard-coded list, so a new column shows up in the next
backup automatically. Soft-deleted rows are included (`deleted_at` present) — a backup is a
faithful snapshot, never filtered. A referenced file missing from disk is listed in
`files_missing[]`, never a thrown error.

`comments` (D-49, T-4-02) and `projects.settings_json` (D-60, T-4-09, carrying `is_sandbox`) are
included the same way as every other table/column — a backup of a sandbox project therefore
restores as a sandbox (same flag, same badge), and a restored project carries its source's comment
threads. Embedded `use_case_templates` (D-59, T-4-08) include their `prerequisites_json`/
`expected_assets_json`/`source_json`/`documentation_url`/`internal_notes`/`internal_url` columns —
the last two are user-owned and travel with the template like any other column, even though they
never appear in the tracking document or any export a client sees.

### Restore

`POST /api/projects/restore-backup/preview` takes the **raw backup object itself** as the whole
request body (not wrapped in a `{backup}` envelope — the exact JSON downloaded from
`export/backup.json`), validates `format`/`version`, and returns `{counts, project: {name, key},
warnings[], payload_hash}` — unknown top-level keys and unknown per-row columns are dropped with a
warning, never an error. `POST /api/projects/restore-backup/apply` takes
`{backup, payload_hash, project: {name, key, client_id}}` — here the backup **is** wrapped, under
the `backup` key, alongside the `payload_hash` from the preview response and the target project's
`name`/`key`/`client_id` (D-22 hash pattern, 409 `PAYLOAD_CHANGED` on a mismatch, 409
`PROJECT_KEY_TAKEN`) — and always creates a **new** project — restore never merges into an existing
one — in one transaction:

1. A fresh UUID is generated for every row's own `id` (and for the new project itself), building an
   `idMap` from old id to new id.
2. Every row of every table is deep-walked (object keys and values, recursing into every parsed
   `*_json` column) and any string equal to an old id is replaced by its new id. Compound strings
   (a `finding.fingerprint`, an `event_property`'s composite `change_log.entity_id`
   `"<event_id>:<property_id>"`) get a substring replace instead of an exact match, so a manual
   finding acknowledgement (D-42) and a `change_log` grouping still resolve correctly after
   restore.
3. `use_case_templates` are the one array **not** recreated: matched by `code` against the live
   global library — an existing template with an equal definition is reused, a different
   definition is reused with a warning (the use case keeps the *existing* template's id), a
   missing one is created.
4. Files are written through `FileStore.put` under the new project id; `triggers_json` image paths
   and `client_logo_path` are rewritten to the new paths through the same id-map-style walk.
5. One `change_log` row (`action: restore`, `source: 'restore'`) records the restore with counts,
   then `runComparison` recomputes findings for the new project.
6. `share_token`/`share_access` are never restored (left `null` on the new project), so a restored
   copy can never silently duplicate a live public link.

Restoring twice from the same backup (different target keys) produces two independent projects; no
old id ever appears anywhere in a restored row (id remap is total, not partial).

## Use case library (D-47, D-55, D-57, capability 11)

`samples/use-case-library-sample.json` (`.claude/team/samples/`) is the shipped format sample:
three templates (`UC-01 Abandoned cart`, `UC-02 Purchase confirmation`, `UC-03 Back in stock`) that
resolve against the `data-mapping.json` fixture, tagged with the D-57 facets and including one
`catalog_attribute` and one `consent` requirement (on `UC-02`) and one deliberately unresolvable
`event_name` requirement (`UC-03`'s `wishlist_add`, which is added to the project as a `gap`).

```
{
  format: 'e3-use-case-library', version: 1,
  templates: [
    {
      code: 'UC-01', name: 'Abandoned cart', type: 'marketing' | 'transactional',
      description?, narrative_template?,
      tags?: { channels?[], goals?[], tiers?[], kpis?[], industries?[] },   // D-57
      flags?: { new?: boolean, popular?: boolean },
      default_requirements: [
        {
          target_kind: 'customer_property' | 'event' | 'variant' | 'event_property'
                     | 'variant_property' | 'catalog_attribute' | 'consent',
          standard_event?,      // D-55: a Bloomreach standard event key, resolved via the
                                 // project's own standard event mapping first
          event_name?,          // for a custom event outside the standard catalog
          property_name?,       // standard property name (customer_property/event_property/...)
          field_name?,          // catalog_attribute: a main-catalog field name
          condition?: { property_name, value },
          level: 'R' | 'O',
          note?,
        },
      ],
    },
  ],
}
```

- `GET /api/use-case-templates/export.json` emits the same shape from the live table (round-trips
  the sample: import then export deep-equals the input).
- `POST /api/use-case-templates/import/preview` parses strict-but-forgiving
  (`src/domain/import/useCaseLibrary.ts`: an invalid `type`, an unknown `target_kind`, a missing
  `event_name`/`standard_event` become warnings and the entry is dropped) and diffs by `code`
  against the live global table (`create` / `update`, field changes listed / `unchanged`, shown
  deselected by default).
- `POST /api/use-case-templates/import/apply` (payload hash, D-22) upserts the selected items in
  one transaction. Templates are global (no `project_id`); import/export is never written to
  `change_log` (library maintenance, not a project change, D-44).
- `DELETE /api/use-case-templates/:id` returns 409 `TEMPLATE_IN_USE` (with the live reference count)
  while any non-deleted use case was added from it.
- Adding a template to a project (`POST /api/projects/:id/use-cases/from-template/:templateId`, optional `{code?}`,
  defaulting to the template's own code with a `-2`/`-3` suffix on conflict) resolves each
  requirement through the project's standard event mappings first, then an exact name match, then a
  mapping-step dialog for whatever is still unresolved (`.../preview` returns
  `{resolved, unresolved: [{index, target_kind, standard_event, property_name, candidates}]}`; the
  apply body's `mappings: [{index, event_id, variant_id?, property_id?}]` answers those rows and
  each becomes a new `StandardEventMapping`). Anything left unresolved (or explicitly skipped)
  becomes a requirement with `status: gap`. See `docs/DOMAIN.md`'s "Use case library and templates"
  section for the full resolution-order narrative.

## Documentation HTML export: examples and findings summary (T-4-19)

Each event's property table in `GET /export/documentation.html` ends with an **Example** column:
scalars and lists of scalars read as plain text (`2023, 2024`), objects are pretty-printed in a
code block, never as escaped JSON. The project properties section lists stored example values
comma separated. A **Findings summary** section sits before the event sections (and is the first
link in the table of contents, `#findings-summary`): open counts by severity and by comparison,
the top five events by open errors (linked to their event sections) and the acknowledged count.
It is omitted when there are no open and no acknowledged findings. The standard event mappings
section is one block per mapping ("standard event -> event (variant)", "n of m fields mapped",
mapped fields first, the rest "not mapped"). The shared view shows the same summary and mapping
blocks.

## Bloomreach bridge formats and the tracking document

`data-mapping.json`, `expiration-settings.json`, `data-manager-customers.json`,
`data-manager-events.json` (paste-in import with diff, byte-equivalent export on an untouched
project, D-04/D-28) are documented in `docs/DOMAIN.md`'s "Bloomreach Data Manager formats" section
and the `domain-model` skill, not repeated here. The machine-readable, per-project tracking document
(`GET /api/projects/:id/export/tracking-document.json`) has its own reference doc,
`docs/TRACKING-DOCUMENT.md`.
