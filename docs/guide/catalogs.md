# Catalogs

## Events versus catalogs

| | Events | Catalogs |
| --- | --- | --- |
| Nature | Point-in-time facts (something happened) | Mutable lookup and reference data |
| Examples | `view_item`, `purchase`, `cart_update` | Product catalog, variant (SKU) catalog |
| Typical use | Reporting, analytics, journey triggers | Personalization, enrichment, joins |
| Change over time | Append-only | Updated in place (name, price, category) |

Events answer what happened; catalogs answer what is the current state of an entity. Documenting both shows how an event property such as `item_id` is the lookup key into a catalog.

## What a catalog records

On the Catalogs page each catalog has a name, description, owner, priority, status and a **mapping role**:

- **main**: the catalog Bloomreach uses as the product (main) catalog in its data mapping.
- **variant**: the catalog Bloomreach uses at variant (SKU) level.
- empty: any other lookup table.

Each mapping role can be held by only one catalog per project. A catalog lists its **fields** (columns) and marks which one is the **lookup key**. Fields are edited in one table, one row per field (drag or use the arrows to reorder; one lookup key, which must be a string; "Searchable n/40" warns at the limit); changes are saved with the catalog.

## Why the roles matter

The mapping role is what the Bloomreach data mapping import and export use, and the `unmapped_catalog` finding is raised when a catalog in the definitions has no counterpart in the applied mapping. Requirements of kind `catalog_attribute` refer to a field of the main catalog by name.

Record the source system, owner and update frequency of each catalog in its description or owner field. Without them a catalog is a black box for lineage, freshness and audits.

## One catalog per market

A shop that sells in several markets usually has a product and a variant catalog per market and language, with the same fields but market-specific prices, currencies and URLs. Give each catalog a **kind** (product, variant, other), a **market** (for example GB), a **language** (en-GB) and a **version** (v1 or v2). The two mapping roles stay single per project; give them to the default market's pair.

Catalogs of the same kind must share one schema. After you add or change fields, the **Catalogs** comparison checks:

- searchable fields: a warning at 40, an error above 40 (the Bloomreach limit);
- v1 catalogs: use **Mark live** when the catalog goes live. On v1 the searchable fields are fixed from then on, so a later change is an error;
- the lookup key: exactly one per catalog. The key is the `item_id` column, which Jinja cannot read (it reads only catalog properties), so every product or variant catalog also needs a regular field with the same value, named `product_id` or `variant_id`; if the key field already has that name, rename it to `item_id` first;
- schema drift: a field present in one market and missing in another, or with a different type or searchable flag, is a warning;
- links: a property linked to a catalog field must have the same data type, and `product_id`, `variant_id` and `item_id` properties should link to the lookup key of their catalog kind (pick it in the **Catalog field** select of the property editor).

A use case requirement for a catalog attribute is satisfied when every catalog of the main catalog's kind has the field; if a market lacks it, the requirement is created as a gap that names the markets.

## Sources

On the **Sources** page record each source as a system (Shopify, a custom backend, a mobile app, a CRM, ...) and how its data is collected (GTM data layer, direct Web SDK, Tracking API, Bloomreach integration, file import). The event editor shows "System via method", a Tracking API source makes a linked event server-side by default, and the project's **default source** (Settings) is linked to every new event that names none.
