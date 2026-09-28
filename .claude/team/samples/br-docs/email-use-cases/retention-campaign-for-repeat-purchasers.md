---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Retention campaign for repeat purchasers

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Advanced</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>increase in RPV</p>\n    </a>\n  </div>\n \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Retention</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

# What to Expect From This Use Case

The Retention Campaign for Repeat Purchasers use case sends automated emails based on each customer's shopping frequency and last purchase recency to maintain or improve their buying habits. This approach directly influences shopping frequency and customer lifetime value (CLTV), enhancing customer retention.

> 💡 Tip
>
> Visit our [microsite](https://www.bloomreach.com/en/products/engagement/plug-and-play/retention-campaign-for-repeat-purchasers) to read more about this and other use cases developed by a team of Bloomreach experts.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/3a6c409-LRRP-BR-Retention-Campaign-for-Repeat-Purchasers.gif",
        "",
        ""
      ],
      "align": "center"
    }
  ]
}
[/block]

## Use Case Items

With this use case, you’ll get a:

* Retention campaign for repeat purchasers' email
* Recommendations engine
* Evaluation Dashboard
* Trending products report
* Campaign event segmentation

# How to deploy the Use Case

After downloading the use case, follow these steps:

## Step 1: Meet the Requirements

Verify if the data in your project meets the requirements. Follow this [step-by-step setup guide](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements) in case of problems.

## Step 2: Understand the Use Case Logic

For every customer with a minimum of 2 purchases, we calculate the average time between these purchases. Based on the average time, we split customers into segments: those whose average time is less than 30 days, less than 60 days, less than 90 days, less than 120 days, and less than 180 days. The customer receives an email with current Trending products when the time of the last customer's purchase reaches Day -1 of the segment limit, i.e., if the customer's average purchase frequency is less than 60 days, then the customer will be contacted when he/she reaches 59 days since the last purchase.

The scenario is triggered daily at `9:00`.  To ensure compliance with GDPR rules, we first check if the customer has `emailing` consent. Additionally, the scenario checks if the customer made at least two purchases and if the customer's last purchase timestamp matches D -1 of the corresponding segment. The frequency capping prevents customers from receiving this campaign more than twice. Plus, a customer can not be contacted sooner than 30 days after the first email.

What are the trending products displayed in email content? Trending products have the most significant % increase between views on the web page in the last 14 days and views on the web page in the previous seven days before those 14 days. To be eligible, a product must have at least 100 views over the previous 14 days. You can preview the current list in the report 'Trending Products \[TOP 100]' that is part of the dashboard.  The products are fetched from recommendation `[LRRP] Trending products in last 14 days [Retention campaign]`. There are `4 products` displayed in the templated email design.

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

To evaluate, open the evaluation dashboard, enter the email's name (e.g. Retention Campaign for Repeat Purchasers), set the [attribution window for revenue in hours](https://documentation.bloomreach.com/engagement/docs/use-case-evaluation#benefitrevenue-calculations) (e.g. 24) and click the `Refresh` button in the upper right corner to see the results.

If you encounter any problems, read [this article](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) for insights on evaluating the use case.

> 💡 Tip
>
> Don’t forget to regularly check the results so you can optimize the use case for better performance.

# Additional Resources

Learn how to [enhance and optimize email](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.

> 📘 Interactive tour
>
> Learn how to auickly set up email campaigns with use case templates and drive repeat purchases with an interactive tour.

[block:html]{"html":"<head>\n    <meta charset=\"UTF-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n    <title>E03</title>\n    <style>\n        button {\n            color: #ffffff;\n            background-color: #01a7cc;\n            font-size: 15px;\n            border: 1px solid #00a6cb;\n            border-radius: 90px;\n            padding: 10px 20px;\n            cursor: pointer;\n        }\n        button:hover {\n            color: #01a7cc;\n            background-color: #ffffff;\n        }\n        .steps {\n            margin-left: 10px;\n            font-size: 15px;\n            vertical-align: middle;\n            padding: 10px;\n            color: grey;\n        }\n    </style>\n</head>\n<body>\n    <button onclick=\"window.open('https://tour.bloomreach.com/psl/o31h0amm', '_blank')\">View tour</button>\n  <span class=\"steps\">17 steps, 3 minutes</span>\n</body>"}[/block]

>