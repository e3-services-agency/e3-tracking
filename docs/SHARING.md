# Sharing (D-48, D-49, D-50, D-60, D-73–D-76, D-88)

How a client opens the client portal, reads the public documentation, chooses a commenting
identity, and takes part in shared threads. Clients only read and comment: a share link never
edits the tracking plan, and there is no editor role (D-88).

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
no expiry. Under the default audience (**Anyone with the link**) no login is required and optional
Google commenter sign-in does not change link access; under **Only listed people** the link needs a
verified Google sign-in (see "Share audience and members" below). `share_created_at` is shown next
to the link. Rotating or revoking the link keeps the audience setting and the listed people.

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
- **`comment`** — same as `read`, plus new-comment and reply forms on events, properties, use cases
  and requirements. Reactions and permitted thread status changes also require comment access.

Both access levels can read permitted comments and use their copy controls. Signing in identifies a
commenter; it does not upgrade a read link or grant access to the internal app.

## Share audience and members (D-88, T-5-45, migration `0045`)

Settings > Share link > **Who can open the link** (`projects.share_audience`, `SHARE_AUDIENCES` in
`src/domain/enums.ts`):

- **Anyone with the link** (`anyone_with_link`, the default for every project, including every
  share that existed before migration `0045`): unchanged behaviour. Whoever holds the link gets the
  link's access.
- **Only listed people (Google sign-in)** (`listed_people`): the token alone is not enough. A
  visitor gets in only with a Google sign-in whose **Google-verified** email is on the project's
  **Listed people**, or as E3 staff recognised through the Workspace proxy.

**Listed people** (`share_members`: lower-cased `email`, unique per project, `role` `viewer` or
`commenter`, `added_by`, `created_at`) are managed in the same block: add by email with a role,
change the role, remove (`POST|PATCH|DELETE /api/projects/:id/share/members[/:memberId]`, staff
routes). The audience can be set before a link exists (`PATCH /api/projects/:id/share
{share_audience}`). Each member change and each audience change is a project `update` in
`change_log` (a `share_members` line in the diff), so internal History shows who changed it.

**Role capping.** A member's effective access is the lower of their role and the link's access
(`capShareAccess`): a `commenter` on a `read` link reads only; a `viewer` on a `comment` link reads
only; a `commenter` on a `comment` link comments. Staff verified through the proxy get the link's
access. There is no editor role, through a member or otherwise.

**What a visitor who is not let in sees.** A signed-out visitor, a visitor signed in with an
unlisted email, and a visitor whose Google email is not verified all see the same neutral screen,
"Sign in to open this link" (`src/features/portal/PortalSignIn.tsx`), with no project name, client
name or logo. `GET /api/shared/:token` answers only `{ sign_in_required: true, signed_in }`; every
data route (document, summary, cards, findings, comments, history, files, QA reports, identity,
documentation) and every write route answers the identical 404 `SHARE_NOT_FOUND` body that an
unknown token gets, so the routes give no signal of who is listed. A signed-in visitor without
access also sees "The Google account you are signed in with has no access to this link", with
**Signed in as** and **Sign out** so they can try another account. Only the sign-in routes
(`/auth/config`, `/auth/google`, `/auth/logout`) work before sign-in.

**Enforcement** is server-side in `middleware/share.ts`: `requireShare` (token plus audience) guards
every data route; `requireShareToken` (token only) guards the header and the sign-in routes. The
shared-auth router (`routes/sharedAuth.ts`) also answers 404 for a shut-out visitor on everything
except the header and `/auth/*`. Membership, the audience and the session are read from the database
on every request, so removing a person or switching the audience takes effect on their next
request; signing out deletes the session.

**Where emails are stored, and that they are never public.** A member's email is stored in
`share_members`. A visitor's email is stored in `comment_auth_sessions.email`, and only when Google
reports `email_verified: true` (after the audience, issuer, expiry and nonce checks); otherwise the
column stays empty and the visitor cannot pass a listed-people check. Neither email is part of any
public response: not the header, the comments, the identity route, the history (project rows,
which hold the `share_members` diff, are never in the public history) or the documents. Comment
author names on a share stay the Google display name. `share_members` is in backup and restore
(not in CSV); sessions and their emails are operational data and stay out of backups. A Google
session created before migration `0045` carries no email, so a listed visitor signs in once more.

**Staff.** E3 staff open a listed-people link while signed in to the Workspace portal: the
shared-auth router asks the trusted oauth2-proxy (`AUTH_MODE=proxy`, `COMMENT_STAFF_SESSION=1`,
`WORKSPACE_DOMAIN`) and never trusts a client-supplied header. Staff do not need to be listed.

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
So are the finding priority fields (D-89, T-5-47): `priority`, `priority_rank` and
`priority_reasons` on every finding, `findings_summary.open_p1_count` and the summary's per-event
`open_p1_count`. The reasons name only the severity, the tier ("Transactional backend event"), use
case codes and the event priority value, all of which the public document already carries; a use
case's name is used only when it has no code.

Comments are never part of the tracking document or the HTML export at all (D-49) — they are their
own routes, described below.

## The shared routes (`routes/shared.ts`, mounted at `/api/shared`, ahead of `optionalAuth`)

Every data route requires `requireShare` (`middleware/share.ts`; the header and the sign-in routes
use `requireShareToken`, see "Share audience and members"): the token is looked up by exact match
and then re-compared with `node:crypto.timingSafeEqual`, so an unknown token and a wrong-length or
same-length-but-wrong token behave identically. Unknown or revoked is always 404
`SHARE_NOT_FOUND` — never 403 — so a leaked or rotated link gives no signal a project ever existed
at that path.

- `GET /:token` — project header: `{project: {name, client_logo_path}, client: {name}, access,
  require_name, generated_at}`, where `access` is the visitor's effective access. For a visitor a
  listed-people share shuts out, only `{sign_in_required: true, signed_in}`.
- `GET /:token/tracking-document.json` — the public projection of the tracking document (the
  full download, `?version=1`).
- `GET /:token/document-summary.json` (T-5-41, D-88) — the same public document with each event
  reduced to its light fields (`TrackingDocumentSummaryEvent`: id, name, business_name, class,
  implementation_method, status, priority, description, sources, identifiers, certification,
  quality, plus `variant_names`, `property_count`, `open_finding_count` and, since D-89 (T-5-47),
  `open_p1_count`). Every other top-level
  section is exactly what `tracking-document.json` carries. The portal loads this first.
  Since T-5-46 each summary event also carries `expiration` (the card's effective expiration and
  its source; about 60 bytes per event), so the portal Events table shows the Expiration column.
- `GET /:token/events/:eventId/card.json` (T-5-41, D-88) — one full public `EventCard`, the same
  object `tracking-document.json` carries for that event. Loaded when a client opens an event.
- `GET /:token/findings.json` (T-5-42, D-88 amendment 1) — each event's current `findings` (events
  without any left out) plus `unattached_findings`, from the same light public document as the
  summary. Loaded when a client opens the QA view. Since D-89 (T-5-47) every finding carries
  `priority` (P1-P4), `priority_rank` and `priority_reasons`, each list is in priority order and the
  events are ordered by their best finding, so events with P1 findings come first.
- `GET /:token/history` — public change history. With `entity_type` and `entity_id`: one target
  (see "Identity, catalog and definition discussions" below). With neither (T-5-43): the project's
  recent public changes, newest first, same row shape, `limit` 1-100 and cursor paging; the
  overview asks for five.
- `GET /:token/qa-reports`, `GET /:token/qa-reports/:id`, `GET /:token/findings/:id/history` — the
  public QA reports and a finding's public history (QA view). Since D-89 (T-5-47) a report item's
  `recorded` carries `priority`, `priority_rank` and `priority_reasons` as they were when the report
  was captured; reports captured before that have none of the three.
- `GET /:token/documentation.html` — the public projection of the HTML export.
- `GET /:token/files/*` — the same decode/traversal checks as the internal `routes/files.ts`,
  scoped to this token's own project (a trigger screenshot, the project logo).
- `GET /:token/comments` / `POST /:token/comments` (D-49 amendment, T-4-04) — see below.
- `GET /:token/identity` — the current commenter’s display metadata, without participant IDs.
- `GET /:token/auth/config`, `POST /:token/auth/google` and `POST /:token/auth/logout` — optional
  verified commenter authentication, mounted before the shared router. See
  [Google identity setup](SHARED-GOOGLE-AUTH.md).

The three lazy routes (`document-summary.json`, `events/:eventId/card.json`, `findings.json`) are
built from `toPublicTrackingDocument`'s output, never from database rows directly: the summary from
a light build (no per-event coverage or codegen) run through the projection and then reduced to an
allowlist of event fields; the card from the projection of a document limited to that one event;
the findings list from the same light public document as the summary. A field added to the projection's strip list is therefore
stripped from both automatically. On either route every error, including an unknown, deleted or
other-project event id, is the identical 404 `SHARE_NOT_FOUND` body.

Unknown, revoked and malformed share tokens return the same 404 `SHARE_NOT_FOUND` body,
including malformed percent-escapes caught by the router. Other failures retain their appropriate
codes: read-only writes return 403, invalid input returns 400, and rate limits return 429. Hidden or
missing comment attachments return the same 404 `NOT_FOUND` file response. Responses carry
`Cache-Control: no-store`; a token-bearing URL must not be cached by a browser or proxy. The global
error handler does not emit stack traces outside `NODE_ENV=development`.

## Comments (D-49, one shared thread — amendment 2026-09-29)

Comments attach to an `event`, `property`, `use_case`, or `requirement` (`entity_type`/`entity_id`,
`comments` table, migration `0019`). **A comment thread is shared, not two separate ones**: internal
and share-link participants answer the same root comment. A link sees only permitted roots and
non-private replies. Under the default `all` setting, internal replies are visible to link holders;
under `via_share_only`, they remain visible when the root was posted through the link. An
**Internal only** root hides the entire thread, and an independently private reply is excluded
regardless of its root. See "Comment visibility controls" below.

Private team notes belong in an Internal only comment or a field the public projection strips
(`use_case.internal_notes`/`internal_url`, `agent_instructions`, `owners`, `identity_note`). The
internal `CommentsPanel` states the visibility next to the form. `via_share` records where a
particular comment was posted; it is not itself a public-visibility flag.

The public comment projection strips `project_id`, `internal_only`, internal resolution/status
attribution, and participant IDs. Display names, verified identity badges and approved profile
photos remain visible so readers can understand who posted.

`POST /api/shared/:token/comments`:
- 403 `SHARE_READ_ONLY` unless `access === 'comment'`.
- 400 `FIELD_NOT_ALLOWED` for any body key outside `entity_type`/`entity_id`/`author_name`/`body`/`parent_id`
  — in particular `resolved` can never be set through this route.
- The anchor is validated the same way the internal route validates it
  (`comment.dal.ts#createComment`'s `assertEntityExists`, scoped to this token's own project), so a
  comment can never attach to another project's entity.
- Every comment created this way carries `via_share: true`.
- A per-token rate limit of 60 posts per 10 minutes (in-memory, reset on process restart) returns
  429 `RATE_LIMITED` past the limit — a cheap guard against a script hammering a leaked link, not
  real rate limiting (see "Remaining hosting considerations" below).

### Threads and status (D-70, T-5-02, migration `0033`)

A comment can have **replies** (`comments.parent_id`; `parent_id` is an allowed `POST` key). A reply
attaches to the root and inherits its entity and initial `internal_only` value. A private root hides
the whole thread; a reply can also carry its own private flag. On a `via_share_only` link the origin
rule applies to roots: a visible root keeps its non-private replies, including internal replies.

The root carries a **status**: `open`, `on_it`, `done`, `wont_do` (`resolved_at`/`resolved_by` are
mirrored for `done`, so `PATCH {resolved: true|false}` still works internally: done / open).
`PATCH /api/shared/:token/comments/:id/status {status, author_name?}` (comment access, same
rate limit and field whitelist as posts):

- a link may set `on_it` or `done` only; `wont_do` is 403 `STATUS_NOT_ALLOWED`;
- a link may not reopen: any change on a `done`/`wont_do` comment is 403 `STATUS_NOT_ALLOWED`;
- `read` links get 403 `SHARE_READ_ONLY`; an internal-only comment (or one hidden by `via_share_only`) answers the identical 404 `SHARE_NOT_FOUND`;
- internal callers (`PATCH /api/projects/:id/comments/:id {status}`) may set any of the four.

Hidden or missing targets return the identical 404 `SHARE_NOT_FOUND` body for replies, reactions
and status changes, so a link cannot probe for existence. Status changes accept only root IDs. A
visible reply used as `parent_id` is normalized to its root; a private reply cannot be used this
way. Internally, `?resolved=false` also matches `on_it` and `wont_do` (it means not done), and
`PATCH {resolved}` on a reply is a 400 by design (only a root has a status).

Who changed it last is kept as `status_changed_by`/`status_changed_at` on the comment (stripped from the public response; comments stay out of `change_log`).

### Reactions and the name requirement (D-70, T-5-03; participant identity T-5-13, migration `0037`)

Exactly three reactions, `seen`, `like` and `on_it`, one per participant per comment per kind. Historical rows without a participant ID retain their original case-insensitive author names. Pressing a reaction again removes it. `on_it` only exists on a root comment (400 on a reply) and also moves an *open* root to `on_it`; through a share link the status goes through the restricted rules, and if the status change is refused the reaction is still recorded. Removing `on_it` does not revert the status.

- Internal: `POST /api/projects/:id/comments/:id/reactions {kind, author_name?}` toggles (author defaults to the signed-in user); the comments list carries `reactions[]` per comment as `{kind, count, authors[], mine}`. A trusted internal staff actor can remove their matching historical internal reaction without creating a duplicate. Shared guests never claim historical reactions by matching a name.
- Shared: `POST /api/shared/:token/comments/:id/reactions {kind, author_name?}` needs `comment` access, accepts only `kind` and `author_name` (else 400 `FIELD_NOT_ALLOWED`), is rate-limited with comment posts, and answers the identical 404 `SHARE_NOT_FOUND` for hidden, missing or reply-of-hidden IDs. The public list carries `{kind, count, authors[], mine}` only on comments the link may see. Optional-name links allow a server-issued animal/color guest for posts, replies, reactions and status changes. A deliberately chosen guest name is optional; verified account names come from the server. The literal name "Share link" is reserved. Browser-generated `Visitor xxxx` labels are replaced by animal/color identities and never satisfy a required-name rule. The old global `localStorage['e3-share-author']` value is moved into the per-link key once and removed.
- **Require a name** (`projects.share_require_name`, default off): Settings > Share link > "Require a name on the share link" (`PATCH /api/projects/:id/share {share_require_name}`, also accepted by `PATCH /api/projects/:id`). `GET /api/shared/:token` carries `require_name`. When set, posts, replies, reactions and status changes require an explicitly chosen name or a server-verified identity. The shared view remembers a chosen guest name per link (`localStorage['e3.share.<token>.name']`) and synchronizes every root/reply editor.

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
  `all` (default) shows non-private roots and their non-private replies. `via_share_only` shows
  only roots posted through the link (`via_share = 1`) and their non-private replies. It hides
  internally created roots, not internal replies on a shared root.
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
  that link, and at most 15 minutes old. New participant-bound comments additionally require
  ownership by the current server participant. Legacy comments with a null `participant_id`
  retain the older visibility/freshness compatibility exception; ownership is not checked for
  those records. Limits per token (in memory, reset on restart): 60 uploads per 10 minutes and
  200 MB per rolling 24 hours, both 429 `RATE_LIMITED`. A visitor cannot delete images.
- **Serving**: `GET /api/shared/:token/files/<project>/comments/...` returns the image only when its
  owning comment **and its root** are visible to that link (neither is `internal_only`, and the root
  passes `share_comments`). Anything else, including a comments path with no attachment row,
  is the same 404 `NOT_FOUND` as a missing
  file. The public comment list carries `attachments[]` without `project_id`, and only on the
  comments that pass the public filters.
- Backup embeds the files like trigger screenshots (`files_missing[]` warning), restore rewrites ids
  and paths; CSV entity `comment_attachments`.

Comment visibility and attachment metadata are preserved by JSON backup/restore; the `comments`
CSV includes `internal_only`. Comment bodies cannot be edited after posting. Internal staff can
change visibility, manage root status and delete comments from the project-wide Comments page.
Share-link visitors have only the restricted root status actions described above.

### Markdown bodies (D-71, T-5-05)

A comment body is Markdown text, stored exactly as typed (the public `GET` is unchanged: Markdown is text). Supported: bold, italic, strikethrough, inline code and code blocks, links, bullet, numbered and task lists, quotes. Raw HTML is never rendered (it shows as text). Links open in a new tab with `rel="noopener noreferrer nofollow"` and external links show their host. Images only render as `![alt](attachment:<id>)` for an image in the visible thread’s attachment pool (resolved to the internal files URL, or the permitted share files URL in the shared view); any other image source shows the alt text only. The body limit is 10,000 characters on both the internal and the shared `POST` (400 `VALIDATION_ERROR`). The composer is the shared `MarkdownEditor` (toolbar, Write/Preview, Ctrl/Cmd+Enter posts).

## The client portal (`src/pages/SharedProject.tsx`, `src/features/portal/`, D-88)

`/tracking-plan/shared/<token>` is matched before `ProtectedRoute` (`src/App.tsx`) and needs no
staff login. It is a shell with one view per section, built from the internal app's read-only
table components (`src/features/views/`, T-5-40) fed only through pure adapters from the public
document shapes (`src/features/views/adapters/document.ts`). Invalid or revoked links show the
invalid-link page; a listed-people share shows the neutral sign-in screen first.

### Views and paths

Paths are `/tracking-plan/shared/<token>/<view>[/<id>]` (`src/sharedRoute.ts`; segments are
percent-decoded one by one, at most two; an unknown view is the overview). The server serves
`index.html` for every path under `/tracking-plan/shared/`, including a last segment with a dot
(`src/backend/static.ts`, `vercel.json`).

| View | Path | Item path |
| --- | --- | --- |
| Overview | `/shared/<token>` | |
| Events | `/events` | `/events/<event name>`: the event page |
| Properties | `/properties` | `/properties/<slug>`: the property page |
| Use cases | `/use-cases` | `/use-cases/<code>` (the id when the code is not unique): the use case page |
| Identity | `/identity` | `/identity/<rule id>`: the rule's row, marked |
| Catalogs | `/catalogs` | `/catalogs/<slug>`: the catalog page |
| Consent categories | `/consents` | `/consents/<slug>`: the category's row, marked |
| Standard events | `/standard-events` | `/standard-events/<slug>`: the mapping page |
| QA and findings | `/qa` | finding anchors in the hash |

The sidebar (the internal sidebar's look and icons, `PortalShell.tsx`) shows the project and client,
each section with its item count (QA: open findings) and its open comment threads, the JSON and
HTML downloads and the comment identity. A section with no content is left out; QA is always there.
Below 1024 px the sidebar is a drawer behind the menu button in the header; the downloads and the
Google identity controls are inside it (the Google One Tap prompt still appears, since the control
stays mounted). Navigation uses `pushState`, so the browser's back and forward buttons move between
views, and a list keeps its search, filters, sort, expanded rows and scroll position when the
visitor comes back from an item page (`useViewState`, `PortalListScope`).

A path or link naming an item the share does not have (renamed, removed, a typo) lands on its list
with the note "No <kind> “<name>” is in this tracking plan…" until the visitor moves on.

### The overview

The landing view (`views/PortalOverview.tsx`, `overviewModel.ts`) shows: the project and client,
when the document was generated and when it last changed, the JSON and HTML downloads; **Progress**
(custom events per status, certified of applicable with a bar, open findings by severity linking to
QA); **Waiting on you** (the first 10 open comment threads, newest activity first, each linking to
its item with the comment focused; internal-only threads never appear); **Recent changes** (the five
newest rows of the project-wide public history: property definitions, identity rules, catalogs and
catalog fields; events have no public history); and a card per section with its count and open
threads.

### Lists, item pages and lazy loading

The portal first loads the header, `document-summary.json` and the permitted comments (one shared
comment store, not a request per panel). Event cards are fetched only when a client opens an event
(`card.json`, a loading skeleton while it arrives, **Try again** on failure); `findings.json` and the
QA reports only when the QA view opens. The full `tracking-document.json` and `documentation.html`
are download links only; the portal never fetches them.

- **Events**: the internal Events table, read-only, with class, source, status, certification,
  Expiration (from the summary, T-5-46), property and variant counts. The event page renders the
  shared `EventCardView` (mode `shared`, which never shows agent instructions) with the event's
  comments on the page (beside the card from 1280 px), copy link, copy as Markdown and copy name.
- **Properties**: event and customer properties together, grouped as in the internal app, the first
  100 rows then **Show 100 more** (`PROPERTY_ROW_LIMIT`). The property page shows its definitions
  and the events that use it.
- **Use cases**: the use case page shows the narrative (or "No narrative yet"), the documentation
  link (rendered only for an `http(s)` URL), the requirements with links to their events and
  properties, the use case's comments on the page and each requirement's comments in a sheet.
- **Identity**: the identity rules table and the Identification flow paragraph.
- **Catalogs**, **Consent categories**, **Standard events**: their tables; catalogs and mappings
  have their own pages.
- **QA and findings**: the public QA reports and one findings table, the first 100 findings then
  **Show 100 more** (`PORTAL_ROW_LIMIT`); filters and search run over all findings. A finding a link
  points at past row 100 is pinned after the first 100 rows, marked and expanded.

Every row and item page has the comment and history actions (`TargetCollaboration`): comments,
reactions, images and status in a sheet, history in a sheet. Read access hides the posting and reply
forms and the status controls; the server rejects read-only writes with 403 `SHARE_READ_ONLY`
whatever the page shows.

Measured on the merged portal (T-5-42..T-5-45 QA, production build): every view stays under 5,000
DOM elements (at most 4,183, the ARMEDANGELS QA view with 509 findings; the single page had about
35,600), and only `/api/shared/<token>/...` requests are made.

### Old links redirect

Links to the retired single page keep working indefinitely (D-88). On load, and on a hash change,
`legacyAnchorTarget` (`portalModel.ts`) maps every old anchor to its view and item and replaces the
URL (no extra history entry): `#event-<name>` and `#variants-event-<name>` to the event page (the
variants block in view), `#property-<slug>`, `#use-case-<id>`, `#consent-<slug>`, `#catalog-<slug>`
and `#mapping-<slug>` to their item, section and group anchors (`#use-cases`, `#consents`,
`#mapping`, `#events-…`, `#properties-…`) to their list, and `#findings…` and
`#current-finding-<id>` to the QA view with the finding in view. Copied comment links (all target
kinds) open the item with the thread and the target comment focused. An old anchor naming an item
that is gone lands on the list with the not-found note.

### Comment identities (T-5-13, T-5-15; D-74, D-76)

Every new-comment and reply editor shows **Posting as** after the server identity has loaded. While loading, posting and reaction/status writes wait; an identity failure shows Retry and preserves drafts and chosen names. A guest can enter or change their display name in either editor; all editors on that share page update together. Optional-name links allow an animal/color guest name, such as Blue Otter. Required-name links require a deliberately entered name or a server-verified account; an old generated `Visitor xxxx` label does not satisfy that rule.

The chosen guest name stays in the browser per share link. A separate opaque HttpOnly, SameSite=Lax cookie identifies the guest for 30 days and survives disabled localStorage. Disabling cookies starts a new participant on each request. Changing a display name does not change reaction ownership, and different guests can have the same display name. Guest names are labelled **Guest** and are not proof of identity. Verified identities show **Google account** or **Signed-in account** badges. Profile photos are shown only for supported verified Google image URLs; other identities use initials or an animal icon.

`GET /api/shared/:token/identity` returns display metadata only (`name`, `kind`, `avatar_url`, `verified`, `name_chosen`). Shared writes accept an optional explicitly chosen `author_name`; the server supplies anonymous names and overrides names from a verified session. Client-supplied `participant_id`, `author_kind`, `avatar_url` and `verified` fields are refused. Comment/reaction public responses never expose participant IDs or session credentials. Guest session credentials are not included in project backup exports. Migration 0037 is additive: old comment author names and name-based reactions remain readable and restorable.

When configured, **Continue with Google** identifies a commenter using a separate External Google
Web client. Eligible Google Identity Services (GIS) One Tap/auto-selection may offer an existing
Google session; it does not read the Chrome browser profile, and automatic selection is not
guaranteed. The explicit button remains available. The server verifies the account before using
its display name/photo. Trusted staff-session reuse can provide a Signed-in account identity;
without a trusted photo, initials are shown. The existing Internal staff OAuth client and
`/oauth2/callback` remain unchanged.

**Use guest identity** opts out of the shared verified identity and prevents automatic Google
selection and staff-session reuse. Where the visitor cannot comment (a read link, or the
listed-people sign-in screen) the same control reads **Signed in as** and **Sign out** (T-5-46). It does not log the user out of Google or the staff portal.
Google script/network failures leave guest commenting available. Signing in never upgrades share
access, reveals private fields or creates a staff role. The External GIS flow uses a public client
ID and no client secret; configuration and real sign-in verification are described in
[Google identity setup](SHARED-GOOGLE-AUTH.md). Auth session/challenge credentials are operational
data and are excluded from project backups.

### Copying comments and opening links (T-5-14, D-75)

Each root comment and reply has **Copy comment link** and **Copy comment Markdown** controls.
Roots also offer **Copy thread Markdown**, including the root and all replies permitted in the
current view, oldest first. Copy feedback is accessible and reports success or failure; a failed
clipboard write leaves the content unchanged and can be retried.

Markdown retains the original body, author, timestamp and attachment references. Image references
are resolved to absolute URLs permitted in the current view: share-file URLs on a shared page,
internal file URLs for staff. Unknown or unavailable attachment references use an unavailable
marker. Shared copying never fetches private comments or private attachments. Copied image URLs
remain protected by the same share/staff permissions; copying does not make them public. Document
JSON, HTML and ordinary entity Markdown exports still exclude comments.

A comment link retains the current share token or uses the internal project Comments page. Its
versioned fragment identifies the entity, thread root and target comment. On opening, reloading or
changing the fragment, the portal checks those relationships against permitted data, opens the
view or item page that holds the target, opens the thread (inline on an event or use case page, in
a sheet elsewhere), reveals all replies (including a target beyond the first two) and focuses and
highlights the target. Internal Comments-page links clear filters that would otherwise hide the
target. Invalid, removed or private targets show a generic unavailable/invalid notice; revoked
shares show the invalid-link page. No internal fallback is used to resolve a target from a shared
page.

### Identity, catalog and definition discussions (T-5-22)

Identity rules, catalogs and each named property definition have comment and history controls in Actions, in both internal and shared views. Counts and discussions refer to that exact target; a definition discussion is separate from its parent property's discussion. The portal loads comments once and distributes permitted rows to the panels. Copy comment links open the same target and thread, including a definition nested under its property.

Internal staff retain discussions after the target is removed. Shared links can read, reply, react, change status or access comment images only while the target and its owning parent remain live in the linked project. Missing, foreign and removed targets return the same public 404. Private threads and the project share-comments setting still apply.

Shared history is available through `GET /api/shared/:token/history?entity_type=<type>&entity_id=<id>`, for the three targets above. It includes only the target's documented public fields and live catalog field changes. Private-only changes are excluded before paging; actors display as Staff or System. Without `entity_type` and `entity_id` the same route returns the project's recent public changes (T-5-43) with the same projection row by row: only identity rules, catalogs, catalog fields and property definitions the share sees today, current names as labels; project and event rows never appear (project rows hold the listed people's emails). Internal history retains its existing staff detail. Done closes the discussion and does not change findings or certification.

## Remaining hosting considerations

- **Token hashing**: share tokens are stored in plaintext so Settings can re-display them.
  Hashing with one-time display would require a separate change to that workflow.
- **Durable rate limiting**: in-memory per-token counters reset on restart and are not shared
  across server instances. Durable limits across shared routes remain separate work.
- **Passphrase**: an optional per-link passphrase, stored hashed and checked once per browser
  session, remains planned together with token hashing and durable rate limiting. For a closed
  audience today, use **Only listed people**.
