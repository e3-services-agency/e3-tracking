# Agent application error codes

Codes remain stable within each server. Existing aliases are preserved; none alters a business
status. OAuth/JSON-RPC and SDK schema-validation failures retain their protocol error envelopes.

| Codes | Meaning / operator action |
| --- | --- |
| `VALIDATION_ERROR`, `invalid_request`, `PRIORITY_INVALID`, `PROPERTY_INVALID`, `unsupported_record_type` | Correct arguments using the advertised schema. Use IDs for ambiguous names. |
| `MCP_FORBIDDEN`, `scope_denied`, `principal_denied` | Current credentials do not authorize the request. Inspect discovery; agent labels cannot grant access. |
| `PROJECT_NOT_FOUND`, `EVENT_NOT_FOUND`, `USE_CASE_NOT_FOUND`, `VARIANT_NOT_FOUND`, `PROPERTY_NOT_FOUND`, `CATALOG_NOT_FOUND`, `TEMPLATE_NOT_FOUND`, `NOT_FOUND`, `record_not_found` | Target unavailable in this scope. Do not search other projects as a fallback. |
| `PAYLOAD_CHANGED`, `revision_mismatch`, `draft_conflict` | Exact preview, revision or protected draft baseline changed. Read/preview the current target again. |
| `IDEMPOTENCY_CONFLICT` | Same key, different arguments. Use a new key for a new operation. |
| `IDEMPOTENCY_IN_PROGRESS` | Request is running/recovering. Retry the same key after the current attempt or its 60-second lease. |
| `REFERENCE_CONFLICT` | The pinned reference exists with different metadata. Inspect the existing pointer; it was not replaced. |
| `UNKNOWN_OPERATION` | Unsupported batch operation. Use an advertised operation. |
| `DUPLICATE_OBSERVATION` | Evidence collides with an existing observation. Inspect its owning run. |
| `IDENTIFIER_TYPE_MISMATCH` | Existing registry identifier has another type. Reconcile the definition explicitly. |
| `service_auth_required`, `context_unavailable`, `INTERNAL_ERROR` | Service unavailable or unexpected internal failure. No credentials, source bytes or internal paths are returned. |

Other Tracking DAL validation/conflict codes retain their existing tool-specific meanings. They
are never inferred to be a retry authorization. A failed batch returns its per-operation codes,
applied/failed/not-run counts and original batch ID; replaying its key does not run the remainder.
