---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Import vouchers

[Vouchers](https://documentation.bloomreach.com/engagement/docs/vouchers-1) are text codes that customers use to redeem discounts or special offers in your campaigns. The platform lets you load pools of voucher codes, insert them into campaigns, and track their usage. Importing vouchers lets you bring pre-generated voucher codes into the platform and assign them to voucher pools.

This guide walks you through each step of the voucher import process, from preparing your data to running the import and verifying results.

## Prerequisites

* Read the [Imports article](https://documentation.bloomreach.com/engagement/docs/data-import) to understand how imports work, what sources are available, and how to monitor import progress.

* Prepare a pre-generated list of unique voucher codes in a single column with a header row.

* Voucher pool names must use a single word with no spaces. Use descriptive names for easy identification. For example, *10%Discount*, *100EURoff,* or a campaign name.

* Before using vouchers for the first time, track voucher usage during purchases. Go to **Project Settings** > **Mapping** > **Vouchers** and specify where the voucher code is tracked after use. This lets the platform recognize when a specific voucher is redeemed.

## Choose a voucher pool

1. To start an event import, go to **Data & Assets** > **Imports** > **+ New import** > **Vouchers**.

2. Choose an existing voucher pool to add new codes to, or create a new one by entering a name.

## Choose a data source

Select the source your voucher data is coming from. All standard import sources are supported. For details on each, see [Data sources](https://documentation.bloomreach.com/engagement/docs/data-import#data-sources).

Click **Preview** to verify the delimiter and encoding settings, then click **Next**.

## Assign the code ID

Drag the blue box to assign the code ID to the column containing your voucher codes. You can only import one column containing voucher codes.

<Image src="https://files.readme.io/74233445a584a01779ef946194b249f0785018a9f151499b147ee8b88fa663d7-Choose_data_sources_for_voucher_imports.png" alt="Voucher import mapping screen with the blue code ID box assigned to the voucher code column." align="center" width="70% " caption="Drag the blue code ID box to the column containing your voucher codes before running the import." border={true} />

## Schedule a repeated import (optional)

If you're importing from a dynamic source—URL, Database, or Bloomreach app—you can schedule a repeated import. For details, see [Schedule a repeated import](https://documentation.bloomreach.com/engagement/docs/data-import#schedule-repeated-imports).

## Run the import

Click **Run Import**. Go to **Data & Assets** > **Imports** to review the import and confirm all rows were imported correctly.

You can view all imported voucher pools in **Data & Assets** > **Vouchers**.

## Limitations

* Voucher codes must be unique within a pool. If a code already exists in the pool, it is ignored on reimport.

* You can't import the same code into multiple voucher pools.

If there are no voucher codes available to assign, campaigns fail to send and generate events with `status = enqueue_failed`. Weblayers aren't displayed and generate no events.