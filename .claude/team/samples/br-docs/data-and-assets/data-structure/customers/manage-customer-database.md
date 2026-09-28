---
updatedAt: 2026-07-16T09:27:30.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Manage customer database

This guide explains how to access and navigate your [customer](https://documentation.bloomreach.com/engagement/v2/docs/customers) database, search and filter profiles, download customer data, and delete or edit individual profiles.

## Access the customer database

To open your customer database:

1. Go to **Data and Assets** > **Customers**. This displays the full list of all customer profiles in your project.

2. To customize which attributes are visible and searchable in this list view, click the **cog wheel icon** in the top-right corner of the table. Note that the search function only searches through attributes that are visible in the current list view.

[block:image]{"images":[{"image":["https://files.readme.io/0b139727d678a3896f25f401c8f15f5e5209c6b95e09ab370579fc5779f9cc3f-Screenshot_2026-03-12_at_10.55.33.png","","customer database list view showing the full list of profiles and the cog wheel icon in the top right"],"align":"center","border":true,"caption":"Customer database list view"}]}[/block]

## Search and filter customers

To find a specific customer, use the search field at the top of the list. For more advanced filtering, use the [customer and event filter](https://documentation.bloomreach.com/engagement/docs/use-filters).

Click **+ Add filter condition** to filter by:

* Funnel steps or customer attributes.
* [Event attributes](https://documentation.bloomreach.com/engagement/docs/funnels-2#summarizing-event-attributes).
* Additional [filter conditions](https://documentation.bloomreach.com/engagement/docs/filtering-data).

To narrow results by segmentation, click **+ Add filter condition**, select the **Customer** tab, choose a segmentation, and click **Apply filters**.

## Download customer data

### Download all customers

1. Go to **Data and Assets** > **Customers**.
2. Click the **three-dot icon** in the top-right corner.
3. Select **Download customer data**.
4. Choose the attributes you want to include in the export.

The data is exported as a CSV file. All customer identifiers are automatically included and aren't available in the attribute selection.

To open the CSV as a Microsoft Excel spreadsheet, follow this [formatting guide](https://www.hesa.ac.uk/support/user-guides/import-csv). To preview CSV files, use Notepad++ on Windows or Sublime Text on Mac.

### Download customers for a specific segmentation

1. Go to **Data and Assets** > **Customers**.
2. Click **+ Add filter condition** and select the **Customer** tab.
3. Choose the segmentation you want to filter by and click **Apply filters**.
4. Click the **three-dot icon** in the top-right corner.
5. Select **Download customer data**.

Only data matching your applied filters is exported.

## Delete customers

### Delete multiple customers

1. Go to **Data and Assets** > **Customers**.
2. Click the **three-dot icon** in the top-right corner.
3. Select **Delete all customers**.

This action deletes all customers currently displayed in the list. Apply filters before deleting if you want to limit the scope.

### Delete a single customer

1. Hover over the row for the customer you want to delete.
2. Click the **Edit** button that appears, then open its drop-down menu.
3. Select **Delete**.

## Edit a customer profile

### Edit attribute values

1. Open a customer profile by clicking on it in the list.
2. Go to the **Properties and events** tab.
3. Hover over the attribute value you want to edit.
4. Click the edit icon that appears and update the value.

### Delete a customer attribute value

To clear an attribute value for a specific customer, hover over the attribute in the **Properties and events** tab and click the **delete icon**. This removes the value for that customer only.

To remove an attribute from the entire project, go to the [Data manager](https://documentation.bloomreach.com/engagement/docs/data-manager).