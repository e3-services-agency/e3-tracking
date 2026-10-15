# Sharing and access

## Signing in

Staff use the configured app sign-in: a local actor in local mode, or the Internal Workspace OAuth
login on the hosted portal. A share-link visitor does not need staff access. Optional Google
commenter sign-in supplies a verified identity without granting access to the internal app or
changing the link’s permissions. On a link limited to listed people, Google sign-in is what opens
the link (see **Who can open the link** below).

## Share link

A project can have one **share link**, managed in **Settings**:

- Generate a link, or generate again to rotate it. Revoke disables it immediately.
- **Read** access allows viewing and copying permitted content. **Comment** also allows posting,
  replying, reacting and the permitted thread status changes.
- The link opens the client portal. Agent instructions, owners, identity notes, the Bloomreach
  project URL and internal notes are removed.
- Sandbox projects require confirmation before a link can be generated.

Clients only read and comment; no link lets anyone edit the tracking plan. Signing in cannot
upgrade a read link. See the [Sharing reference](../SHARING.md) for the exact routes and guarantees.

### Who can open the link

- **Anyone with the link** (the default): whoever holds the link gets its access, with no login.
  Share it only with the intended audience.
- **Only listed people (Google sign-in)**: the visitor signs in with Google, and the link opens
  only when that Google account's verified email is under **Listed people**. Add each person by
  email as **viewer** (reads) or **commenter** (reads and comments), change a role, or remove them;
  changes apply on their next page load.

A person’s access is never more than the link’s: a commenter on a **Read** link can only read.
Everyone else (signed out, signed in with an unlisted account, or with an unverified Google email)
sees only "Sign in to open this link", without the project or client name, and every data request
answers as if the link did not exist. E3 staff signed in to the Workspace portal can always open
the link and do not need to be listed. Listed emails are never shown on the portal or in any public
response, and changes to the list appear in the project's internal History. Rotating or revoking
the link keeps the list.

## Browsing the client portal

The portal opens on an **Overview**: progress (events by status, certified events, open findings by
severity), **Waiting on you** (open comment threads, newest first, each a link to its item), the
five most recent changes, and a card per section. The sidebar lists the sections with their counts
and open threads: Events, Properties, Use cases, Identity, Catalogs, Consent categories, Standard
events, and QA and findings. Sections without content are left out. The sidebar also has the JSON
and HTML downloads and the Google identity; below 1024 px it opens from the menu button.

Each section is its own page with the same tables as the internal app, read-only: search, filters
and column sorting work as there. Properties and findings show 100 rows first, then **Show 100
more**. Opening an event, a property, a use case, a catalog or a standard event mapping opens its
own page (the event card loads when you open it). The address bar always names the page, so a
copied URL or **Copy link** opens the same page, and the browser's back button returns to the list
with its filters and scroll position.

Links to the old single-page view (for example `#event-cart_update`) still work and open the
matching page. A link to something that is no longer in the tracking plan opens its list with a
note saying so.

Comment-count buttons open discussions on every row; on an event or use case page the comments sit
on the page itself. Read links show permitted discussions and copy controls, with no posting or
reply editor.

## Posting identity

Every new-comment and reply editor shows **Posting as**. Wait for identity to load before posting;
if it fails, **Retry** keeps the draft, selected images and chosen name.

Guests can enter or change a name in either editor, and all editors on that share page update
together. Without a chosen name, optional-name links assign a stable animal/color identity such
as Blue Otter. The chosen name is remembered per link in that browser; a separate guest cookie
tracks reaction ownership. Changing a name does not lose reactions, and two guests with the same
name remain separate participants. With cookies disabled, identity starts anew on each request.
A **Guest** badge means the name is self-declared, not verified.

When enabled, **Continue with Google** uses Google Identity Services to verify the account name
and supported profile photo. Eligible Google sessions may receive One Tap or automatic selection;
this does not inspect the Chrome profile, and automatic sign-in is not guaranteed. An existing
trusted staff session may also supply identity. Badges distinguish **Google account** from
**Signed-in account**; identities without a supported photo use initials or an animal icon.

Choose **Use guest identity** to opt out of the shared verified identity and automatic Google
selection/staff-session reuse. Where you cannot comment (a read link, or the sign-in screen of a
link limited to listed people) the control reads **Signed in as** and **Sign out** instead. This leaves Google and staff portal login intact. If Google sign-in
is unavailable, guest commenting remains available. **Require a name on the share link** requires
an explicitly entered guest name or a verified account before posting, replying, reacting or
changing status; an automatic animal name does not meet that requirement.

Public commenter sign-in uses a separate **External** Google Web client and its public client ID,
with no client secret. The existing **Internal** staff OAuth client and callback remain unchanged.
See [Google identity setup](../SHARED-GOOGLE-AUTH.md) for configuration and sign-in verification.

## Comments and privacy

Post new comments from entity panels. The project-wide **Comments** page lists discussions and
provides internal filtering and moderation. Internal and shared participants answer the same
thread, subject to the link’s visibility settings:

- **All comments** shows non-private roots and their non-private replies.
- **Only comments posted through the link** shows roots posted through the link and their
  non-private replies, including replies from the team. Internally created roots are hidden.
- **Internal only** on a root hides the whole thread. A private reply stays hidden even when its
  root is public. Private images and reactions also remain unavailable through the share link.

Comments do not appear in tracking-document JSON, documentation HTML or ordinary entity exports.
Shared identity never reveals private fields or provides staff permissions. Typed guest names are
unverified; public comment responses do not expose participant IDs or session credentials.

## Replies, status and reactions

Replies appear beneath the root, initially the first two with **Show n more** for the rest. The
root has a status: **Open**, **On it**, **Done** or **Won’t do**. Internal staff can set any status.
A comment-link visitor can set On it or Done, but cannot reopen a closed thread or set Won’t do.

**Seen** and **Like** are available on roots and replies; **On it** is a root-only reaction and also
marks an open thread On it when permitted. Press a reaction again to remove it; hover to see who
reacted. Removing On it does not reset the status. Read links cannot react or change status.

## Copying and linking comments

Roots and replies offer **Copy comment link** and **Copy comment Markdown**. A root also offers
**Copy thread Markdown** for the root and all replies visible in the current view. Copy feedback
reports success or failure; retry a failed clipboard write.

Markdown keeps the body, author, timestamp and permitted attachment references. Shared copying
includes only public content, and image URLs still require the same valid link. Internal copying
uses the staff view’s file URLs. Copying does not change access or make private images public.

Opening or reloading a comment link opens the page that holds the comment and its thread, reveals
the target reply even beyond the first two, and focuses/highlights it. Internal Comments-page links clear
filters that would hide the target. Removed, private or invalid targets show a generic notice;
revoked links show the invalid-link page. Existing entity links still work.

## Images and Markdown

Drop, paste or select PNG, JPEG or WebP screenshots in a comment or reply editor: up to 10 images,
5 MB each. Images upload after posting and appear as thumbnails; open one to view it full size and
use arrow keys to browse. Upload processing removes hidden image metadata. Share-link visitors
can attach images to their own freshly posted comments within 15 minutes; internal staff can
manage attachments. A private comment or private root keeps its images off the share link.

The Markdown editor supports formatting, links, lists, quotes, tasks, code and images already
attached to the visible thread. Use **Preview** to check the result. Raw HTML is not rendered.
Comments can contain up to 10,000 characters. Ctrl/Cmd+Enter posts; Ctrl/Cmd+B, I, K and E insert
bold, italic, links and code. Enter continues a list; Tab and Shift+Tab indent list items.

## Agents

The MCP server exposes definitions, findings and QA tools to agents on the same database. Agent
writes use the agent name in History; see the MCP server reference. Share commenter authentication
does not grant MCP or staff access.
