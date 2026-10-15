# Plan 2026-10-15: client portal v2 (option B)

Requested by Ján Pan on 2026-10-15: "Go with option B: plan the shared read-only components, the overview, one view per section, lazy event cards and share roles. Clients only read and comment." Planning only; no code changes yet. Decision D-88, accepted by the user on 2026-10-15 with the recommended answers below. Supersedes the single-page layout of D-50 and the T-5-12 table layout; keeps every D-48 / D-49 / D-70 / D-74..D-76 / D-84..D-86 contract unless stated here.

## Why
Measured on the sandbox-acme-eu share link (2026-10-14, dev build): one page renders every section at once, 35,600 DOM elements and 3,950 buttons with everything collapsed, 126 MB heap, 828 table rows. Every click or sidebar keystroke blocks the main thread for about 1.1-1.4 s because the whole page re-renders. `tracking-document.json` is 1.2 MB, of which full event cards are 941 KB (about 15 KB per event), all downloaded although every event starts collapsed. The portal also has its own table components, so improvements to the internal app do not reach clients.

## Target shape

### 1. One data contract for read-only views
- Read-only views take the public `TrackingDocument` shapes (`src/domain/document/trackingDocument.ts`), never internal REST rows. That shape is already the public projection, so a view that only knows it cannot leak an internal field.
- New pure adapters in `src/features/views/adapters/` turn the document (or its summary, section 3) into table rows per section. Unit-tested.
- Internal pages keep their own REST loading and editor Sheets (`Events.tsx` 306/412, `Properties.tsx` 303/422, and the others listed in the T-5-40 row). Their tables move onto the same presentational components, fed from their own rows through thin internal adapters.

### 2. Shared presentational components (`src/features/views/`)
- One table component per section: `EventsTable`, `PropertiesTable`, `UseCasesTable`, `IdentityView` (identifiers, flow, rules, codegen), `CatalogsTable`, `ConsentTable`, `StandardEventsTable`, plus the existing `EventCardView`.
- Each takes rows plus slots: `rowActions(row)`, `onOpen(row)`, `commentCount(row)`, `readOnly: boolean`. No fetching, no editors inside.
- Look and feel follow the conventions agreed on 2026-10-14:
  - one-line rows (8817e0d, 7a5ee74), faint empty dash, defaults muted, exceptions highlighted
  - secondary actions on hover (`.row-actions`), a comment count above zero always visible
  - full names never truncated in the portal (SharedEntityTable test)
  - density toggle (compact | comfortable) per browser
  - one search and filter bar per view: status, source, class/category
- The identification flow view from the session "Structured identification flow in the client portal" (`IdentificationFlowView`) is reused here, not rebuilt.

### 3. Lazy event cards: two new public routes
Both are mounted in `routes/shared.ts` behind `requireShare` (and the share role check, section 6). Both carry `Cache-Control: no-store` and return the identical 404 `SHARE_NOT_FOUND` body for any error.

- **`GET /api/shared/:token/document-summary.json`**
  - The public document with each event reduced to its light fields: id, name, business_name, class, implementation_method, status, priority, description, sources, identifiers, certification, quality counts, variant names, property count, open finding count.
  - Everything else (properties, use cases, identity, catalogs, consents, mappings, findings summary, limits) stays as it is today.
  - Target size on the sandbox: at most 250 KB uncompressed (today 1.2 MB).
- **`GET /api/shared/:token/events/:eventId/card.json`**
  - One full `EventCard` from the public projection, with variants, properties, codegen, coverage, findings, triggers and use cases.
  - An unknown or deleted id returns the same 404 as a bad token.
- **Security rule:** both routes are derived from the output of `toPublicTrackingDocument` (`document.service.ts:1123`), never from DAL rows directly. A single shared projection path means a new internal field cannot reach only one of them. Tests assert that every key stripped today is absent from both responses.
- **Builder cost:** add a per-request summary builder that skips codegen and coverage, to cut the about 1 s server build time (today the full card is built for every event). The JSON and HTML downloads stay unchanged (full document, `?version=1`).

### 4. Portal shell and routing
- **Paths:** `/tracking-plan/shared/:token/<view>[/<id>]` with views `overview` (default), `events`, `events/<name>`, `properties`, `use-cases`, `use-cases/<code-or-id>`, `identity`, `catalogs`, `consents`, `standard-events`, `qa` (QA reports and findings).
  - `sharedTokenFromPath` (`src/sharedRoute.ts`) and the server's SPA fallback must accept the deeper paths.
  - The internal app has no router library (Layout switches on `activeTab`). The portal gets a small path parser modelled on `mainRoute.ts`, not a new dependency.
- **Layout:** the same layout as the internal app: the Sidebar visual (`navIcons.ts`), `PageHeader`/`PageBody`, the agency brand header, and read-only sections only. Section counts and open-comment counts sit in the sidebar.
- **Old links keep working.** Every link already sent to clients is a hash on the single page: `#event-<name>`, `#property-…`, `#variants-event-…`, `#catalog-…`, `#consent-…`, finding and comment anchors. On load, `/shared/:token#<anchor>` redirects to the new view and id (comment deep links through `useCommentLink`/`commentLinks.ts`). Test every anchor kind in `references.ts`.
- **Features carried over unchanged:**
  - comments, reactions, attachments and status (`CommentsPanel` api mode `shared`)
  - Google sign-in (`SharedGoogleSignIn`) and the per-link name
  - QA reports (`QaReports`) and findings (`SharedFindingsTable`, `sharedFindingsModel`)
  - copy as Markdown, copy link, the naming and sources notes, and JSON/HTML downloads
- **Retired:** global and per-group Expand all / Collapse all (one view at a time makes them unnecessary), the scroll spy, and the 1,200-line single page. `SharedProject.tsx` becomes the shell plus routes.

### 5. Overview (landing view)
- **Header:** project and client name, last updated (`generated_at`, latest history entry), and the JSON/HTML downloads.
- **Progress:**
  - custom events by status (planned, in review, implemented)
  - certified out of applicable
  - open findings by severity, from `findings_summary`
- **Waiting on you:** open comment threads, newest first, each linking to its target (reuses the comment list and `resolveCommentTarget`), plus the five most recent changes from `GET /:token/history`.
- **Section cards** with counts that open each view.
- **Data:** only the summary route plus the existing comments and history routes. No new data is exposed.

### 6. Share roles: read and comment only
- **Unchanged:** link role `read | comment` (`projects.share_access`, D-48), `share_comments`, `share_require_name`, `internal_only`, and the D-70 status limits.
- **New audience setting** per project: `anyone_with_link` (default, today's behaviour) or `listed_people`.
  - With `listed_people`, the share link alone is not enough: a visitor must sign in with Google (D-76 path, `sharedAuth.ts`), and their verified email must be on the list.
  - Workspace staff recognised by the trusted proxy are always allowed.
  - Unlisted or signed-out visitors get a neutral sign-in screen that reveals neither the project nor the client name. Every data route answers 404 `SHARE_NOT_FOUND` for them.
- **Members:** `share_members(project_id, email lower-cased, role viewer|commenter, added_by, created_at)`.
  - A member's role is capped by the link role: a commenter on a read-only link can only read.
  - No editor role exists. Clients never write definitions (user, 2026-10-15).
- **Identity:** the Google session must keep the verified email server-side (`email_verified` true; today only `sub`, name and photo are stored). The email is never returned by any public route or shown to other participants.
- **Enforcement** lives in `middleware/share.ts` (`requireShare` resolves the effective role into `req.shareAccess`), never only in the UI. Every POST/PATCH under `/api/shared` keeps checking `comment`.
- **Settings UI:** the Share block gains the audience switch and a member list (add by email, choose role, remove). Changes are written to `change_log` as project updates.
- **Migration 0045:**
  - `projects.share_audience` (CHECK, default `anyone_with_link`)
  - the `share_members` table
  - `comment_auth_sessions.email` (nullable)
- **Backups:** `share_members` goes in backup and restore. Sessions stay out, as today. Rotating the token keeps the members; revoking the link keeps them too, for a later re-share.

## Phases
Each step ends with the app runnable and the portal QA-able on localhost (D-09). Order: T-5-40 and T-5-41 can run in parallel; T-5-42 needs both; T-5-43 and T-5-44 follow T-5-42; T-5-45 is independent of the UI work after T-5-41; T-5-46 closes.

| Task | Goal | Exit criteria (qa-tester) |
|---|---|---|
| T-5-40 | Shared presentational tables, internal pages switched to them | Internal pages look and behave as before (plus the density toggle); adapters unit-tested; no new requests |
| T-5-41 | Summary and per-event card routes | Privacy tests over every stripped key; 404 parity; summary at most 250 KB on the sandbox; downloads unchanged |
| T-5-42 | Portal shell, routing, one view per section, old-link redirects | Every `references.ts` anchor kind and comment deep link lands on the right view; at most 5,000 DOM elements per view on the sandbox; comments, reactions, attachments, QA reports and findings work |
| T-5-43 | Overview | Counts match the summary; waiting-on-you lists only visible, non-internal threads |
| T-5-44 | Event detail and use-case detail pages, lazy card | Card loads on open only; comments panel on the page; interaction under 200 ms in a production build |
| T-5-45 | Share audience and members (0045) | Listed mode blocks unlisted, signed-out and wrong-email visitors on every route; role capped by link role; email never in public responses; backup/restore; Settings UI |
| T-5-46 | Integration QA, docs, release | Full suite, build, lint; browser QA desktop and narrow; SHARING.md, guide and help updated; release under the existing backup gates |

## Out of scope
- Client editing of any definition.
- Per-entity or per-section sharing.
- Notifications.
- Email invitations: listed people receive the link from E3 by hand.
- A router library.
- List virtualization: it breaks find-in-page and anchors, and one view per section makes it unnecessary.

## Superseded proposals
Two session cards from 2026-10-14 fold into this plan and should be withdrawn:
- **"Client portal performance quick wins":** memoizing the single page would be thrown away by T-5-42.
- **"Compact density mode for the Events table":** becomes part of T-5-40.

## Answers (user, 2026-10-15)
All four recommended answers accepted: nothing shown to unlisted visitors, event detail as its own page, new shares default to anyone with the link, old hash links redirect indefinitely.

## Open questions as asked
1. **Listed mode for unlisted visitors:** show nothing at all (recommended) or the project name with "ask E3 for access"?
2. **Event detail:** its own page (recommended: linkable, same as the internal card page) or a side panel over the list?
3. **Default audience for new shares:** `anyone_with_link` (recommended, today's behaviour) or `listed_people`?
4. **Old hash links:** redirect indefinitely (recommended) or for a limited period?
