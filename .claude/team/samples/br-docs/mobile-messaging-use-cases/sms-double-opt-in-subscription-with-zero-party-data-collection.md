---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# SMS double opt-in subscription with zero-party data collection

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Basic</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Lead generation</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Grow database</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

The [SMS double opt-in subscription with zero-party data collection](https://www.bloomreach.com/en/products/engagement/plug-and-play/sms-double-opt-in-subscription-with-zero-party-data-collection) use case enables easy double opt-in subscription and consent tracking for new subscribers and, additionally, rewards new SMS subscribers with a discount code for answering the zero-party data questions via the banner.

### Key features

* **Seamless Double Opt-In**: Easily manage double opt-in subscriptions and consent tracking for new subscribers, ensuring compliance and enhancing customer trust.
* **Zero-Party Data Collection**: Gather valuable customer insights by encouraging subscribers to answer questions via the banner and rewarding them with a discount code.
* **Cross-Device Compatibility**: Efficiently handle subscriptions across desktop and mobile platforms, with tailored processes for each to ensure smooth data collection and voucher distribution.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/6e794edff80382ff7bf729d512002c3ae3e1d8ad517f82d337081e3fcdf6445b-sms-double-opt-in-subscription-with-zero-party-data-collection.gif",
        "",
        ""
      ],
      "align": "center",
      "sizing": "700px"
    }
  ]
}
[/block]

## Use case items

With this use case, you’ll get:

* Banner: The customer subscribes to SMS through this mobile banner. The banner enables customers to subscribe in two clicks using [two-way messaging](https://documentation.bloomreach.com/engagement/docs/two-way-sms-messaging-and-keyword-auto-responses).

* SMS Scenario: This checks whether the customer's consent was tracked, whether they opted in through the campaign's scenario, and whether this is their first time opting in. When all conditions are met, they receive an SMS voucher code.

* **Evaluation dashboard**: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

### Understand the use case logic

When a customer subscribes for SMS through the banner, they receive a discount for their purchase. The process varies slightly between desktop and mobile platforms:

**Desktop:**

* All activities are tracked under a single profile, identified through a cookie and `phone_id`.
* The `double_opt_in` event is recorded via the banner.
* The phone number and `phone_id` are captured upon subscription through the banner (before double opt-in), ensuring all data is collected within one profile.

> 📘 Note
>
> The `double_opt_in` event is only relevant for desktop subscribers. For mobile subscribers, the process involves [two-way messaging](https://documentation.bloomreach.com/engagement/docs/two-way-sms-messaging-and-keyword-auto-responses) subscriptions, and the voucher is provided through a separate flow afterward.

**Mobile:**

* The banner events, such as `show` and `subscribe`, are initially tracked under one profile identified with a cookie.
* Afterwards, a second profile is created, identified with a `phone_id` prefixed with '00'.
* The two-way messaging for mobile is set in the way that they keyword should also be`(ref: sgnpz)` therefore, this [keyword needs to be added](https://documentation.bloomreach.com/engagement/docs/two-way-sms-messaging-and-keyword-auto-responses) to the SMS messages sent to the customer.

> 🚧 Warning
>
> Ensure the phone number format is consistent in both the banner settings (using either the '00' or '+' prefix) and the Project Settings (under **SMS / MMS Settings > Phone number format**).
>
> If they don't match, the identification won't align correctly.

This approach ensures comprehensive tracking and data consolidation across different devices, enhancing the effectiveness of SMS subscriptions and promotions.

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

1. Open the evaluation dashboard.
2. Enter the banner's name. For example, SMS double opt-in subscription with zero-party data collection.
3. Set the [attribution window for revenue in hours](https://documentation.bloomreach.com/engagement/docs/use-case-evaluation#benefitrevenue-calculations), for example, 24.
4. Click **Refresh** to see the results.
5. Check campaign results regularly to optimize performance.

## Other resources

Learn how to [enhance and optimize the banner](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.