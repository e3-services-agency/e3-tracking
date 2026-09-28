---
updatedAt: 2026-03-30T20:07:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Reactivation of lapsing customers with Contextual personalization

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Advanced</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Increase in Active subscriber base</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Retention</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

Use personalized emails to prevent key customers from lapsing, boosting revenue and retention. You can keep valuable customers engaged by targeting key segments with personalized offers, such as free shipping or discounts. AI determines the most engaging offer for each customer, helping to drive revenue and encourage repeat purchases.

[This use case](https://www.bloomreach.com/en/products/engagement/plug-and-play/reactivation-of-lapsing-customers-with-contextual-personalization) focuses on customers in the "At risk" and "Cannot Lose Them but Losing" RFM segment who haven't made a purchase in the last 90 days and have provided email consent.

### Key features

* Personalized offers based on contextual personalization
* AI-driven engagement strategies
* Regularly triggered scenarios
* Integration with retargeting platforms like Facebook and Google

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/a0cdf8d1e3b24fcfe67ed70fbb329f0324f6b397721f151fa36a1fcb957cd4ad-BR_Use_Case_Image__Reactivation_of_Lapsing_Customers_With_Contextual_Personalization2x_1.jpg",
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

* Scenario: A pre-built scenario targeting "At risk" and "Cannot Lose Them but Losing" RFM segments.

* Email Campaign: Personalized emails with discount or free delivery codes.

* Recommendation Engine: Advanced product recommendations with "Personalized for you + New Items \[fallback]."

* Retargeting Integration: Adds non-responsive customers to ad audiences on platforms like Google Ads and Facebook.

* **Evaluation dashboard**: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

### Understand the use case logic

The system targets customers in the "At risk" and "Cannot Lose Them but Losing" RFM segments who:

* Haven't purchased in the last 90 days.
* Haven't received this reactivation campaign before.
* Have given emailing consent.

Customers undergo the [Contextual Personalization A/B test](https://documentation.bloomreach.com/engagement/docs/scenarios-in-contextual-personalization) and receive either a discount code or free delivery code in the email campaign.

If there's no interaction within three days, a follow-up email is sent. Emails include personalized product recommendations based on the advanced recommendation engine, "Personalized for you + New Items \[fallback]."

Customers who don't interact with the email are added to ad audiences on platforms like Google Ads and Facebook to increase engagement chances.

### Adjust the use case

Now that you understand the use case logic, you can set up the use case according to your needs.

1. Ensure you have an existing [RFM segmentation](https://documentation.bloomreach.com/engagement/docs/email-health-list#recommended-segments) set up.
2. Adding [ad audience](https://documentation.bloomreach.com/engagement/docs/ad-audiences) webhooks is also required.
3. Adjust your [email settings](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-email-design-and-settings-in-the-use-case-center#settings).
4. Customize email visuals and copy to align with your company's brand identity. Learn how to [adjust the email template with products](https://documentation.bloomreach.com/engagement/docs/customize-the-email-node-in-use-case-center) in the email node.

### Test and run the use case

Test a use case before deploying it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-banner-in-the-use-case-center) ensures you don't send unfinished or imperfect campaigns to your customer base.

Once the testing is over, run the use case. Open the banner and click **Start** to launch the campaign.

If there's no interaction within three days, add the customer to ad audiences on platforms like Google and Facebook to increase engagement chances.

### Evaluate the results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt [evaluation dashboard](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) to measure and analyze relevant data.