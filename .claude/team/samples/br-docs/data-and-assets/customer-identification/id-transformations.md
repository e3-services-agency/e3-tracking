---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# ID transformations

This guide explains how ID transformations work in Bloomreach and how they help maintain consistent customer identification across your tracking and import data.

> 📘 Note
>
> ID transformations apply to both tracking and imports. Real-time ID tracking lets you automatically apply a selected transformation to all tracked IDs. You can also apply the same transformation to a list of IDs imported into your project. Learn more in the [Web tracking](https://documentation.bloomreach.com/engagement/docs/web-tracking-1) and [Data imports](https://documentation.bloomreach.com/engagement/docs/data-import) articles.

## Customers' IDs transformation

You can create multiple hard and soft IDs for customers in Bloomreach. These IDs automatically go through **trim transformation**, and you can choose to enable or disable **lowercase transformation**. This ensures consistent formatting and efficient handling of customer IDs.

> 🚧 Important
>
> Discuss and agree with your teams before enabling or disabling transformations. Changes can significantly affect the consistency of your data.

## Trim ID transformation

Trim transformation removes all whitespace from the beginning or end of a string.

> 📘 Note
>
> Trim transformation is mandatory and automatically enabled for every new project. If your project was created before this feature released on 17 Dec 2018, contact your Bloomreach representative to enable trim transformation.

**Examples of trim transformations**

| Input values                 |    | After transformation     |
| :--------------------------- | :- | :----------------------- |
| "    <email@example.com>"    | →  | "<email@example.com>"    |
| "<email@example.com>  "      | →  | "<email@example.com>"    |
| "em  <ail@example.com>"      | →  | "em  <ail@example.com>"  |
| "  15er89g7s9+gs4f65sd768  " | →  | "15er89g7s9+gs4f65sd768" |

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/97aac22-image_2.png",
        null,
        "Trim transformation automatically removes leading and trailing whitespace from customer IDs"
      ],
      "align": "center",
      "border": true,
      "caption": "Trim transformation automatically removes leading and trailing whitespace"
    }
  ]
}
[/block]

## Lowercase ID transformation

Lowercase transformation converts all characters to lowercase. It's an optional feature, but you should **avoid toggling it on and off repeatedly** — doing so can create significant inconsistencies in your tracked data.

Your decision to enable or disable lowercase transformation should depend on whether you want customer IDs to be case-sensitive.

### Why enable the lowercase transformation

Say you track events from two email addresses: `john.doe@example.com` and `John.Doe@example.com`. These represent the same customer, but inconsistencies between your CRM and ecommerce platform can cause them to appear as separate IDs. Without lowercase transformation, Bloomreach assigns these events to two different customer profiles — reducing data quality.

Enabling lowercase transformation ensures both IDs map to a single unique customer. Enable lowercase transformation on IDs that hold plain-text emails. Keep it disabled on IDs that hold cookies and hashed emails.

> 📘 Note
>
> Enabling transformations only affects data that flows into your project after the change. Re-import any existing data to apply a trim or lowercase transformation to it.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/a8aef73b55a7fb4c6ee18c5a91f558002f1394db6ccd77ce1ebbb5af5f09dfa6-Screenshot_2026-03-30_at_14.19.38_2.png",
        "id-transformation.png",
        "Lowercase transformation merges case variants of the same email into a single customer profile."
      ],
      "align": "center",
      "sizing": "6000",
      "border": true,
      "caption": "Lowercase transformation merges case variants of the same email into a single customer profile"
    }
  ]
}
[/block]