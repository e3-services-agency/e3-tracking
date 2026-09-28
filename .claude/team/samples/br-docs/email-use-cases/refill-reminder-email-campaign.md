---
updatedAt: 2026-03-30T20:07:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Refill reminder email campaign

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Champion</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Higher purchase frequency</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Retention</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

Drive repeat purchases and retain customers with timely, personalized refill reminders based on their buying habits. Automated refill reminders are triggered at the perfect time by leveraging purchase data. For repeat customers, reminders are sent based on their buying history, while first-time buyers receive emails timed to average refill patterns. Each email highlights recently purchased products, making it easy for customers to restock their favorite items.

[This use case](https://www.bloomreach.com/en/products/engagement/plug-and-play/refill-reminder-email-campaign) boosts purchase frequency, retention rates, and overall customer satisfaction.

> 👍 Note
>
> Interested in implementing this use case? Contact your Customer Success Manager to discuss how it can be tailored for your business.

### Key features

* Automated refill reminders based on purchase history
* Personalized timing for first-time and repeat buyers
* Optimized email sending for best click rates
* Product highlights for easy restocking

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/58bdc2d9ccf2723970c7afb9bb75b4144522419d93c2906b2ea1c3c7701d576f-BR_Use_Case_Image__Refill_Reminder_Email_Campaign2x.jpg",
        "",
        ""
      ],
      "align": "center",
      "sizing": "80% ",
      "border": true
    }
  ]
}
[/block]

## Use case items

With this use case, you’ll get:

* Scenario: A pre-built scenario that triggers refill reminders based on customer purchase history.

* Email Campaign: Automated emails sent to customers with personalized refill reminders.

* Product Catalog Integration: Displays products to be refilled based on the chosen product catalog.

* **Evaluation dashboard**: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

#### Define your refill campaign scope

Before deploying the use case, you need to define which products will be included in your refill campaign.

This use case is designed to work with `category_level_1` by default, but you can modify it to use other purchase\_item event attributes:

* variant\_id
* product\_id
* category\_level\_1
* category\_level\_2
* category\_level\_3

Open the **Refill product definition** - event segmentation and adjust the segment to include all purchase items for products you want to target in the refill campaign. You can choose one or multiple event attributes from the list above. Other attributes are not supported in this template. Do not change the segment name.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/4278964037572978abcb5ef6416b7f3cf029dbd011cee144e458e3bbc5cace44-Refill_Products_Definition_-_event_segmentation.png",
        "",
        ""
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

#### Data requirements

Ensure your project data includes `purchase_item` events from the **last 365 days** for the chosen product categories. Customers must have at least two `purchase_item` events **with the same product ID** for repeat reminders.

### Understand the use case logic

This use case reduces churn and cultivates an active, engaged subscriber base through automated refill reminders. The campaign uses custom `repeat` event tracking to identify when customers should restock their previously purchased products.

#### Custom event tracking foundation

The scenario tracks custom `repeat` events to identify customers eligible for refill reminders. These events are created based on purchase history patterns and help determine the optimal timing for sending refill notifications. When a customer makes a repeat purchase (at least two purchases of the same product), the system calculates their personalized refill time gap and tracks a `repeat` event on their profile.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/f5476a834023bb574a57adfb2d36fd8fbf353df4a57cad32fad3d66f9f4b1694-Refill_reminder_repeat_event.png",
        "",
        ""
      ],
      "align": "center",
      "sizing": "80% ",
      "border": true
    }
  ]
}
[/block]

#### Step 1: Initial load - Creating the repeat event foundation

Run this flow once to create repeat events for previously repeated purchases. The flow processes only existing `purchase_item` events and creates a repeat event for customers with a next purchase date in the future.

The system identifies customers with `purchase_item` events from the chosen categories in the last 365 days and tracks `repeat` events on their profiles. Customers must have at least 2 `purchase_item` events with the same `product_id` to be eligible for repeat event tracking.

**Customize tracking parameters (optional)**

Open the node that tracks `repeat` event and adjust the following parameters based on your business needs:

* **Row 4 (set threshold = 2)**: The minimum number of purchase\_item events from the same product that must be present on the customer profile to calculate the customer's personalized 'time gap' for product refill.

  **Note**: If you change the current threshold of 2, ensure to include all customers with events between 1 (excluded) and your custom threshold (excluded). Create a separate campaign flow for these customers, as they will not be covered by the existing flows.

* **Row 7 (set max\_events = 5)**: The maximum number of purchase\_item events of the same product that will be used to calculate the customer's 'time gap' for this product refill. For example, the last 5 `purchase_item` events of product ID 123 will be selected to calculate the average 'time gap' for the product 123 refill reminder.

* **Row 10 (set days = 365)**: Only purchase\_item events within the specified timeframe will be considered in the customer's average 'time gap' calculations. For example, all purchase\_item events tracked within the last 365 days will be included in the calculations.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/87a9ec621626e0b650b81866f6e85aa36f92e9188dddc3ccab58ac065b672597-Track_repeat_event_scenario_node.png",
        "",
        ""
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

#### Step 2: Track 'repeat' event for all products from chosen category

Every `purchase_item` event from the selected categories triggers the flow and evaluates the customer's purchase history. The system checks if the `product_id` is already a repeat purchase for that customer.

**Branch 2: Repeat buyers (2+ previous purchases)**

If the customer has made a repeat purchase and exceeds the threshold (at least 2 purchases of the same product), the system tracks a `repeat` event. This event includes the customer's personalized refill time gap, calculated from their individual purchase history. This `repeat` event will trigger the email flow in Step 3B in the future when the refill timing arrives.

**Branch 3A: First-time buyers**

If the customer is purchasing the product for the first time, the system checks if there's an average time gap calculated at the project level for this product. If an average time gap is available, the customer enters a wait period in this flow and receives a refill email directly (without tracking a `repeat` event yet). The `repeat` event will only be tracked when the customer makes their second purchase of this product and thus we will be able to calculate his personal average time gap for the specific product.

#### Step 3A: Send email to all customers that bought the product for the first time

This email flow is triggered directly from Step 2 for first-time buyers.

For first-time buyers making their second purchase, the system calculates the average time gap based on project data. If an average time gap is available for the particular product, the campaign sends a refill email to the customer based on the average refill time gap.

The customer waits until 24 hours before the calculated future refill day. The email sending time is optimized for the best click rate, and if newsletter consent is present and the customer hasn't purchased this product in the meantime, the refill email is sent containing the specific product to be refilled.

#### Step 3B: Send email to all customers that have refilled the product in the past

This email flow is triggered by the `repeat` events created in Step 2 for customers who made at least two previous purchases.

Choose one of two flows:

**Option 1: One refill product per email**

Every time a new repeat purchase is added, the system waits until the next expected purchase date and triggers an email. This approach works best when products are rarely bought together, such as when you have a low number of products per purchase.

The flow is triggered by the 'repeat' event and sends an email reminder with one product at a time. The customer waits until 24 hours before the calculated future refill day. The email sending time is optimized for the best click rate, and if newsletter consent is present and the customer hasn't purchased this product in the meantime, the refill email is sent.

**Option 2: Multiple refill products per weekly email**

The scenario checks every week for items that should be replenished in the next week and groups them together into a single email. This approach is beneficial if you have a high number of products per purchase, as it reduces the volume of emails and consolidates reminders into a consolidated weekly email.

The flow is triggered weekly by the 'Repeat' event trigger. The system waits until the optimal send time and checks if newsletter consent is present and the customer hasn't purchased these products in the meantime. The refill email is sent containing multiple products to be refilled.

### Adjust the use case

Now that you understand the use case logic, you can set up the use case according to your needs.

#### Product catalog

Customize the product catalog to ensure the email content displays the correct products for refill.

#### Email settings

Follow this detailed guide to [customize your email settings](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-email-design-and-settings-in-the-use-case-center#settings).

#### Design and copy

Customize the email visuals and copy to align with your company's brand identity.

Learn how to [adjust the email template with products](https://documentation.bloomreach.com/engagement/docs/customize-the-email-node-in-use-case-center) in the email node.

### Test and run the use case

Test a use case before deploying it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-email-in-the-use-case-center) ensures you don't send unfinished or imperfect campaigns to your customer base.

Once the testing is over, run the use case. Open the email and click the **Start** button in the upper right corner to launch the campaign.

### Evaluate the results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt [evaluation dashboard](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) to measure and analyze relevant data.

**Configure attribution window**

Before using the evaluation dashboard, you need to set the attribution window in two event segmentations:

1. Open the **Purchases from Refill vs. Others** event segmentation.
2. Adjust the time before purchase in hours (for example, 48 hours).

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/a9d58ad1ea008d5811204328a92dddb1549d680845d14c8f91362b654840ab55-Attribution_window_setting_Refill_reminder.png",
        "",
        ""
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

3. Open the **Purchase\_item target** event segmentation.
4. Adjust the time before purchase in hours to match the first segmentation.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/40621e3f8d7da858e6a6e4e88e5f6dbc72b9b7c6e347f1eb98eeccb0c059318d-Refill_reminder_purchase_item_target_event_segmentation.png",
        "",
        ""
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

**View dashboard results**

1. Open the evaluation dashboard
2. Enter the email's name. For example, Refill reminder email campaign.
3. Click **Refresh** to see the results.
4. Check campaign results regularly to optimize performance.