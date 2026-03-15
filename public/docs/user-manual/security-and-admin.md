# Security & Admin

## The Lock & Key Model: Auth vs RLS

The E3 Tracking Portal uses a two-layer security model so that only the right people can see and change the right data.

### 1. Authentication (the “Key”)

**Authentication** answers: *Who are you?*

- You sign in with **email and password** (Supabase Auth).
- The portal issues a **session** and a **JWT (JSON Web Token)** that identifies you.
- Every request to the backend (events, properties, catalogs, journeys, workspace settings) sends this JWT in the `Authorization` header so the server knows who is making the request.

Without a valid session, you cannot access protected routes; you are redirected to the **Login** page.

**Session expiry and data protection:** For security, sessions can expire or become invalid (for example after a period of inactivity or when credentials are revoked). If the portal detects that your credentials are no longer valid (for example when the server returns an unauthorized response), it will automatically sign you out and redirect you to the sign-in page so you can sign in again. This protects data by ensuring that only valid sessions can access workspace data.

### 2. Row Level Security (the “Lock”)

**Row Level Security (RLS)** answers: *What are you allowed to see and change?*

- Data is stored in a **multi-tenant** way: every row is tied to a **workspace**.
- Membership is stored in **workspace_members**: each record links a user to a workspace with a **role** (`admin`, `member`, or `viewer`).
- The database enforces **RLS policies**: you can only **select**, **insert**, **update**, or **delete** data if you have a row in `workspace_members` for that workspace.

So: **Auth** gets you in the door; **RLS** decides which rooms (workspaces) you can enter and what you can do there.

### Public exception: shared journeys

Journeys can be **shared via a link**. Those shared views use a **share token**. The database allows **public read-only** access to a journey when a valid `share_token` is used, so recipients do not need to log in to view the shared journey.

---

## Managing Client Access via Workspace Settings

Workspace admins control who can access a workspace and how it is branded.

### General tab

- **Workspace name** — Label for the workspace (e.g. client or project name).
- **Client primary color** — Used in the UI (e.g. buttons, accents). E3 default is Emerald Green (`#0DCC96`).
- **Client name** (optional) — Display name for the client.
- **Client logo URL** (optional) — URL of the client’s logo for the header.

Only users with the **admin** role in that workspace can change these settings.

### Members tab

Here you see everyone who has access to the current workspace and their **role**:

- **Admin** — Can edit workspace name and branding, and **invite or manage members**.
- **Member** — Can edit events, properties, catalogs, and journeys in the workspace.
- **Viewer** — Read-only access to the workspace.

**Invite by email:** Enter a colleague’s email and choose a role, then click **Invite**. The system looks up the user by email and adds them to `workspace_members`. They must already have an account (same Supabase Auth); if no user is found, you’ll see “No user found with that email.”

---

## Secure Member Row (UI reference)

In the **Members** tab, each member is shown in a row with their identifier, optional display info, and role badge. Conceptually, the row looks like this (Tailwind-style layout):

```html
<!-- Secure Member Row: name, email, role badge -->
<div class="flex items-center justify-between py-2 px-3 rounded-lg border border-gray-200 bg-gray-50/50">
  <div class="flex items-center gap-3">
    <span class="font-medium text-gray-900 truncate max-w-[120px]">Jane Smith</span>
    <span class="text-sm text-gray-500">jane.smith@example.com</span>
    <span class="text-xs font-medium px-2 py-0.5 rounded bg-[var(--brand-primary)]/20 text-[var(--brand-primary)]">
      Admin
    </span>
  </div>
</div>
```

- **Name** — Display name or truncated user id if no profile.
- **Email** — User’s email (or user id in some setups).
- **Admin badge** — Role pill; admins get the primary brand color, others a neutral gray.

---

## Logout

Use **Logout** in the sidebar (or user menu) to sign out. Your session is cleared and you are redirected to the Login page. To access the portal again, sign in with your email and password.
