---
updatedAt: 2026-08-07T10:32:38.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Data exports

This article explains what Data exports is, how it works, and what types of data you can export.

<Callout icon="📘" theme="info">
  ### Note

  Contact your Customer Success Manager to access this feature if it's not available in your project.
</Callout>

## What is Data exports

Data exports feature lets you send raw customer and event data from Bloomreach in CSV or JSON format to your preferred file storage. Use existing [integrations](https://documentation.bloomreach.com/engagement/docs/integrations) to move data in a structure that fits your needs.

Define exactly what data to export, how to format it, and where to send it. Connect Bloomreach with tools or vendors that require bulk data processing, such as:

* Email campaign platforms
* CRMs
* Data warehouses
* Data lakes

## Data exports benefits

Data exports gives you full flexibility over your export output. You control:

* **Data structure:** Choose between customer profiles or event data.
* **Filtering:** Narrow down which customer profiles to include.
* **Attributes:** Select which fields to export.
* **Column mapping:** Rename columns to match your target system's schema.
* **Format:** Export as CSV, JSON, or JSON Lines.
* **Encoding and delimiters:** Configure text encoding and CSV delimiters.
* **Target storage:** Send data to [SFTP](https://documentation.bloomreach.com/engagement/docs/sftp), [Google Cloud Storage](https://documentation.bloomreach.com/engagement/docs/google-cloud-storage-for-imports-and-exports), [Amazon S3](https://documentation.bloomreach.com/engagement/docs/amazon-s3-integration), or [Azure Storage](https://documentation.bloomreach.com/engagement/docs/azure-blob-storage-integration).
* **File naming:** Apply custom, time-based naming conventions.

## Use case examples

Data exports supports a range of data workflows, for example:

* Loading partial data into a unified data warehouse or data lake for further analysis.
* Syncing campaign and consent data with external systems.
* Enriching data already tracked on the platform.
* Triggering campaigns in offline channels, such as call centers or stores.

## How Data exports works

When you [set up a data export](https://documentation.bloomreach.com/engagement/docs/set-up-data-exports), you configure the data source, filters, structure, format, and target destination. Once configured, the export runs based on your chosen trigger and sends a file to your specified storage location.

During the export, Bloomreach creates a temporary file first. Once the export completes, the temporary file is renamed to the final filename. Make sure you have the correct write permissions configured for your target storage.

### Types of data

You can export 2 types of data:

* **Static data:** Raw data such as customer attributes and event attributes—for example, `email` or `purchase_item`.
* **Dynamic data:** Enriched data such as customer segmentations, event segmentations, aggregates, and calculated expressions — for example, `customer total spent`.

### Export triggers

You can trigger an export in three ways:

* **Manual:** Run an export on demand from the **Exports** screen.
* **Scheduled:** Set a recurring schedule for automatic exports.
* **Via API:** Trigger exports programmatically for manually initiated workflows.

## Limitations

Keep the following limitations in mind when planning your exports:

* Only one running export is allowed per export definition at a time. For example, if a scheduled export labeled "All customers" runs every hour but takes 1.5 hours to complete, the 10 AM run starts only after the 9 AM run finishes at 10:30 AM.
* A maximum of four exports can run simultaneously across your Bloomreach project.
* [Azure Storage](https://documentation.bloomreach.com/engagement/docs/azure-blob-storage-integration) supports exporting up to 48.8 GB of data.
* Exporting all data from Bloomreach at once isn't supported, as it would exceed the limits above. For full data exports, consider using Loomi [BigQuery](https://documentation.bloomreach.com/engagement/docs/ebq) instead.

<br />