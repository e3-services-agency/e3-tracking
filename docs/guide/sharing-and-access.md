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

## Reactions and names

Under every comment are three buttons: **Seen**, **Like** and **On it**. Press one to react, press it again to take it back; hover a button to see who reacted. **On it** also marks an open thread as On it. On a share link the visitor's name is remembered in their browser for that link; a visitor who has not entered one reacts as an automatic "Visitor 4f2a" id. If you tick **Settings, Share link, Require a name on the share link**, visitors must enter a name before they can comment, reply, react or change a status.

## Agents

An MCP server exposes the definitions, findings and QA tools to AI agents on the same database. See the MCP server reference. Agent writes are attributed to the agent name in History.

## Replies and status

Every comment can be answered with a reply; replies show under the comment (the first two, then
"Show n more"). The first comment of a thread has a status: Open, On it, Done or Won't do. On the
internal pages you can set any of them (the Comments page has a status filter). A client with a
comment link can mark a thread On it or Done, but cannot reopen it or set Won't do. Section headers
of the shared page show how many threads are still open.

## Images on comments

In any comment form, drop, paste (Ctrl+V while the dashed zone is focused) or click to add screenshots: PNG, JPEG or WebP, 5 MB each, up to 10 per comment. The images upload right after the comment is posted and show as small thumbnails under it (three visible, then "+n"); click one to open it full size and step through the rest with the arrow keys. Images are re-encoded on upload, so location data and other hidden metadata are removed. An image on an "Internal only" comment is never visible through the share link. Clients with a comment link can attach images to the comment they just wrote (within 15 minutes); the team can add and delete images from the internal API.
