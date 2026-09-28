---
updatedAt: 2026-03-30T20:07:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# RFM omnichannel winback campaign

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use case maturity: \n        <p>Champion</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Increase in CLTV</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use case goal: \n        <p>Retention</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

[RFM Omnichannel Winback Campaign](https://www.bloomreach.com/en/products/engagement/plug-and-play/rfm-omnichannel-winback-campaign) targets customers in the [RFM segments](https://documentation.bloomreach.com/engagement/docs/rfm-segmentation) “Hibernating customers,” “At risk,” and “Cannot lose them but losing.” The campaign aims to reactivate these customers through Ad Audiences and direct channels like mobile or browser push, email, and SMS. For customers without consent for direct channels, it uses weblayer. Each message includes a universal discount coupon, and emails contain personalized product recommendations.

### Key features

* Reactivates customers through Ad Audiences and direct channels like mobile or browser push, email, and SMS.
* Uses Weblayer for customers without consent for direct channels.
* Includes a universal discount coupon in every message.
* Provides personalized product recommendations in each email.
* Helps push customers into higher segments in RFM.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/e1c6e0ed22f5258668fe5ba3b17a05ffba8063b83a21d6b0a105ddbddc1a7e9b-owbo.gif",
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

* Scenario: The main flow that targets customers in specific RFM segments and reactivates them through various channels.

* Recommendation: Personalized product recommendations included in emails to motivate customers.

* Banner: A weblayer displayed on the website for customers without consent for direct channels, offering a discount voucher.

* **Evaluation dashboard**: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). During the deployment process, the Use Case Center lists requirements for each use case.

### Understand the use case logic

The RFM Winback Omnichannel Campaign reactivates customers in specific RFM segments by using multiple communication channels. Here's how it works:

#### 1. Flow trigger

The campaign flow triggers daily, but you can adjust the frequency to weekly or bi-weekly based on your business needs.

#### 2. Customer segmentation

The system checks if customers belong to the targeted RFM segments (“Hibernating customers,” “At risk,” and “Cannot lose them but losing.”).

#### 3. Channel eligibility

The system verifies if customers are eligible for push notifications by checking their push token and consent. If eligible, it sends a push notification.

#### 4. Follow-up email

If the push notification isn't delivered, a follow-up email is sent after one day, provided the customer is eligible. The email includes a voucher code and recommended products.

#### 5. SMS communication

If push and email are not viable, the campaign attempts to contact customers via SMS, checking for a phone number and consent.

#### 6. Weblayer display

For customers who cannot be contacted through direct channels, the system uses a Weblayer to display a voucher when they visit the website.

#### 7. Ads retargeting

The campaign also sends customers to Meta and Google Audiences for ads retargeting, ensuring valid consent and contact information.

Customers are removed from the audience if they make a purchase, as their RFM segment changes.

### Adjust the use case

Now that you understand the use case logic, you can set up the use case according to your needs.

Open the use case and find the panel with adjustable parameters. For guidance, hover over the information icons next to each parameter. Change the settings, design, and copy to reflect your company's brand identity.

* Set up your [mobile push notifications](https://documentation.bloomreach.com/engagement/docs/mobile-push-notifications#settings).
* Modify the settings of your [browser push notifications](https://documentation.bloomreach.com/engagement/docs/browser-push-notifications#notification-editor).
* Customize the [email node](https://documentation.bloomreach.com/engagement/docs/customize-the-email-node-in-use-case-center).
* Personalize [SMS](https://documentation.bloomreach.com/engagement/docs/sms-in-scenarios) parameter.
* Adjust the [banner design and settings](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-banner-design-and-settings-in-the-use-case-center).
* Tailor your Meta and Google [Ad Audiences](https://documentation.bloomreach.com/engagement/docs/ads-best-practices).

### Test and run the use case

Test a use case before deploying it. Testing ensures you don't send unfinished or imperfect campaigns to your customer base. Test [scenario](https://documentation.bloomreach.com/engagement/docs/testing-scenarios) in your use case, or learn more how to test individual use case items:

* Learn how to [test your banner](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-banner-in-the-use-case-center).
* Test your [mobile push notifications](https://documentation.bloomreach.com/engagement/docs/mobile-push-notifications#sending-test-push-notifications).
* Study [email testing](https://documentation.bloomreach.com/engagement/docs/email-testing).

Once the testing is over, launch the campaign.

### Evaluate the results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt [evaluation dashboard](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) to measure and analyze relevant data.

1. Open the evaluation dashboard
2. Enter the banner's name. For example, Omnichannel Winback Campaign.
3. Set the [attribution window for revenue in hours](https://documentation.bloomreach.com/engagement/docs/use-case-evaluation#benefitrevenue-calculations), for example, 24.
4. Click **Refresh** to see the results.
5. Check campaign results regularly to optimize performance.