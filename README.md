# E3 Tracking Implementation Portal

Enterprise-grade **Tracking Implementation Portal** for the E3 agency. It bridges the gap between data strategy and developer implementation by providing a single source of truth for events and properties, a visual journey builder, implementation-ready code generation (GTM dataLayer, Bloomreach SDK & API), and QA payload validation.

---

## Features

- **Data dictionary** — Events, properties (with presence rules), and sources; workspace-scoped and audit-ready.
- **Visual journey builder** — Canvas-based flows with step nodes, trigger nodes (linked to events), and implementation-type badges (New / Enrichment / Fix).
- **CodeGen** — Multi-style snippets (dataLayer, Bloomreach Web SDK, Bloomreach Tracking API) with optional-property comments.
- **Export** — Standalone HTML implementation briefs with agency branding and implementation examples per trigger.
- **QA validation** — Payload validation against always-sent properties and verification status on the journey canvas.

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, React Flow, Zustand
- **Backend:** Express, Supabase (PostgreSQL)
- **Branding:** E3 Space Blue & Emerald, DM Sans, client co-branding via `--brand-primary`

---

## Prerequisites

- **Node.js** (LTS recommended)
- **npm** (or compatible package manager)

---

## Local Setup

### 1. Clone and install

```bash
git clone <repository-url>
cd e3-tracking
npm install
```

### 2. Environment configuration

Create a **`.env`** (or **`.env.local`**) in the project root. The app expects at least:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | Yes (if using API) | Base URL of the backend API (e.g. `http://localhost:3001`). Omit trailing slash. Used by the frontend for events, properties, journeys, codegen, and export. |
| `GEMINI_API_KEY` | Optional | For any Gemini AI–powered features. |
| `APP_URL` | Optional | Application URL for links and callbacks. |

Example:

```env
VITE_API_BASE_URL=http://localhost:3001
```

If `VITE_API_BASE_URL` is not set, API calls may fall back to relative or empty base (behavior depends on feature). For full functionality, run the backend and set this to its base URL.

### 3. Run locally

**Frontend (Vite dev server):**

```bash
npm run dev
```

The app is typically available at **http://localhost:3000** (see terminal output for the exact URL and port).

**Backend:** If your setup uses a separate Express server, start it according to your backend documentation and ensure `VITE_API_BASE_URL` points to that server.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (default port 3000). |
| `npm run build` | Production build. |
| `npm run preview` | Preview production build locally. |
| `npm run lint` | Type-check with `tsc --noEmit`. |

---

## Documentation

Detailed documentation lives in the **`/docs`** folder:

| Document | Description |
|----------|-------------|
| [**Product Requirements**](docs/PRODUCT_REQUIREMENTS.md) | High-level product overview, business problem, and core features (Data Dictionary, Journey Builder, CodeGen, Export, QA Validation). |
| [**Architecture**](docs/ARCHITECTURE.md) | Tech stack, database schema (workspaces → events & properties → journeys → steps), and code generation logic. |
| [**Branding and UI**](docs/BRANDING_AND_UI.md) | E3 agency branding (Space Blue, Emerald, DM Sans) and the CSS variable system for client co-branding (`--brand-primary`). |

Additional planning and schema notes:

- [Data Schema & Architecture Plan](docs/DATA_SCHEMA_AND_ARCHITECTURE_PLAN.md)
- [Journeys Current State Analysis](docs/JOURNEYS_CURRENT_STATE_ANALYSIS.md)

---

## License and Usage

Proprietary — E3 agency. For internal and client use as permitted by your agreement.
