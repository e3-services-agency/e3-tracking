---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# SMS subscription with email collection

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Basic</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Increase in Active subscriber base</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Grow database</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

Simplify sign-ups with an email and SMS subscription banner. The [SMS subscription with email collection](https://www.bloomreach.com/en/products/engagement/plug-and-play/sms-subscription-with-email-collection) use case offers a single opt-in subscription for email and a double opt-in for SMS, with streamlined consent tracking and a discount code incentive for SMS subscribers. With this use case, you will build a genuinely interested and engaged customer base.

### Key features

* Multistep double opt-in: Simplifies SMS subscription and consent tracking for new subscribers.
* Discount code reward: Provides new SMS subscribers with a discount code.
* Automated consent management: Manages consent and voucher distribution automatically after subscription.
* Existing subscriber notification: Alerts existing subscribers if their phone number is already subscribed.
* New subscriber flow: Ensures new subscribers receive an SMS voucher code when conditions are met.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/b23325fab1e0cdcf4a04b28aa5bc2532939dff552c1a801aa56e85316835d736-SMS_592x382_LSES.gif",
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

* Email and SMS subscription banner with offer.

* Multistep double opt-in scenario.

* **Evaluation dashboard**: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

Additionally, you'll need SMS integration and phone and SMS consents.

### Understand the use case logic

#### 1. Initial subscription

The customer subscribes through the Multistep Sign-up Unit (Email and SMS) to receive SMS communication. The email subscription is always single-opt-in, while the SMS subscription is double-opt-in. The email consents are set up within the banner and tracked automatically without any scenario.

#### 2. Consent check

System checks if the customer has granted SMS consent before.

#### 3. SMS request

If no consent, the scenario sends an SMS asking for sign-up by replying 'YES'.

#### 4. Existing subscriber notification

If already subscribed, the system notifies the customer via SMS confirming their subscription.

#### 5. New subscriber flow

For new subscribers, the system checks if consent was tracked and if they opted in through the campaign scenario.

#### 6. Voucher code

Finally, the customer receives an SMS voucher code when all conditions are met.

### Additional details

#### Double opt-in event

Applies only to desktop subscribers. Mobile subscribers follow the two-way messaging subscription flow and receive the voucher via the second flow.

#### Two-way messaging

Set the keyword in Project Settings (**ref: sgnpe**). Find more details at [Two-way messaging](https://documentation.bloomreach.com/engagement/docs/two-way-sms-messaging-and-keyword-auto-responses#grant-consent-action-opt-in) documentation page.

#### Phone number format

Ensure the phone number format is the same (parameter "00" or + prefix) in the banner settings and Project Settings (SMS / MMS Settings > Phone number format) to match identification.

### Adjust the use case

Now that you understand the use case logic, you can set up the use case according to your needs.

#### Banner settings

Access the banner and go to the **Settings** tab to adjust the [banner settings](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-banner-design-and-settings-in-the-use-case-center#settings).

#### Design and copy

Customize the [banner visuals and copy](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-banner-design-and-settings-in-the-use-case-center) to reflect your company's brand identity.

Open the banner use case and find the panel with adjustable parameters. For guidance, hover over the information icons next to each parameter.

### Test and run the use case

Test a use case before deploying it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-banner-in-the-use-case-center) ensures you don't send unfinished or imperfect campaigns to your customer base.

Once the testing is over, run the use case. Open the banner and click **Start** to launch the campaign.

### Evaluate the results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt [evaluation dashboard](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) to measure and analyze relevant data.

1. Open the evaluation dashboard
2. Enter the banner's name. For example, SMS double opt-in banner.
3. Set the [attribution window for revenue in hours](https://documentation.bloomreach.com/engagement/docs/use-case-evaluation#benefitrevenue-calculations), for example, 24.
4. Click **Refresh** to see the results.
5. Check campaign results regularly to optimize performance.

## Other resources

Learn how to [enhance and optimize the banner](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.