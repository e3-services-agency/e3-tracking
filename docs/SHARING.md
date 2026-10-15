# Sharing (D-48, D-49, D-50, D-60, D-73–D-76)

How a client reads the public documentation, chooses a commenting identity, and participates in shared threads.

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
no expiry and no required login. Optional Google commenter sign-in does not change link access.
`share_created_at` is shown next to the link.

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
- `GET /:token/tracking-document.json` — the public projection of the tracking document (the
  full download, `?version=1`).
- `GET /:token/document-summary.json` (T-5-41, D-88) — the same public document with each event
  reduced to its light fields (`TrackingDocumentSummaryEvent`: id, name, business_name, class,
  implementation_method, status, priority, description, sources, identifiers, certification,
  quality, plus `variant_names`, `property_count`, `open_finding_count`). Every other top-level
  section is exactly what `tracking-document.json` carries. The portal loads this first.
- `GET /:token/events/:eventId/card.json` (T-5-41, D-88) — one full public `EventCard`, the same
  object `tracking-document.json` carries for that event. Loaded when a client opens an event.
- `GET /:token/documentation.html` — the public projection of the HTML export.
- `GET /:token/files/*` — the same decode/traversal checks as the internal `routes/files.ts`,
  scoped to this token's own project (a trigger screenshot, the project logo).
- `GET /:token/comments` / `POST /:token/comments` (D-49 amendment, T-4-04) — see below.
- `GET /:token/identity` — the current commenter’s display metadata, without participant IDs.
- `GET /:token/auth/config`, `POST /:token/auth/google` and `POST /:token/auth/logout` — optional
  verified commenter authentication, mounted before the shared router. See
  [Google identity setup](SHARED-GOOGLE-AUTH.md).

Both lazy routes are built from `toPublicTrackingDocument`'s output, never from database rows
directly: the summary from a light build (no per-event coverage or codegen) run through the
projection and then reduced to an allowlist of event fields; the card from the projection of a
document limited to that one event. A field added to the projection's strip list is therefore
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

## The shared view page (`src/pages/SharedProject.tsx`, D-50)

`/tracking-plan/shared/<token>` is matched before `ProtectedRoute` (`src/App.tsx`) and requires no
staff login. It fetches the project header, public tracking document and permitted comments, using
one shared comment store rather than a request per entity panel. The page shows the client header
and logo, navigation, Events, Properties, Use cases, Identity, Consents, Catalogs, Mapping and
Findings, plus tracking-document JSON and documentation HTML downloads. Empty sections are
omitted. Invalid or revoked links show the invalid-link page.

Events, properties, use cases, catalogs, mappings and finding lists use aligned tables with labeled
columns, entity icons, full wrapping names/descriptions and compact action columns. Expandable
detail rows retain the existing document content. Inline `CommentsPanel` instances cover events,
properties, use cases and requirements. Read access hides posting/reply forms and status controls;
existing reaction counts remain visible. Reacting requires comment access, and the server rejects
read-only writes with 403 `SHARE_READ_ONLY`. Optional Google identity controls do not change access.

`EventCardView` is the common event-detail renderer behind the internal event card, shared view and
HTML export (D-50). The shared page consumes only the public projection.

## Remaining hosting considerations

- **Token hashing**: share tokens are stored in plaintext so Settings can re-display them.
  Hashing with one-time display would require a separate change to that workflow.
- **Durable rate limiting**: in-memory per-token counters reset on restart and are not shared
  across server instances. Durable limits across shared routes remain separate work.
- **Passphrase**: an optional per-link passphrase, stored hashed and checked once per browser
  session, remains planned together with token hashing and durable rate limiting.

## Client view layout (T-4-14)

The shared portal uses tables instead of separate chip-like cards (T-5-12, D-73). Names and
descriptions wrap in full rather than truncating with ellipses. Entity type icons, classification
and certification badges, source details, comment counts and copy/link actions occupy consistent
columns. Tables have their own horizontal scroll regions when a narrow viewport needs them.
Sidebar labels wrap too.

Expandable events, properties, use cases, catalogs and mappings start collapsed. Global
**Expand all / Collapse all** controls open or close these rows; local controls operate on their
section or group. Existing entity links, such as `#event-<name>` and `#property-<slug>`, open and
scroll to the appropriate row. Comment links additionally open the specific thread and reply.

A sticky left navigation becomes a dropdown below 1024px. It lists the available sections and
groups, with filtering and a highlight for the current section. Group controls work with mouse,
Enter and Space. Filtering reveals matching children, and clicking a section highlights it until
the reader scrolls. Section/group headings and scroll offsets account for the page header.

Speech-bubble buttons open event, property, use-case and requirement discussions inline, showing
a comment count (`0` muted). Posting/reply forms and status controls require comment access;
reaction counts remain visible on read links, and reaction writes require comment access. Event
Implementation details remain behind a Show/Hide toggle, with GTM / Web SDK / Tracking API tabs
and code-copy feedback. Event property tables retain Payload key, Type, Kind, Required,
Description and Example columns; additional metadata appears as secondary description lines.

The Findings summary includes open counts by severity, kind family and comparison, top events by
open errors, and acknowledged counts when present. It is computed from the public document only
and can be copied as Markdown. Findings groups and requirement targets keep their same-page
cross-links. Documentation HTML keeps its export layout; it does not include comments.

### Grouped use cases, consents, mapping and findings (T-4-21)

The navigation and the page group four more sections the same way as Events: **Use cases** by their `type` (Marketing, Transactional, Other for a use case without one; leaves are the use cases, each with its own Expand all / Collapse all per group), **Consents** by channel (Email, SMS, Push, WhatsApp, Other; leaves are the categories), **Mapping** (one leaf per standard event mapping) and **Findings** (one group per comparison, leaves are the affected events). Consent categories have no channel field, so the channel is derived: the standard key is checked first, then the name, for the keywords whatsapp, sms/mms/text message, email/newsletter, push/browser/mobile app (tested in that order, so "Email notifications" is Email; a bare "notification" counts as Push only when nothing else matched); anything else is Other (`src/domain/consentChannel.ts`). The section ids, nav entries and rendered groups come from one helper (`sharedSectionGroups` in `src/features/shared/viewHelpers.ts`), and a parity test checks nav ids equal rendered ids. When a template is added to a project the dialog asks for the use case Type (marketing or transactional), suggested from the template's message channels and an explicit confirmation-like name (order/shipping/booking confirmation, receipt, invoice, password reset, verification code, double opt-in); the bulk add keeps each template's own type.

### Copy buttons, category badges, cross-links and the naming note (T-4-22)

- **Copy name** buttons sit next to every entity name: event titles, property rows and their definitions, use cases, consent categories, standard event mapping headings (the standard event key), catalog names and catalog fields, and the payload key in event card property tables. They copy the exact name only and show "Copied" or "Copy failed", like the copy-link button.
- **Category badges** (System customer, Customer, SDK default, Event) show on property rows and in event card property tables; the first two accent categories use the Bloomreach colour variables, the others are neutral. The Kind column stays.
- **Cross-links** all stay on the page: "Used in" events link to `#event-<slug>`; property keys inside an event card and a catalog's "Properties that look up into this catalog" link to the property's row (`#property-<slug>`, unique per property; following the link opens the row); use case requirement targets for events and properties link to the event card or property. Anything that does not resolve renders as plain text. The anchors are listed by `src/features/shared/references.ts`.
- **Naming note**: when the project has a naming convention (always, default snake_case) the Events and Properties section headers show "Naming convention: snake_case (system items exempt)". The document carries it as `project.naming_convention` (additive).

### Grouped properties, catalogs and icons (D-64, T-4-20)

The Properties section lists **event and customer properties together**, grouped System customer, Customer, SDK default and Event (Event sub-grouped by kind: event, item, state list, context). Each group has a sticky group header at the same offset as the event groups, with its own Expand all / Collapse all; each property is a collapsed table row (full wrapping name, type and description) that opens to its named definitions and, for an event property, the events that use it. The navigation lists the groups under Properties (and the kind subgroups under Event). A "Copy properties as Markdown" button copies the same grouping (`propertiesToMarkdown`); the HTML export groups the same way.

The Catalogs section is present only when the project has catalogs: one expandable table row per catalog with its kind (product, variant, other), market and language, version (and whether it is live), the number of searchable fields, the lookup key, its mapping role, status, source system and sync method (D-61), a fields table (name, type, lookup key, searchable, description) and the list of event properties that look up into it (`mapped_catalog_field_id`). It is in the navigation and the HTML export. When the project has sources, a "Collected from" line under the Events heading lists each source as "System via method" with its event count, and each event card's Overview shows its sources the same way (D-62); these are client-facing and stay in the public projection. `owner`, `client_name` and `priority` of a catalog are never part of the tracking document, so they are not in the public projection either; `source_system`, `sync_method` and `update_frequency` are kept as client-facing.

Section headers and top-level navigation entries carry the sidebar's icons (Events, Properties, Use cases, Identity, Consents, Catalogs, Mapping, Findings) from one module, `src/components/layout/navIcons.ts`, used by both the sidebar and the shared view.

### Requirement targets and project-level findings (T-4-25)

Every use case requirement row shows a small type label with the sidebar icon (Event, Variant, Property, Customer property, Catalog attribute, Consent; labels in `src/features/shared/requirementTargets.ts`) and its target is a same-page link: an event to its card (`#event-<slug>`); a variant to its event, opened and scrolled to the Variants block (`#variants-event-<slug>`); an event or variant property links both parts (event or variant, then property row `#property-<slug>`); a catalog attribute to its catalog card (`#catalog-<slug>`, one anchor per catalog); a consent to its row in the Consents section (`#consent-<slug>`, the same ids as the navigation). The document gains additive ids: `variant_id`, `catalog_id` (the main catalog of a catalog attribute) and `consent_category_id` on a requirement, and `id` on a consent category; they are not internal fields and stay in the public projection. A target that no longer resolves ("(removed)") is plain text.

The "Not tied to an event" leaf in a findings group is clickable and expands to that comparison's project-level findings: kind (human label, explanation in a tooltip), severity, message and the entity it concerns. A finding with a property or variant links to its row or event; a catalog or consent finding (recognised from its kind prefix, since a finding carries no catalog or consent id) links to the Catalogs or Consents section. The navigation leaf opens and scrolls to that list (`src/features/shared/findingEntity.ts`).

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
selection and staff-session reuse. It does not log the user out of Google or the staff portal.
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
changing the fragment, the page checks those relationships against permitted data, expands the
containing entity/group and thread, reveals all replies (including a target beyond the first two),
and focuses/highlights the target. Existing entity anchors still work. Internal Comments-page
links clear filters that would otherwise hide the target. Invalid, removed or private targets
show a generic unavailable/invalid notice; revoked shares show the invalid-link page. No internal
fallback is used to resolve a target from a shared page.


### Identity, catalog and definition discussions (T-5-22)

Identity rules, catalogs and each named property definition have comment and history controls in Actions, in both internal and shared views. Counts and discussions refer to that exact target; a definition discussion is separate from its parent property's discussion. The shared page loads comments once and distributes permitted rows to the panels. Copy comment links open the same target and thread, including a definition nested under its property.

Internal staff retain discussions after the target is removed. Shared links can read, reply, react, change status or access comment images only while the target and its owning parent remain live in the linked project. Missing, foreign and removed targets return the same public 404. Private threads and the project share-comments setting still apply.

Shared history is available through `GET /api/shared/:token/history?entity_type=<type>&entity_id=<id>`, for the three targets above. It includes only the target's documented public fields and live catalog field changes. Private-only changes are excluded before paging; actors display as Staff or System. Internal history retains its existing staff detail. Done closes the discussion and does not change findings or certification.
