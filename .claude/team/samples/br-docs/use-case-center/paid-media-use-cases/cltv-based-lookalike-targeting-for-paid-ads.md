---
updatedAt: 2026-03-30T20:07:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# CLTV based lookalike targeting for paid ads

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Advanced</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>increase in RPV</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Acquisition</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

This [use case](https://www.bloomreach.com/en/products/engagement/plug-and-play/cltv-based-lookalike-targeting-for-paid-ads) optimizes your paid ad campaigns by creating robust audiences rooted in customer lifetime value and brand loyalty. By focusing on your most valuable and loyal customers, your business can derive maximum value and productivity.

This use case directly influences and boosts paid media advertising efficiency, potentially leading to increased traffic, higher conversion probabilities, and higher revenue. Leveraging this approach enables you to utilize your ad budgets more strategically and effectively.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/1c8f867-LLTC_-_CLTV-Based-Lookalike-Targeting-for-Paid-Ads.gif",
        null,
        ""
      ],
      "align": "center"
    }
  ]
}
[/block]

## Use case items

With this use case, you’ll get an:

* CLTV Based Lookalike Targeting for Paid Ads email

* **Evaluation dashboard**: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

### Understand the use case logic

The primary function of this Use Case is to generate optimized audiences for your paid media channels by leveraging insights from the customer lifetime value (CLTV) and brand loyalty. You can execute this through an automation process that categorizes your customers into distinct cohorts, which are then pushed to ad platforms like Google Ads and Facebook Audiences.

This automation operates along two paths. The first path consistently refreshes the audience based on customer CLTV cohort updates. This functionality applies to both Google Ads and Facebook Audiences. The second path, designed explicitly for Facebook Audiences, creates an audience based on the deliberate weighting of each customer's value to your business.

For the successful operation of this use case, certain elements need to be adjusted. First, establish your Facebook and/or Google Ads integration from your interface's Data & Assets > Integrations section. Plus, ensure that the campaign events for 'ads' are actively tracked in your project settings.

Follow the labels in the scenario to adjust the necessary, such as:

* customer's 'retargeting consent' to match your project's needs and the customers' email and/or phone properties.
* update the 'Ad audience' nodes, ensuring they include 'Top 20 Percentile CLTV Audience' for the first scenario path.

A third optional path allows the removal of customers who no longer deliver value.

If you intend to launch the same scenario for another platform (such as Facebook or Google), you can replicate the existing scenario and set up different 'Ad audiences'.

### Test and run the use case

Test a use case before deploying it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-banner-in-the-use-case-center) ensures you don't send unfinished or imperfect campaigns to your customer base.

Once the testing is over, run the use case. Open the banner and click **Start** to launch the campaign.

### Evaluate the results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt [evaluation dashboard](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) to measure and analyze relevant data.

To evaluate the impact of this use case, we can only compare the performance of the incoming traffic. It is crucial to use UTM parameters for proper evaluation and ensure that they correspond with the values specified in the event segmentation named \[OLTC] Visit sources (found in the Use case setup step under Event Segmentation session\_start asset).

The dictionary below helps understand metrics definitions and attribution in the evaluation:

**Revenue and Conversion Attribution**\
The attribution model used for revenue attribution takes into consideration all the purchases made within:

* 24h since the last website visit from the given source
* It is a combination of the last-click model with the attribution window period

**Metric Definitions**

* u-prefix - the ‘u’ before a metric name in the Evaluation Dashboard stands for the “unique” definition of the metric (counting only one occurrence per customer).
* Visits - all session\_starts with the given traffic source. The total number of visits of all users.
* uVisitors - unique visits (session starts) with the given traffic source. The number of users visiting the website at least once.
* Orders = Number of Purchases - all purchases made by customers impacted by the campaign (e.g., opened or clicked on the email, were shown or clicked on the weblayer, etc.) within the attribution window.
* Buyers = unique purchases - all customers impacted by the campaign (e.g. opened or clicked on the email, show or click on the weblayer, etc.) who purchased within the attribution window.
* Revenue - the total sum of values of all purchases made by customers impacted by the campaign (e.g. came from our retargeting campaign, opened or clicked on an email, seen or clicked on a weblayer, etc.) within the attribution window.
* CR (Conversion rate) - Percentage of impressions that were converted into a purchase within the attribution window
  * Conversion rate = count all purchases/count of all visits (session starts)
* uCR (Unique Conversion rate) - The proportion of customers who came from a given traffic source and were converted into a purchase within the attribution window
  * Unique Conversion rate = count of buyers / unique visitors
* RPV (Revenue Per Visitor) = Revenue per reach - Average revenue per customer with an impression (e.g. open email, show banner, etc.)
  * RPV = total revenue / all visitors