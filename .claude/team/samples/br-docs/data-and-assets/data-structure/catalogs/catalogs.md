---
updatedAt: 2026-09-01T08:52:33.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Catalogs

Catalogs help you store and manage business data for marketing automation. This guide explains the types of catalogs available and how to use catalog data in campaigns and recommendations.

## What are catalogs

A catalog is a lookup table with one primary key item\_id that stores and manages business data for marketing automation. Ecommerce websites typically use catalogs to store products and related information, while publishing businesses use catalogs for articles and section details.

## Catalog types

Bloomreach offers two types of catalogs:

### General catalogs

A flexible lookup table for your project where item\_id is the only required attribute as the primary key. Define all other attributes based on your business needs.

### Product catalogs

Designed to store ecommerce product information with a predefined data structure that helps Bloomreach identify key product details for recommendations, inventory management, and stock level calculations.

## Create and manage catalogs

The way you create and manage catalogs depends on your integration. Non-Data hub integrations use the legacy catalogs system.

### Data hub integrations

Catalogs include the following:

#### Product catalogs

If you're Data hub enabled, create and manage product catalogs in Data hub using [item collections](https://documentation.bloomreach.com/data-hub/docs/item-collection). Once you create a product catalog in Data hub and connect it to your project as a [destination](https://documentation.bloomreach.com/data-hub/docs/item-collection-destinations), the catalog automatically appears in your catalogs listing.

#### General catalogs

Create general [catalogs](https://documentation.bloomreach.com/engagement/docs/create-and-manage-catalogs) directly within the **Catalogs** application. General catalogs with Data hub integrations offer [features](https://documentation.bloomreach.com/engagement/docs/data-hub-catalogs) including mutable schemas and searchable settings that you can modify after creation.

### Non-Data hub integrations

Create and manage both product and general catalogs directly in the project using [imports](https://documentation.bloomreach.com/engagement/docs/data-import#importing-catalogs) and the [Catalog API](https://documentation.bloomreach.com/engagement/reference/catalog-api-overview-2). For non-Data hub integrations, you can’t change the catalog schema or searchable attributes after creation.

## Key differences

Learn about the [key differences](https://documentation.bloomreach.com/engagement/docs/data-hub-versus-legacy-catalogs) in capabilities between the Data hub catalogs and legacy catalogs.

## Recommended reserved product catalog attributes

The table below lists the recommended reserved product catalog attributes. These attributes have special meaning in Bloomreach and enable features such as recommendations and inventory management.

<table>
  <tr>
   <td><strong>Attribute</strong>
   </td>
   <td><strong>Attribute Name</strong>
   </td>
   <td><strong>Type</strong>
   </td>
   <td><strong>Description</strong>
   </td>
   <td><strong>Example Value</strong>
   </td>
  </tr>
  <tr>
   <td>Product ID
   </td>
   <td>product_id
   </td>
   <td>string
   </td>
   <td>Base product identifier (ignores variants).
   </td>
   <td>"SHIRT123"
   </td>
  </tr>
  <tr>
   <td>Item ID
   </td>
   <td>item_id
   </td>
   <td>string
   </td>
   <td>Unique identifier of your product variants (SKU, EAN - considering sizes, colors). Note: To enable edits using the Catalog API, use item_id values that don't contain /. Due to endpoint decomposition, edit attempts won't work with item_id values containing /, which also affects edits via the platform UI.
   </td>
   <td>"SHIRT123-BLK-L"
   </td>
  </tr>
  <tr>
   <td>Title
   </td>
   <td>title
   </td>
   <td>string
   </td>
   <td>Product name.
   </td>
   <td>"Black fitted crew neck t-shirt"
   </td>
  </tr>
  <tr>
   <td>Description
   </td>
   <td>description
   </td>
   <td>string
   </td>
   <td>Product description.
   </td>
   <td>"Comfortable cotton t-shirt..."
   </td>
  </tr>
  <tr>
   <td>Active
   </td>
   <td>active
   </td>
   <td>boolean
   </td>
   <td>Product availability status.
   </td>
   <td>true
   </td>
  </tr>
  <tr>
   <td>Brand
   </td>
   <td>brand
   </td>
   <td>string
   </td>
   <td>Product brand.
   </td>
   <td>"Nike"
   </td>
  </tr>
  <tr>
   <td>Category IDs
   </td>
   <td>category_ids
   </td>
   <td>list
   </td>
   <td>Internal category identifiers.
   </td>
   <td>[12345, 67890]
   </td>
  </tr>
  <tr>
   <td>Category Level 1
   </td>
   <td>category_level_1
   </td>
   <td>string
   </td>
   <td>Top-level category name.
   </td>
   <td>"Shoes"
   </td>
  </tr>
  <tr>
   <td>Category Level 2
   </td>
   <td>category_level_2
   </td>
   <td>string
   </td>
   <td>Second-level category name.
   </td>
   <td>"Athletic"
   </td>
  </tr>
  <tr>
   <td>Category Level 3
   </td>
   <td>category_level_3
   </td>
   <td>string
   </td>
   <td>Third-level category name.
   </td>
   <td>"Running"
   </td>
  </tr>
  <tr>
   <td>Category Path
   </td>
   <td>category_path
   </td>
   <td>string
   </td>
   <td>Full category hierarchy.
   </td>
   <td>"Shoes | Athletic | Running"
   </td>
  </tr>
  <tr>
   <td>Color
   </td>
   <td>color
   </td>
   <td>string
   </td>
   <td>Main product color.
   </td>
   <td>"red"
   </td>
  </tr>
  <tr>
   <td>Gender
   </td>
   <td>gender
   </td>
   <td>string
   </td>
   <td>Target gender.
   </td>
   <td>"Male", "Female", "Unisex"
   </td>
  </tr>
  <tr>
   <td>Image
   </td>
   <td>image
   </td>
   <td>string
   </td>
   <td>Main product image URL.
   </td>
   <td><a href="http://example.com/image.jpg">http://example.com/image.jpg</a>
   </td>
  </tr>
  <tr>
   <td>Lead Time
   </td>
   <td>lead_time
   </td>
   <td>string
   </td>
   <td>Restocking time.
   </td>
   <td>"7"
   </td>
  </tr>
  <tr>
   <td>Supplier
   </td>
   <td>supplier
   </td>
   <td>string
   </td>
   <td>Supplier identifier.
   </td>
   <td>"SUPP123"
   </td>
  </tr>
  <tr>
   <td>Size
   </td>
   <td>size
   </td>
   <td>string
   </td>
   <td>Product size.
   </td>
   <td>"XL", "12"
   </td>
  </tr>
  <tr>
   <td>URL
   </td>
   <td>url
   </td>
   <td>string
   </td>
   <td>Direct product URL.
   </td>
   <td><a href="http://example.com/product">http://example.com/product</a>
   </td>
  </tr>
  <tr>
   <td>Stock Level
   </td>
   <td>stock_level
   </td>
   <td>integer
   </td>
   <td>Current inventory quantity.
   </td>
   <td>42
   </td>
  </tr>
  <tr>
   <td>Cost Per Unit
   </td>
   <td>cost_per_unit
   </td>
   <td>float
   </td>
   <td>Product cost before margin.
   </td>
   <td>15.99
   </td>
  </tr>
  <tr>
   <td>Discount Percentage
   </td>
   <td>discount_percentage
   </td>
   <td>float
   </td>
   <td>Percentage discount.
   </td>
   <td>50.0
   </td>
  </tr>
  <tr>
   <td>Price
   </td>
   <td>price
   </td>
   <td>float
   </td>
   <td>Final customer price.
   </td>
   <td>29.99
   </td>
  </tr>
  <tr>
   <td>Returned Products
   </td>
   <td>returned_products
   </td>
   <td>string
   </td>
   <td>Number of returns.
   </td>
   <td>"5"
   </td>
  </tr>
  <tr>
   <td>Date Added
   </td>
   <td>date_added
   </td>
   <td>timestamp
   </td>
   <td>First inventory date.
   </td>
   <td>1709078400
   </td>
  </tr>
</table>

## Reserved attribute names for Data hub item collections

You can use the following names as custom attributes. Since Marketing reserves these names, it adds a `main.` prefix to the attribute (for example, `main.height`). To reference the attribute in Marketing, use the prefixed name `main.height` instead of the original name `height`.

`active`, `brand`, `capacity`, `category_ids`, `category_path`, `category_paths`, `category_level_1` through `category_level_20`, `color`, `color_group`, `condition`, `cost_per_unit`, `country`, `date_added`, `default_variant`, `depth`, `description`, `discount_percentage`, `discount_value`, `exclude_from_apps`, `flags`, `gender`, `height`, `high_confidence_terms`, `image`, `keywords`, `large_image`, `launch_date`, `lead_time`, `original_price`, `original_price_range`, `price`, `price_range`, `product_class`, `product_id`, `promotions`, `returned_products`, `reviews`, `size`, `stock_level`, `stores`, `supplier`, `swatch_image`, `thumb_image`, `title`, `url`, `variant_options`, and `width`.

Many of these names have an equivalent Data hub [system attribute](https://documentation.bloomreach.com/data-hub/docs/items-system-attributes). If you want to reference the attribute in Marketing without the `main.` prefix, set up the closest system attribute instead.

## Data mapping

#### Non-Data hub integrations

* If your workspace isn’t Data hub enabled, ensure you map the catalog attributes during the initial catalog import in **Data & Assets** > **Imports**.
* Then, use **Data & Assets** > **Data manager** > **Mapping** to choose the required main catalog and map the reserved attributes.

See the [legacy catalogs setup guide](https://documentation.bloomreach.com/engagement/docs/create-legacy-catalogs).

#### Data hub integrations

If your account has Data hub enabled, how you configure catalog attributes depends on the catalog type.

##### Product catalogs

If your main product catalog is managed via Data hub [item collection](https://documentation.bloomreach.com/data-hub/docs/how-to-set-up-an-item-collection):

**Map product attributes in Data hub**

* Go to the **Schema** tab to configure how record fields map to item attributes (including [system attributes](https://documentation.bloomreach.com/data-hub/docs/items-system-attributes)). See [Configure schema](https://documentation.bloomreach.com/data-hub/docs/configure-schema).
* [Set item identifier](https://documentation.bloomreach.com/data-hub/docs/configure-schema#2-set-item-identifier). This corresponds to the item\_id.

**Choose main catalog and control searchable fields in Marketing destination**

* After you create an Marketing [destination](?tab=t.pi94m2v9ayl3) for the item collection, Data hub keeps the product catalog in sync.
* Use **Data & Assets** > **Data manager** > **Mapping** to choose the required main catalog.
* To change which attributes can be used as filters in recommendations and campaigns, go to **Data & Assets** > **Catalogs** > \[The product catalog] > **Attributes** and adjust the **Searchable** settings. Update these at any time without recreating the catalog. See the Data hub catalogs [setup guide](https://documentation.bloomreach.com/engagement/docs/create-and-manage-catalogs).

**Required mappings for product-based use cases**

When setting up use cases or recommendations that reference product data, confirm that the reserved attributes reference the Data hub [system attribute](https://documentation.bloomreach.com/data-hub/docs/items-system-attributes) listed below.

<table>
  <tr>
   <td><strong>Reserved attribute</strong>
   </td>
   <td><strong>Data hub system attribute</strong>
   </td>
  </tr>
  <tr>
   <td>item_id
   </td>
   <td>Item identifier <a href="https://documentation.bloomreach.com/data-hub/docs/configure-schema#2-set-item-identifier">set in item collection schema</a>.
   </td>
  </tr>
  <tr>
   <td>image
   </td>
   <td><a href="https://documentation.bloomreach.com/data-hub/docs/items-system-attributes-product-large-image">large_image</a>
   </td>
  </tr>
  <tr>
   <td>price
   </td>
   <td><a href="https://documentation.bloomreach.com/data-hub/docs/items-system-attributes-product-price">price</a>
   </td>
  </tr>
  <tr>
   <td>original_price
   </td>
   <td><a href="https://documentation.bloomreach.com/data-hub/docs/items-system-attributes-product-original-price">original_price</a>
   </td>
  </tr>
  <tr>
   <td>title
   </td>
   <td><a href="https://documentation.bloomreach.com/data-hub/docs/items-system-attributes-product-title">title</a>
   </td>
  </tr>
  <tr>
   <td>url
   </td>
   <td><a href="https://documentation.bloomreach.com/data-hub/docs/items-system-attributes-product-url">url</a>
   </td>
  </tr>
  <tr>
   <td>active status
   </td>
   <td><a href="https://documentation.bloomreach.com/data-hub/docs/items-system-attributes-product-active">active</a>
   </td>
  </tr>
</table>

##### General catalogs (Data hub catalogs)

If you use general catalogs:

* Create and manage general catalogs by going to **Data & Assets** > **Catalogs** and create a catalog with type **General**.
* Configure schema and searchable fields using the catalog’s **Schema** tab to define attributes and choose which ones are searchable. Change these settings at any time without recreating the catalog.

See the Data hub catalogs [setup guide](https://documentation.bloomreach.com/engagement/docs/create-and-manage-catalogs).

## User access

Manage catalog permissions through roles in **Access Management** > **Roles**. Assign appropriate roles to perform catalog operations.

### Full catalog management

Users with **Project Developer/Admin**,**Imports Admin**, or **Campaigns Editor/Admin roles** have complete control over catalogs.

#### Permissions

* Create, delete, and modify catalogs along with their records, configuration, and schema.
* Create, modify, run, and delete catalog imports.
* View all catalog components, including items, records, schema, jobs, and imports.

### View-only access

Users with **Campaigns Viewer**, **Weblayers Viewer/Editor/Publisher**, **Email Campaigns Viewer/Editor/Publisher**, **SMS Campaigns Viewer/Editor/Publisher**, **Scenarios Viewer/Editor/Publisher**, **Customers Viewer/Editor/Consent Editor**, **Managed Endpoints Viewer/Editor/Publisher**, or **Recommendation Viewer/Editor** roles can view all catalogs and their components.

#### Permissions

View catalog items, item attributes, records, record fields, configuration, schema, jobs, and imports.

## Limitations

* **Number of catalogs per project:** The limit is 50 catalogs per project, regardless of catalog version. Data hub catalogs enforce this limit. Legacy catalogs don't enforce this limit.
* **Searchable attributes per catalog:** 40 maximum.
* **Items per project:** 6,000,000 maximum for both legacy and Data hub catalogs.
* **Items per Data hub catalog:** 1,000,000 maximum.
* **Catalog item value length:** 28,672 bytes maximum (legacy catalogs). If you exceed this, shorten the value or split the property into two shorter ones.
* **Attributes per catalog or item:** 260 maximum. This applies to both legacy and Data hub catalogs.

To request an increase to any of these limits, contact your Customer Success Manager (CSM).

Downloading and exporting catalogs isn't possible.

> 📘 **Note**
>
> Catalogs with no usage in the previous 90 days (no access from the application and no import) are automatically deleted. All respective scenarios remain editable.

## Personally identifiable information

Catalogs should never contain personally identifiable information (PII) such as emails or phone numbers.