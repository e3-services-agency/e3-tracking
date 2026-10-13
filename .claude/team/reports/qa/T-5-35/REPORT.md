# T-5-35 QA report (local part), branch task/T-5-35-https-mcp-claude

Server: `npx tsx src/backend/server.ts` on port 3105, fresh SQLite, AUTH_MODE=proxy, TRUSTED_PROXY_CIDR=127.0.0.1/32, WORKSPACE_DOMAIN=e3-services.com.
Deviation: `mcpConfig()` rejects a non-HTTPS E3_PUBLIC_ORIGIN, so I used E3_PUBLIC_ORIGIN=https://tracking.e3-services.com and sent `Host: tracking.e3-services.com` over plain HTTP to 127.0.0.1:3105 (the Host check requires it). Because of that the Secure consent cookie was sent by hand.
Migrations: /api/health schema_migration=0043_mcp_oauth.sql; schema_migrations holds 42 rows (numbering has gaps, e.g. 0020), 0043 last. Data: sandbox backup restored as project qa-acme, plus empty qa-other. Raw log: run-log.txt, scripts p1.mjs/p2.mjs.

| # | Result | Evidence |
|---|---|---|
| 1 flag off | PASS | POST /mcp, GET /.well-known/oauth-authorization-server, POST /mcp/oauth/register, PRM, /mcp/connections, /api/mcp/connections all 404 |
| 2 metadata | PASS | PRM 200 resource=https://tracking.e3-services.com/mcp, authorization_servers=[origin]; AS metadata issuer=origin, endpoints under /mcp/oauth/*, S256 only, auth method none; /oauth-protected-resource/mcp 200 |
| 3 unauth /mcp | PASS | 401, WWW-Authenticate Bearer scope="projects:read", resource_metadata=.../.well-known/oauth-protected-resource/mcp |
| 4 DCR | PASS | claude.ai callback 201-style success (client_id issued); evil.example redirect 400 invalid_client_metadata |
| 5 authorize/consent | PASS | authorize 200 consent HTML (csrf hidden field, __Secure-e3-mcp-consent cookie, 2 project checkboxes); plain challenge rejected (302 to callback with invalid_request); GET /mcp/oauth/consent 405; consent with Origin evil.example 403 and claude.ai 403; authorize without staff header 401; exact-origin approve 302 with code+state |
| 6 token | PASS | token 200 (expires_in 900, scope projects:read); code replay 400 invalid_grant; the first access token then 401 (grant revoked); fresh flow 200 |
| 7 MCP read | PASS | initialize 200; tools/list 10 (list_projects, list_events, get_event_card, get_expected_payload, list_use_cases, get_use_case, list_findings, get_coverage_grid, get_tracking_document, get_history); list_projects returns only qa-acme; get_tracking_document qa-acme 200 (285 KB); qa-other 403 access_denied; create_event and submit_observation with read grant 403 WWW-Authenticate insufficient_scope scope="projects:read projects:write" |
| 7w write | PASS | tools/list 27; create_event dry_run 200 (no change_log row); real create 200; change_log row actor=qa@e3-services.com source=mcp despite agent_name="FORGED"; create on ungranted project 403 |
| 8 refresh | PASS | rotate 200; replay of old refresh 400 invalid_grant; afterwards both the rotated access token and the original access token 401, newer refresh 400 (whole grant revoked) |
| 9 management | PASS | GET /api/mcp/connections 200 lists grants (revoked flag, scopes, projects, expiry); revoke with bad csrf 403, bad origin 403, valid 200 {revoked:true}; access token then 401 invalid_token; /mcp/connections page 200 |
| 10 case variant | PASS | POST /MCP/oauth/register 404, /Mcp 404, /.well-known/OAuth-authorization-server 404 (extra: wrong Host 403) |
| 11 stdio | PASS | src/mcp/stdioProtocol.test.ts passes (29 tools via stdio) |
| 12 browser | PARTIAL | Not run in browser: vite.config.ts proxy hard-codes localhost:3001 (user's port, forbidden). Static check only: src/pages/Settings.tsx:28 renders a link "My Claude connections" to /mcp/connections |

## Notes (not failures)
- Protected-resource metadata scopes_supported lists only projects:read while AS metadata lists projects:read, projects:write, templates:read. Consistent with "initially read" in docs but worth a conscious decision.
- get_history over HTTP requires entity_type and entity_id (tool schema), so history was verified directly in SQLite instead.
- Write-grant tools/list returns 27 of 29 (template tools hidden without templates:read); docs say both "all 29 discoverable" and "tools/list shows only allowed tools". The second statement matches behaviour; the first sentence in the docs is stale.
- Cleanup: server stopped by PID 39828 (and its wrapper 47784 is gone); ports 3000/3001/3020 untouched. Scratch DB left in the scratchpad.
