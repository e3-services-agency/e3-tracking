---
updatedAt: 2026-07-29T08:00:39.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Cloning

This guide explains how to clone items.

Cloning lets you copy items from one project to another, saving time when replicating configurations across environments. Use this feature across almost all Bloomreach modules, including reports, scenarios, predictions, and catalogs.

> ❗️ Warning
>
> Cloning is irreversible and doesn't allow window closure during the process. Verify you're cloning the correct items to the correct projects before proceeding. It is irreversible and may cause a mess if done incorrectly.

## How to clone items

### Choose what to clone

Click on an item and select **Clone to project**.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/f991d990f6dbb679e2d641417a0a22bab7ebcb2611ba103e31057edbbbc3df2c-Clone_to_project.png",
        "Cloning.png",
        "Interface showing the Clone to another project option."
      ],
      "align": "center",
      "sizing": "60% ",
      "border": true,
      "caption": "Select an item and choose Clone to another project to start."
    }
  ]
}
[/block]

### Choose where to clone

Select the accounts and projects where you want to clone the item. You can select multiple destinations.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/9abbe6ff49033def7e1c5e6549d448c85f36393410e2d7def15beadeb584a5f8-Cloning_destinations.png",
        "Cloning destination.png",
        "Account and project selection screen for cloning destination."
      ],
      "align": "center",
      "sizing": "60% ",
      "caption": "Choose one or more target accounts and projects for cloning."
    }
  ]
}
[/block]

### Configure cloning settings

Configure initiatives, suffixes, and [data mapping](https://documentation.bloomreach.com/engagement/docs/data-manager#cloneable-data-mapping) for the cloned items. Use **Linked settings** (the link icon) to apply the same initiatives and suffixes across all target projects.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/1f75d74-Linked_settings.png",
        "Linked settings.png",
        "Cloning settings panel with Initiative, Suffix, and Linked settings options."
      ],
      "align": "center",
      "sizing": "60% ",
      "caption": "Use Linked settings to apply initiative and suffix changes across all target projects at once."
    }
  ]
}
[/block]

#### Initiatives

Add cloned items to an initiative in the target project. With **Linked settings**, Bloomreach automatically finds matching initiative names across projects. Create new initiatives if needed. They're created immediately, not after cloning. You'll receive a notice if you lack permissions to create initiatives.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/a77a43280753964a6a885602f7c7c648f5098f4829f8527beb1df92ba0021e92-Create_new_initiatives.png",
        "Creating new Initiative.png",
        "Initiative selection dropdown in cloning settings"
      ],
      "align": "center",
      "sizing": "50% ",
      "caption": "Assign the cloned item to an existing initiative in the target project."
    }
  ]
}
[/block]

### Check for dependencies

After you click **Next**, Bloomreach checks for dependencies in 2 stages.

#### 1. Finding dependencies

Identifies all items the cloned item uses (aggregates in [Jinja](https://documentation.bloomreach.com/engagement/docs/jinja), segmentations in [filters](https://documentation.bloomreach.com/engagement/docs/segmentations), and more) and includes them in the clone. Updates all references automatically.

#### 2. Finding duplicates

Compares dependencies with existing items in the target project. Items are duplicates if they meet all criteria:

* Share the same cloning lineage or internal ID.
* Have the same type (scenario, aggregate, and so on).
* Have the same name, including the suffix.
* Belong to the same initiative or no initiative.

Manually created items are never matched as duplicates, even with identical type, name, and initiative. Initiative cloning doesn't detect duplicates. Duplicate detection only works for individual items like scenarios or reports.

For duplicates, choose how to proceed:

* **Duplicate:** Creates a new copy alongside the existing item.
* **Replace:** Overwrites the existing item with the new definition.
* **Use existing:** Keeps the existing item unchanged; dependencies reference the existing item.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/e30a5ac-Review_dependencies.png",
        "Review dependencies.png",
        "Dependency review screen showing duplicate handling options."
      ],
      "align": "center",
      "sizing": "60% ",
      "caption": "Choose to duplicate, replace, or use the existing item for each detected dependency."
    }
  ]
}
[/block]

If dependency review errors occur, you'll see which projects had issues. For example, data mapping errors appear if multiple events map to the same event.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/8ca8c1c-Dependencies_Error.png",
        "Dependencies Error.png",
        "Error message shown during dependency review in cloning."
      ],
      "align": "center",
      "sizing": "60% ",
      "caption": "The dependency review flags errors by project, such as data mapping conflicts."
    }
  ]
}
[/block]

### Confirm cloning execution

Once you are satisfied with the cloning dependencies setup, click **Apply** and **Start Cloning**.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/a5ed01e-ComfirmScreen.jpg",
        "",
        "Cloning confirmation screen with Apply and Start Cloning buttons."
      ],
      "align": "center",
      "sizing": "60% ",
      "caption": "Confirm your cloning setup before starting the process."
    }
  ]
}
[/block]

### Complete cloning

Review the cloning results. Any errors (such as insufficient permissions) appear in the summary.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/a074bf4-Cloning_complete.png",
        "Cloning complete.png",
        "Cloning results screen showing completed and failed items."
      ],
      "align": "center",
      "sizing": "60% ",
      "caption": "Review the cloning results and any errors once the process finishes."
    }
  ]
}
[/block]

## Asset-specific cloning actions

For cloned scenario email nodes, email campaigns, or email templates, the email provider switches to the target project's default provider. If no default provider exists, the email provider remains unset. Email template **Link transformation** settings reset to default (Auto).

All campaigns reset to **Draft** status upon cloning. Running campaigns doesn't automatically start in target projects.

Authentication integrations (in webhooks) and Ads integrations (in ads audiences) used in scenarios are removed. Add them manually after cloning.

## Cloning catalogs: version-specific behavior

### Legacy catalogs

Cloning legacy catalogs (both product and general) creates an independent duplicate in the target project. The cloned catalog includes the catalog structure, settings, and import definitions, but operates separately from the original.

### Data hub catalogs

**Product catalogs** created via Data hub [item collections](https://documentation.bloomreach.com/data-hub/docs/item-collection) lose their connection when cloned in the application. The cloned catalog loses import connections and no longer receives updates from the original Data hub source. Instead of cloning, [create a new item collection](https://documentation.bloomreach.com/data-hub/docs/how-to-set-up-an-item-collection). This maintains proper synchronization.

**General catalogs** clone safely while preserving their enhanced capabilities as Data hub-enabled [general catalogs](https://documentation.bloomreach.com/engagement/docs/data-hub-catalogs) with mutable schemas and dynamic configuration. The version doesn't change during cloning.

## Data mapping

Different projects use different names for events and customer properties. The Use data mapping function solves this complexity during cloning.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/02c735a-data_mapping_cloning.png",
        "data mapping cloning.png",
        "Use data mapping checkbox in cloning settings."
      ],
      "align": "center",
      "sizing": "60% ",
      "caption": "Enable data mapping to automatically translate event and property names between projects."
    }
  ]
}
[/block]

After ticking the box, upon cloning, this function automatically modifies all cloned items based on the mapping and translates your events' names and attributes, customer properties, and catalog names used in the items from the mapped data in the source project into mapped data in the target projects.

This process helps you eliminate manual changes needed after cloning items between projects. It is enabled by default, but you can disable it to prevent changes to your original definitions.

### Coverage

Data mapping applies to most entities but not all occurrences. Entities searched for data mapping during cloning include all Jinja, customer filters, and reports for customer properties; or event filters, campaign audiences, and aggregates for events.

### Troubleshooting

If you are unable to clone your event and the application shows "Multiple custom events mapped to the same original event”, adjust your data mapping so that different events don't share the same event attributes.

### Data hub catalogs

For product catalogs, set the mappings in the [item collections schema](https://documentation.bloomreach.com/data-hub/docs/configure-schema).