# Cloud Deployment Audit — E3 Tracking Portal

**Date:** 2025-03  
**Scope:** Vercel (frontend) + Cloud Provider (backend) + Supabase

---

## Summary

- **Production blockers** identified and fixed: CORS, auth loading resilience.
- **Environment variables** are documented below for Vercel and Supabase.
- **Migrations and RLS** are in good shape for a fresh production database.

---

## Task 1: Environment Variable Validation

### Hardcoded URLs

- **No production-risk hardcoded URLs** in `src/`. The only absolute URLs are:
  - `https://fonts.googleapis.com` and `https://fonts.gstatic.com` (export.service.ts, index.html) — acceptable.
  - `https://api.exponea.com/...` in codegen.service.ts as an example in generated snippet — not a runtime URL.
  - Placeholder `https://...` in PropertyEditor — UI only.

### API base URL

- All API calls use a **single pattern**: `VITE_API_BASE_URL` (not `VITE_API_URL`).
- When `VITE_API_BASE_URL` is **unset**, `API_BASE` is `''`, so `fetch(\`${API_BASE}/api/...\`)` becomes **relative** (`/api/...`). That works when the frontend is served from the same origin as the API (e.g. Vercel proxy or same host).
- **Set `VITE_API_BASE_URL`** in Vercel to your backend URL (e.g. `https://api.yourdomain.com`) when the API is on a different origin.

### Supabase (frontend)

- **`VITE_SUPABASE_URL`** and **`VITE_SUPABASE_ANON_KEY`** are used in `src/lib/supabase.ts`.
- If either is missing, `getSupabaseBrowser()` throws; the app is wrapped in `ErrorBoundary`, so users see an error screen instead of a blank crash.

### Supabase (backend)

- **`SUPABASE_URL`** and **`SUPABASE_SERVICE_ROLE_KEY`** in `src/backend/db/supabase.ts` (DAL) — **required**; code throws if missing.
- **`SUPABASE_URL`** and **`SUPABASE_ANON_KEY`** in `src/backend/middleware/auth.ts` (JWT verification) — if missing, `optionalAuth` never sets `req.userId`, so protected routes return 401.

---

## Task 2: CORS & Header Security

### CORS (fixed)

- **Before:** No CORS middleware in `src/backend/app.ts` — browser requests from another origin (e.g. Vercel) would be blocked.
- **After:** `cors` middleware added with:
  - **Origin:** `CORS_ORIGIN` env (comma-separated). If unset, `origin: true` (reflect request origin) for flexibility with preview deployments.
  - **Credentials:** `true` (for `Authorization: Bearer`).
  - **Methods:** GET, POST, PUT, PATCH, DELETE, OPTIONS.
  - **Allowed headers:** `Content-Type`, `Authorization`, `x-workspace-id`.

**Recommendation:** In production, set `CORS_ORIGIN` to your frontend origin(s), e.g.  
`https://your-app.vercel.app,https://your-domain.com`.

### Authorization header

- Protected routes use `requireAuth`, which expects `req.userId` set by `optionalAuth`.
- `optionalAuth` reads `Authorization: Bearer <token>` and validates the JWT with Supabase.
- All relevant API hooks (events, properties, catalogs, journeys, workspaces) send `Authorization: Bearer` when `getAccessToken()` is available.

---

## Task 3: Production Build Compatibility

### Dependencies

- No **development-only** code gates (e.g. `NODE_ENV === 'development'`) that would break a Vite build.
- **`better-sqlite3`** is in `dependencies` but not used in the current backend (Supabase is the DB). Safe to leave or remove; no impact on build.

### Living Documentation (`public/docs/`)

- **`src/pages/Documentation.tsx`** loads markdown with `fetch(\`/docs/user-manual/${file}\`)`.
- Vite copies `public/` to the **root** of `dist/`, so built output has `dist/docs/user-manual/*.md`.
- As long as the deployment serves the whole `dist` from the same origin, `/docs/user-manual/...` resolves correctly. No code change needed.
- **If** you serve the app from a subpath (e.g. `https://site.com/tracking-plan/`) and static files only from that subpath, ensure your host also serves `docs/` under that path or adjust the fetch path accordingly.

---

## Task 4: Error Handling & Resilience

### Silent failures (addressed)

- **AuthContext:** `getSession()` used to have no `.catch()`. If Supabase was down or the request failed, `loading` could stay `true` forever.
  - **Fix:** `.catch()` clears session/user, `.finally()` sets `loading` to `false`, so the UI reaches a decided state (e.g. redirect to login via `ProtectedRoute`).

### Error boundary

- **`ErrorBoundary`** wraps the app and catches render errors, showing “Something went wrong” plus message and a “Try again” button instead of a blank screen.

### Session expired / 401

- **ProtectedRoute** only checks `user` from Supabase session; it does **not** listen for API 401s.
- If the session expires and the user triggers an API call, the backend returns 401; the UI does not automatically sign out or redirect.
- **Recommendation:** Optionally add a small layer (e.g. a fetch wrapper or hook) that on 401 calls `signOut()` and redirects to `/login`, or handle 401 in critical flows.

---

## Task 5: Database & Migration Audit

### Migrations (0001–0007)

- **0001:** Creates tables and RLS policies (no seed data that could conflict).
- **0002–0006:** Add columns/tables with `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` where applicable.
- **0007:**  
  - Creates `workspace_member_role` enum with `DO $$ ... EXCEPTION WHEN duplicate_object`.  
  - Creates `workspace_members` with `CREATE TABLE IF NOT EXISTS`.  
  - Drops old policies with `DROP POLICY IF EXISTS`, then creates new RLS policies.  
  - Adds `client_primary_color`, `client_name`, `client_logo_url` to `workspace_settings` with `ADD COLUMN IF NOT EXISTS`.  
- **No conflicting INSERTs** that would fail on a fresh production run.

### RLS and cross-tenant safety

- **`is_workspace_member(ws_id)`** is used consistently: it checks `auth.uid()` against `workspace_members`.
- All main tables (workspaces, workspace_settings, sources, properties, events, catalogs, journeys, join tables, qa_*) either:
  - use `is_workspace_member(workspace_id)` or `is_workspace_member(id)`, or  
  - use an `EXISTS` subquery that gates by workspace membership via the parent row.
- **`journeys_public_share`** allows `SELECT` where `share_token IS NOT NULL` (for shared links); other access remains member-gated.
- **Conclusion:** RLS is sufficient to prevent cross-tenant data access for normal member-based access.

---

## Environment Variables

### Vercel (Frontend)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | **Yes** | Supabase project URL (e.g. `https://xxxx.supabase.co`). |
| `VITE_SUPABASE_ANON_KEY` | **Yes** | Supabase anon/public key (safe to expose in the client). |
| `VITE_API_BASE_URL` | **No** (but recommended if API is on another origin) | Backend API base URL (e.g. `https://api.yourdomain.com`). Omit to use relative `/api/...` (same origin). |
| `BASE_URL` | **No** | Set by Vite/build (e.g. `/tracking-plan/`). Override only if you use a custom base path. |

### Backend (Cloud provider / Node server)

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default in code: `3001`). |
| `SUPABASE_URL` | **Yes** | Same Supabase project URL as frontend. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Supabase service role key (server-only; never expose in client). |
| `SUPABASE_ANON_KEY` | **Yes** | Supabase anon key (used by auth middleware to verify JWTs). |
| `CORS_ORIGIN` | **Recommended in production** | Comma-separated allowed origins (e.g. `https://your-app.vercel.app,https://your-domain.com`). If unset, CORS reflects the request origin. |

### Supabase dashboard

- No extra env vars needed in the Supabase UI for this app.
- Ensure **Authentication** is enabled and **RLS** is enabled on the tables (as in 0007).
- After running migrations, confirm `workspace_members`, RLS policies, and `get_user_id_by_email` exist.

---

## Checklist Before Go-Live

1. **Vercel:** Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and (if needed) `VITE_API_BASE_URL`.  
2. **Backend:** Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, and (recommended) `CORS_ORIGIN`.  
3. **Supabase:** Run migrations 0001–0007 on the production project.  
4. **Optional:** Add 401 handling (sign out + redirect to login) for a smoother “session expired” experience.
