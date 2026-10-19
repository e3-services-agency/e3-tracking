# MCP use-case maintenance (WP-UC)

Release 0.5.1 adds `update_use_case`, `link_use_case_asset`, `unlink_use_case_asset`, including all
three as `batch_apply` operations. The generated inventory in [MCP.md](MCP.md) remains the tool-count
source of truth. Shared agent conventions remain revision **2026-10-19.1**.

## Lifecycle, owners and history

Use-case status keeps the UI vocabulary: `proposed`, `approved`, `in_progress`, `live`, `dropped`, or
unset (`null`). Priorities are `critical`, `high`, `medium`, `low`, or unset. `on_hold`, `signed_off`,
`in_qa`, `deprecated`, `done`, and finding priorities such as `P1` are rejected with allowed values.
No statuses are renamed. `approved` records an agreed lifecycle declaration; it does not approve a
Decision inbox proposal, certify an event, or establish successful delivery.

`update_use_case` resolves `use_case` by code or ID and accepts only `status`, `priority`,
`owner_business`, `owner_technical`, `status_note`, and the shared write options. Separate owner
fields are additive; the existing `owner` field is preserved. Owner labels are assignment data,
not identities or permission grants. Status transitions record `status_changed_by` from the verified
grant and `status_changed_at`. Changing to `approved` or `live` requires a fresh nonempty
`status_note` and explicit agent label. The brief's note rule for `on_hold`/`signed_off` cannot apply
because those values do not exist; no substitute lifecycle is silently inferred.

All new writes default to `dry_run:true` and return before/after/differences/warnings. They preserve
verified actor and agent separately, and applied mutations have a batch ID and history. Identical
single-write receipt replay reports `action:"unchanged"`, `replayed:true`, original action and the
same receipt/batch IDs without new history. Batch replay preserves the original batch result.
Batch apply retains its existing stop-on-error, non-atomic semantics; dry runs roll back everything.

Optional `if_hash` compares the exact current **public** `get_use_case.hash` inside the write
transaction. A mismatch returns `STALE_HASH` plus structured error `{code,status:409,message}`.
As an MCP tool application error, this is carried over the normal JSON-RPC transport; it does not
replace the transport's HTTP status. Private-only note edits do not change the public hash.
Compact write receipts omit narrative/requirements; `include:"detail"` or `"body"` returns public
detail. Internal-only notes/URLs are never exposed.

`get_history` already accepts `entity_type:"use_case"`. Request `include:"detail"` for field diffs,
including status/note before/after. Compact history includes actor, agent, batch ID and timestamp.

## Asset pointers and existing reviewed mappings

Asset tools accept `system:"bloomreach"`, `asset_type` (`scenario`, `email_template`, `email_campaign`,
`segmentation`, `catalog`, `other`), `asset_id`, `environment` (`staging`, `production`), optional
`label`, and role (`primary`, `variant`, `qa`; default `primary`). They deduplicate on use case,
system, type, asset ID and environment. Reusing the same key returns `action:"unchanged"` and the
existing link, even with different optional label/role: metadata is preserved and
`ASSET_POINTER_METADATA_IGNORED` names the link ID. Review an explicit unlink/relink to change it.
Unlink affects only maintained pointers, never reviewed evidence mappings.

Existing captured-source mappings and their human review receipts remain intact. New pointers use
`use_case_asset_pointers`, following the external-reference pointer pattern, so an unverified string
cannot inherit a reviewed mapping's configuration authority. Both are returned by `get_use_case`;
`list_use_cases.asset_count` counts the returned effective mappings plus pointers. The existing
implementation UI displays pointers explicitly as unverified. They never contribute to captured
configuration state, coverage, findings, certification, sends or completion. Pointer rows survive
portable backup/restore, with local target IDs remapped and external asset IDs unchanged.

Release **0.5.2** normalizes the public assets to singular types and explicit environments.
Reviewed mappings preserve their raw `source_asset_type` and source URL. Production/staging suffixes
in Bloomreach project URLs are labelled inferences (`environment_source:"source_url_project_name"`);
unknown environments are `null`. Pointers use `environment_source:"declared"`. Reads expose
structured `ASSET_ENVIRONMENT_CONFLICT` warnings with both link IDs/environments; link previews and
receipts expose the same warning as text. Warnings never edit either record. See the
[agent conventions](AGENT-CONVENTIONS.md) for lifecycle meanings and the public compatibility change.
Read a fresh hash after the projection upgrade.

## Optional Cortex verification

`add_reference` supports optional `verify` (default false). Without it, a syntactically valid hash
is accepted only as an unverified pointer. `add_reference(verify:true)` performs an exact Cortex `read_cortex_record` before the atomic write,
checking scope, ID, revision and **content_hash** (not the public representation hash). Successful
apply stores `verified_at`. Dry run resolves but writes nothing. Verification confirms the pointer
at that moment; it does not validate business approval or ongoing source freshness. Unresolved
pointers return `REFERENCE_NOT_VERIFIED` warnings even when their hash has valid syntax.

A Tracking access token is never forwarded to Cortex. Deployers may supply a private
`E3_CORTEX_VERIFY_BINDINGS_FILE`, readable only by the application, containing exact human/project
delegations to existing consented Cortex readers:

```json
{"bindings":[{"actor":"verified-human@example.test","tracking_project":"fictional-tracking",
"client":"fictional-client","project":"fictional-project","token":"EXISTING-CORTEX-READER-TOKEN"}]}
```

The endpoint is fixed to the hosted Cortex MCP URL. Calls are bounded and secrets never appear in
receipts or portable backups. Missing delegation returns `REFERENCE_VERIFICATION_UNAVAILABLE`;
read failures return `REFERENCE_NOT_FOUND`, and exact mismatches `REFERENCE_HASH_MISMATCH`, with no
stored pointer. No account, source permission or OAuth grant is created or expanded by this feature.
An old static reader without an effective Cortex role is insufficient. Provisioning credentials
must preserve the existing human's actual Cortex authority.

## Compatibility and next scope

No requirement editing, finding lifecycle changes, certification/comparison changes, Bloomreach
writes, bulk source-link loading or automatic decision approval is introduced. Existing use-case
values and reviewed mappings are preserved. `get_finding(if_hash)` keeps `{unchanged,id,hash,state}`;
the state field is required by the approved shared contract. Null-event finding buckets now have
`event_name:"(not in plan)"`.

The conventions URL is pinned to the release tag `tracking-mcp-0.5.2`. Refresh MCP tool discovery to
load the new schemas. The [WP6 parity audit](MCP-UI-PARITY-WP-UC-2026-10-19.md) lists current UI write
surfaces and gaps. Ján selects any WP6 implementation separately. The reviewed bulk status table and
first load of external asset links remain operator actions after their own diff and confirmation.
