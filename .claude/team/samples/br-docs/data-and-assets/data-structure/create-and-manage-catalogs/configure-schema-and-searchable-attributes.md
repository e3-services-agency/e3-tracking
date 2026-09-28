---
updatedAt: 2026-07-16T09:27:30.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Configure schema and searchable attributes

Configure the general catalog schema to define how records transform into [items](https://documentation.bloomreach.com/engagement/docs/data-hub-catalogs). This guide helps you map your source record fields to custom item attributes.

To configure the schema for your product catalog, use [Item collections](https://documentation.bloomreach.com/data-hub/docs/configure-schema).

## How schema changes work

Modifying a catalog's schema immediately triggers a reprocessing of all existing records, resulting in a complete regeneration of items based on the new schema. This action can have immediate and significant effects on application usage.

For example, changing the data type of an attribute used in a campaign or recommendation may cause those campaigns to behave unexpectedly or fail.

Always test schema changes in a non-production environment to prevent unexpected issues in dependent applications.

## Configure attributes

1. Go to **Schema** > **Custom attributes** tab.

2. To create a new custom attribute, click **+ Add custom attribute**.
   > 📘 Note
   >
   > Attributes are created automatically during new imports and import configuration updates. Learn more about [auto-add schema during imports](https://documentation.bloomreach.com/engagement/docs/add-and-manage-records#4-map-data-and-schedule-import).

3. Enter an attribute name. For example: blog\_title.

4. Enter the record field name as the source field of this attribute.

5. Choose the data type of the attribute. For example, String, Integer, Boolean, and more.

6. Toggle ON the **Searchable** switch to enable searching and filtering using this attribute. There is a limit of 40 searchable attributes per catalog.

[block:image]{"images":[{"image":["https://files.readme.io/692a3aff47cde0bc0b60f5e7059fa335a6c6c7b716db5bdf5f4a6db5931c4ba6-image1.png","","Configure schema and searchable attributes"],"align":"center","border":true,"caption":"Configure searchable attributes"}]}[/block]

7. Click **Save changes**.

The system uses the schema to process data and generate items.