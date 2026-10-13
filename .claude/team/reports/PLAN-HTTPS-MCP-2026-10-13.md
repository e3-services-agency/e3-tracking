# Authenticated HTTPS MCP connector — approved implementation contract

User approval: proceed with the HTTPS endpoint connector for Claude. D-87, tasks T-5-34 through T-5-36. Architecture owner auth-planner and independent auth-reviewer PASS. Coordinator alone writes team records. Baseline source bcdd365, production9bc5e72-dirty/20fc8b7f... on exact0040_qa_reports.sql.

## Transport and client compatibility

Endpoint `https://tracking.e3-services.com/mcp`, issuer existing canonical origin. Stateless Streamable HTTP uses a fresh McpServer and transport per request, reusing all29 tool definitions and handlers. Authenticate and preauthorize before SDK dispatch. Preserve existing stdio/IAP behavior and Claude's supported2025 protocol versions. No new cloud project, billing, DNS, Google scopes or client-secret distribution.

Claude custom connector uses **Register automatically**. Bounded Dynamic Client Registration accepts public clients (`token_endpoint_auth_method=none`), authorization-code and refresh grants and only the exact sole hosted redirect `https://claude.ai/api/mcp/auth_callback`. Require S256 PKCE. Reject arbitrary redirects, loopback, arbitrary metadata-fetch URLs and unsupported grant types. Limit registrations/rate and total storage; prune unused registrations only. Do not advertise unimplemented Client ID Metadata Documents support.

Minimally update MCP SDK to1.32.x for the public bearer-audience advisory. Explicitly enforce the exact `/mcp` resource both in the E3 verifier and SDK `expectedResource` plus returned `AuthInfo.resource`. Upgrading alone does not activate this protection. Read installed SDK handler/transport/provider interfaces and official examples rather than guessing APIs.

## Routes and edge boundary

| Route | Protection |
|---|---|
| `/mcp` | Narrow public edge route; dedicated E3 bearer before every request |
| `/.well-known/oauth-protected-resource/mcp` plus root alias | Public resource metadata |
| `/.well-known/oauth-authorization-server` | Public issuer metadata |
| `/mcp/oauth/register`, `/mcp/oauth/token`, `/mcp/oauth/revoke` | Public, bounded, client/token-bound OAuth endpoints |
| `/mcp/oauth/authorize`, `/mcp/oauth/consent` | Existing Workspace forward-auth, direct-peer/domain validation |
| `/api/mcp/connections` and owner revocation | Staff identity, owner check, mutation CSRF |

Use individual SDK OAuth handlers, since its router hardcodes root endpoint paths. Return standards-correct JSON metadata and Bearer challenges, never SPA or Google sign-in redirects on machine endpoints. Public routes strip caller identity headers, cookies and Google access-token headers. Preserve inbound Authorization only on `/mcp`; strip credential response headers. Consent gets only trusted Workspace identity verified again by the app, never shared commenter or caller-supplied identity. Reject unexpected Host/Origin; source absolute issuer/resource exclusively from validated canonical configuration. Default HTTP endpoint disabled until explicitly configured/enabled; production requires proxy staff authentication. Bounded bodies/rate/request duration and fail-closed unsupported methods are necessary for the public surface.

## Durable authorization

Migration0042 adds operational clients, pending consent, authorization codes, grants, selected project rights, access/refresh hashes, grant/project QA runs and metadata-only audit. Use DAL/database rules and ordered migration runner. Proposed lifetimes: pending consent10minutes, code5minutes, access15minutes, refresh family30days absolute. Opaque random tokens/cookies/codes are stored only as hashes; no new signing secret needed. Consume codes atomically once with exact client/redirect/S256/resource binding. Refresh rotates atomically, cannot expand rights, and replay invalidates the entire grant including all access tokens. Revocation is owner-bound and persists across restart. Revalidate current grants/project state on each request and again at tool invocation.

Consent binds the verified staff account, client, exact callback, resource, PKCE challenge, requested scopes and selected project IDs. Explicit Approve/Deny, HttpOnly cookie, CSRF, exact Origin; no GET approval. Read access initially; write and global-template access only through requested scope and explicit consent. Never grant permissions absent the request. Provide a simple staff-owned connections/revocation UI with explanatory labels, no secrets. Reuse existing UI where practical; a small server-rendered management page is acceptable if consistent and discoverable.

## Tool policy and isolation

Preserve authenticated discovery of all29 tool definitions, with an exhaustive default-deny policy registry. Preauthorize `tools/call` before SDK and again in callbacks. Missing scope returns HTTP403 `WWW-Authenticate` Bearer `insufficient_scope` with full required scopes to support Claude step-up. An unselected/foreign project remains generic terminal denial, never automatic permission expansion. Filter `list_projects` to explicitly granted project/client groups with no foreign counts. Remote requests ignore E3_PROJECT_KEY; require explicit key or derive it only when exactly one granted project exists. New projects gain no automatic rights.

Writes include all observation/QA mutations, `run_comparison`, definition mutations and mutation dry-runs. Global template listing requires `templates:read`; instantiation also requires selected-project write. Preauthorize every nested batch operation before invoking the batch, so authorization failure cannot follow an already-committed operation. Existing IDs stay scoped by their selected project; check every tool, including unknown names/operations and malicious nested project references.

Derive actor from the verified grant; caller agent_name is descriptive only. Avoid nested actor overrides and sensitive diagnostic leakage. Remote automatic QA-run reuse is durable by grantID+projectID, not the module-global process/project cache; stdio keeps its existing per-process behavior. Test concurrent principals/projects, revocation races and restart independently from frontend visuals.

## Implementation ownership

T35 owner collaboration-implementer, clean existing shared-portal worktree on a new task/T-5-35-https-mcp branch frombcdd365. Verify no uncommitted work before switching. Current node_modules is a junction to integration checkout; do not mutate the integration dependencies before acceptance. Safely detach only the verified junction entry and install task-local dependencies, or use a clean isolated dependency runtime. Preserve all source and machine .mcp files. Root never implements application code.

Expected scope: new HTTP/request-context/tool-policy modules; OAuth routes/provider/DAL/migration0042; narrow app/registerTools/resolve/session/project-list integration; management UI; Caddy; explicit environment config/examples; package lock; MCP/deployment documentation; meaningful tests. No unrelated domain rewrite, public staff APIs or shared-auth change. Separate source review and QA precede scoped commit underD73, root integration and release.

## Acceptance and operations

Owner focused API/security/regression tests, fresh build/type/lint; independent auth-reviewer source/adversarial tests then portal-qa separate tests and consent/management UI. Serialize expensive suites/builds. Require actual OAuth registration/discovery/PKCE/client/resource/code replay/refresh replay/revocation/restart failures; cross-project/global/batch zero-write denial; concurrent verified actors and QA isolation; normal stdio29-tool regression and both restore rehearsals. Full integrated suite is appropriate for this public authorization boundary and migration.

Real Claude hosted connector read-to-write re-consent is a separate end-to-end gate. Browser automation now initializes successfully; user may need to complete account sign-in/consent. Do not substitute mocks for a real Claude result. No prod test edits/comparison needed: final live smoke uses metadata/challenges and read-only granted tools, with temporary operational grant cleanup only if a reviewed test requires it.

Run scripts with dry-run first. Before deployment: SDK identity/live baseline audit, fresh portable backups and actual downloads/restores, build/push and cache exact image, quiescent full data/config/edge snapshot using existing reviewed0040 helper (current baseline FROM0040). Preserve old image pin. Apply new feature config and reviewed edge routes as part of release; test Caddy and narrowly recreate only necessary edge services, preserve staff/shared settings. Require exact final0042 migration, health/integrity/FK/sequence/baseline data counts, auth metadata/challenges, configured TLS URL and stdio/MCP regression, final offsite upload/download/restore and independent portable JSON preservation. Portable backups exclude all operational connector tokens/grants.

Recovery restores complete consistent data/config/snapshot, never image-only rollback or old SQLite/new WAL overlay. Normal restart retains grants. Restoring an older full database on a future0042 release must explicitly revoke all HTTP grant/token families to avoid resurrecting a prior revocation state. Document and review that recovery procedure before release. Existing0040 snapshot has no HTTP grant tables, so rollback to current baseline removes connector state with the full restored data/config. Keep snapshot artifacts private.

## Primary references

- [Claude connector implementation](https://claude.com/docs/connectors/building)
- [Claude authentication/callback/registration requirements](https://claude.com/docs/connectors/building/authentication)
- [MCP authorization](https://modelcontextprotocol.io/specification/latest/basic/authorization)
- [MCP transport](https://modelcontextprotocol.io/specification/latest/basic/transports)
- [SDK audience advisory](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-rvq5-wwqv-78pq)
