

---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Frequently asked questions (FAQ)

This page answers common questions about deploying and managing use cases in the Use Case Center.

## Getting started

### How can I implement a use case effectively?

The [About Use Case Center](https://documentation.bloomreach.com/engagement/docs/about-use-case-center#how-to-run-a-use-case) guide provides detailed steps for running your use case from start to finish.

### Where can I find a list of all use cases?

You can find all [use cases on our website](https://www.bloomreach.com/en/use-cases). You can also ask your CSM for the full list.

### What use cases are coming next?

Contact your CSM for information about upcoming use cases.

### How can I learn about the latest use case updates?

Newly added use cases display a **New** tag for six weeks after publishing. Use the **New use cases** tile on the Home page or the **Tags** filter on the All use cases page to filter for them.

## Requirements

### How do I map data for use cases?

Review the [use case requirements article](https://documentation.bloomreach.com/engagement/docs/use-case-requirements#catalogs).

### Can I check if my project meets the requirements without downloading the use case?

Yes, there are two ways to check:

1. Hover over the use case tile. If your project meets all required conditions, a green Ready to use tag appears. This tag reflects required integration requirements only — some optional data requirements may still be unmet.
2. Click Download the use case on the use case detail page. A Requirements page opens and lists all requirements with status indicators:
   1. Grey — your project doesn't meet an optional data requirement.
   2. Red — your project doesn't meet a required integration requirement.

Review the instructions on the Requirements page to understand what happens when you click **Continue**.

### What are integration requirements?

Integration requirements are always mandatory. If your project doesn't fulfill them, downloading the use case isn't possible. These requirements can include email, SMS, MMS, browser push, and mobile push integrations, as well as a default mobile center.

### What are optional requirements?

Data requirements—events, customer properties, and catalogs—are always optional. You're encouraged to check these before downloading so the use case pulls in your project's actual data structure. Learn more about [how to meet the requirements](https://documentation.bloomreach.com/engagement/docs/use-case-requirements).

You can still download a use case without meeting optional requirements. Unmet data items download with a recommended default structure, and you'll need to update them in the downloaded assets to match your project's data.

### Why do I need to create a placeholder catalog for some use cases?

Some use cases—for example, Gamified banners—require a voucher catalog or another non-product catalog. When this applies, a special requirement appears under the **Other requirements** section on the **Requirements** page.

The use case references this catalog using Jinja so the catalog name in your project must exactly match the name specified in the use case instructions. To meet this requirement before downloading:

1. [Create a catalog](https://documentation.bloomreach.com/engagement/docs/catalogs) using the exact name specified in the use case instructions.
2. Download the use case.
3. Replace the placeholder catalog reference in the [Jinja code](https://documentation.bloomreach.com/engagement/docs/jinja) with your actual catalog once it's created.
4. Delete the placeholder catalog from your project.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/9cc978365095c7ac6e244c9a2cdf486177df47eb7e7947d1027c959cd13a8291-dummy_catalog.png",
        "",
        "Other requirements section on the Requirements page showing a placeholder catalog requirement."
      ],
      "align": "center",
      "sizing": "700px",
      "border": true,
      "caption": "The Other requirements section flags when a use case needs a placeholder catalog before downloading."
    }
  ]
}
[/block]

### How are requirements set up per use case?

Data requirements—events, customer properties, and catalogs—are always optional. You can download a use case even if you don't meet them.

If you don't meet a data requirement, the use case downloads with default best-practice data for that event, customer property, or catalog. You'll need to update those items in the downloaded assets to align with your project's data. Make sure to view all assets included in the use case after downloading.

Map at least the purchase (complete) and purchase (returned) events in data mapping. These events appear across many assets and are the most time-consuming to update later.

## Download and access use cases

### What happens if I download a use case without meeting the data requirements?

The use case downloads with default best-practice data for any event, customer property, or catalog that didn't meet the requirements. You'll need to update those items in the downloaded assets to align with your project's data.

Make sure to [view all assets included in the use case](https://documentation.bloomreach.com/engagement/docs/ucc-faq#how-can-i-see-all-the-assets-downloaded-with-the-use-case-uc) after downloading. See the [must-have data](use-case-requirements) that unlocks 85% or more of use cases for your project.

### What does the "Repeated use case" message mean?

This message appears when you've previously downloaded the same use case. You can open the latest version or download it again.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/e2519edfaf6dc852ac557ed4c19619d51445034721e0c8f175ce99339fd3e136-repeated_use_case.png",
        "",
        "Repeated use case message shown when a use case has been previously downloaded"
      ],
      "align": "center",
      "border": true,
      "caption": "This message appears when you've already downloaded the same use case — you can open the latest version or download it again."
    }
  ]
}
[/block]

### How can I access a use case I downloaded from the Use Case Center?

There are 2 ways to access a downloaded use case:

* Go to Use Case Center > Project Use Cases. Click the use case to see the active assets—for example, a scenario or weblayer—and the dedicated evaluation dashboard.
* Access the use case assets directly in the relevant section of the application. For example, use case scenarios are also available under Scenarios.

The first option is recommended because it keeps all related assets and the evaluation dashboard in one place

### How can I see all the assets downloaded with the use case?

Go to Use Case Setup, click the three dots in the top-right corner, and select Show use case items. You can switch between the action steps view and a full list of all assets.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/6753cd396eb08e337719505e75ab650255d47bb7c9ac6d394b5dfd423d03a1aa-show_use_case_items.png",
        "",
        "Use Case Setup page showing the three-dot menu with the Show use case items option."
      ],
      "align": "center",
      "sizing": "700px",
      "border": true,
      "caption": "Select Show use case items to switch between the action steps view and a full list of all downloaded assets."
    }
  ]
}
[/block]

## Manage use cases

### How can I delete a downloaded use case from my project?

Go to **Project Use Cases** and select **Delete** for the chosen use case. This permanently removes all assets downloaded with the use case, including assets not visible on the Use Case Setup page.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/c0922669f2cd617f999c16daa927c8cac3403d7ce2d9fc5cf21b1c9c4b5b83d6-delete_use_case.png",
        "",
        "Project Use Cases page showing the Delete button for a use case."
      ],
      "align": "center",
      "border": true,
      "caption": "Select Delete to permanently remove a use case and all its downloaded assets from your project."
    }
  ]
}
[/block]

### How can I unlink downloaded assets from the use case folder?

You can keep just one part of the downloaded assets — for example, only the dashboard — or combine parts from multiple use cases.

1. In **Use Case Setup**, click the three dots and select **Show use case items**.
2. Click the three dots again and select **Unlink all items from use case**.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/52f47020929c07d3ae8c7a8d99f99362a80cabff8b6cbedfc328fc5e2663a04e-show_use_case_items.png",
        "",
        "Use Case Setup page showing the three-dot menu with the Unlink all items from use case option."
      ],
      "align": "center",
      "sizing": "700px",
      "border": true,
      "caption": "Select Unlink all items from use case to detach assets from the use case folder without deleting them."
    }
  ]
}
[/block]

After unlinking, the assets no longer appear in **Project Use Cases** but remain available in the relevant sections of your project — for example, under **Scenarios** or **Dashboards**. There's no visual or dependency link between them after unlinking, and you can delete some assets while keeping others. Identify where each asset is stored before you unlink. It isn't possible to re-link assets after unlinking.

### Can I share a use case I built in my project?

Your use case can become publicly available to all Bloomreach users in the Use Case Center. Contact the team using the **Missing a use case?** option on the Home page or All use cases page. Your CSM can also help with this.

### What should I do if I can't find a specific use case?

Use the search bar and filters within the Use Case Center to narrow the list. If you still can't find it, contact your CSM. If the use case doesn't exist yet, submit your idea using the Missing a use case? option on the Home page or All use cases page.

## Troubleshoot

### What if I encounter an error with an existing use case?

Contact support or your Customer Success Manager (CSM).

### What do these errors mean?

* `property_name`: The listed event attribute isn't mapped in Data Mapping. This error appears on the Use case setup page after downloading. To fix it, map the event attribute and download the use case again.
* `mapped_event`: The event isn't mapped in Data Mapping. This error appears on the Use case setup page after downloading. To fix it, map the event and download the use case again.
* **Voucher pool with name vouchers doesn't exist:** A voucher pool or other non-product catalog required by the use case isn't present in your project. This error appears on the Requirements page before downloading. To fix it, create a dummy catalog with the exact name indicated in the error message.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/f03a8c5b4b1b556cd0483e3b35525cf9799c977eb4785fdd5106bb11809e5a47-ucc_error.png",
        "",
        "Use Case Setup page showing property_name and mapped_event error messages."
      ],
      "align": "center",
      "sizing": "700px",
      "border": true,
      "caption": "These errors appear after downloading when event attributes or events aren't mapped in data mapping."
    }
  ]
}
[/block]

### I can see the use case tile, but I can't open it.

Your project is missing a module required by this use case, such as Predictions, Webhooks, or AI Segments. Contact your CSM or Account Manager to acquire the module.

### I can't access the next step in the use case.

Access depends on your [role and permissions](https://documentation.bloomreach.com/engagement/docs/access-management). Ask a user with the required access to help, or request an access update.

### Can I find which data is needed for which use case?

This isn't possible for individual use cases. However, if you complete the [Data Mapping](https://documentation.bloomreach.com/engagement/docs/use-case-requirements#data-mapping) items marked as Must have, you'll meet the data requirements for 85% or more of use cases.