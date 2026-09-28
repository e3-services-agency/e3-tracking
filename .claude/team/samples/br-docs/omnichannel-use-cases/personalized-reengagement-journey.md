---
updatedAt: 2026-03-30T20:07:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Personalized reengagement journey

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use case maturity: \n        <p>Advanced</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Increase in CLTV</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use case goal: \n        <p>Retention</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

Win back high-value customers with a personalized, omnichannel journey designed to drive repurchases and boost long-term revenue. This automated campaign targets customers who've purchased multiple times but are now at risk of lapsing—their time since last purchase exceeds their typical buying cycle. The scenario reconnects with these valuable customers through Ad Audiences, mobile push notifications, email, and SMS, offering discount incentives to motivate their next purchase. Run this campaign with a strong incentive to reengage customers who can bring substantial revenue in the long run.

### Key features

* Reactivates customers through Ad Audiences and direct channels like mobile push, email, and SMS.
* Includes a universal discount coupon in every message to drive conversions.
* Increases customer lifetime value and improves repurchase rates by motivating lapsing customers to buy again.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/5dcc5b177d714f6d062a7ecbb7da7185fbd411cec5852572e46f18f2357d0cca-Personalized_Reengagement_Journey.jpg",
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

With this use case, you’ll get an:

* **Scenario**: The main automation flow that targets customers based on their purchase frequency and recency, then reactivates them through multiple channels with personalized messaging and discount incentives.

* **Evaluation dashboard**: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). During the deployment process, the Use Case Center lists requirements for each use case.

### Understand the use case logic

The Personalized Customer Reengagement use case reactivates lapsing repeat customers by analyzing their purchase patterns and reaching them through multiple channels. Here's how the automation works:

#### 1. Flow trigger

The campaign triggers daily by default, but you can adjust the frequency to weekly or bi-weekly based on your business needs and customer purchase cycles.

#### 2. Customer segmentation

The system calculates each customer's average days between purchases, then compares this baseline to their current purchase recency. If it's been 8 or more days beyond their average frequency since their last purchase, they enter the reactivation flow. For example, if a customer typically purchases every 60 days and it's now been 68 days since their last purchase, they qualify for the campaign.

#### 3. Channel eligibility

The flow attempts contact through multiple channels in sequence—email, mobile push, and SMS. For each channel, the system verifies customer consent and channel availability. For push notifications specifically, it checks for an active push token and valid consent before sending.

#### 4. SMS communication

If email and push notifications aren't viable options, the campaign attempts to reach customers via SMS by verifying they have a phone number on file and have provided SMS consent.

#### 5. Ads retargeting

The campaign simultaneously adds eligible customers to Meta, TikTok, and Google Audiences for ads retargeting, ensuring they have valid consent and contact information for each platform.

Customers are automatically removed from the audience if they make a purchase, as their purchase recency resets and they no longer qualify as lapsing.

### Adjust the use case

Now that you understand the use case logic, you can set up the use case according to your needs.

Open the use case and find the panel with adjustable parameters. For guidance, hover over the information icons next to each parameter. Change the settings, design, and copy to reflect your company's brand identity.

* Set up your [mobile push notifications](https://documentation.bloomreach.com/engagement/docs/mobile-push-notifications#settings).
* Customize the [email node](https://documentation.bloomreach.com/engagement/docs/customize-the-email-node-in-use-case-center).
* Personalize [SMS](https://documentation.bloomreach.com/engagement/docs/sms-in-scenarios) parameter.
* Tailor your Meta, TikTok and Google [Ad Audiences](https://documentation.bloomreach.com/engagement/docs/ads-best-practices).
* Add your discount voucher code to all communication nodes and to the tracking in the Add event "voucher" node.

### Test and run the use case

Test a use case before deploying it. Testing ensures you don't send unfinished or imperfect campaigns to your customer base. Test [scenario](https://documentation.bloomreach.com/engagement/docs/testing-scenarios) in your use case, or learn more how to test individual use case items:

* Test your [mobile push notifications](https://documentation.bloomreach.com/engagement/docs/mobile-push-notifications#sending-test-push-notifications).
* Study [email testing](https://documentation.bloomreach.com/engagement/docs/email-testing).

Once the testing is over, launch the campaign.

### Evaluate the results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt [evaluation dashboard](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) to measure and analyze relevant data.

1. Open the evaluation dashboard
2. Set the [attribution window for revenue in hours](https://documentation.bloomreach.com/engagement/docs/use-case-evaluation#benefitrevenue-calculations), for example, 24.
3. Click **Refresh** to see the results.
4. Check campaign results regularly to optimize performance.