---
updatedAt: 2026-03-30T20:07:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Product expiration reminder

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use case maturity: \n        <p>Advanced</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Higher customer satisfaction</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use case goal: \n        <p>Retention</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

Prevent customers from running out of essential items by automatically reminding them when purchased products approach their expiration date. This automated omnichannel campaign targets customers who buy perishable goods like groceries or cosmetics, sending timely reminders across mobile push notifications, email, and SMS. By combining catalog data with event-triggered automation, you can drive repeat purchases and improve customer retention while demonstrating care for product freshness.

## Key features

* Automated expiration tracking based on purchase events and catalog data.
* Flexible expiration date calculation using either event attributes or catalog columns.
* Intelligent omnichannel fallback logic (push → email → SMS).
* Consent-aware targeting that respects customer communication preferences.
* Purchase recency checks to avoid redundant messaging.
* Customizable channel priority based on your setup and engagement data.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/30ff234ff4ade016c264ebed2ad1a54d244558a875a5f3fa7d1a92c5b473d2e3-Product_Expiration_Reminder.jpg",
        "",
        ""
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

## Use case items

* **Evaluation dashboard**: Track campaign performance metrics and conversion outcomes
* **Expiration reminder scenario**: Pre-built automation with purchase tracking and omnichannel reminder flows
* **Catalog attribute**: Global days\_until\_expiration field for expiration tracking

## How it works

The campaign has two triggers. The `purchase_item` trigger saves products with expiration periods into the customer profile. This newly created event triggers communication later when the product is about to expire and the customer hasn't bought a new one in the meantime.

**First flow** checks if the expiration date comes directly from the `purchase_item` event or needs to be calculated using the catalog's `days_until_expiration` column. When customers and their purchased products match all conditions, the system creates an `expiration_reminder` event with these attributes:

* `product_id`
* `variant_id`
* `original_purchase_date`
* `expiration_date`

**Second flow** is triggered by the `expiration_reminder` event. The scenario checks if the customer consented to any communication channels and verifies they haven't repurchased the product. Then it chooses a channel where customers can be reached.

You can change the order of the individual channels. The predefined order is based on estimated difficulty of setup and potential engagement. The push channel has an email follow-up in case the push doesn't convert customers. Customers who don't respond to push or email will be targeted by SMS.

## How to deploy the use case

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

### Prerequisites

Before deploying this use case, ensure you have:

* Product catalog configured with `days_until_expiration` attribute for products with expiration dates.
* `purchase_item` event tracking implemented.
* Communication channels configured (mobile push, email, SMS).
* Customer consent management active across all channels.

### Adjust the purchase tracking flow

In the first flow, adjust the product category filter to specify which products have an expiration period. Connect the trigger to the flow before launching the use case live.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/a93dbe317d9374e6c1300db6db29900a52d502d48424164827613ee583bc9747-Ist_fllow_-_Expiration_Reminder__Plug_and_Play_PROD__Bloomreach_2025-12-04_12-31-05.png",
        "",
        ""
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

Review your catalog to verify the `days_until_expiration` field is set. If it's named differently, adjust the field name in the Jinja snippet and in the scenario email, SMS, and push nodes.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/1833cc3a8fa4bc24e525f47ed90b947455d805623bbcead90cbd6c96b8e29377-Days_until_expiration_is_set_in_catalog__Plug_and_Play_PROD__Bloomreach_2025-12-04_12-26-39.png",
        "",
        ""
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

In the first flow, adjust the product category filter to specify which products have expiration dates. This prevents the flow from processing non-perishable items.

### Configure the expiration reminder flow

Open the consent verification nodes to check if the selected consent categories correspond to the consent in your project for:

* Push notification consent
* Email consent
* SMS consent

Verify customer attribute references for mobile push ID, email address, and phone number.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/770f6815e466b7662c0a8eaa9efa3573836409a1abab50aa9a0dec7099b06a49-2nd_fllow_-_Expiration_Reminder__Plug_and_Play_PROD__Bloomreach_2025-12-04_12-31-05.png",
        "",
        ""
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

### Customize channel order

You can change the order of the individual channels by rearranging the conditional nodes and channel actions to match your priorities.

### Design and customize messages

Open each communication node to customize content. Change the settings, design, and copy to reflect your company's brand identity:

* Set up your [mobile push notifications](https://documentation.bloomreach.com/engagement/docs/mobile-push-notifications#settings).
* Customize the [email node](https://documentation.bloomreach.com/engagement/docs/customize-the-email-node-in-use-case-center).
* Personalize [SMS](https://documentation.bloomreach.com/engagement/docs/sms-in-scenarios).

Verify that consent categories match your project settings for each channel.

### Test and run the use case

[Test the scenario](testing-scenarios) in your use case, or learn more about how to test individual use case items:

* Test your [mobile push notifications](https://documentation.bloomreach.com/engagement/docs/mobile-push-notifications#sending-test-push-notifications).
* Study [email testing](https://documentation.bloomreach.com/engagement/docs/email-testing).

Once the testing is over, launch the campaign.

### Evaluate the results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt evaluation dashboard to measure and analyze relevant data:

1. Open the evaluation dashboard.
2. Enter the campaign name, for example, "Product Expiration Reminder".
3. Set the attribution window for revenue in hours, for example, 24.
4. Click **Refresh** to see the results.
5. Check campaign results regularly to optimize performance.