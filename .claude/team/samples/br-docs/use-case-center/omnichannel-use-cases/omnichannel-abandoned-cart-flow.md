---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Omnichannel abandoned cart flow

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Advanced</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Revenue</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Performance</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

The [Omnichannel abandoned cart flow](https://www.bloomreach.com/en/products/engagement/plug-and-play/omnichannel-abandoned-cart-flow) campaign sends a personalized message through one of the omnichannel approaches to customers who have left your website without a purchase but have viewed at least three items. Such messages may spark forgotten interest, lead customers to purchase the products and increase overall conversion and RPV.

### Key features

* Multiple communication channels including email, browser push notifications, mobile push notifications, SMS/MMS, and retargeting to re-engage customers who have abandoned their carts.
* Each channel has specific follow-up actions based on customer interactions.
* Communications are sent only to customers who have provided the necessary consents. This helps in maintaining compliance and targeting the right audience effectively.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/abd02c9726d252824c7e60010d5cdb7f0820ba3d991fb26510185cc5fa039fa6-EPP-OACO-Omnichannel-Abandoned-Cart-Flow.gif",
        "",
        ""
      ],
      "align": "center"
    }
  ]
}
[/block]

## Use case items

With this use case, you’ll get an:

* Abandoned cart scenario: Edit the scenario to fit your brand and messaging. Adjust individual channels. Launch the campaign in just a few clicks with a ready-made template.

* **Evaluation dashboard**: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

* Event segmentation: Custom groups of events based on various event attributes.

* Aggregate: The aggregate displays a list of added products after last cart update.

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

### Understand the use case logic

A customer who adds a product to the cart will enter this scenario. To avoid overcommunication, the scenario checks if the customer hasn't received an 'Abandoned cart' campaign in the last 7 days. If the customer updates the cart from a mobile phone or desktop, based on the device, the customer will continue the journey.

If the customer cart update comes from a **mobile device**, the flow contains:

* Mobile push,
* Email,
* SMS,

where the consent and needed property will be checked.

If the customer cart update comes from a **desktop**, the flow contains:

* Web push,
* Email,
* SMS,

has marketing consent and properties based on a channel.

The client will receive only one message. After 1 hour without any interaction the next message will be sent based on the client properties, channels usage and consents.

### Adjust the use case

Now that you understand the use case logic, you can set up the use case according to your needs.

#### Email flow

Create an [email flow](https://documentation.bloomreach.com/engagement/docs/email-campaigns-use-cases). The client needs to have an email integration set in the project

#### Browser push

Create a Subscription weblayer to subscribe to the [push notifications](browser-push-notifications).

`Browser_push_notification` and the `browser_push_notification_vapid_key` are tracked and populated as soon as a user accepts getting the notifications.

It works as a 'consent' because when users remove permissions to receive a push from that side in their browser, it will get removed, and you will not be able to send any more browser pushes to that user without the ID.

#### Mobile push

Configure [mobile push](https://documentation.bloomreach.com/engagement/docs/mobile-push-notifications) integrations for Android and iOS and track customer properties:

iOS: `apple_push_notification_id`

Android: `google_push_notification_id`

Android - Huawei push service: `huawei_push_notification_id`

#### SMS/MMS

You need to have an [SMS](https://documentation.bloomreach.com/engagement/docs/sms-campaigns) integration and a phone property with a country code format that starts with +.

Currently, MMS are only handled through the third-party provider Sinch. Sinch only provides support in the US.

#### Retargeting

Your project needs to be integrated with [Facebook](https://documentation.bloomreach.com/engagement/docs/facebook-ads-integration) and [Google](https://documentation.bloomreach.com/engagement/docs/google-ads-customer-match).

### Design & copy

#### Email flow

* Trigger: The last `cart_update` event triggered the scenario, and there was no purchase after it.
* Conditions: The customer has a valid `email` property and email consent.
* Action: Send the first email.
* Follow-up: After 1 day, check if the email was opened or clicked. If not, send the next communication.

#### Browser push

* Trigger: The last `cart_update` event triggered the scenario, and there was no purchase after it.
* Conditions: The customer has the `Browser_push_notification` property and push consent.
* Action: Send the first browser push notification.
* Follow-up: After 1 hour, check if the notification was clicked. If not, send the next communication.

#### Mobile push

* Trigger: The last `cart_update` event triggered the scenario, and there was no purchase after it.
* Conditions: The customer has the `mobile_push_notification` property and push consent.
* Action: Send the first mobile push notification.
* Follow-up: After 1 hour, check if the notification was opened or clicked. If not, send the next communication.

#### SMS/MMS

* Trigger: The last `cart_update` event triggered the scenario, and there was no purchase after it.
* Conditions: The customer has the `mobile_phone` property and SMS consent.
* Action: Send the SMS/MMS message.

#### Retargeting

* Trigger: The last `cart_update` event triggered the scenario, and there was no purchase after it.
* Conditions: The customer was not added to the audience in the last 14 days, has an email property, and consent.
* Action: Add the customer to the retargeting audience.
* Follow-up: Remove the customer from the audience if they have not purchased for 14 days or if they purchased and are still in the Abandoned Cart audience.

### Test and run the use case

Test a use case before deploying it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-banner-in-the-use-case-center) ensures you don't send unfinished or imperfect campaigns to your customer base.

Once the testing is over, run the use case. Open the banner and click **Start** to launch the campaign.

### Evaluate the results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt [evaluation dashboard](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) to measure and analyze relevant data.

1. Open the evaluation dashboard.
2. Enter the campaign name. For example, Omnichannel abandoned cart flow.
3. Set the [attribution window for revenue in hours](https://documentation.bloomreach.com/engagement/docs/use-case-evaluation#benefitrevenue-calculations), for example, 24.
4. Click **Refresh** to see the results.
5. Check campaign results regularly to optimize performance.

## Other resources

Learn how to [enhance and optimize the use case](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.