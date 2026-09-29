# Sharing (D-48, D-49, D-50, D-60)

How a client sees the documentation without a login, and how they can comment on it.

## Creating and rotating a link

Settings page, "Share" block (`src/features/projects/pages/ProjectSettings.tsx`):

- **Generate** (`POST /api/projects/:id/share {access}`) creates a token when none exists yet.
- **Generate** again while a link exists rotates it: a new 32-random-byte, base64url token
  replaces the old one immediately, so the previous link stops working the instant the new one is
  created (D-48). There is no separate "rotate" button — the same action serves both cases,
  distinguished server-side by whether `share_token` is already set.
- **Access** (`read` or `comment`) is changeable at any time without rotating the token
  (`PATCH /api/projects/:id/share {access}`).
- **Revoke** (`DELETE /api/projects/:id/share`) nulls `share_token`/`share_access`/
  `share_created_at`; the link then 404s the same way an unknown token does.

The link itself is `<origin>/tracking-plan/shared/<token>` (`shareUrl` in `routes/projects.ts`,
built from the request's own host — there is no separate "public base URL" setting). The token is
stored in plaintext (`projects.share_token`) so Settings can re-display the current link; there is
no expiry and no login. `share_created_at` is shown next to the link.

### Sandbox projects refuse a share link without `force` (D-60)

A project restored from the bundled sandbox backup (`is_sandbox` in `projects.settings_json`)
refuses `POST /api/projects/:id/share` with 409 `SANDBOX_SHARE_REFUSED` unless the request body
carries `force: true`. Settings shows a plain sentence on a sandbox project and asks for
confirmation before resending the same request with `force: true` — there is no separate "force"
control, just a confirm dialog in front of the same button.

## Access levels

- **`read`** — the shared page renders; no comment form appears (the shared `CommentsPanel` hides
  its form when `access !== 'comment'`, a client-side courtesy — `POST /api/shared/:token/comments`
  itself also 403s `SHARE_READ_ONLY` server-side, so the rule holds even against a direct API call).
- **`comment`** — same as `read`, plus the comment form appears on every event card, use case, and
  requirement row in the shared view.

## The public projection

The shared routes never serve the same document the internal app sees. `toPublicTrackingDocument`
(`document.service.ts`) and the `{ public: true }` HTML export (`export.service.ts`) strip:

- `agent_instructions` (every event)
- `owners` (`owner_business`/`owner_technical`, every event)
- `identity_note` (every event)
- `project.bloomreach_project_url`
- every `internal_*` field (`use_case.internal_notes`/`internal_url`,
  `use_case_template.internal_notes`/`internal_url`, D-59 amendment 2) — deep-swept, not a
  field-by-field list, so a future `internal_*` addition is stripped automatically.

`not_suitable_for` **stays** — it is client-facing guidance ("don't use this event for X"), not an
internal note. `triggers[]` (screenshots, D-50), `use_case.documentation_url`, property
`definitions[]` (D-58) and the new `id` fields on `TrackingDocumentUseCase`/
`TrackingDocumentRequirement` (D-49, T-4-04, additive) are unaffected — they are public by design.

Comments are never part of the tracking document or the HTML export at all (D-49) — they are their
own routes, described below.

## The shared routes (`routes/shared.ts`, mounted at `/api/shared`, ahead of `optionalAuth`)

Every route requires `requireShare` (`middleware/share.ts`): the token is looked up by exact match
and then re-compared with `node:crypto.timingSafeEqual`, so an unknown token and a wrong-length or
same-length-but-wrong token behave identically. Unknown or revoked is always 404
`SHARE_NOT_FOUND` — never 403 — so a leaked or rotated link gives no signal a project ever existed
at that path.

- `GET /:token` — project header: `{project: {name, client_logo_path}, client: {name}, access,
  generated_at}`.
- `GET /:token/tracking-document.json` — the public projection of the tracking document.
- `GET /:token/documentation.html` — the public projection of the HTML export.
- `GET /:token/files/*` — the same decode/traversal checks as the internal `routes/files.ts`,
  scoped to this token's own project (a trigger screenshot, the project logo).
- `GET /:token/comments` / `POST /:token/comments` (D-49 amendment, T-4-04) — see below.

**Every error is the identical 404 `SHARE_NOT_FOUND` body**, including a malformed percent-escape
in the URL (Express's own route-matching `URIError`, caught by a router-level error handler) and
the global error handler no longer emits a stack trace outside `NODE_ENV=development`. Every
response carries `Cache-Control: no-store` — a token-bearing URL must never be cached by a browser
or a proxy.

Note (T-4-03 QA, D-09 scope): a malformed escape (`/tracking-plan/shared/%ZZ`) crashes Vite's own
dev/preview static middleware before any app code runs (`decodeURI` throws), on any path, not just
`/shared/...` — this is a dev-server behaviour, not an app defect, and the app-level guard
(`src/sharedRoute.ts`) is correct; the deploy target (Vercel static rewrites) has no equivalent
decode step, so no fix is planned before phase 5, where it should be re-verified on the real host.

## Comments (D-49, one shared thread — amendment 2026-09-29)

Comments attach to an `event`, `property`, `use_case`, or `requirement` (`entity_type`/`entity_id`,
`comments` table, migration `0019`). **A comment thread is shared, not two separate ones**: `GET
/api/shared/:token/comments` returns every comment on the anchor — posted internally through
`/api/projects/:id/comments` or through the same share link alike. An internal reply **is** visible
to anyone holding the share link, by design (the point of the feature is a consultant answering a
client's question where it was asked). A comment is visible unless it is flagged **Internal only**
(see "Comment visibility controls" below); a private, team-only note either carries that flag or
belongs in one of the internal-only fields the public projection strips (`use_case.internal_notes`/
`internal_url`, `agent_instructions`, `owners`, `identity_note`). The internal `CommentsPanel`
states the current visibility next to the form ("Visible to anyone with the share link", or "Not
visible on the share link." once "Internal only" is checked).

`via_share` (was this particular comment posted through a share link, not the same as "is this
comment visible through a share link" — every comment is) stays visible on both sides so the
internal Comments page and event/use-case panels can still tell them apart. `resolved_at`/
`resolved_by` (internal triage only, never settable through the share route) and `project_id` are
stripped from the public `GET` response (`toPublicComment`).

`POST /api/shared/:token/comments`:
- 403 `SHARE_READ_ONLY` unless `access === 'comment'`.
- 400 `FIELD_NOT_ALLOWED` for any body key outside `entity_type`/`entity_id`/`author_name`/`body`
  — in particular `resolved` can never be set through this route.
- The anchor is validated the same way the internal route validates it
  (`comment.dal.ts#createComment`'s `assertEntityExists`, scoped to this token's own project), so a
  comment can never attach to another project's entity.
- Every comment created this way carries `via_share: true`.
- A per-token rate limit of 60 posts per 10 minutes (in-memory, reset on process restart) returns
  429 `RATE_LIMITED` past the limit — a cheap guard against a script hammering a leaked link, not
  real rate limiting (see "Phase 5" below).

### Comment visibility controls (D-49 amendment 2, T-4-10)

Two controls narrow the "one shared thread" default. Both are enforced server-side in
`GET /api/shared/:token/comments` (`routes/shared.ts`), never by the UI alone.

- **Per comment: "Internal only"** (`comments.internal_only`, migration `0024`). The internal
  `CommentsPanel` has an "Internal only" checkbox next to the form (default off; the note reads "Not
  visible on the share link" when checked), `POST /api/projects/:id/comments` accepts
  `internal_only: boolean`, and `PATCH /comments/:id {internal_only}` toggles it later. An
  internal-only comment is **never** returned by the public `GET`, whatever the link settings, and
  the public projection never carries the `internal_only` key. `POST /api/shared/:token/comments`
  keeps `internal_only` outside its allowed body keys (400 `FIELD_NOT_ALLOWED`), so a client can
  never post one. The Comments page shows an "Internal only" badge and has a visibility filter
  (`GET /comments?internal_only=true|false`).
- **Per link: "Show internal comments on the shared view"** (`projects.share_comments`, migration
  `0024`, values `all` | `via_share_only`, `SHARE_COMMENT_VISIBILITIES` in `src/domain/enums.ts`).
  `all` (default) shows every comment that is not internal-only. `via_share_only` shows only the
  comments posted through the link (`via_share = 1`), hiding comments the team posted internally.
  Set from Settings > Share link, saved through `PATCH /api/projects/:id/share {share_comments}`
  (400 for any other value; `GET /:id/share` returns it). The setting belongs to the project, so it
  survives rotating or revoking the link.

Both columns are picked up by the JSON backup/restore and the `comments` CSV (`internal_only`).

There is no edit, on either side — only resolve (internal-only,
`PATCH /api/projects/:id/comments/:id {resolved}`) and delete (internal-only,
`DELETE /api/projects/:id/comments/:id`, from the project-wide Comments page).

## The shared view page (`src/pages/SharedProject.tsx`, D-50)

`/tracking-plan/shared/<token>` is matched before `ProtectedRoute` (`src/App.tsx`), so it never
requires the local auth session. It fetches with a plain `fetch` (no auth header), fetches the
project header, the public tracking document, and the comment list once per page load (not once
per panel — a fix-round change so a project with many events issues one comments request, not one
per event card), then renders: client header and logo, table of contents, custom event cards first
(sdk/platform collapsed in a `<details>`), properties with their `definitions[]`, use cases with
narrative/requirements/`documentation_url`, identity rules, consents, catalogs, standard event
mappings, a findings summary, both downloads (tracking document JSON, documentation HTML), and an
"invalid link" page on any non-OK response. `CommentsPanel` (`src/features/comments/`) is mounted
on each event card, use case, and requirement row, in `shared` mode, hiding its form when access is
`read`.

`EventCardView` (extracted from the internal event card page) is the one renderer behind the
internal card, the shared view, and the HTML export, so all three always agree (D-50).

## Phase 5 notes (not built yet)

- **Token hashing**: the token is stored in plaintext today so Settings can re-display it; a hosted
  deployment should hash it (one-time display on generation) the way a password would be.
- **Real rate limiting**: the in-memory, per-process 60/10-minutes counter on comment posts is a
  placeholder — it resets on restart and is not shared across multiple server instances. A hosted
  deployment needs real, durable rate limiting on every `/api/shared/*` route, not just comments.
- **Passphrase** (user option, 2026-09-27): an optional passphrase per share link, stored hashed,
  checked once per browser session via a cookie — planned together with hashing and rate limiting.
- **Hosting**: verify the malformed-percent-escape behaviour (see above) on the real host once
  phase 5 deploys; the Vercel static-rewrite target has no decode step matching Vite's, so it may
  already differ.

## Client view layout (T-4-14)

The shared page renders every event and use case as a collapsed row; the body mounts only when expanded. `#event-<name>` links (copy-link icon on each event row) expand and scroll to that event; an expanded event's title row stays under the page header until the next event takes over. A sticky left navigation (a dropdown below 1024px) lists Events (custom, sdk, platform), Use cases, Identity, Consents, Catalogs, Mapping and Findings, with a filter box and a highlight for the section on screen. Sections with nothing to show (no use cases, no rules, empty derived metrics, and so on) are not rendered. Implementation snippets sit under an "Implementation" heading with GTM / Web SDK / Tracking API tabs, and every code block has a copy button. The page consumes only the public projection; nothing internal is added by this layout.
