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

Each mapping role can be held by only one catalog per project. A catalog lists its **fields** (columns) and marks which one is the **lookup key**.

## Why the roles matter

The mapping role is what the Bloomreach data mapping import and export use, and the `unmapped_catalog` finding is raised when a catalog in the definitions has no counterpart in the applied mapping. Requirements of kind `catalog_attribute` refer to a field of the main catalog by name.

Record the source system, owner and update frequency of each catalog in its description or owner field. Without them a catalog is a black box for lineage, freshness and audits.
