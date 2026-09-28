---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Automated newsletter for new items of interest

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

# What to Expect From This Use Case

Automated Newsletter for New Items of Interest targets customers interested in specific product categories based on their viewing history, sending them a tailored newsletter encouraging product discovery and potential purchases. Focusing on established consumer preferences directly influences purchasing patterns and amplifies email marketing engagement.

> 💡 Tip
>
> Visit our [microsite](https://www.bloomreach.com/en/products/engagement/plug-and-play/automated-newsletter-for-new-items-of-interest) to read more about this and other use cases developed by a team of Bloomreach experts.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/599521d47b550184f7941c48cf764542834e8efea181592b1ec6fbbb4fc9db03-Automated_Newsletter_for_New_Items_of_Interest2x.png",
        null,
        ""
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

# Use Case Items

With this use case, you’ll get a:

* Ready-to-use automated newsletter for new items of Interest email
* Pre-defined evaluation dashboard
* Recommendations engine

# How to deploy the Use Case

After downloading the use case, follow these steps:

## Step 1: Meet the Requirements

Verify if the data in your project meets the requirements. Follow this [step-by-step setup guide](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements) in case of problems.

## Step 2: Understand the Use Case Logic

An automated newsletter that informs customers about new items available in the store from their most visited product category.

This scenario runs `once a week`. First, to not break the GDRP rules, we check if a customer still has `emailing` consent. If that is true, the customer has to pass two conditions to receive an email: Viewed more than `3` different items in the last 14 days from their overall most viewed product category (tracked as category\_level\_1) and, simultaneously, didn't buy from this category over the previous 30 days.

Then, their most visited product category is recognized based on the customer's previous shopping behavior.

The Newsletter with new items contains products from the customer's most visited product category based on the recommendation engine `[LCAN] New Items [Automated Newsletter for New Items of Interest] `and its frequency is limited to one email per 14 days.

Follow the description and labels in the scenario in case of uncertainty.

> 💡 Tip
>
> The logic of this use case is built on best practices and only requires adjustments if you want to further customize the use case. Get instant value by launching this campaign in just a few clicks.
>
> However, we highly recommend you adjust the use case design and copy to fit your business needs.

## Step 3: Adjust the Use Case

Now that you understand the use case logic, you can set up the use case according to your preference.

### 3.1 Email Settings

If you decide to customize the email settings, follow [this detailed guide](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-email-design-and-settings-in-the-use-case-center#settings) to make the adjustments.

### 3.2 Design & Copy

Customize the email visuals and copy to align with your company's brand identity.

Otherwise, you can go [through this guide](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-email-design-and-settings-in-the-use-case-center) for more information.

Follow [this](https://documentation.bloomreach.com/engagement/docs/customize-the-email-node-in-use-case-center) guide to adjust the email template with products in the email node.

### 3.3 A/B test

[A/B test](https://documentation.bloomreach.com/engagement/docs/ab-tests) the use case to better understand the email performance and revenue generated.

This use case's A/B test traffic distribution is set to variant A at 50 % and the control group at 50 %. We recommend keeping this distribution as it brings quick and statistically significant results.

Learn more about the dos and don'ts when modifying your A/B tests in [this guide](https://documentation.bloomreach.com/engagement/docs/ab-tests#prepare-for-an-ab-test).

## Step 4: Test and Run the Use Case

When you are done adjusting the use case, we recommend to always [test the use case](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-email-in-the-use-case-center) before deployment. When testing, double-check if the use case design, copy, and settings work as preferred.

> ❗️ Warning
>
> You should only deploy a use case after testing. Testing prevents sending unfinished or imperfect campaigns to your customer base.

Run the use case once the testing is over. When you open the email, click the `Start` button in the upper right corner to launch the campaign.

> 👍 Congratulations!
>
> If you got here, you have successfully deployed this use case.

## Step 5: Evaluate the Results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt and ready-to-use evaluation dashboard specifically included in this use case to measure and analyze relevant data.

To evaluate, open the evaluation dashboard, enter the email's name (e.g. Automated Newsletter for New Items of Interest), set the [attribution window for revenue in hours](https://documentation.bloomreach.com/engagement/docs/use-case-evaluation#benefitrevenue-calculations) (e.g. 24) and click the `Refresh` button in the upper right corner to see the results.

If you encounter any problems, read [this article](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) for insights on evaluating the use case.

> 💡 Tip
>
> Don’t forget to regularly check the results so you can optimize the use case for better performance.

# Additional Resources

Learn how to [enhance and optimize email](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.