---
updatedAt: 2026-08-27T07:25:42.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Imports best practices

Running [imports](https://documentation.bloomreach.com/engagement/docs/data-import) well means fewer errors, cleaner data, and a project that stays healthy over time.

This guide covers best practices for importing customers, events, catalogs, and other data into the platform.

## Plan your imports

* Test your imports in a test project before running them in production. This helps you avoid accidental deletion, duplication, or the need to reimport data.
* Split large files and schedule imports during off-peak times for better performance and stability.
* Review the [size limitations](https://documentation.bloomreach.com/engagement/docs/data-manager#data-manager-size-limitations) section in Data Manager to understand attribute and event storage limits before you run large imports.
* Individual imports can't exceed 1,000,000 rows. Split larger files into smaller ones. Maximum file size is 1 GB.

## Set up your data source

* Click **Preview data** after selecting your data source to verify that the format looks correct. If something looks off, check that you've selected the correct delimiter and encoding.
* **Keep the preview query simple.** Preview is capped at 60 seconds and is meant to validate the column shape and sample values, not to run an analytical query. For warehouse and database sources, prefer importing from a table or a pre-computed materialized view rather than embedding the full transformation in the import SQL. This makes the preview faster, makes the scheduled import more reliable, and keeps query logic versioned in your warehouse rather than in Bloomreach. See the source-specific guidance for [Databricks](https://documentation.bloomreach.com/engagement/docs/databricks-setup#preview-timeout), [Snowflake](https://documentation.bloomreach.com/engagement/docs/snowflake#preview-timeout), or [BigQuery](https://documentation.bloomreach.com/engagement/docs/google-bigquery-integration) when a preview times out.
* Check your file for errors or missing elements before importing.
* Check that commas, dots, and spaces in values are used correctly. In CSV files, one misplaced comma can move values to the wrong column.

### Handle regional differences

* Be aware of regional differences in Excel settings. Excel can interpret the value "6.1" as a price in one language setting but as a date in another.
* When using the "Text to Columns" function, specify the formatting of each column and set its decimal point to avoid misinterpretation.
* When locating and changing values in Excel, note that the dropdown filter only lists the first 10,000 rows.

## Map your columns

In the dropdown menu for each column, map it to an existing attribute. When mapped, the column name changes to blue font. You can create a new attribute by typing the name and clicking **+**.

<Image src="https://files.readme.io/7a6a8bd-Imports_new_attribtue.png" alt="Column mapping dropdown in the import wizard showing attribute options." align="center" width="80%" caption="Map each column to an existing attribute or create a new one during the import setup." border={true} />

Watch for duplicate headers when importing the same event from multiple CSV files. The import wizard treats two headers with the same name as one column and, within the platform, as one attribute.

Select the attribute checkbox after adding the column and data type to import the column as an attribute.

## Handle customer IDs

During every import, pair at least one column with the identifiers in the yellow boxes in the customer IDs section. These identifiers tell the platform which customer profile to update with the imported values.

Don't check the checkbox for the customer ID column. Selecting it imports the ID as an attribute, which causes data duplication and can create volume issues in your project.

You can map multiple ID columns—for example, `registered` and `cookie`. The platform uses whichever ID is available for a given customer to pair the event.

### Keep IDs consistent and clean

Ensure customer IDs in your import files match those of existing customers. Misspelled IDs create duplicate customer profiles.

Trim and lowercase important values like IDs to avoid incorrect identification. Use the `TRIM(LOWER(xx))` function in Excel.

The "No valid customer ID" error occurs when a customer is missing an ID or the ID exceeds 256 bytes. Check customer IDs in each row of your source file to resolve this.

## Set correct data types

Set the correct data type for each column—text, number, date, and more. The data type affects how the platform filters and displays values. For example, the value "28.9.1996 13:45" displays differently depending on whether it's imported as text, number, or date.

* Importing a `timestamp` as an integer causes display issues. Timestamps must be imported in date type format.
* You can change the data type for an attribute later in Data Manager, but be careful with list values. They're processed differently when imported under an incorrect data type.

## Track your import sources

* Add a `source` column with a static value by clicking the **+** on the far right of the preview table. Use a descriptive value such as Import\_11 June 2019 to help with troubleshooting and data organization later.

<Image src="https://files.readme.io/bb2ee43-Import_add_new_column.png" alt="Import preview table with the option to add a new static value column." align="center" caption="Add a source column with a static value to help track and troubleshoot imports later." border={true} />

* Track import dates by adding an attribute like import\_date=20190715. The total number of events with this attribute should match the number of lines in your CSV file.

## Import events

### Use the right timestamp format

Transform all time formats into UNIX timestamps. The number of seconds since January 1, 1970 00:00:00 UTC. This avoids problems with regional date formats where, for example, "02/04/2017" could be read as either April or February.

Accepted formats:

* **Datetime:** 2020-08-05T10:22:00
* **Numeric:** Number of seconds since 1970, for example, `1596615705`.

If only a date is provided, the platform adds midnight as the event time. Check the timezone of your timestamp before importing.

### Import oldest events first

Import the oldest events first. If an error occurs, you can use "events expiration" in Data Manager to remove newer information.

### Avoid repeated daily event imports

Don't run daily imports for all events. Importing the same events repeatedly—including new ones each day—causes issues with automation flows and increases your platform usage unnecessarily.

## Handle purchase events

Make sure all `purchase_item` events have a purchase\_id attribute that matches a corresponding `purchase` event. This lets the platform treat multiple purchase items from a single `purchase` correctly.

When combining 2 sets of events, make sure the price attribute in the `purchase` event uses the same VAT, shipping, and discount settings across both sets.

## Import catalogs

The guidance in this section depends on whether your workspace uses Data hub (Data hub catalogs) or a non-Data hub integration (legacy catalogs).

### Legacy catalogs (non-Data hub integrations)

#### Set searchable fields on first import

Set the right columns as searchable when you first import a catalog. Searchable fields are indexed in the platform's search, and recommendations are based on these columns. For example, to make product recommendations based on brand, the brand column must be set as searchable.

You can assign searchable columns during import creation. Once the catalog structure is created, you can't change it. You can only add more items.

* Maximum of 40 columns can be set as searchable and available for recommendations.
* List and JSON fields can't be set as searchable.

#### Replace an existing catalog

If you need to replace a catalog with a new one that has different searchable fields or data types, follow these steps:

1. Set data types correctly and mark all searchable fields in your new catalog before importing. You can't remove or rename columns, change data types, or alter searchability after the fact.
2. Keep existing column names if you want existing emails and imports to work with the new catalog. Otherwise, update the Jinja code in your emails.
3. Create a new catalog from a fresh import. Verify it's complete and correct in the UI before proceeding.
4. Note the new catalog ID from the URL.
5. Rename the old catalog, then rename the new catalog to the original name. This ensures any emails referencing the catalog by name in [Jinja](https://documentation.bloomreach.com/engagement/docs/jinja) continue to work.
6. Check that any existing imports still work against the new catalog. If column names and data types are the same, only the catalog name should need updating.
7. Update any existing API calls to reference the new catalog ID.
8. Update any existing recommendations to reference the new catalog. This relationship is fixed to the catalog ID.
9. Delete the old catalog after all recommendations are re-pointed to the new one.

### Data hub catalogs

Modify searchable attributes under the [schema tab](https://documentation.bloomreach.com/data-hub/docs/item-collection-schema). Unlike legacy catalogs, you don't need to recreate the catalog to add searchable fields.

## Manage repeated imports

If a repeated import gets stuck, edit the repeated import settings and save again without changing anything. This restarts the repeated imports.

## Time your reimports

After deleting events, don't start reimporting right away. Events and customers may appear deleted in the app, but the deletion process on the backend may still be in progress. Deletion runs at low priority and takes longer than import.

## Handle errors

When an error occurs, rows with errors are skipped, and the rest of the file is imported. For troubleshooting common import issues, see the [Imports FAQ](https://support.bloomreach.com/hc/en-us/articles/18151211688861-Imports-FAQ).