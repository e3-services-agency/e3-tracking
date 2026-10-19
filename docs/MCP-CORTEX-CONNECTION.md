# Cortex tool-count diagnostic — 2026-10-19

The active Codex user configuration at `~/.codex/config.toml` contains:

```toml
[mcp_servers.e3-cortex]
url = "https://cortex.e3-services.com/mcp"
enabled_tools = ["read_cortex_context", "find_cortex_actors", "read_cortex_record"]
```

This exactly matches the three Cortex tools exposed in this chat. The configured endpoint is the
hosted Cortex MCP endpoint; the local allowlist excludes `get_cortex_capabilities`, library and
draft tools even when the server advertises them. Claude's reported 16-tool inventory is therefore
compatible with this observation. Removing a client-side filter would still leave the server's
grant/scope checks in force, but this diagnostic did not change the filter, grant or permissions.

The local Cortex source registers `get_cortex_capabilities` and inventories advertised tools at
runtime. Its source documentation records a separate 16-tool OAuth verification. During deployment,
a host-side HTTPS check using an existing company reader binding advertised 12 tools and confirmed
`get_cortex_capabilities` and the new response contract. That reader inventory is grant-specific.
The three-tool Codex client filter remains unchanged.

[Official configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
defines `mcp_servers.<id>.enabled_tools` as an allowlist and `disabled_tools` as a subsequent denylist.
To expose more tools, review the intended client allowlist separately; no new OAuth grant is implied.
