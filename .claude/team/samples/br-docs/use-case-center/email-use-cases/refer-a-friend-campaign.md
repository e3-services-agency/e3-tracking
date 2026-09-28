---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Refer a friend campaign

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Advanced</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Increase in Lead Generation</p>\n    </a>\n  </div>\n \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Acquisition</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

[Refer a Friend campaign](https://www.bloomreach.com/en/products/engagement/plug-and-play/refer-a-friend-campaign) rewards customers with vouchers for successfully referring new customers. The referring and new customer (referee) receive vouchers, creating a mutually beneficial incentive to engage with and promote the brand. This process involves a structured system where referrers and referees are rewarded based on certain actions, encouraging participation from both parties.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/a203cea949fcbc89dd5598878abc3c9c34307f33973cf215c3e932585a796fc2-EPP-ORAF_Refer-a-Friend.gif",
        "",
        ""
      ],
      "align": "center"
    }
  ]
}
[/block]

### Use case items

With this use case, you’ll get a:

* Refer a friend email
* Survey
* Evaluation dashboard

### Prerequisites

* Email configured as `hard_id`
* Webhook integration
* Voucher\_code tracked in purchase events

## How to deploy the use case

After downloading the use case, follow these steps:

### Meet the requirements

Verify if the data in your project meets the requirements. Follow this [step-by-step setup guide](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements) in case of problems.

### Understand the use case logic

The existing customer (referrer) receives an email prompting them to refer a friend (referee). This email consists of three ways the referrer can invite the referee to sign up for the brand's newsletter and make a purchase. The referrer can share a link to register for the brand's newsletter via:

* SMS
  * The SMS opener must always be active for SMS functionality to work. To activate it, open the SMS opener and click **Start**—no additional changes are needed.
* Email
* WhatsApp

The referee must use the link to a survey received either via SMS, Email, or WhatsApp to sign up for the newsletter. After signing up, the system checks if the referee is already an existing customer. If so, the referee is notified by email and consented to marketing communications.

A new customer profile is created if the referee is not an existing customer with assigned newsletter consent.

Once the referee makes a purchase, a 14-day waiting period is initiated to account for potential returns. If the purchase is not returned and the referrer’s marketing consent remains valid, the referrer is notified by email that their referee has completed a purchase, and they are eligible for a voucher included in the email.

This scenario uses webhooks to track the campaign's progress through friend\_referral events, which trigger specific actions. To ensure proper functionality, the project must meet the following requirements:

* Email configured as `hard_id`
* If your email identifier isn't "`registered`," replace it in **nodes 193, 250, **and** 323**
* Webhook integration (**nodes 152** and **158**). Follow these steps:
  * Set up the webhook with email as the `hard_id` parameter.
  * In **Editor** > **Endpoint**, replace the bold portion with your instance URL: **<https://cloud-api.exponea.com>**/data/v2/projects/{{ project.id }}/customers/attributes
  * In **Settings** > **Authentication**, select valid authentication for your project.
* Voucher\_code tracked in purchase events

Tracking the voucher code under the purchase event is essential to confirm that the referrer qualifies for a voucher. This eligibility depends on the referee completing their first purchase.

### Adjust the use case

Now that you understand the use case logic, you can set up the use case according to your preference.

#### Survey

The survey is titled **Refer a Friend Survey**, and this name must remain unchanged for the use case to function.

##### Adjust the survey

Open the survey and go to the **Design > Form** tab.

Only fields with parameter names enclosed in square brackets \[ ] are displayed for this use case. Edit the copy for fields that consist of parameters in brackets but do not edit the parameters in brackets, for example:

* You can edit "\[heading] Sign up and receive a 10% discount" to "\[heading] Sign up, and we will send you a voucher gift"

Go to the **Design tab > Translation** tab to edit the Thank You page displayed after submitting the survey. You can edit fields that contain the parameters in brackets \[ ], but do not edit the parameters in brackets. For example:

* Success header
  * edit the URL of an image
* Success text
  * Success text consists of the parameter in brackets \[ ], text, and a CTA. You can edit the text and the CTA.
    * Text: Thank you for subscribing to the newsletter. Your discount code will be delivered to your email shortly.
    * URL of the CTA: <https://www.bloomreach.com/en/products/engagement/plug-and-play>
    * CTA copy: Go to our page

In the **Translations** tab, you can enable the **Recurrent** checkbox, which allows one referrer to share the link with multiple referees.

#### Email settings

If you decide to customize the email settings, follow [this detailed guide](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-email-design-and-settings-in-the-use-case-center#settings) to make the adjustments.

#### Design and copy

Customize the email visuals and copy to align with your company's brand identity.

Otherwise, you can go [through this guide](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-email-design-and-settings-in-the-use-case-center) for more information.

Follow [this](https://documentation.bloomreach.com/engagement/docs/customize-the-email-node-in-use-case-center) guide to adjust the email template with products in the email node.

### Test and run the use case

After adjusting the use case, always test it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-email-in-the-use-case-center) ensures the design, copy, and settings work as intended.

Once the testing is over, run the use case. When you open the banner, click **Start** to launch the campaign.

### Evaluate the results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt evaluation dashboard to measure and analyze relevant data.

* Click **Refresh** to see the results
* Check campaign results regularly to optimize the use case for better performance.

If you encounter any problems, read [this article](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) for insights on evaluating your campaign.

## Other resources

Learn how to [enhance and optimize email](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.