# Workspace Management

## Overview

Workspaces in the E3 Tracking Portal isolate each client’s or project’s tracking plan: **Events**, **Properties**, **Sources**, and **Journeys** all belong to a single workspace. This page explains how to create workspaces, how **Client Portfolio** grouping organizes them in the switcher, and how to use **Master Templates** to speed up onboarding for new clients.

---

## Client Portfolio (grouped switcher)

The **Workspace Switcher** in the header groups workspaces by **Client Name** so you can scan by client instead of a flat list.

- Each workspace can have an optional **Client Name** (set when creating the workspace or later in **Settings → General**).
- The dropdown shows **small, subtle section headers** in E3 Space Blue (slightly dimmed), with workspace names listed underneath each client.
- Workspaces without a client name are grouped under **Internal Projects** at the bottom.

The header display uses the format **Client Name › Workspace Name** (e.g. *Acme Corp › Web Tracking*). If there is no client name, only the workspace name is shown.

### Grouped dropdown (UI reference)

The following is a **static Tailwind HTML mock** of how the grouped Workspace Switcher dropdown looks. Client headers use Space Blue with reduced opacity; project names are indented beneath each header.

<div class="rounded-lg border border-gray-200 shadow-lg py-1 min-w-[220px] my-4 max-w-sm" style="background-color: #EEEEE3;">
  <div class="px-3 py-1.5 text-xs font-medium uppercase tracking-wider" style="color: #1A1E38; opacity: 0.75;">Acme Corp</div>
  <div class="pl-5 pr-4 py-2 text-sm text-gray-700">Web Tracking</div>
  <div class="pl-5 pr-4 py-2 text-sm text-gray-700">Mobile App Events</div>
  <div class="px-3 py-1.5 text-xs font-medium uppercase tracking-wider mt-1" style="color: #1A1E38; opacity: 0.75;">Beta Inc</div>
  <div class="pl-5 pr-4 py-2 text-sm text-gray-700">Analytics Workspace</div>
  <div class="px-3 py-1.5 text-xs font-medium uppercase tracking-wider mt-1" style="color: #1A1E38; opacity: 0.75;">Internal Projects</div>
  <div class="pl-5 pr-4 py-2 text-sm text-gray-700">Master Template</div>
  <div class="border-t border-gray-200 mt-1 pt-1">
    <div class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium" style="color: #0DCC96;">+ Create New Workspace</div>
  </div>
</div>

*Above: Mock of the grouped Workspace Switcher. Background E3 White (#EEEEE3); client headers in Space Blue (#1A1E38) at 75% opacity; project rows indented with pl-5.*

---

## Master Templates: The E3 Approach

A common pattern is to maintain a **Master Workspace** (or several) that act as **templates**. For example:

- **eCommerce Master** — Events like `Product Viewed`, `Add to Cart`, `Checkout Started`, `Purchase`; properties such as `product_id`, `revenue`, `currency`; and the right **Always Sent** / **Sometimes Sent** rules already wired.
- **Content / Media Master** — Events and properties tuned for content consumption and engagement.
- **Lead Gen Master** — Forms, page views, and conversion events with a minimal, consistent schema.

When you onboard a **new client**, you create a **new workspace** and choose **Start from Template** → your eCommerce Master (or another template). The portal **clones** the template’s core schema into the new workspace:

- **Sources** (e.g. Web, iOS, Android) are copied and new IDs are assigned.
- **Properties** are copied with the same predefined values and types.
- **Events** are copied.
- **Event–Property links** (Always Sent / Sometimes Sent) are preserved.

**Journeys, journey steps, and QA runs are not cloned.** You get a clean Data Dictionary and event–property structure; journeys and QA are specific to each client and are created in the new workspace as needed.

This “define once, clone for each client” approach saves time, keeps schemas consistent across clients, and lets you refine the master over time and reuse it for future projects.

---

## Creating a New Workspace

Use the **Workspace Switcher** in the header (top right) and click **Create New Workspace**. A modal opens where you:

1. Enter a **Workspace Name** (required), e.g. *Acme Corp Tracking*.
2. Optionally enter a **Client Name** (e.g. *Acme Corp*) so the workspace appears under that client in the portfolio switcher. If left blank, it will appear under **Internal Projects**.
3. Choose **Start from Template**:
   - **Blank Workspace** — empty Events, Properties, and Sources; you build from scratch.
   - Any **existing workspace** — the system clones that workspace’s sources, properties, events, and event–property rules into the new workspace (as described above).

After you click **Create Workspace**, the new workspace is created and the app switches your active context to it. You can then add or edit events, properties, and journeys in that workspace.

---

## Create Workspace Modal (UI Reference)

The following is a **static Tailwind HTML mock** of the Create Workspace modal for reference. In the live app, the dropdown is populated with your existing workspaces.

<div class="rounded-xl border border-gray-200 overflow-hidden shadow-xl my-6 max-w-md mx-auto">
  <div class="px-6 py-4 border-b flex items-center justify-between" style="background-color: #1A1E38;">
    <h3 class="text-lg font-semibold" style="color: #EEEEE3;">Create New Workspace</h3>
    <button type="button" class="p-1.5 rounded hover:bg-white/10 transition-colors" style="color: #EEEEE3;" aria-label="Close">×</button>
  </div>
  <div class="p-6 space-y-4" style="background-color: #EEEEE3;">
    <div>
      <label for="doc-workspace-name" class="block text-sm font-medium text-gray-700 mb-1">Workspace Name <span class="text-red-500">*</span></label>
      <input id="doc-workspace-name" type="text" placeholder="e.g. Acme Corp Tracking" class="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900" readonly />
    </div>
    <div>
      <label for="doc-workspace-client" class="block text-sm font-medium text-gray-700 mb-1">Client Name (optional)</label>
      <input id="doc-workspace-client" type="text" placeholder="e.g. Acme Corp" class="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900" readonly />
      <p class="text-xs text-gray-500 mt-1">Used for portfolio grouping in the workspace switcher.</p>
    </div>
    <div>
      <label for="doc-workspace-template" class="block text-sm font-medium text-gray-700 mb-1">Start from Template</label>
      <select id="doc-workspace-template" class="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#0DCC96] focus:ring-1 focus:ring-[#0DCC96]">
        <option value="">Blank Workspace</option>
        <option value="template-1">eCommerce Master</option>
        <option value="template-2">Content &amp; Media Master</option>
      </select>
    </div>
    <div class="flex gap-3 pt-2">
      <button type="button" class="flex-1 h-10 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
      <button type="submit" class="flex-1 h-10 rounded-md text-sm font-medium text-white hover:opacity-90" style="background-color: #0DCC96;">Create Workspace</button>
    </div>
  </div>
</div>

*Above: Mock of the Create Workspace modal. Header uses E3 Space Blue (#1A1E38); panel uses E3 White (#EEEEE3). Primary button uses E3 Emerald (#0DCC96). Client Name is optional and used for portfolio grouping.*

---

## Summary

- **Workspaces** isolate Events, Properties, Sources, and Journeys per client or project.
- **Client Portfolio** grouping in the Workspace Switcher shows workspaces by Client Name (with **Internal Projects** for those without a client). The header shows **Client Name › Workspace Name** when a client is set.
- **Master Templates** are existing workspaces you clone from to create new workspaces with a pre-defined schema.
- Use **Create New Workspace** from the Workspace Switcher; optionally set **Client Name** for grouping, then choose **Blank Workspace** or an existing workspace as the template.
- Cloning copies **sources, properties, events, and event–property rules**; it does **not** copy journeys, journey steps, or QA runs.
