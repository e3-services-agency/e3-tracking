# Projects and clients

## Clients and projects

A **client** is a Bloomreach account (a mother company). A **project** is one Bloomreach project or brand inside it. Everything you document (events, properties, use cases, QA runs, findings) belongs to exactly one project; only clients and the global use case template library sit above it.

The **project switcher** in the header groups projects under their client. The URL carries the active project key (`/p/<key>/...`), so a link to a page opens in the same project.

## Creating things

- **Clients** page: create a client, then create projects under it, or delete several at once.
- **Create sandbox**: restores the bundled sample project under a "Sandboxes" client (or a client you pick). Sandboxes are badged in the switcher and in the Clients list, are meant for exploration, and refuse a share link unless you force it.
- **Restore a backup**: a full JSON backup always restores as a brand-new project; it never merges into an existing one.

## Settings

The **Settings** page holds project details, the money tolerance used by rounding checks, the default industry filter for the template library, and the share link block (see Sharing and access).

## Backups and exports

From the project you can download a full **JSON backup**, individual **CSV** tables, the **tracking document** JSON and the **documentation HTML**. Bloomreach-format exports (data mapping, expiration settings, Data Manager files) are rebuilt from your definitions. See the Exports reference for every file.

## History

Every change to a definition is recorded on the **History** page with who did it, where from (UI, MCP agent, import, restore) and the field diff. An import or restore groups its rows under one batch.
