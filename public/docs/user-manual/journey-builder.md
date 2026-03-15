# Journey Builder: Visual Canvas & CodeGen

## Introduction

The **Journey Builder** is a canvas-based editor where you design **user flows** by placing **step nodes** (screens or actions, often with screenshots) and **trigger nodes** (tracking events). Edges connect steps to triggers so that the flow reads left-to-right: *after this step, this event fires*. Each trigger is **linked to an event** from your Data Dictionary; that link is what drives **Code Snippets** and **Export** content for that event.

This document explains how triggers connect to events on the canvas and how the **Code Snippets** interface presents implementation-ready code—including the exact **exponea.track()** (Bloomreach Web SDK) output.

---

## Triggers and Events on the Canvas

- **Step node** — Represents a screen or action in the flow. You can add a label, description, screenshot, and (for automation) a target element. Each step can be tagged with an **implementation type**: **New**, **Enrichment**, or **Fix**, which is summarized in the journey’s **Scope** (e.g. 4 New, 2 Enr, 1 Fix).

- **Trigger node** — Represents a tracking event that fires at this point in the flow. You **connect an event** from the Data Dictionary (by selecting it in the trigger’s “Connect Event” control). Once connected, the trigger displays the event name (and optional variant), and the **Code Snippets** panel in the right sidebar shows the three implementation styles for that event.

Connections are made by **drawing edges** from a step node’s right handle to a trigger node’s left handle. The graph is saved with **Save Layout**; the backend derives **journey_events** and **type_counts** from the canvas for storage and reporting.

---

## Code Snippets Interface

When a trigger node with a connected event is selected, the right sidebar shows a **Code Snippets** section. The interface uses **tabs** to switch between three styles: **dataLayer**, **Bloomreach SDK**, and **Bloomreach API**. Below is a mock of that interface: a gray header with tabs and a code block underneath.

<div class="rounded-xl overflow-hidden shadow-sm border border-gray-200 my-6">
  <div class="px-4 py-2 bg-gray-200 border-b border-gray-300 flex justify-between items-center">
    <span class="text-xs font-semibold text-gray-600">Code Snippets</span>
  </div>
  <div class="flex gap-1 p-2 bg-gray-100 border-b border-gray-200">
    <span class="px-3 py-1.5 text-xs font-medium rounded-md bg-white text-gray-900 shadow-sm">dataLayer</span>
    <span class="px-3 py-1.5 text-xs font-medium rounded-md text-gray-600">Bloomreach SDK</span>
    <span class="px-3 py-1.5 text-xs font-medium rounded-md text-gray-600">Bloomreach API</span>
  </div>
  <div class="px-4 py-2 bg-gray-100 border-b border-gray-200 flex justify-end">
    <span class="text-xs text-gray-500">Copy</span>
  </div>
  <pre class="p-4 text-[13px] font-mono text-gray-800 bg-[#2A2A2A] text-[#E0E0E0] overflow-x-auto whitespace-pre-wrap leading-relaxed m-0"><code>window.dataLayer.push({
  event: 'purchase_completed',
  order_id: '&lt;value&gt;',
  total_value: '&lt;value&gt;',
  // Optional:
  coupon_code: '&lt;value&gt;',
});</code></pre>
</div>

*Mock of the Code Snippets block: tabs for dataLayer | Bloomreach SDK | Bloomreach API, with a code block below. This example shows the dataLayer style.*

---

## Generated Bloomreach Web SDK Code

When you switch to the **Bloomreach SDK** tab, the same event and properties are rendered as an **exponea.track()** call. Always-sent properties appear as required keys; sometimes-sent properties appear with a `// Optional:` comment above the line.

Example for the event **`purchase_completed`** with **`order_id`** and **`total_value`** (Always Sent) and **`coupon_code`** (Sometimes Sent):

<pre class="p-4 text-[13px] font-mono bg-[#1e293b] text-[#e2e8f0] rounded-lg overflow-x-auto my-6"><code>exponea.track('purchase_completed', {
  order_id: '&lt;value&gt;',
  total_value: '&lt;value&gt;',
  // Optional:
  coupon_code: '&lt;value&gt;',
});</code></pre>

Implementers copy this snippet, replace `<value>` placeholders with variables or literals, and integrate it into their site or app. The **Bloomreach API** tab shows the equivalent JSON body and cURL example for the server-side Tracking API.

---

## Export and Implementation Examples

When you **export a journey to HTML**, each trigger in the document gets an **Implementation examples** section. That section includes the same three styles (GTM dataLayer, Bloomreach Web SDK, Bloomreach Tracking API) so that the offline brief is fully aligned with what the portal shows in the Code Snippets UI. Typography and branding (E3 logo, footer, DM Sans) are applied to the exported HTML for a consistent, client-ready deliverable.

---

## Summary

- **Step nodes** and **trigger nodes** are connected by edges; triggers are **linked to events** from the Data Dictionary.
- The **Code Snippets** panel (tabs: dataLayer | Bloomreach SDK | Bloomreach API) shows implementation-ready code for the trigger’s event.
- **exponea.track(eventName, { ...props })** is the Bloomreach Web SDK form; always-sent and sometimes-sent properties are reflected with optional comments where appropriate.
- **Export** repeats these implementation examples in the HTML brief so strategy and implementation stay in sync.
