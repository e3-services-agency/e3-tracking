---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Paid ad optimization using audience predictions

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Advanced</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Increase in RPV</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Drive traffic/Acquisition</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

The [paid ad optimization using audience predictions](https://www.bloomreach.com/en/products/engagement/plug-and-play/paid-ad-optimization-using-audience-predictions) use case leverages Bloomreach's built-in purchase prediction capabilities to segment customers based on low, mid, and high purchase probability and push these segments to the advertising platform.

## Key features

**Predictive Segmentation:** Utilizes advanced purchase prediction models to categorize customers into high, medium, and low probability segments for targeted advertising.

**Automated Audience Management:** Seamlessly updates ad audiences by adding or removing customers based on purchase probability.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/d5e451b1ae5617a04b3750f0f384d96cac5e74e20f5b4faef870d3c7b40c3f0d-Paid_Ad_Optimization_Using_Audience_Predictions.png",
        "",
        ""
      ],
      "align": "center"
    }
  ]
}
[/block]

## Use case items

With this use case, you’ll get:

* Purchase prediction: Calculates the purchase probability within the next 30 days for all customers who had a session start in the last 90 days.

* Ad audiences scenario: Retargets customers based on purchase predictions.

* Prediction report: View the "Eligible Customers" report to analyze 30-day purchase predictions, categorized into adjustable probability groups, for customers with recent sessions and valid contact information.

* Customer segmentation: Divides your customer base into groups to personalize marketing efforts and improve engagement.

* Campaign segmentation: Categorizes campaigns to target specific audience segments.

* Purchase segmentation: Classifies purchases into segments to analyze buying patterns.

* Ad audience campaign tracking: Tracks the ad audience campaign.

* **Evaluation dashboard**: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

Ensure all tracking requirements and naming conventions are met. Verify that Bloomreach Modules, such as Ads & Retargeting with Facebook/Google Ads Integration and Prediction Models, are integrated.

### Understand the use case logic

The scenario first verifies if customers are eligible for communication by checking:

* Marketing consent,
* Valid email or phone number,
* Prediction conditions that match the 'Eligible customer filter' in your prediction model.

Customers are then divided into three segments based on purchase probability:

* High (>0.9)
* Medium (0.1\~0.9)
* Low (<0.1)

Using webhooks for platforms like Facebook or Google, customers in the desired segment are added to ad audiences, and customers no longer fitting the segment criteria are removed.

### Set up the use case

Now that you understand the use case logic, you can set up the use case according to your needs.

#### Clone the initiative

Go to **Initiatives** and find your initiative. Open the initiative and press **Clone into Project**. Review the dependencies and check that the initiative's elements don't conflict with existing elements.

Press **Apply** and **Start cloning**.

#### Start the prediction

Open the "30 days purchase prediction" use case item and press **Start**.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/31bc2e7fae686759f04ad7d36e42cc3261b8e7b0f0ec42322e493c74bf64ccd1-purchase_prediction.png",
        "",
        ""
      ],
      "align": "center",
      "sizing": "700px",
      "border": true
    }
  ]
}
[/block]

There is no need to change anything in the setting. Optionally, you can check the list of events the prediction trains. To do so, go to **Features > Event filters** and adjust them to your project.

Once the prediction is calculated, you can see the results for your customer base in the report "Eligible Customers drilled down by 30 days purchase prediction".

The results are filtered only for eligible customers based on the prediction model (customers with `session_start` in the last 90 days) and eligible for Ad audience (`email` or `phone` has value).

The prediction values are reported by grouping ‘discretization’ into three groups. Feel free to adjust the grouping in the drill down section for views more suitable for your results.

#### A/B test

[A/B test](https://documentation.bloomreach.com/engagement/docs/ab-tests) is necessary to evaluate if the Use Case is performing and, most importantly, bringing extra revenue. To achieve the desired significance level faster, opt for a 50/50 distribution.

Once you achieve significance and observe a **positive uplift** in the Use Case, you can either:

* Reduce the Control Group to 10% and continue the A/B test to ensure ongoing positive results.
* Disable the A/B test but conduct regular evaluations, such as reactivating the test for three months to confirm sustained positive outcomes.

If the Use Case shows a statistically significant **negative uplift**, which indicates the hypothesis is incorrect, and Variant A underperforms compared to the Control Group, revisit the hypothesis and Use Case setup.

We recommend testing multiple variants, such as wording and banner placement, to optimize performance and identify the most effective option.

Learn more about the dos and don'ts of [modifying A/B test](https://documentation.bloomreach.com/engagement/docs/ab-tests#prepare-for-an-ab-test).

### Test and run the use case

Test a use case before deploying it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-banner-in-the-use-case-center) ensures you don't send unfinished or imperfect campaigns to your customer base.

Once the testing is over, run the use case. Open the scenario and click **Start** to launch the campaign.

### Evaluate the results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt [evaluation dashboard](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) to measure and analyze relevant data.

Open the dashboard and click **Refresh** to see the results. Check campaign results regularly to optimize performance.

## Other resources

Learn how to [enhance and optimize the banner](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.