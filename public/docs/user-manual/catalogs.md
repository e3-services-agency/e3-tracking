# Catalogs & Data Governance

## Overview

**Catalogs** in the E3 Tracking Portal document your CDP (Customer Data Platform) **lookup tables**—mutable reference data used for real-time personalization, enrichment, and reporting. This page explains the architectural difference between **Events** and **Catalogs**, why documenting **source system** and **sync method** is critical for data governance, and how to map event properties to catalog fields.

---

## Events vs. Catalogs: Why Both Matter

| | **Events** | **Catalogs** |
|--|------------|--------------|
| **Nature** | Point-in-time facts (something happened) | Mutable lookup/reference data |
| **Examples** | `Product Viewed`, `Purchase`, `Sign Up` | Product catalog, User attributes, Content metadata |
| **Typical use** | Reporting, analytics, journey triggers | Real-time personalization, enrichment, joins |
| **Change over time** | Immutable once sent (append-only) | Updated (e.g. product name, category, price) |

**Events** answer “what happened?” and drive reporting and journey flows. **Catalogs** answer “what is the current state of this entity?” and are used when you need to look up attributes (e.g. product name, category) at the time of an event or in a downstream system. Documenting both in the portal gives you a single place to see how event properties **map** to catalog fields (e.g. `product_id` on an event is the **lookup key** into the **Products** catalog).

---

## Why Source System and Sync Method Matter for Data Governance

For each catalog, the portal stores:

- **Source system** — Where the data lives (e.g. *Shopify*, *Akeneo PIM*, *Segment Profiles*).
- **Sync method** — How it is loaded (e.g. *Native Integration*, *SFTP*, *Batch API*).
- **Update frequency** — How often it is refreshed (e.g. *Real-time*, *Daily*, *On demand*).

Documenting these is **critical for data governance** because:

1. **Lineage** — Teams can see which system is the system of record and how data flows into the CDP.
2. **Freshness** — Update frequency sets expectations for how current the lookup data is (e.g. real-time vs. nightly).
3. **Ownership** — Combined with an **owner** field, it is clear who is responsible for the catalog and its sync.
4. **Compliance and audits** — Regulators and internal audit can trace catalog data back to source and sync process.

Without this metadata, catalogs are “black boxes” and governance, debugging, and handoffs become harder.

---

## Catalog Type: Product, Variant, and General

Each catalog has a **Catalog Type** to help your agency team distinguish how it is used:

- **Product** — Master product entity (e.g. one row per product line or parent product). In eCommerce, this is typically the "product" level: name, brand, category, and attributes shared across all variants (sizes, colors, etc.).
- **Variant** — SKU or variant level (e.g. one row per size/color combination). Events often send a *variant* ID (e.g. `sku_id`); the Variant catalog holds price, stock, and variant-specific attributes. The **Product** catalog holds the parent product; the **Variant** catalog links to it and adds variant-level fields.
- **General** — Any other lookup table (users, content, locations, etc.) that is not a product/variant hierarchy.

**In an eCommerce context:** Use **Product** for the main product catalog (one record per product) and **Variant** for the SKU/variant catalog (one record per purchasable SKU). Event properties like `product_id` map to the Product catalog; `variant_id` or `sku_id` map to the Variant catalog. This keeps reporting and enrichment consistent and makes it clear which catalog to use for which event property.

---

## Catalog Governance Card (UI Reference)

In the app, each catalog has a **Data governance** section that shows **Catalog Type**, source, sync, and frequency as badges. Below is a **static Tailwind HTML mock** of a Catalog Governance Card (with Type: Product in blue).

<div class="rounded-lg border border-gray-200 overflow-hidden p-4 bg-white my-6 max-w-md" style="font-family: DM Sans, sans-serif;">
  <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Data governance</div>
  <div class="flex flex-wrap gap-2">
    <span class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border bg-blue-100 text-blue-800 border-blue-200">Type: Product</span>
    <span class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">Source: Shopify</span>
    <span class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">Sync: Native App</span>
    <span class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">Frequency: Real-time</span>
  </div>
</div>

*Above: Mock of the Catalog Governance Card. The **Type** badge is blue for Product, purple for Variant, and gray for General. Other badges show Source, Sync, and Frequency. E3 uses Space Blue (#1A1E38) and Emerald (#0DCC96) for primary UI.*

---

## Mapping Event Properties to Catalog Fields

In the **Data Dictionary** (Properties), you can optionally **map** a property to a catalog field:

- **Select Catalog** — The lookup table (e.g. Products).
- **Select Field** — The column in that catalog (e.g. `category_level_1`).
- **Relationship type**:
  - **This property is the Lookup Key** — The event sends a value (e.g. `product_id`) that is used to *join* to the catalog (e.g. to look up product name or category).
  - **This property maps to the catalog field value** — The event property holds the *same* value as the catalog field (e.g. a copied or synced attribute).

Once mapped, the Properties table shows a badge such as **Maps to Products.category_level_1** so you can see at a glance which properties are tied to which catalog fields.

---

## Summary

- **Catalogs** document CDP lookup tables; **events** document point-in-time facts. Both are first-class in the portal.
- **Catalog Type** (Product, Variant, General) helps distinguish product/variant hierarchies from other lookup tables; use Product for master products and Variant for SKUs in eCommerce.
- Documenting **source system**, **sync method**, and **update frequency** for each catalog is essential for **data governance**, lineage, and ownership.
- Use **Catalog Mapping** in the Data Dictionary to link event properties to catalog fields (lookup key or mapped value) and keep governance and implementation aligned.
