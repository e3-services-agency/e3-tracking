---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Data structure

The data structure in Bloomreach consists of 4 main elements:

* Customers
* Events
* Catalogs
* Vouchers

## Customers

Customers are the visitors to your website. They generate events through their actions. An anonymous customer is recognized by their cookie. Once they log in or make a purchase, they are identified by a "hard ID". The hard ID can be:

* An internal ID your business uses
* Your customer's email
* Any other unique identifier.

The identification assures that actions are assigned to the correct user. Hard IDs also allow us to track a single customer across more platforms or devices. For example, a customer with 1 hard ID can have several cookies representing each device or browser.

When a new customer with a different cookie is identified by an existing hard ID, these 2 customers are merged into one in Bloomreach. Every customer has attributes, such as `first_name`, `last_name`, `email`, or anything useful for your business.

Bloomreach is a customer-centric system, as everything involves individual customers, as opposed to session-based systems. This provides you with a unique and detailed single-customer view.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/a09ce6e-data_structure.png",
        "data_structure.png",
        "detailed single-customer view"
      ],
      "align": "center",
      "sizing": "80",
      "border": true,
      "caption": "Single customer view"
    }
  ]
}
[/block]

> 📘 Tip
>
> Read more about customers
>
> [How customer identification works](https://documentation.bloomreach.com/engagement/docs/customer-identification)\
> [Single Customer View and managing customers](https://documentation.bloomreach.com/engagement/docs/customers-1)

## Events

Events are actions customers perform in relation to your business. These can be any clicks and views on your website or any offline actions imported to Bloomreach.

Events have attributes too that specify them further. For example, an event `purchase` would have attributes specifying the timestamp, the number of items bought, the total price. Event attributes allow you to calculate the majority of metrics and drill down deep into your data. Typical events tracked in Bloomreach are:

* `page_visit`
* `view_item`
* `view_category`
* `cart_update`
* `checkout`
* `purchase`
* `purchase_item`

The maximum number of event attributes is 255 per event.

Events and their attributes enable you to get deep insights into your customers' behavior and create segmentations or automatically trigger personalized campaigns.

Data in Bloomreach are stored in a NoSQL schema-less database structure (also called schema-free or dynamically typed schema).

For details on settings related to events, review [Data Manager](https://documentation.bloomreach.com/engagement/docs/data-management-1). For details on attributes for all system events, review [System events](https://documentation.bloomreach.com/engagement/docs/system-events).

> 👍 Note
>
> You decide what events and attributes to track. Our consultants use their expertise to identify the best data structure for your business.

## Catalogs

A [catalog](https://documentation.bloomreach.com/engagement/docs/catalogs) is a lookup table with one primary key `item_id` that can be used in various ways. E-commerce websites typically use catalogs for storing products and their related information. On the other hand, publishing businesses use catalogs for their articles and section details.

Catalogs are usually updated through regular scheduled [imports](https://documentation.bloomreach.com/engagement/docs/data-import) from your data sources.

## Vouchers

[Vouchers](https://documentation.bloomreach.com/engagement/docs/vouchers-1) are simple text codes that customers can use to redeem discounts or other special offers. You can communicate these codes to your customers through your campaigns.

The simplest way to insert a voucher into a campaign would be to use the same code for every customer. However, sending a unique code to every customer is often desirable. The Vouchers feature allows you to load a pool of vouchers into Bloomreach, insert them into any campaign, and track their usage.