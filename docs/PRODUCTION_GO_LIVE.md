# E3 Tracking Portal — Production Go-Live Checklist

**Stack:** Vercel (frontend + API) · Supabase (Database, Auth, Storage)  
**Prerequisite:** Migrations 0001–0007 have been run on the production Supabase project.

---

## Task 1: Code Audit for Production

### Frontend API usage

- **`src/lib/api.ts`** and all hooks (events, properties, catalogs, journeys, workspaces, WorkspaceSettings, EventCodeGen) call the backend via **`fetchWithAuth(\`${API_BASE}/api/...\`)`**.
- **`API_BASE`** comes from **`VITE_API_BASE_URL`**. When unset, it is `''`, so requests are **relative** (e.g. `/api/workspaces`).
- **Conclusion:** The app does **not** assume a separate Express server. It expects an HTTP API at `/api/*`. When that API is on the **same origin** as the frontend (e.g. Vercel serving both), leave `VITE_API_BASE_URL` **unset**.

### Supabase usage in the frontend

- **`getSupabaseClient()`** is used for:
  - **Auth** (AuthContext: sign in/out, session).
  - **Workspace list** and **workspace_settings** (useWorkspaces).
- All other data (events, properties, catalogs, journeys, members, codegen, export) goes through the **Express API** (with JWT in `Authorization` and optional `x-workspace-id`).

### Backend (required for full app functionality)

- **Location:** `src/backend/app.ts` — Express app with routes: `/api/workspaces`, `/api/catalogs`, `/api/events`, `/api/properties`, `/api/journeys`, `/api/shared`.
- **Uses:** Supabase (service role in DAL, anon key in auth middleware). No separate DB; no `better-sqlite3` at runtime.
- **Features:** Workspace CRUD and clone, catalog/event/property/journey CRUD, shared journey view, codegen, HTML export.

### Deploying the backend as Vercel Serverless (no third-party host)

The repo includes **`api/[[...path]].ts`**, which forwards every **`/api/*`** request to the same Express app. That way the API runs on Vercel in the **same project** as the frontend.

- **Behavior:** Requests to e.g. `/api/workspaces` or `/api/journeys/123/canvas` are handled by the serverless function, which passes `(req, res)` to the Express app. No separate Node server is required.
- **Env for the API:** Set the **backend** variables in the **Vercel** project (see Task 2). The serverless function runs in the same deployment and reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, and optionally `CORS_ORIGIN` and `GEMINI_API_KEY`.
- **Same-origin:** Because the API is served from the same Vercel deployment, **do not set `VITE_API_BASE_URL`** (or set it to the same origin). The frontend will call `/api/...` relative to the current origin.

If you ever move the API to another host (e.g. Railway), set **`VITE_API_BASE_URL`** in Vercel to that host’s base URL and configure CORS there.

---

## Task 2: Environment Variable Manifest (Vercel)

Configure these in **Vercel → Project → Settings → Environment Variables** (apply to Production and, if needed, Preview).

| Variable | Required | Description |
|----------|----------|-------------|
| **`VITE_SUPABASE_URL`** | **Yes** | Supabase project URL (e.g. `https://xxxx.supabase.co`). |
| **`VITE_SUPABASE_ANON_KEY`** | **Yes** | Supabase anon/public key (safe in client). |
| **`VITE_API_BASE_URL`** | **No** (when API is on Vercel) | When the API is **Vercel Serverless** in this project, **leave unset** so the app uses relative `/api/...`. When the API is on another domain, set this to that base URL (e.g. `https://api.yourdomain.com`), no trailing slash. |

**Backend (used by `api/[[...path]].ts` on Vercel):**

| Variable | Required | Description |
|----------|----------|-------------|
| **`SUPABASE_URL`** | **Yes** | Same as `VITE_SUPABASE_URL`. |
| **`SUPABASE_SERVICE_ROLE_KEY`** | **Yes** | Supabase service role key (server-only; never expose in client). |
| **`SUPABASE_ANON_KEY`** | **Yes** | Supabase anon key (used by auth middleware to verify JWTs). |
| **`CORS_ORIGIN`** | Optional | Comma-separated allowed origins. If unset, CORS reflects the request origin (fine for same-origin). |
| **`GEMINI_API_KEY`** | Optional | For event codegen feature. |

**Summary:** For a single Vercel project serving both the SPA and the API, set the six variables above (three `VITE_*`, three backend). Leave **`VITE_API_BASE_URL`** unset.

---

## Task 3: Supabase Authentication Configuration

1. Open **[Supabase Dashboard](https://supabase.com/dashboard)** → your **production** project.
2. Go to **Authentication → URL Configuration**.
3. **Site URL:** Set to your production app URL, e.g.  
   - `https://your-app.vercel.app`  
   - or with base path: `https://your-app.vercel.app/tracking-plan`  
   - or custom domain: `https://tracking.yourdomain.com`
4. **Redirect URLs:** Add every URL where users can land after sign-in or sign-up (one per line), for example:
   - `https://your-app.vercel.app/**`
   - `https://your-app.vercel.app/tracking-plan/**` (if you use `base: '/tracking-plan/'`)
   - `https://tracking.yourdomain.com/**` (if using a custom domain)
   - Preview deployments (optional): `https://*.vercel.app/**`
5. Save. Without the production URL in **Redirect URLs**, auth callbacks can be blocked and users may see “redirect URL not allowed” errors.

---

## Task 4: Final Build Verification

### Vercel build settings

- **Build Command:** `npm run build`  
- **Output Directory:** `dist`  
- **Install Command:** `npm install` (default)

No separate build step is needed for the API; Vercel builds the `api/` serverless function from the repo.

### Living Documentation

- Markdown files live in **`public/docs/user-manual/`** (e.g. `getting-started.md`, `security-and-admin.md`).
- Vite copies **`public/`** to the root of **`dist/`**, so after build you have **`dist/docs/user-manual/*.md`**.
- The app loads them with **`fetch('/docs/user-manual/<file>')`** in `Documentation.tsx`.
- Once deployed, they are available at **`https://<your-vercel-url>/docs/user-manual/<filename>.md`** (same origin as the app). No extra config needed if the app is served from the root. If you use **`base: '/tracking-plan/'`**, the app is under `/tracking-plan/` but static assets from `dist/` are still served at the root by Vercel, so **`/docs/user-manual/...`** continues to work.

---

## Go-Live Checklist (step-by-step)

1. **Supabase**
   - [ ] Migrations 0001–0007 applied on the **production** project.
   - [ ] **Authentication → URL Configuration:** **Site URL** = production app URL.
   - [ ] **Redirect URLs** include production (and preview) URLs as above.

2. **Vercel env**
   - [ ] `VITE_SUPABASE_URL` = production Supabase URL.
   - [ ] `VITE_SUPABASE_ANON_KEY` = production anon key.
   - [ ] `VITE_API_BASE_URL` **unset** (API on same Vercel project).
   - [ ] `SUPABASE_URL` = same as `VITE_SUPABASE_URL`.
   - [ ] `SUPABASE_SERVICE_ROLE_KEY` = production service role key.
   - [ ] `SUPABASE_ANON_KEY` = production anon key.
   - [ ] (Optional) `CORS_ORIGIN`, `GEMINI_API_KEY`.

3. **Vercel project**
   - [ ] **Build Command:** `npm run build`
   - [ ] **Output Directory:** `dist`
   - [ ] Repo connected; `api/[[...path]].ts` is in the repo so `/api/*` is served by the Express app.

4. **Deploy**
   - [ ] Trigger a production deploy (e.g. push to main or “Deploy” in Vercel).

5. **Verify**
   - [ ] Open the production URL; app loads (login or dashboard).
   - [ ] Sign in with Supabase Auth (no “redirect URL not allowed”).
   - [ ] Create or open a workspace; call an API (e.g. events or journeys). No CORS errors (same-origin).
   - [ ] Open **`/docs/user-manual/getting-started.md`** (or the Docs page) and confirm the Living Documentation loads.

If the API were on a **different** host, you would set **`VITE_API_BASE_URL`** to that host and add that origin to **Supabase Redirect URLs** and to **`CORS_ORIGIN`** on the API server to avoid CORS and auth issues.
