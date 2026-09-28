---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Data hub versus legacy catalogs

This article explains the key differences between Data hub [catalogs](https://documentation.bloomreach.com/engagement/docs/data-hub-catalogs) and legacy catalogs.

## Key differences

While both versions serve the core purpose of managing catalog data, Data hub catalogs introduce architectural and functional improvements to manage catalogs in Bloomreach.

The fundamental definitions of a catalog and the items it contains are unchanged. The way you use catalogs in your Bloomreach project remains consistent across versions.

### Integration, configuration, and management

* **Dynamic configuration**: Data hub catalogs allow configuration changes, such as modifying searchable attributes, without requiring catalog recreation. Legacy catalogs require catalog recreation for many configuration changes.
* **Schema-less ingest format**: Data hub catalogs have a schema-less ingest format, which eases source system setup. Legacy catalogs require source systems to adhere to a strict schema.
* **Update only changed attributes**: Data hub catalogs support fine-grained attribute updates and enhanced processing modes, allowing you to update only what has changed.
* **Job history**: Data hub catalogs maintain a searchable history of jobs with detailed operation information, improving transparency and debugging.
* **Adjustable limits**: Data hub catalogs allow for adjustable limits; if a catalog outgrows its current limits, Bloomreach can work with you to increase them if the use case is valid and tested for performance impacts.

### Performance, reliability, and scalability

* **Faster data updates**: Data hub catalogs offer significantly faster item updates, with up to 10x faster processing times, particularly beneficial for large catalogs.
* **More reliable update times**: Data hub catalogs ensure consistent update times, preventing fluctuations.
* **Improved multi-tenant support**: Each catalog in Data hub catalogs has its dedicated processing queue, preventing large updates in one catalog from impacting others on shared and private instances. Legacy catalogs have a single processing queue per instance.

### Data quality and consistency

* **Stronger consistency guarantees**: Data hub catalogs provide transactional guarantees, ensuring that updates are atomic and preventing partial updates that could lead to inconsistent data. Legacy catalogs don’t have the same transactional integrity.
* **Ordered processing**: Updates to items in Data hub catalogs are processed in the order they are received, preventing out-of-sequence updates. Legacy catalogs have less robust ordering guarantees.
* **Full replacement mode**: Data hub catalogs' full replacement mode, including with imports, facilitates the automatic cleanup of catalogs and deletion of old data without manual tracking. Legacy catalogs require more manual data management.
* **Enhanced error handling**: Data hub catalogs provide clear feedback on processing issues and keeps track of errors, helping you identify and address new issues.

### Data handling and processing

* **Records as a staging layer**: Data hub catalogs introduce a records layer as an intermediate step for raw data before it becomes Items. This allows for better data validation and control, ensuring that only valid data is processed into Items. Legacy catalogs don't have this staging layer.
* **Heterogeneous data**: In Data hub catalogs, items can have different sets of attributes, removing the need for forced uniformity, whereas Legacy catalogs have a more rigid schema.
* **Patch operations**: Data hub catalogs support sequenced, multi-operation updates in a single request through patch operations, which is more efficient than the update mechanisms in legacy catalogs.
* **Schema-free source data**: Source systems don't need a strict schema when sending data to Data hub catalogs.

To migrate from legacy catalogs to Data hub catalogs, review the Data hub [catalogs guide](https://documentation.bloomreach.com/engagement/docs/data-hub-catalogs).