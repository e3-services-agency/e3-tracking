# WP-UC review corrections — Tracking 0.5.2

Scope: duplicate pointer receipts, normalized public asset types/environments and explicit
cross-environment warnings, plus lifecycle/reference-verification documentation. No schema change,
business data repair, bulk status update or external asset loading is part of this patch.

The five existing statuses remain supported; their meanings are recorded in
[agent conventions](AGENT-CONVENTIONS.md). `approved` alone does not prove client sign-off.
Reviewed asset mappings retain all source metadata; inferred environment is labelled and unknown
environment is null. Pointer identity duplicates return the existing link unchanged, preserving
metadata and history. Same-ID cross-environment warnings name both links without editing them.
The normalized public representation changes use-case hashes; clients must reread before writes.

Hosted 0.5.1 schema inspection independently confirmed `add_reference.verify` is a boolean.
The connected client had a cached schema omitting it. `verify:false` is intentionally unverified;
`verify:true` requires a separately authorized Cortex reader and fails closed if unavailable.
No new grant, reader, secret or permission was provisioned.

The null-event summary was confirmed live: 235 findings labelled `(not in plan)`, 486 open in total.
The [parity audit](MCP-UI-PARITY-WP-UC-2026-10-19.md) includes an operator summary and complete route
inventory for selecting future scope. Approval of a future parity gap is separate.

Validation before source freeze: 69 targeted tests passed (8 files), including pointer metadata
deduplication, warning/no-mutation behavior, public hash changes, reviewed mapping authority,
durable replay, compact pages, verification failure guards and UI lifecycle. Production build
passed. Deployment and post-deployment evidence will be appended after verified cutover.

UC-ID-02's existing acceptance note and both UC-ID-14 links must remain byte-identical. All new
apply tests run only in disposable fictional fixtures; hosted checks use reads and dry runs.

## Completed deployment and hosted checks

Released at **2026-10-19 20:08 UTC**, schema **0055** unchanged, **39 registered tools**,
shared conventions revision **2026-10-19.1**, conventions URL pinned to `tracking-mcp-0.5.2`.
Source: `f6edd2323e1af62304d56a9bac13a35a7f51d74e` on `codex/wp-uc-review-fixes`.

Exact app and backup image:
`europe-west1-docker.pkg.dev/e3-tracking/e3-tracking/e3-tracking@sha256:e0d442b38a4684b1b409abaf067b604adeb7b6bde72d5d48e8d9cb1a62cf97f1`.

Previous image:
`europe-west1-docker.pkg.dev/e3-tracking/e3-tracking/e3-tracking@sha256:22e1968fc6e0fbba3db058b6aaf62efed3a50ccb2ec7a58a5ef7725a2a6182ae`.

- Production build, TypeScript/color lint, generated inventory check, 69 targeted regression tests
  and 12 exact-image fictional acceptance cases passed. Existing build warnings concern bundle
  size/dependency annotations; dependency versions were not changed by this patch.
- Four fresh offsite backups (`2026-10-19T20-00-05-943Z`) restored in isolated candidate containers
  on the VM. Bytes/MD5 matched GCS metadata; restore previews had zero warnings, expected table
  counts, integrity OK and no foreign-key failures. No client backup was transferred to the PC.
- Verified quiescent full data/config snapshot:
  `/var/backups/e3-tracking/post-compact-0055-20261019T200646Z`.
  An extracted clone opened successfully with the candidate, preserving all business rows.
- All **44 business-table fingerprints** matched after cutover and again after backup. This
  includes use cases, notes, requirements, reviewed mappings, pointers, findings and change logs.
  UC-ID-02's note/status and both UC-ID-14 stored rows were unchanged. External references remain 0.
- App/backup run the exact pinned digest; the image revision label matches the source commit.
  Configuration fingerprints match except the approved `IMAGE` key. Caddy `e02a302ad106` and
  OAuth proxy `e9252fd50f88` retain their pre-cutover IDs. Public health is 200/writable0055;
  unauthenticated MCP is 401.
- Hosted SDK checks matched all 584 finding IDs and full paged rows, stable page markers, 486 open,
  a **1,703-character summary**, **6,026-character** default finding page, and all 33 use cases in
  **9,126 characters**. Matching conditional reads omit bodies and retain state.
- Real authenticated connector checks confirmed verified actor `jan.pan@e3-services.com`, server
  0.5.2, normalized UC-ID-14 assets and `ASSET_ENVIRONMENT_CONFLICT`. A duplicate dry-run batch with
  differing label/role returned `unchanged`, empty differences and `ASSET_POINTER_METADATA_IGNORED`
  naming the existing pointer. A following matching conditional read confirmed no public change.
- The conflict identifies reviewed link `346c5ae1-b7fa-4d2f-bb5c-89c6b550e468` as production by URL
  inference, and pointer `9af407e4-6aed-4daa-9a16-33617da40973` as declared staging, for scenario
  `6ad0b6b16c7bfc185cd65be8`. Neither environment was corrected; reconciliation remains an operator
  decision before relying on that mapping or loading related links.
- `add_reference.verify` is advertised in the actual server schema. A hosted `verify:true` dry run
  fails `REFERENCE_VERIFICATION_UNAVAILABLE` without storing a reference. Successful live Cortex
  resolution remains pending an eligible separately consented reader. Mocked tests verify exact
  scope/revision/hash mismatch guards; they do not claim successful live Cortex verification.
- All four post-release uploads succeeded at `2026-10-19T20-09-32-601Z`.

Host scripts/receipts: `/home/jan_pan/wp-uc-review-20261019` and
`/var/backups/e3-tracking/wp-uc-review-20261019`. `cutover.sh rollback` performs matched full
data/config/previous-image recovery and revokes restored connector authorizations; preserve any
later client writes before considering rollback. The immutable source tag is retained; this
post-deployment report is a subsequent documentation commit.

No bulk status changes, template/asset loading, seven-finding review attachment, business approval,
certification change or access expansion was performed. The primary dirty checkout was preserved.
