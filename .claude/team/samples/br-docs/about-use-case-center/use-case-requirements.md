---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Use case requirements

This guide explains how to meet the data requirements for deploying a use case in the Use Case Center.

To run a use case, your project needs the right data in place. During the requirements step, you'll identify what data the use case needs and map your existing data to match it.

Bloomreach's data mapping feature lets you keep your existing event names, customer properties, and catalog structure. Instead of renaming your data, you map it to the naming conventions the use case expects.

## Meet the requirements

Before downloading a use case, check the status icons on the **Requirements** page:

* **All icons green:** The use case downloads with data matched to your project's structure.
* **All icons gray:** The use case downloads with default best-practice data, which you can update after downloading.
* **Mixed icons:** Some data matches your structure, but other items use default data.

### Resolve unmet requirements

Resolve any unmet requirements in Data manager before downloading the use case. You can update optional requirements at any time after download.

1. Go to **Data & Assets** > **Data manager** > **Mapping**.
2. Map the data following the guidance in the [data mapping section](https://documentation.bloomreach.com/engagement/docs/use-case-requirements#data-mapping) below.
3. Click **Save changes**.
4. Return to the use case.
5. Refresh the requirements page.
6. Click **Continue**.

> 📘 Note
>
> When the requirements step appears, map all the data in your project or only the data required for the specific use case you downloaded.

## Data mapping

The following events, catalogs, customer properties, and consents are required for use cases to function. Map these in the [Data manager](https://documentation.bloomreach.com/engagement/docs/data-manager) before downloading.

### Events

#### Purchase (Completed)

Triggers campaigns for active, successful purchases. Also used to list purchased items and in evaluations.

* `Purchase_status`: Used to narrow results to successful purchases.
* `Total_price`: Used primarily in evaluations.
* `Product_IDs`: Used when listing all purchased products.

#### Purchase\_item

* `Product_ID`

* `Total_price`

#### Add to cart

Maps the basic action of adding an item to the cart.

* `Product_ID`
* `Total_price`

#### view\_item

* `Product_ID`

### Customer roperties

* `Email`: Required for any email-related use cases.
* `Phone`: Required for any SMS-related use cases.

### Catalogs

Your project must have one main catalog being tracked. This catalog is primarily used to visualize products in templates. If your project has multiple main catalogs — for example, for different countries or brands — select one and edit the email templates after downloading the use case. Every email template includes a parameter to specify which catalog to use.

The following catalog attributes must be mapped for use cases to function correctly:

* Item ID
* Image
* Price
* Title
* URL
* Original price
* Active status

The [data mapping](https://documentation.bloomreach.com/engagement/docs/catalogs#data-mapping) path depends on your integration.

### Consents

* Newsletter Emailing: Applies if email integration is implemented.
* SMS: Applies if SMS integration is implemented.

> 📘 Note
>
> Each project's requirements must be set up individually.

## Troubleshooting

For answers to common questions about deploying and managing use cases, see the [Use Case Center FAQ](https://documentation.bloomreach.com/engagement/docs/ucc-faq).