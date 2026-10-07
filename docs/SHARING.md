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

### Threads and status (D-70, T-5-02, migration `0033`)

A comment can have **replies** (`comments.parent_id`; `parent_id` is an allowed `POST` key). A reply
always attaches to the root and inherits its entity and `internal_only` from it, so an internal-only
thread never appears, replies included. On a `via_share_only` link the rule applies to roots: a
visible root keeps its replies.

The root carries a **status**: `open`, `on_it`, `done`, `wont_do` (`resolved_at`/`resolved_by` are
mirrored for `done`, so `PATCH {resolved: true|false}` still works internally: done / open).
`PATCH /api/shared/:token/comments/:id/status {status, author_name?}` (comment access, same
rate limit and field whitelist as posts):

- a link may set `on_it` or `done` only; `wont_do` is 403 `STATUS_NOT_ALLOWED`;
- a link may not reopen: any change on a `done`/`wont_do` comment is 403 `STATUS_NOT_ALLOWED`;
- `read` links get 403 `SHARE_READ_ONLY`; an internal-only comment (or one hidden by `via_share_only`) answers the identical 404 `SHARE_NOT_FOUND`;
- internal callers (`PATCH /api/projects/:id/comments/:id {status}`) may set any of the four.

Every hidden or missing comment id (internal-only, hidden by `via_share_only`, nonexistent, a reply id on the status route, or a `parent_id` pointing at any of these) answers the identical 404 `SHARE_NOT_FOUND` body, so a link cannot probe for existence. Internally, `?resolved=false` also matches `on_it` and `wont_do` (it means not done), and `PATCH {resolved}` on a reply is a 400 by design (only a root has a status).

Who changed it last is kept as `status_changed_by`/`status_changed_at` on the comment (stripped from the public response; comments stay out of `change_log`).

### Reactions and the name requirement (D-70 items 3 and 5, T-5-03, migration `0034`)

Exactly three reactions, `seen`, `like` and `on_it`, one per author per comment per kind (author compared case-insensitively; table `comment_reactions`, cascade-deleted with the comment, not change-logged). Pressing a reaction again removes it. `on_it` only exists on a root comment (400 on a reply) and also moves an *open* root to `on_it`; through a share link the status goes through the restricted rules, and if the status change is refused the reaction is still recorded. Removing `on_it` does not revert the status.

- Internal: `POST /api/projects/:id/comments/:id/reactions {kind, author_name?}` toggles (author defaults to the signed-in user); the comments list carries `reactions[]` per comment as `{kind, count, authors[], mine}`.
- Shared: `POST /api/shared/:token/comments/:id/reactions {kind, author_name?}` needs `comment` access, accepts only `kind` and `author_name` (else 400 `FIELD_NOT_ALLOWED`), is rate-limited with comment posts, and answers the identical 404 `SHARE_NOT_FOUND` for hidden, missing or reply-of-hidden ids. The public list carries `reactions[]` (`{kind, count, authors[]}`, names as typed) only on comments the link may see. There is no server-side anonymous fallback: `author_name` is required on reactions and status changes, and the literal name "Share link" (any case) is rejected with 400 `VALIDATION_ERROR` on every share write. A visitor who has not entered a name gets a random per-link id ("Visitor 4f2a") generated once by the browser and stored under the same key, which the UI sends as `author_name` for reactions and status changes; posts and replies still need a typed name. The old global `localStorage['e3-share-author']` value is moved into the per-link key once and removed.
- **Require a name** (`projects.share_require_name`, default off): Settings > Share link > "Require a name on the share link" (`PATCH /api/projects/:id/share {share_require_name}`, also accepted by `PATCH /api/projects/:id`). `GET /api/shared/:token` carries `require_name`. When set, posts, replies, reactions and status changes without `author_name` are 400. The shared view remembers the visitor's name per link in the browser (`localStorage['e3.share.<token>.name']`) and prefills it everywhere.

The backup carries `comment_reactions`; CSV entity `comment_reactions`.

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

### Comment images (D-70 item 4, T-5-04, migration `0035`)

A comment can carry up to 10 images (`comment_attachments`). Rules, enforced server-side:

- **Types**: PNG, JPEG and WebP only, decided from the file's magic bytes (the extension and the
  declared type are ignored; SVG and GIF are refused, 400 `UNSUPPORTED_IMAGE_TYPE`).
- **Size**: 5 MB per file (400 `FILE_TOO_LARGE`); the 11th image on a comment is 409 `ATTACHMENT_LIMIT`.
- **Re-encoding**: every upload is decoded and re-encoded with `sharp` before it is stored, so no
  EXIF/XMP/text chunks or appended bytes survive (EXIF orientation is applied first). Stored through
  the FileStore at `<project>/comments/<comment_id>/...`; width, height and size are recorded.
- **Internal**: `POST /api/projects/:id/comments/:commentId/attachments` (multipart field `file`, one
  image per request) and `DELETE .../attachments/:attId`; the internal files route serves all.
- **Shared**: `POST /api/shared/:token/comments/:commentId/attachments`, comment access only (403
  `SHARE_READ_ONLY` otherwise). The target must be a comment posted through a share link, visible to
  that link, and at most 15 minutes old, so a visitor can attach screenshots to the comment they just
  wrote but not to anyone else's. Limits per token (in memory, reset on restart): 60 uploads per 10
  minutes and 200 MB per rolling 24 hours, both 429 `RATE_LIMITED`. A visitor cannot delete images.
- **Serving**: `GET /api/shared/:token/files/<project>/comments/...` returns the image only when its
  comment is visible to that link (not `internal_only`, and the `share_comments` rule); anything
  else, including a comments path with no attachment row, is the same 404 `NOT_FOUND` as a missing
  file. The public comment list carries `attachments[]` without `project_id`, and only on the
  comments that pass the public filters.
- Backup embeds the files like trigger screenshots (`files_missing[]` warning), restore rewrites ids
  and paths; CSV entity `comment_attachments`.

Both columns are picked up by the JSON backup/restore and the `comments` CSV (`internal_only`).

There is no edit, on either side — only resolve (internal-only,
`PATCH /api/projects/:id/comments/:id {resolved}`) and delete (internal-only,
`DELETE /api/projects/:id/comments/:id`, from the project-wide Comments page).

### Markdown bodies (D-71, T-5-05)

A comment body is Markdown text, stored exactly as typed (the public `GET` is unchanged: Markdown is text). Supported: bold, italic, strikethrough, inline code and code blocks, links, bullet, numbered and task lists, quotes. Raw HTML is never rendered (it shows as text). Links open in a new tab with `rel="noopener noreferrer nofollow"` and external links show their host. Images only render as `![alt](attachment:<id>)` for an image attached to that comment (resolved to the internal files URL, or the share files URL in the shared view); any other image source shows the alt text only. The body limit is 10,000 characters on both the internal and the shared `POST` (400 `VALIDATION_ERROR`). The composer is the shared `MarkdownEditor` (toolbar, Write/Preview, Ctrl/Cmd+Enter posts).

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

The shared page renders every event and use case as a collapsed row; the body mounts only when expanded. `#event-<name>` links (copy-link icon on each event row) expand and scroll to that event; an expanded event's title row stays under the page header until the next event takes over.

One global Expand all / Collapse all pair in the page toolbar (also reachable below `md`, in the row above the content) opens or closes every event and use case; the Use cases header and each event group header (Custom, SDK, Platform) keep a small local pair for that section only. Every top-level section header (Events, Properties, Use cases, Identity, Consents, Catalogs, Mapping, Findings) and every event group header is sticky at the same offset under the page header and is replaced by the next header as it scrolls in; inside an expanded event the event title row wins over the group header (it is drawn on top at the same offset while the event body is on screen). Anchors and the scroll spy account for the sticky height (`scroll-margin-top` = page header, plus the group header for an event), and the headers contain the comment and copy-link buttons rather than covering them. A sticky left navigation (a dropdown below 1024px) lists Events (custom, sdk, platform), Properties, Use cases, Identity, Consents, Catalogs, Mapping and Findings, with a filter box and a highlight for the section on screen. The group rows (Events and its Custom/SDK/Platform groups) have a chevron, and the group label itself is a button that does the same (Enter/Space work; while a filter is active the chevron is disabled and the label is a plain link that navigates), collapsing or expanding their children (all start expanded; a filter shows matches regardless). Clicking a section link scrolls to it and highlights it until the reader's first own scroll (wheel, touch, scrollbar drag or autoscroll; scroll events during the click's own scroll are ignored until they have been quiet for 150 ms; typing or Tabbing in the nav does not clear it), so the last, short sections (Consents, Mapping, Findings) highlight even though they never reach the scroll-spy band at the end of the page. Comments are a compact button (speech-bubble icon and the comment count, `0` muted) on each requirement row and each event header, in the shared view and in the internal app alike; clicking it opens that thread inline (the add form shows only when the link allows `comment`, always internally). Sections with nothing to show (no use cases, no rules, empty derived metrics, and so on) are not rendered. On the shared view the "Implementation" section is collapsed behind a Show/Hide toggle (the internal event card starts it expanded); it has GTM / Web SDK / Tracking API tabs, and every code block has a copy button that also works over plain http (textarea fallback) and says "Copied" or "Copy failed". Content polish (T-4-19): table cells wrap (no one-line clamp anywhere in the shared view or the event cards; the Message column takes the remaining width); example values read as plain values (arrays comma-separated, objects pretty-printed in a code span), never escaped JSON. The event property table has a fixed shared column set (Payload key, Type, Kind, Required, Description, Example); role, name, formats, allowed values, PII, bundle and dataLayer path appear as small secondary lines in the Description cell when present, so the table fits the card at 1440px without a horizontal scroller (the internal card keeps every column inside its own scroller). Standard event mappings are one block per mapping ("standard event → event (variant)", "n of m fields mapped", a Bloomreach field / project property list with mapped fields first and the rest shown as "not mapped"). The Findings summary shows open counts by severity, a by-kind-family table (Schema, Values, Arithmetic, Consistency, Coverage, Data Manager: the kinds with human labels and counts, and a next step), open counts by comparison (human names, the explanation in a tooltip), the top five events by open errors (linked to their cards), and the acknowledged count when there is one; it is computed from the public document only. A "Copy findings as Markdown" button copies the same summary. Below it the Findings section is grouped by comparison (sticky group headers) with one leaf per affected event linking to its card, plus a "Not tied to an event" leaf. sdk and platform class badges use the Bloomreach accent (`--brand-bloomreach` in `src/index.css`). The documentation HTML export mirrors the mapping blocks, the findings summary and the example rendering; its use cases, consents and mapping sections are not regrouped (only the findings summary and findings tables carry the new labels and families).
The page consumes only the public projection; nothing internal is added by this layout.

### Grouped use cases, consents, mapping and findings (T-4-21)

The navigation and the page group four more sections the same way as Events: **Use cases** by their `type` (Marketing, Transactional, Other for a use case without one; leaves are the use cases, each with its own Expand all / Collapse all per group), **Consents** by channel (Email, SMS, Push, WhatsApp, Other; leaves are the categories), **Mapping** (one leaf per standard event mapping) and **Findings** (one group per comparison, leaves are the affected events). Consent categories have no channel field, so the channel is derived: the standard key is checked first, then the name, for the keywords whatsapp, sms/mms/text message, email/newsletter, push/browser/mobile app (tested in that order, so "Email notifications" is Email; a bare "notification" counts as Push only when nothing else matched); anything else is Other (`src/domain/consentChannel.ts`). The section ids, nav entries and rendered groups come from one helper (`sharedSectionGroups` in `src/features/shared/viewHelpers.ts`), and a parity test checks nav ids equal rendered ids. When a template is added to a project the dialog asks for the use case Type (marketing or transactional), suggested from the template's message channels and an explicit confirmation-like name (order/shipping/booking confirmation, receipt, invoice, password reset, verification code, double opt-in); the bulk add keeps each template's own type.

### Copy buttons, category badges, cross-links and the naming note (T-4-22)

- **Copy name** buttons sit next to every entity name: event titles, property rows and their definitions, use cases, consent categories, standard event mapping headings (the standard event key), catalog names and catalog fields, and the payload key in event card property tables. They copy the exact name only and show "Copied" or "Copy failed", like the copy-link button.
- **Category badges** (System customer, Customer, SDK default, Event) show on property rows and in event card property tables; the first two accent categories use the Bloomreach colour variables, the others are neutral. The Kind column stays.
- **Cross-links** all stay on the page: "Used in" events link to `#event-<slug>`; property keys inside an event card and a catalog's "Properties that look up into this catalog" link to the property's row (`#property-<slug>`, unique per property; following the link opens the row); use case requirement targets for events and properties link to the event card or property. Anything that does not resolve renders as plain text. The anchors are listed by `src/features/shared/references.ts`.
- **Naming note**: when the project has a naming convention (always, default snake_case) the Events and Properties section headers show "Naming convention: snake_case (system items exempt)". The document carries it as `project.naming_convention` (additive).

### Grouped properties, catalogs and icons (D-64, T-4-20)

The Properties section lists **event and customer properties together**, grouped System customer, Customer, SDK default and Event (Event sub-grouped by kind: event, item, state list, context). Each group has a sticky group header at the same offset as the event groups, with its own Expand all / Collapse all; each property is a collapsed row (name, type, one-line description) that opens to its named definitions and, for an event property, the events that use it. The navigation lists the groups under Properties (and the kind subgroups under Event). A "Copy properties as Markdown" button copies the same grouping (`propertiesToMarkdown`); the HTML export groups the same way.

The Catalogs section is present only when the project has catalogs: one card per catalog with its kind (product, variant, other), market and language, version (and whether it is live), the number of searchable fields, the lookup key, its mapping role, status, source system and sync method (D-61), a fields table (name, type, lookup key, searchable, description) and the list of event properties that look up into it (`mapped_catalog_field_id`). It is in the navigation and the HTML export. When the project has sources, a "Collected from" line under the Events heading lists each source as "System via method" with its event count, and each event card's Overview shows its sources the same way (D-62); these are client-facing and stay in the public projection. `owner`, `client_name` and `priority` of a catalog are never part of the tracking document, so they are not in the public projection either; `source_system`, `sync_method` and `update_frequency` are kept as client-facing.

Section headers and top-level navigation entries carry the sidebar's icons (Events, Properties, Use cases, Identity, Consents, Catalogs, Mapping, Findings) from one module, `src/components/layout/navIcons.ts`, used by both the sidebar and the shared view.

### Requirement targets and project-level findings (T-4-25)

Every use case requirement row shows a small type label with the sidebar icon (Event, Variant, Property, Customer property, Catalog attribute, Consent; labels in `src/features/shared/requirementTargets.ts`) and its target is a same-page link: an event to its card (`#event-<slug>`); a variant to its event, opened and scrolled to the Variants block (`#variants-event-<slug>`); an event or variant property links both parts (event or variant, then property row `#property-<slug>`); a catalog attribute to its catalog card (`#catalog-<slug>`, one anchor per catalog); a consent to its row in the Consents section (`#consent-<slug>`, the same ids as the navigation). The document gains additive ids: `variant_id`, `catalog_id` (the main catalog of a catalog attribute) and `consent_category_id` on a requirement, and `id` on a consent category; they are not internal fields and stay in the public projection. A target that no longer resolves ("(removed)") is plain text.

The "Not tied to an event" leaf in a findings group is clickable and expands to that comparison's project-level findings: kind (human label, explanation in a tooltip), severity, message and the entity it concerns. A finding with a property or variant links to its row or event; a catalog or consent finding (recognised from its kind prefix, since a finding carries no catalog or consent id) links to the Catalogs or Consents section. The navigation leaf opens and scrolls to that list (`src/features/shared/findingEntity.ts`).
