# Data Dictionary: Events & Properties

## Introduction

The **Data Dictionary** is the foundation of your tracking plan. It consists of **Events** (user actions you track), **Properties** (data points attached to those events or to the user/profile), and **Sources** (where the data originates—e.g. Web, iOS, Android). This document focuses on how to define **properties** and their **types**, and how they attach to events with **presence** rules that drive code generation and QA validation.

---

## Properties: Context and Types

Properties are defined once per workspace and can be scoped as:

- **Event property** — Sent with a specific event (e.g. `order_id` with a `purchase` event).
- **User property** — Stored on the user profile (e.g. `plan_type`, `signup_date`).
- **System property** — Platform or SDK metadata (e.g. device type, app version).

Each property has a **name** (e.g. `snake_case` per your audit rules), **data type** (string, integer, float, boolean, object, list), optional **description**, **category**, **PII status**, and **example values**. These fields ensure that implementers and downstream systems interpret the data correctly.

---

## Presence: Always Sent vs. Sometimes Sent

When you **attach a property to an event**, you assign a **presence** value. This is critical for code generation and validation:

- **Always Sent** — The property must be included every time the event fires. Code snippets and validation expect this key to be present.
- **Sometimes Sent** — The property may be included depending on context. In generated code it appears with a `// Optional:` comment; validation does not require it.
- **Never Sent** — The property is defined for documentation or future use but is not emitted with this event. It is omitted from snippets.

In the application UI, presence is shown with badges next to each attached property. Below is how those badges appear.

### Always Sent badge

<span class="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">Always Sent</span>

### Sometimes Sent badge

<span class="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">Sometimes Sent</span>

Use these consistently when attaching properties to events so that generated code and QA validation match your specification.

---

## Example: Event with Properties Attached

Suppose you have an event **`purchase_completed`** with three attached properties: **`order_id`** (Always Sent), **`total_value`** (Always Sent), and **`coupon_code`** (Sometimes Sent). The system will generate snippets that include `order_id` and `total_value` as required, and `coupon_code` as optional.

A **mock JSON payload** for that event might look like this:

```json
{
  "event": "purchase_completed",
  "order_id": "ORD-88492",
  "total_value": 129.99,
  "coupon_code": "SAVE10"
}
```

For validation, the portal checks that **always_sent** keys (`order_id`, `total_value`) are present. If `coupon_code` is missing, the payload is still valid; if `order_id` or `total_value` is missing, validation returns **invalid** and lists the missing keys.

---

## Summary

- Define **properties** with clear context (event / user / system), type, and metadata.
- Attach properties to **events** with the correct **presence** (Always Sent, Sometimes Sent, Never Sent).
- Use the **badges** in the UI to confirm presence at a glance.
- Rely on the Data Dictionary as the single source of truth for **CodeGen** and **QA Validation** in the Journey Builder and Export.
