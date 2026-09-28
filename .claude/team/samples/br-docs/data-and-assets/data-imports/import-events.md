---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Import events

Events capture what your customers do—purchases, page visits, sign-ups, and more. Importing events lets you bring historical event data into the platform so you can use it in analyses, segmentations, and campaigns.

This guide walks you through each step of the event import process, from choosing a data source to mapping your columns and running the import.

## Prerequisites

* Read the [Imports article](https://documentation.bloomreach.com/engagement/docs/data-import) to understand how imports work, what sources are available, and how to monitor import progress.

* You can name events as you like, but follow the [platform's naming standards](https://documentation.bloomreach.com/engagement/docs/web-tracking#section-events) for basic events.

* Each event import requires two columns: a customer ID column and a timestamp column.

* Import each event type in a separate CSV file.

* For deduplication and reimport safety, always include explicit timestamps. See [Event deduplication](https://documentation.bloomreach.com/engagement/docs/imports-technical-reference#event-deduplication) for details.

## Choose a data source

1. To start an event import, go to **Data & Assets** > **Imports** > **+ New import** > **Events**.

2. Name the import.

3. Select the source your event data is coming from. All standard import sources are supported. For details on each, see [Data sources](https://documentation.bloomreach.com/engagement/docs/data-import#data-sources).

4. After selecting your source, click **Preview data** to confirm the format looks correct. If the preview looks off, check that the right delimiter and encoding are selected.

## Map data

Data mapping tells the platform how to interpret each column and which customer profile to pair each event with.

### Map columns to attributes

In the dropdown menu for each column, map it to an existing attribute or create a new one by typing a name and clicking **+**. Set the correct data type for each column—text, number, date, and more. Each data type is explained in the [Data manager](https://documentation.bloomreach.com/engagement/docs/data-manager) article.

### Assign required tags

Two columns are required for every event import:

* **Customer ID column:** Assign the yellow tag to pair each event with the correct customer profile. Don't check the checkbox for this column. Checking it imports the ID as an attribute, which causes data duplication.

* **Timestamp column:** Assign the blue tag. The `timestamp` must be in datetime format (for example, `2020-08-05T10:22:00`) or numeric format (for example, `1596615705`—seconds since January 1, 1970). If only a date is provided, the platform adds midnight as the event time.

You can map multiple ID columns—for example, `registered` and `cookie`. The platform uses whichever ID is available for a given customer. The `registered` hard ID always takes priority.

### Use the timezone selector

The timezone selector, located below the data table, adjusts the timezone of datetime values. This feature only applies to ISO 8601 datetime formats—if your datetime doesn't conform to this format, the selector has no effect.

## Trigger on-event campaigns (optional)

Check the **Trigger on-event campaigns** checkbox in the top right to allow imported events to trigger on-event scenarios. This option is turned off by default.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/3962d889144d241c6cfe5af8d5cf71a456089ebd492c6fec971cc630f9537f5e-Trigger_on-event_campaigns.png",
        "",
        "Trigger on-event campaigns checkbox in the top right of the event import wizard."
      ],
      "align": "center",
      "border": true,
      "caption": "Enable this option to allow imported events to trigger on-event scenarios."
    }
  ]
}
[/block]

## Schedule a repeated import (optional)

If you're importing from a dynamic source—Database, URL, or Bloomreach—you can schedule repeated imports. For details, see [Schedule a repeated import](https://documentation.bloomreach.com/engagement/docs/data-import#schedule-repeated-imports).

## Run the import

Complete the wizard steps to start the import. Check the status in the import list by clicking **Refresh**. Large files take more time to process.

You can monitor progress using the two-stage progress bar. Data is available only after both the import and processing stages complete. For details, see [Track import progress](https://documentation.bloomreach.com/engagement/docs/data-import#track-import-progress).

You can use these example CSVs to test a small import before running a large one.

```text Purchase_item event CSV example
registered;timestamp;purchase_id;price;product_id;title;quantity;total_price
john@smith.com;1474886373;100001;35.30;29;Colorful bracelet;1;35.30
john@smith.com;1474886373;100001;9.30;47;Fancy necklace;2;18.60
```

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/4da33df-Import_event.png",
        "Import_event.png",
        "Event import mapping editor with registered unchecked and timestamp and data types correctly set."
      ],
      "align": "center",
      "sizing": "60% ",
      "border": true,
      "caption": "Example of a correctly mapped event import using the purchase_item sample CSV."
    }
  ]
}
[/block]

`registered` has no blue color and its checkbox is unchecked. It's used only to match each row to the correct customer profile, not imported as an attribute.

## Limitations

* Imported events can't be selectively altered or deleted.

* Events with future timestamps are processed, but only become visible after that future time has passed.