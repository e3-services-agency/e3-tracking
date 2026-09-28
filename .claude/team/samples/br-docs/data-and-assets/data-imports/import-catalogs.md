---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Import catalogs

[Catalogs](https://documentation.bloomreach.com/engagement/docs/catalogs) are lookup tables that store structured data, such as products, articles, and other reference data that your campaigns and recommendations depend on. Importing catalogs lets you bring this data into the platform and keep it up to date.

This guide walks you through each step of the catalog import process, from choosing a catalog type and data source to mapping your columns and setting searchable fields.

## Prerequisites

* Read the [Imports article](https://documentation.bloomreach.com/engagement/docs/data-import) to understand how imports work, what sources are available, and how to monitor import progress.

* Decide whether you're importing a general catalog or a product catalog.

* Catalog names must use a single word with no spaces.

* Catalogs should never contain personally identifiable information (PII) such as emails or phone numbers.

* `item_id` values should not include `/`. Catalog items with `/` in their `item_id` can't be edited via the [Catalog API](https://documentation.bloomreach.com/engagement/reference/catalog-api-overview-2) and return a 403 error.

## Steps to import legacy catalogs 

To start a catalog import for non-Data hub integrations:

1. Go to **Data & Assets** > **Imports** > **+ New import** > **+ New catalog**. 

2. This redirects you to the **Catalogs** page. Follow the guide to [create and manage legacy catalogs](https://documentation.bloomreach.com/engagement/docs/create-and-manage-catalogs).

## Steps to import Data hub catalogs 

To start a catalog import for Data hub integrations:

1. Go to **Data & Assets** > **Imports** > **+ New import** > **+ New catalog**. 

2. This redirects you to the **Catalogs** page. Follow the guide to create and manage Data hub [catalogs](https://documentation.bloomreach.com/engagement/docs/data-hub-catalogs).

## Limitations

* Catalogs that haven't been accessed or imported to in the previous 90 days are automatically deleted. Associated scenarios remain editable.

* Downloading and exporting catalogs isn't possible.