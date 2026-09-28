---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Create legacy catalogs

This guide explains how to set up and manage legacy catalogs with non-Data hub integrations and Data hub enabled workspaces still using the legacy catalogs workflow.

## When to use legacy catalogs

Legacy catalogs are relevant if you have one of these:

* **Non-Data hub integrations**: Your workspace isn't Data hub enabled. Follow the standard creation workflow.

* **Data hub enabled workspace using legacy catalogs workflow**: Your workspace has been upgraded to Data hub, but your workflows still use legacy catalogs. Contact your Bloomreach representative to enable the legacy catalog module for your workspace so you can continue working with catalogs as before while you plan your transition to Data hub catalogs. You then see a **legacy** toggle in the Catalogs interface.

## Prerequisites

Before you begin, ensure you have the appropriate permissions.

## Steps to create legacy catalog

The following steps illustrate the standard legacy catalogs creation workflow:

### 1. Create a new catalog

1. To start a catalog import, go to **Data & Assets** > **Imports** > **+ New import** > **+ New Catalog**.
2. This redirects you to the Catalogs page. Click **+ New catalog**. For Data hub enabled workspaces, toggle ON the **legacy** mode.
3. Name the catalog.

### 2. Choose a data source

Select the source your catalog data is coming from. All standard import sources are supported. For details, see Data sources.

After selecting your source, click **Preview data** to confirm the format looks correct. If the preview looks off, check that the right delimiter and encoding are selected. Click **Next**.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/b874c512d8bbadba5f1a3fb457c731fba1a8a7c4f0d96cba7c3478b7e5b167a5-image2.png",
        null,
        "Preview data to confirm the format looks correct"
      ],
      "align": "center",
      "border": true,
      "caption": "Preview data to check format"
    }
  ]
}
[/block]

### 3. Map your data

#### Select catalog type

The platform supports two catalog types. Choose **Product catalog** at the top of the mapping screen if you're importing a product catalog. This displays additional tags to assign to your columns.

#### Assign required IDs

At least one ID tag must be assigned:

* **General catalogs:** Only item\_id is available and mandatory.

* **Product catalogs:** Two IDs are available — item\_id and product\_id. A single product (product\_id) can have multiple variants, each with its own item\_id. For example, "iPhone X Case" with product\_id "123" can have separate item\_id values for black, white, and green variants.

[block:image]{"images":[{"image":["https://files.readme.io/bb6b59fc57185703aa532e0ca9dea7ece71fb3dd586fa7088d2fe8aa594da6c5-image3.png",null,"Map data per the catalog type"],"align":"center","border":true,"caption":"Map data and set data types"}]}[/block]

#### Set data types

Set the correct data type for each column — text, number, date, and more. Data types affect how the platform filters and displays values. Each data type is explained in the [Data manager](https://documentation.bloomreach.com/engagement/docs/data-manager) article.

### 4. Set searchable fields

If you're importing a catalog for the first time, select which fields are searchable. Searchable fields are indexed in the platform's search and are the basis for recommendations. For example, to make product recommendations based on brand, the brand column must be set as searchable.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/d81341cebb62132a13a98b55a3a75fe731f938bebf13f9304fac58722e50e4f4-image1.png",
        null,
        "Select which fields are searchable."
      ],
      "align": "center",
      "sizing": "600px",
      "border": true,
      "caption": " Set searchable fields"
    }
  ]
}
[/block]

Searchable field limits:

* Searchable fields can only be defined on first import. To add more searchable columns later, reimport the data to a new catalog.
* A maximum of 40 columns can be set as searchable.
* List and JSON fields cannot be set as searchable.

### 5. Schedule a repeated import (optional)

If you're importing from a dynamic source — Database, URL, or Bloomreach — you can schedule repeated imports. For details, see [Schedule a repeated import](https://documentation.bloomreach.com/engagement/docs/data-import#schedule-repeated-imports).

### 6. Run the import

Complete the wizard steps to start the import. Check the status in the import list by clicking **Refresh**. Large files take more time to process.

You can monitor progress using the two-stage progress bar. Data is available only after both the import and processing stages are complete. For details, see [Track import progress](https://documentation.bloomreach.com/engagement/docs/data-import#track-import-progress).