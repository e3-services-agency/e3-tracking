---
updatedAt: 2026-07-29T08:00:39.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Import customers

Customer imports let you import existing customer data from external sources into the platform. 

This guide walks you through each step of the customer import process, from choosing a data source to mapping your columns and running the import.

## Prerequisites

* Read the [Imports article](https://documentation.bloomreach.com/engagement/docs/data-import) to understand how imports work, what sources are available, and how to monitor import progress.

* If you want to send emails through the platform, customers must have an attribute called `email` populated with their email addresses.

* If you want to send text messages, the attribute must be called `phone`.

* Review size limitations in [Data manager](https://documentation.bloomreach.com/engagement/docs/data-manager#data-manager-size-limitations) before running large imports.

## Choose data source

1. To start a customer import, go to **Data & Assets** > **Imports** > **+ New import** > **Customers**. 

2. Name the import.

3. Select the source of your customer data. All standard—for details on each, see [Data sources](https://documentation.bloomreach.com/engagement/docs/data-import#data-sources). Each column in your import file represents a customer attribute, and each row represents a single customer. The first row identifies the attribute names. You can remap, discard, or supplement these in the data mapping step.

4. After selecting your source, click **Preview data** to confirm the format looks correct. If the preview looks off, check that the right delimiter and encoding are selected.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/bcbc16d36a915aa5d8a2e268a3137f9714deaa989d0d7531343c07778f4bd158-Import_customers.png",
        "",
        "Data source selection screen in the customer import wizard."
      ],
      "align": "center",
      "sizing": "60% ",
      "caption": "Select your data source and preview it before proceeding to the mapping step."
    }
  ]
}
[/block]

## Map data

Data mapping tells the platform how to interpret each column in your file and which customer profile to update.

### Map columns to attributes

In the dropdown menu for each column, map it to an existing attribute or create a new one by typing a name and clicking **+**. When a column is mapped to an existing attribute, its name changes to blue font.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/de3fa10e4a0657edbf0703c1f8081c0ff53b915619836c8498445f8d2dbfa96a-Map_columns_to_attributes.png",
        "",
        "Column mapping editor showing a mapped attribute highlighted in blue font."
      ],
      "align": "center",
      "sizing": "60% ",
      "border": true,
      "caption": "Map each column to an existing attribute or create a new one by typing a name and clicking +."
    }
  ]
}
[/block]

Set the correct data type for each column—text, number, date, and more. Data types affect how the platform filters and displays values. Each data type is explained in the [Data Manager](https://documentation.bloomreach.com/engagement/docs/data-manager) article.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/13ac19dc15cf2f0b0d68e6247db9b745952ed81a435c93e6cbbb7c2e9bfc3a02-Data_type_selector.png",
        "",
        "Data type dropdown in the column mapping editor."
      ],
      "align": "center",
      "sizing": "60% ",
      "border": true,
      "caption": "Set the correct data type for each column to control how values are filtered and displayed."
    }
  ]
}
[/block]

### Timestamps

You can optionally map a column to `update_timestamp` to enable customer properties synchronization, also known as last-write-wins.

When you include this field, the platform compares the incoming timestamp to the existing property value and overwrites it only if the incoming timestamp is newer. This prevents stale data from overwriting fresher values tracked between import runs.

If you don't include a timestamp column, the platform uses the current time at the start of import. Future timestamps are capped to the current time in batch CSV imports and the Tracking API.

### Pair at least one customer ID

During every import, pair at least 1 column with a customer identifier in the yellow boxes in the customer IDs section. This tells the platform which customer profile to update with the imported values.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/1b555fbcb6fb5e37aaa908f4de5b90496c51b2ea87a929df0250127249bbdf12-Pair_customer_ID.png",
        "",
        "Customer IDs section with yellow identifier boxes and an unchecked customer ID checkbox."
      ],
      "align": "center",
      "sizing": "60% ",
      "border": true,
      "caption": "Pair at least one column with a customer identifier—and leave the checkbox unchecked to avoid importing the ID as an attribute."
    }
  ]
}
[/block]

Don't check the checkbox for the customer ID column. Selecting it imports the ID as an attribute, which causes data duplication and can create volume issues in your project.

You can map multiple ID columns. For example, `registered` and `cookie`. The platform uses whichever ID is available for a given customer. The `registered` hard ID always takes priority.

### Add a static value column

Add a column with a static value by clicking **+** on the far right of the preview table. Adding a source column—for example, with the value `Import_11 June 2019`—helps with troubleshooting and data organization later.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/5a6a98cd7a42b61b67a46bfc0bbc1ab2ad258d8290e933cec1200d8f70684c9e-Add_a_static_value_column.png",
        "",
        "Import preview table with the + button highlighted on the far right."
      ],
      "align": "center",
      "sizing": "60% ",
      "border": true,
      "caption": "Add a static source column to make it easier to track and troubleshoot imports later."
    }
  ]
}
[/block]

## Schedule repeated import (optional)

If you're importing from a dynamic source—File storage, Database, URL, or Bloomreach—you can schedule repeated imports. For details, see [Schedule a repeated import](https://documentation.bloomreach.com/engagement/docs/data-import#schedule-repeated-imports).

## Run the import

Complete the wizard steps to start the import. Check the status in the import list by clicking **Refresh**. Large files take more time to process.

You can monitor progress using the two-stage progress bar. Data is available only after both the import and processing stages complete. For details, see [Track import progress](https://documentation.bloomreach.com/engagement/docs/data-import#track-import-progress).

You can use this example CSV to test a small import before running a large one.

```text Example customer CSV
registered;first_name;last_name;email;birthday
john@smith.com;John;Smith;john@smith.com;28.9.1996
```

A few things to note in this example:

* `registered` has no blue color and its checkbox is unchecked. It's used only to match the row to the correct customer profile, not imported as an attribute.
* `birthday` has no blue color either. This means the attribute doesn't exist yet and will be created during import. Make sure to set its data type to date.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/767cb96-Import_customers.png",
        "Import customers.png",
        "Completed customer import mapping with registered unchecked and birthday set to date format."
      ],
      "align": "center",
      "sizing": "60% ",
      "border": true,
      "caption": "Example of a correctly mapped customer import using the sample CSV."
    }
  ]
}
[/block]

## Import lists

To import multiple values for a single attribute, use the following format: `["value1", "value2"]`. Use square brackets with each value in double quotes, separated by commas.

## Reimport customers

When reimporting customer data, you can control how existing values are handled:

* **Overwrite with new data:** Include the attribute in your import with the new value.

* **Overwrite with a blank value:** Include the attribute in your import with a blank value.

* **Leave existing value unchanged:** Exclude the attribute from your import entirely.

## Limitations

* Customer IDs can't exceed 256 bytes. The "No valid customer ID" error occurs when an ID is missing or exceeds this limit. Check customer IDs in each row of your source file. See the [Imports FAQ](https://support.bloomreach.com/hc/en-us/articles/18151211688861-Imports-FAQ) for common issues.

* Each cell can only contain a single value. To import multiple cookies for one customer, use a separate identifier, such as `registered` to pair the additional rows.