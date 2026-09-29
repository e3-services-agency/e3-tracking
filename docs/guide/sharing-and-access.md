# Sharing and access

## Signing in

Local mode is the only mode today: the app runs on your machine or server, and the actor name in History comes from the configured local user name. There is no per-project role model.

## Share link

A project can have one **share link**, managed in **Settings**:

- Generate or rotate the link; revoke it to disable it immediately.
- Access is **read** (view only) or **comment** (view and post comments).
- The link opens `/tracking-plan/shared/<token>` with no login and shows a public version of the documentation. Internal-only fields (agent instructions, owners, identity notes, the Bloomreach project URL and every internal note) are removed.
- Sandbox projects refuse a share link unless forced.

See the Sharing reference for the exact routes and guarantees.

## Comments

You can comment on an event, property, use case or requirement, from the panels on those pages or the project-wide **Comments** page. A comment thread is shared: what a client posts through a comment share link and what you post internally appear on the same anchor. Tick **Internal only** on a comment to keep it off the share link, whatever the link settings are. Otherwise internal replies are visible to the link holder only while **Settings, Share link, Show internal comments on the shared view** is set to **All comments**; with **Only comments posted through the link**, the shared view shows just the comments posted through the link itself. Comments can be resolved (internally) and deleted. Comments never appear in the tracking document, the HTML export or MCP output.

## Agents

An MCP server exposes the definitions, findings and QA tools to AI agents on the same database. See the MCP server reference. Agent writes are attributed to the agent name in History.
