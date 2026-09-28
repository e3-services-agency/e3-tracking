---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# AI-segmented single opt-in email subscription banner

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Advanced</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Active Subscriber Base</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Acquisition</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

The [AI-segmented single opt-in email subscription banner](https://www.bloomreach.com/en/products/engagement/plug-and-play/ai-segmented-single-opt-in-email-subscription-banner) use case shows an incentive to website visitors in the form of a subscription banner with a free delivery offer or a discount on the next purchase. With a personalized A/B test, you can let AI decide which subscription banner to display to your customers.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/4d56fb4a5aecf064bb0bcdc18d42fd6d04b321e2f46a6b0db1b509caa9365f87-BR_Use_Case_Image__AI-Segmented_Single_Opt-in_Email_Subscription_Banner2x.png",
        null,
        ""
      ],
      "align": "center",
      "sizing": "700px"
    }
  ]
}
[/block]

## Use case items

With this use case, you’ll get a:

* Banner: Shown to all customers without consent who have viewed at least two products during the ongoing session and did not see the subscription weblayer more than four times.

* Purchase segmentation: Set definitions for each targeted segmentation.

* **Evaluation dashboard**: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

### Understand the use case logic

The Use Case shows a weblayer offering free delivery or a discount on the customer's first order. Customers who subscribe to this banner will receive an email with the discount or free delivery.

The weblayer is shown to all customers without consent who have viewed at least two products during the ongoing session and did not see the subscription weblayer more than four times.

### Adjust the use case

Now that you understand the use case logic, you can set up the use case according to your needs.

#### Banner settings

Access the banner and go to the **Settings** tab to adjust the [banner settings](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-banner-design-and-settings-in-the-use-case-center#settings).

#### Design and copy

Access the banner and go to **Design > Editor** to customize the [banner visuals and copy](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-banner-design-and-settings-in-the-use-case-center#design--copy) to reflect your company's brand identity.

#### A/B test

[A/B test](https://documentation.bloomreach.com/engagement/docs/ab-tests) the use case to better understand the email performance and revenue generated.

This Use Case uses [Contextual Personalization](https://documentation.bloomreach.com/engagement/docs/contextual-personalization-2). In the setup, contextual personalization targets 80% of the audience with automatic distribution, depending on the visitor's segmentation.

The AI learns from the collected data based on the Features set up within the Contextual Personalization setup and automatically creates the segments.

The features in this Use Case present four different customer segmentations. You can adjust the segmentations manually according to your preferences.

Learn more about the do's and don'ts of [modifying A/B test](https://documentation.bloomreach.com/engagement/docs/ab-tests#prepare-for-an-ab-test).

### Test and run the use case

Test the use case before deploying it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-banner-in-the-use-case-center) ensures you don't send unfinished or imperfect campaigns to your customer base.

Once the testing is over, run the use case. Open the banner and press **Start** to launch the campaign.

### Evaluate the results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt [evaluation dashboard](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) to measure and analyze relevant data. You need to adjust the following components to ensure that data is displayed correctly:

1. Banner name: If you rename the banner, update it within this event segmentation as well. Do not change the segment name “banner”. Change the purchase status according to your data tracking. Currently, it is set to `purchase` = `success`.
2. `purchase_banner` target: Change the purchase status according to your data tracking in the following assets. Currently, it is set to `purchase` = `success`.

## Other resources

Learn how to [enhance and optimize banner](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center#banner) performance with different tips and tricks from Bloomreach experts.

Additionally, learn more about [contextual personalization](https://documentation.bloomreach.com/engagement/docs/contextual-personalization-2#step-by-step-guide) and [A/B testing](https://documentation.bloomreach.com/engagement/docs/ab-tests).