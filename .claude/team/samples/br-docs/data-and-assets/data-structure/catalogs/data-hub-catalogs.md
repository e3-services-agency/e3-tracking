---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Data hub catalogs

This guide introduces you to Data hub catalogs.

Catalogs with Data hub integration offer an [enhanced catalog system](https://documentation.bloomreach.com/engagement/docs/data-hub-versus-legacy-catalogs) that provides improved performance, reliability, and flexibility for managing both product and non-product business data, such as marketing assets, content items, or custom lookup tables.

## Prerequisites

* Review the [Catalogs](https://documentation.bloomreach.com/engagement/docs/catalogs) article to understand the high-level concept of catalogs.
* Ensure your workspace is Data hub enabled.

## Key concepts

Understanding these core concepts helps you work effectively with Data hub catalogs:

### Catalogs

Catalogs are containers for your business data, such as marketing assets or custom content.

### Records

Raw data entities within a catalog that can be added or modified. Records are flexible and can contain any valid JSON data. Records aren't directly exposed to Bloomreach applications, only items.

### Items

Processed, strongly typed entities generated from records by applying the catalog's configuration settings. Items are what Bloomreach applications interact with. Items can't be modified directly. They can only be modified through schema changes.

### Schema

Schema maps records to items using attribute definitions.

### Jobs

Operations that track the progress of data updates and configuration changes.

## Create and manage Data hub catalogs

* **General catalogs**: Visit the Data hub catalogs [setup guide](https://documentation.bloomreach.com/engagement/docs/create-and-manage-catalogs) to learn more about setting up and working with Data hub catalogs for non-product data.
* **Product catalogs**: Manage product data using Data hub [Item collections](https://documentation.bloomreach.com/data-hub/docs/item-collection).

## Frequently asked questions

### How can I migrate from legacy to Data hub catalogs?

If you have legacy catalogs in your project and would like to upgrade, you must enable Data hub and set up the catalogs from scratch. Once created, update your project references to use the new catalogs.

#### General catalogs

* Recreate the legacy catalog as a new general catalog in the same project. Visit the [setup guide](https://documentation.bloomreach.com/engagement/docs/create-and-manage-catalogs).

* Update any [campaign](https://documentation.bloomreach.com/engagement/docs/campaigns), [scenario](https://documentation.bloomreach.com/engagement/docs/introduction-to-scenarios), [recommendation](https://documentation.bloomreach.com/engagement/docs/recommendations), or templates that referenced the legacy catalog to use the new catalog identifier. Use the **Show usages** option to view where a catalog is used across the app.

#### Product catalogs

Recreate the legacy product catalog as a new [Item collection](https://documentation.bloomreach.com/data-hub/docs/item-collection) in Data hub. Update the applications that reference the legacy catalog to use the new catalog.

### Can I clone a legacy catalog into a Data hub catalog?

#### General catalogs

[Cloning](https://documentation.bloomreach.com/engagement/docs/cloning) a legacy catalog creates another legacy catalog. To upgrade to Data hub catalogs, create a new general catalog and follow the steps to migrate.

#### Product catalogs

[Cloning](https://documentation.bloomreach.com/engagement/docs/cloning) a product catalog creates a catalog that isn't connected to any [item collection](https://documentation.bloomreach.com/data-hub/docs/item-collection).

To upgrade to Data hub catalogs, [create a new item collection](https://documentation.bloomreach.com/data-hub/docs/how-to-set-up-an-item-collection) instead.

### Where can I configure schema and attribute mappings in Data hub catalogs setup?

It depends on whether you want to configure a product or a general catalog:

#### General catalogs

Define the data schema and searchable attribute [configurations](https://documentation.bloomreach.com/engagement/docs/configure-schema-and-searchable-attributes) under **Data & Assets > Catalogs > Schema**.

#### Product catalogs

* Change the searchable attributes under **Data & Assets > Catalogs > Attributes**.
* Define the data schema changes in the item collections [schema](https://documentation.bloomreach.com/data-hub/docs/configure-schema).