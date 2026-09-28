---
updatedAt: 2026-07-29T08:00:39.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Data mapping

This guide explains how to connect your custom naming conventions to Bloomreach’s predefined formats via data mapping.

## What is Data mapping

Data mapping connects your custom naming conventions to Bloomreach's predefined formats. This lets you keep your existing event names, customer properties, and catalog structure while ensuring Bloomreach features work seamlessly.

## Data mapping use cases

Use data mapping to:

* Deploy use cases without restructuring your data.
* Clone content between projects while retaining custom naming.
* Power recommendation and prediction engines.
* Set up predictive campaigns faster.

## Events

This section lets you map your custom events to the predefined events in Bloomreach. After selecting a specific event, you can further refine the event attributes.

Supported events include:

* `Purchase`
* `Purchase item`
* `Add to cart`
* `Remove from cart`
* `View item`
* `View category`
* `Return item`
* `Search`
* `Add to wishlist`
* `Remove from wishlist`

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/8b12fb1-data_mapping_events.jpg",
        "data mapping events.jpg",
        "Events data mapping table showing custom ecommerce events mapped to predefined events like purchase and add to cart."
      ],
      "align": "center",
      "sizing": "80",
      "border": true
    }
  ]
}
[/block]

> 🚧 Permissioned access to campaign event settings
>
> Campaign settings require permission access. Discuss any mapping changes with your Account Manager before making them.

## Customer properties

Map specific customer properties to Bloomreach's predefined format. For example: `first_name` or `last_name`.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/2021d83-data_mapping_customer_properties.jpg",
        "data mapping customer properties.jpg",
        "Customer properties mapping view aligning custom profile attributes to attributes such as first_name and last_name."
      ],
      "align": "center",
      "sizing": "80",
      "border": true
    }
  ]
}
[/block]

## Email mapping

Email mapping doesn't affect campaign functionality. Email campaigns always use the `email` property as the recipient (unless a custom recipient is configured), regardless of mapping.

## Catalogs

The **Catalogs** section lets you map your product catalog structure to Bloomreach's predefined format. This includes selecting your main catalog and mapping reserved fields so that features like recommendations, use cases, and templates work correctly.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/0dff671-data_mapping_catalogs.jpg",
        "data mapping catalogs.jpg",
        "Catalogs mapping interface showing product catalog attributes mapped to item collection fields used for recommendations and analytics."
      ],
      "align": "center",
      "sizing": "80",
      "border": true
    }
  ]
}
[/block]

### Main catalog

Each project uses one catalog as its primary product catalog. This catalog represents your complete set of sellable products.

Go to **Data & Assets** > **Data Manager** > **Mapping** > **Catalogs** and choose the catalog that represents your complete set of sellable products. Typically, this is your variant catalog.

If your project has multiple catalogs, you select the catalog a given recommendation or template uses during recommendation setup or catalog lookups. The main catalog selection also determines which catalog the Use Case Center defaults to.

### Configure catalog attributes

How you configure catalogs depends on whether you have Data hub [integration](https://documentation.bloomreach.com/data-hub/docs/data-hub-overview).

#### Non-data hub integrations

1. Go to **Data & Assets** > **Data manager** > **Mapping** > **Catalogs**.
2. Map relevant fields to Bloomreach’s reserved attributes.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/0c43eb8e5e3370c39b039d6b41a1e9bfd5cea3f42b2da26bf66548e06d0a30f4-Configure_catalog_attributes_for_non_data_hub_integrations.png",
        "",
        "Data manager mapping view showing the Columns panel used to map catalog attributes—item ID, URL, stock level, price, title, category levels, brand, and discount fields—for a non-integration."
      ],
      "align": "center",
      "sizing": "80% ",
      "border": true
    }
  ]
}
[/block]

Review the article on [creating legacy catalogs](https://documentation.bloomreach.com/engagement/docs/create-legacy-catalogs).

#### Data hub integrations

The effective main product catalog is the [item collection](https://documentation.bloomreach.com/data-hub/docs/item-collection) configured as the product [catalog destination](https://documentation.bloomreach.com/data-hub/docs/create-destinations#how-engagement-destinations-work) for your project. [Schema mapping](https://documentation.bloomreach.com/data-hub/docs/item-collection-schema) in Data hub, including system attributes, is the source of truth for reserved fields.

1. In Data hub, go to the **Schema** tab of your item collection.
2. Configure the [system attributes](https://documentation.bloomreach.com/data-hub/docs/items-system-attributes).

Review the article on creating and managing Data hub [catalogs](https://documentation.bloomreach.com/engagement/docs/data-hub-catalogs).