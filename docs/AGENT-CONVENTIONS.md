# E3 agent conventions — 2026-10-19.1

Tracking and Cortex keep their own authority, business states and access controls. A reference,
agent label or successful MCP call grants no approval, certification or execution authority.

**Discover access.** Tracking `get_server_info` works with every authenticated grant, including
template-only grants. It reports registered/visible tool counts, effective scopes/projects,
write visibility, limits and access-token/grant expiry timestamps. Cortex
`get_cortex_capabilities` reports its actual advertised tools and permitted scopes. Client-side
tool allowlists may expose fewer tools; discovery is not a backend-health or cross-connector check.

**Pages.** Collection envelopes contain `total`, `offset`, `limit`, `returned`, `next_offset`,
`truncated`, and `result_marker`. Rows live in the tool's named collection (`items`, `actors`,
`records`, `entities`, or `resources`). Cortex context has independent envelopes in `pagination`.
Follow the returned offset, including when a response-size bound returns fewer rows than requested.
Keep filters fixed and compare markers across pages; restart on a changed marker. Markers exclude
page bounds. Tracking uses database-backed revisions and snapshot reads; a completed comparison
invalidates findings traversal even if its output is identical. Cortex hashes persisted scoped
inventories in repeatable-read snapshots. Neither marker claims a remote-source refresh.

Tracking defaults: findings/history **10**, events/use cases **100**, maximum **1000**.
Historical reports default/max **100** checks. Cortex advertises its own bounded limits.
`fields=[...]` selects public row/object fields and overrides `include`. `include="detail"` and
`include="body"` request full detail. Unknown/private fields fail. Explicit detail may exceed
compact response-size targets; IDs, hashes, sequences and timestamps are never shortened.

**Conditional reads.** `if_hash` validates the complete public representation, including current
state and requested representation/page. A matching read returns
`{unchanged:true,id,revision?,hash,state}` without a body; `state` is null where inapplicable.
State changes invalidate a representation hash. Cortex also accepts `if_revision`; a match can
omit an unchanged revision's content while still returning its current state. Multiple supplied
conditions must all match. Existing `content_hash` parameters remain exact provenance guards,
separate from representation validators. Cortex retains `record_id` and `content_hash` aliases
in unchanged replies for existing callers. Reuse a validator only with the same target/options.

**Attribution and retries.** `actor` is the verified human; `agent` is a supplied label, never an
identity or permission grant. Tracking accepts `agent_name`; Cortex draft tools accept `agent`.
Supplied actor claims never replace authentication. Local Tracking stdio identifies its actor
as `local MCP user` and advertises unverified authentication. Older records have a null agent.
Tracking automatic QA sessions are separated by grant, project and agent; explicitly selected
runs retain creator attribution and each write receipt identifies its current writer.

Every Tracking write accepts optional `idempotency_key`, scoped to human/client, project and tool.
Identical canonical arguments replay the original receipt, including partial batch failures.
Different arguments—including preview/apply mode—require a new key. Each operation and its result
commit together; interrupted batches recover their original batch ID and skip committed steps.
Concurrent retries receive `IDEMPOTENCY_IN_PROGRESS`; retry the same key. A crashed request's lease
can be reclaimed after 60 seconds. Keys remain retained for their project's lifetime; receipts and
OAuth session maps are operational data and stay out of portable backups.

**References.** Tracking `add_reference` previews by default. An applied pointer pins Cortex
client/project, record type/ID, revision and content hash. Pointers are deduplicated and explicitly
unverified; following one requires separate Cortex authorization. References appear in detail reads
and survive portable restore with local target IDs remapped. They do not change business state.

**Errors.** Application tool errors use `CODE: message`; transport/schema failures retain standard
MCP handling. Shared retry/access codes and existing server aliases are listed in
[Agent error codes](AGENT-ERRORS.md). Safe messages exclude credentials, private paths and upstream
payloads. Check discovery and the relevant tool schema before retrying a denied/invalid operation.
