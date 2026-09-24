# e3-tracking

In-house web app for Bloomreach Engagement migration intake, use-case data mapping, per-event documentation, automated QA, and export. Owner: E3 Services (Ján Pan). Replaces the Google Sheet plus Apps Script workflow entirely, with no legacy compatibility.

## Local setup

1. `npm install`.
2. `npm run dev` — runs the Express API (port 3001) and the Vite dev server (port 3000) together.
3. Open `http://127.0.0.1:3000/tracking-plan/`.
4. If port 3000 is already taken on your machine, stop the other process; there is no automatic fallback port.

The local SQLite database and uploaded files live under `data/` (gitignored). See `.env.example` for the environment variables and `CLAUDE.md` for full run, test, build and repository-structure details, including agent-specific rules.

## What works today (phase 1)

- Import and export of the three Bloomreach JSON formats (data mapping, expiration settings, customer events export), every import shown as a diff and confirmed before it is applied.
- Documentation export (self-contained HTML) and per-event codegen snippets (GTM, Bloomreach Web SDK, Bloomreach Tracking API).
- Variants (event plus discriminator conditions) and standard-event mappings.
- Identity rules, consent categories, catalogs.
- Use cases (templates and client instances) and the computed requirements matrix.
- QA runs and observations, and the definition-vs-observations comparison producing typed findings.
- Client/project management, local single-user auth, local file storage for uploads.

## Not yet (planned for a later phase)

- The certified data product card and per-event documentation UI.
- The MCP server for AI-agent-driven QA (D-11, D-19).
- Change history per entity.
- Per-entity CSV export.
- Client share links.
- Remote deployment (phase 1 through 4 are local-only, D-09).

## Documentation

- Agent and repository rules: [`CLAUDE.md`](CLAUDE.md)
- Product context and decisions: [`.claude/team/CONTEXT.md`](.claude/team/CONTEXT.md), [`.claude/team/DECISIONS.md`](.claude/team/DECISIONS.md)
- QA setup for local runs: [`docs/QA-LOCAL.md`](docs/QA-LOCAL.md)
- Entity model in plain words: [`docs/DOMAIN.md`](docs/DOMAIN.md)
- User-facing guides: [`public/docs/user-manual/`](public/docs/user-manual/)

## License and usage

Proprietary — E3 Services. For internal and client use as permitted by your agreement.
