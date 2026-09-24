# e3-tracking

In-house web app for Bloomreach Engagement migration intake, use-case data mapping, per-event documentation, automated QA, and export. Owner: E3 Services (Ján Pan). Replaces the Google Sheet plus Apps Script workflow entirely, with no legacy compatibility.

## Local setup

1. `npm install`.
2. `npm run dev` — runs the Express API (port 3001) and the Vite dev server (port 3000) together.
3. Open `http://127.0.0.1:3000/tracking-plan/`.
4. If port 3000 is already taken on your machine, stop the other process; there is no automatic fallback port.

The local SQLite database and uploaded files live under `data/` (gitignored). See `.env.example` for the environment variables and `CLAUDE.md` for full run, test, build and repository-structure details, including agent-specific rules.

## Documentation

- Agent and repository rules: [`CLAUDE.md`](CLAUDE.md)
- Product context and decisions: [`.claude/team/CONTEXT.md`](.claude/team/CONTEXT.md), [`.claude/team/DECISIONS.md`](.claude/team/DECISIONS.md)
- QA setup for local runs: [`docs/QA-LOCAL.md`](docs/QA-LOCAL.md)
- User-facing guides: [`public/docs/user-manual/`](public/docs/user-manual/)

## License and usage

Proprietary — E3 Services. For internal and client use as permitted by your agreement.
