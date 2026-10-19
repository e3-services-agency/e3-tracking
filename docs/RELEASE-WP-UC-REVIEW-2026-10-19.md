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
