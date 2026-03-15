# Product Requirements — E3 Tracking Implementation Portal

## Overview

The **E3 Tracking Implementation Portal** is an enterprise-grade application that bridges the gap between **data strategy** and **developer implementation**. It enables data teams and agencies to define tracking plans (events, properties, sources), design implementation journeys visually, generate client-ready code snippets, and validate payloads—all in one place.

**Business problem:** Organizations often have a clear analytics and tracking strategy on paper, but handoff to engineering is fragmented: spreadsheets, static docs, and ad-hoc tickets lead to inconsistent implementation, missed properties, and costly rework. The portal turns the tracking plan into a **single source of truth** and delivers implementation-ready artifacts (code, exports, QA checks) so developers can integrate tracking correctly the first time.

---

## Core Features

### 1. Data Dictionary (Events & Properties)

- **Events:** Define tracked user actions with name, description, and optional trigger documentation. Events are workspace-scoped and support naming and audit rules.
- **Properties:** Define event, user, and system properties with context, data type, PII status, categories, and example values. Properties are attached to events with **presence** (Always sent, Sometimes sent, Never sent), which drives code generation and validation.
- **Sources:** Categorize where data originates (e.g. Web, iOS, Android) and associate them with events and properties for lineage and handoff clarity.

Together, events and properties form the **data dictionary** that underpins all code generation, exports, and QA validation.

### 2. Visual Journey Builder

- **Canvas-based editor** built with React Flow. Users design flows by adding **step nodes** (screenshot, label, description, target element for automation) and **trigger nodes** (linked to events from the data dictionary).
- **Implementation type** per step: each step can be tagged as **New**, **Enrichment**, or **Fix** for scope reporting. The system aggregates counts (e.g. 4 New, 2 Enrichment, 1 Fix) and persists them for dashboard and export.
- **Notes and annotations** support documentation and visual callouts on the canvas. Layout (nodes and edges) is persisted to the backend and can be shared via a read-only link.

### 3. CodeGen (Implementation Snippets)

- **Multi-style code generation** for every event:
  - **GTM dataLayer:** `window.dataLayer.push({ event: 'event_name', ...props });`
  - **Bloomreach Web SDK:** `exponea.track('event_name', { ...props });`
  - **Bloomreach Tracking API:** JSON body and cURL example for `POST /track/v2/projects/{token}/customers/events`.
- **Property presence** is respected: always-sent properties appear in the snippet; sometimes-sent properties are included with a `// Optional:` comment so implementers know what is required vs. optional.
- Snippets are available in the **Event Detail** view (Code Snippets section), in the **Journey Sidebar** when a trigger with an event is selected, and in the **HTML Export** for each trigger.

### 4. Export

- **Journey HTML Export:** Standalone HTML implementation brief including journey name and description, testing instructions, steps with screenshots and implementation-type badges, and for each trigger: **Implementation Examples** (dataLayer, Bloomreach SDK, Bloomreach API) instead of raw JSON only.
- **Branding:** Export header uses the agency light logo; footer displays “Powered by E3 | ENABLE. EMPOWER. ELEVATE.” Typography uses DM Sans for a consistent, professional look.
- Export is intended for handoff to clients or developers and for offline reference.

### 5. QA Validation

- **Payload validation** per event: given a JSON payload (e.g. pasted from the browser or a tool), the system checks that all **always_sent** properties for that event are present. Returns `{ valid: true }` or `{ valid: false, missing_keys: string[] }`.
- Integrated into the **Journey** experience: when a trigger node is connected to an event, users can validate payloads during QA runs and attach verification status (Pass/Fail) and notes to the node.
- QA runs and evidence can be persisted and reviewed for audit and sign-off.

---

## Target Users

- **Data strategists / analysts:** Define events and properties, set presence rules, and maintain the data dictionary.
- **Implementation / solutions engineers:** Use the journey builder and code snippets to implement tracking in GTM, Bloomreach, or other systems.
- **QA and delivery:** Validate payloads against the plan and record results on the journey canvas.
- **Agency and client stakeholders:** Consume exported briefs and shared read-only journey links for alignment and handoff.

---

## Success Criteria

- A single, authoritative tracking plan (events + properties + journeys) that stays in sync with implementation and QA.
- Reduced back-and-forth between strategy and engineering thanks to clear, copy-paste-ready code and structured exports.
- Traceability from strategy (data dictionary) to implementation (steps and triggers) to validation (QA payload checks).
