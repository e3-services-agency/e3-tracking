# WP-UC production delivery — 2026-10-19

Human approval: “approved proceed iwth live impelementatoin into the VM”. The approved brief's
explicit hosted acceptance cases were exercised; the bulk operator status table and template-link
load were not applied. No requirement, finding status, certification, comparison or approval logic
was changed. No Bloomreach write or attachment to the seven findings was performed.

## Release

- Server **0.5.1**, **39 registered tools**, conventions **2026-10-19.1**.
- Source `ed19d5662342dbc982d9d12856ce2d7f814657f3`; immutable tag `tracking-mcp-0.5.1`.
- Image `europe-west1-docker.pkg.dev/e3-tracking/e3-tracking/e3-tracking@sha256:22e1968fc6e0fbba3db058b6aaf62efed3a50ccb2ec7a58a5ef7725a2a6182ae`.
- Schema `0055_use_case_maintenance.sql`; app and backup use the same pinned image.
- [Tagged conventions](https://github.com/e3-services-agency/e3-tracking/blob/tracking-mcp-0.5.1/docs/AGENT-CONVENTIONS.md).
- New tools: `update_use_case`, `link_use_case_asset`, `unlink_use_case_asset`, including batch operations.
- [Maintenance contract](MCP-USE-CASE-MAINTENANCE.md), [125-route parity audit](MCP-UI-PARITY-WP-UC-2026-10-19.md).

Existing UI statuses are kept: `proposed`, `approved`, `in_progress`, `live`, `dropped`, plus unset.
Priorities are `critical`, `high`, `medium`, `low`, plus unset. Unsupported proposed statuses are
rejected, not renamed. Notes and an agent label are required for MCP transitions to `approved` or
`live`; these declarations cannot approve Decision inbox proposals. Separate business/technical
owners and the lifecycle note are also visible/editable in the existing use-case UI.

## Acceptance results

| Brief case | Actual result |
| --- | --- |
| 1. Preview UC-ID-02 `in_progress` | PASS hosted authenticated batch: before `proposed`, action `update`, no business write. |
| 2. Apply/replay | PASS: UC-ID-02 changed to `in_progress`, status note and verified grant actor recorded with agent `Codex`. Identical hosted batch replay returned the same batch/receipt with no new history. Exact-image direct `update_use_case` replay returned `unchanged`. |
| 3. Invalid `done` | PASS hosted: `USE_CASE_STATUS_INVALID`, all five existing UI values listed, no write. |
| 4. `on_hold` without note | PASS rejection: value is absent from the UI vocabulary and is rejected even with a note. Separate missing-note checks for supported protected transitions also passed. |
| 5. Stale hash | PASS hosted: `STALE_HASH`, no write. Direct exact-image tool check also confirmed structured domain status 409; JSON-RPC transport retains its normal HTTP behavior. |
| 6. Five-operation preview | PASS hosted: five results, rollback proved by independent database comparison. |
| 7. UC-ID-14 staging pointer | PASS hosted: the brief-supplied scenario pointer is stored with `pointer_only_not_verified`; a fresh duplicate request returned `unchanged`. Existing reviewed mapping remains separate and intact. |
| 8. Use-case history | PASS hosted: `get_history(entity_type="use_case")` returns existing history plus the pointer change with verified actor, agent and batch ID. Detailed status/note diffs were validated through real MCP and database checks. |
| 9. Wrong Cortex hash with verification | GUARDED / DELEGATION PENDING: hosted call returned `REFERENCE_VERIFICATION_UNAVAILABLE` and stored nothing. There is no eligible delegated ODO reader configured. Exact delegated-reader scope/ID/revision/hash mismatch tests passed with synthetic credentials. Successful live resolution is not claimed. |
| 10. Server information | PASS hosted: 0.5.1, 39 tools, conventions 2026-10-19.1, release-tag URL. |

The current connector's cached inventory did not expose the new single-tool names, so hosted writes
used the already available authenticated `batch_apply` entry point. The exact container artifact
also exercised direct tool discovery, apply/replay, status errors, notes, stale hash, pointer
deduplication, history and verification refusal over the official MCP SDK on an isolated network.
Refresh discovery/reconnect to expose the new names in clients. Existing scopes are sufficient;
no OAuth grant was created or expanded.

Cortex verification deliberately requires explicit human/project/scope delegation. The existing
ODO static reader lacks the required effective role; no credentials were copied or invented to
work around that boundary. Without `verify`, unresolved references now return a warning. See the
maintenance contract for private deployment configuration. This setup item remains open.

## Preservation and recovery

Four fresh offsite backups matched GCS size/MD5 and restored through the candidate image with zero
warnings and clean integrity/FK checks. Quiescent full snapshot:
`/var/backups/e3-tracking/post-compact-0054-20261019T193628Z`.
The extracted-copy migration rehearsal passed before live migration. All original business rows
were unchanged at cutover. A second independent comparison after acceptance checked 44 business
tables and allowed exactly:

- One use-case lifecycle/note change (UC-ID-02).
- One unverified staging asset pointer (UC-ID-14).
- Two appended history rows, with the same verified actor and agent `Codex`.

All other business rows, including the other use cases, requirements, decisions, findings,
certification evidence and reviewed asset mappings, remained unchanged. External references remain
empty. All four projects uploaded again after acceptance at `2026-10-19T19-42-21-035Z`.
Public health is 200 with writable schema0055; unauthenticated MCP is 401. Edge/auth configuration
and images were preserved. Compose only adds the optional verifier-config environment setting.

Previous image:
`europe-west1-docker.pkg.dev/e3-tracking/e3-tracking/e3-tracking@sha256:bc76a866f4603eda1c64f15306a27b59d22285c6d6bd1fc34ff86e177535ce9f`.
Host receipts: `/var/backups/e3-tracking/wp-uc-release-20261019`.
The staged schema0054 helper performs matched data/config/image rollback and revokes restored
connector authorizations. Never run the old image on schema0055. Preserve acceptance writes before
any later rollback. Future maintenance helper:
`/opt/e3-tracking/deploy/gcp/maintenance-mcp0055.sh`.

## Regression evidence and response size

Affected verification passed across MCP authorization, durable retry/crash recovery, use-case DAL,
UI lifecycle, reviewed mappings, backup/restore, migrations and inventory. Builds, TypeScript and
color lint passed. The final attribution/HTTP regression run passed 56 tests; the UI/mapping run
passed 30, and the final DAL/hash/inventory run passed 34. These are overlapping targeted runs, not
an additive full-suite count. Earlier fixture/helper failures were corrected and the affected
checks rerun; no failed run is represented as a pass.

Live pre-acceptance compact reads: summary 1,703 characters, findings page 6,026, all 33 use cases
9,093. All 584 finding IDs/pages matched, including 486 open; conditional replies preserved state
and omitted body. Null-event groups are labelled `(not in plan)`.

The WP6 audit is delivered for scope selection only. No additional parity gaps were implemented.
