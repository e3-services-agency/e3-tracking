# Getting Started

## Overview

The E3 Tracking Implementation Portal is an enterprise-grade application designed to **bridge the gap between data strategy and developer implementation**. It serves as the single source of truth for your tracking plan: events, properties, sources, and visual journeys. By centralizing definitions and generating implementation-ready artifacts (code snippets, HTML briefs, and validation rules), the portal ensures that strategy is delivered accurately to engineering and QA.

This guide introduces the **E3 Tracking methodology** and orients you to the workspace and navigation so you can use the tool effectively from day one.

---

## The E3 Tracking Methodology

Our methodology is built on three pillars:

1. **Define once, implement everywhere.** Events and properties are defined in the Data Dictionary with clear presence rules (Always Sent, Sometimes Sent, Never Sent). Code generation and validation consume this single definition—no duplicate specs or spreadsheets.

2. **Visualize the flow.** Journeys turn abstract event lists into concrete user flows. Steps (screens, actions) and triggers (events) are connected on a canvas, so implementers and QA see exactly where each event fires and what payload it carries.

3. **Validate and hand off.** Payload validation checks real JSON against the plan; exports produce client-ready HTML briefs with implementation examples. The portal closes the loop from strategy to sign-off.

Adopting this workflow reduces rework, improves consistency across platforms (web, mobile, backend), and gives stakeholders one place to reference the tracking plan.

---

## Workspace and Navigation

When you open the application, you are always working within a **workspace**. The workspace header anchors every view and reinforces co-branding between E3 and your client.

### Workspace Header

The top bar is the persistent workspace header. It uses the E3 Space Blue background and displays the agency logo, a divider, the label **Tracking Portal**, and on the right either the **client logo and name** (when workspace settings are configured) or a subtle **Internal Project** badge.

<div class="rounded-lg border border-gray-200 overflow-hidden shadow-sm my-6">
  <header class="flex items-center justify-between px-6 py-3" style="background-color: #1A1E38;">
    <div class="flex items-center gap-4">
      <img src="/branding/agency-logo.png" alt="E3" class="h-8 w-auto object-contain" />
      <div class="h-6 w-px bg-white/30" aria-hidden="true"></div>
      <span class="text-sm font-medium" style="color: #EEEEE3;">Tracking Portal</span>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-sm font-medium" style="color: #EEEEE3;">Acme Corp</span>
    </div>
  </header>
</div>

*Above: Mock of the workspace header. Left: E3 logo and "Tracking Portal." Right: Client name (e.g. "Acme Corp"). When no client is set, a small "Internal Project" badge appears instead.*

Use the **left sidebar** to switch between **Events**, **Properties**, **Sources**, **Journeys**, and at the bottom **Settings**, **Docs**, and **Documentation** (this Knowledge Base). The **Documentation** section is where you are now: living, HTML-enhanced guides that replicate UI elements inline for clarity.

---

## Next Steps

- **Data Dictionary:** Learn how to define [Events and Properties](data-dictionary.md) and how presence rules drive code generation and validation.
- **Journey Builder:** Learn how to build [visual journeys and use Code Snippets](journey-builder.md) for triggers and exports.
