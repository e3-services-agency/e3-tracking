---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Reactivation campaign for disengaged email subscribers

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Advanced</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>increase in CLTV</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Retention</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

# What to Expect From This Use Case

Reactivation Campaign for Disengaged Email Subscribers is an efficient tool for returning customers who have been inactive or haven't purchased in a specific timeframe. Implementing personalized email communication highlighting each customer's history and presenting tailored product recommendations brings the focus back to your brand. This direct interaction re-engages customers, improves retention, and boosts sales, reinforcing a solid customer-brand connection.

> 💡 Tip
>
> Visit our [microsite](https://www.bloomreach.com/en/products/engagement/plug-and-play/reactivation-campaign-for-disengaged-email-subscribers) to read more about this and other use cases developed by a team of Bloomreach experts.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/07a1be1c45ad2d190f0f48d0262f41d81b197981a1f172db2d795aff4ccf1790-Reactivation_Campaign_for_Disengaged_Email_Subscribers2x.png",
        "",
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

* Ready-to-use reactivation campaign for disengaged email subscribers' email
* Recommendations engine
* Aggregate displaying products in the email
* Pre-defined evaluation dashboard

# How to deploy the Use Case

After downloading the use case, follow these steps:

## Step 1: Meet the Requirements

Verify if the data in your project meets the requirements. Follow this [step-by-step setup guide](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements) in case of problems.

## Step 2: Understand the Use Case Logic

Once a week, the 'Disengaged' customers are identified, and an email campaign with personalized recommended products is sent to them.

Who is a disengaged customer? A customer who gave `emailing` consent more than three months ago and did not interact (open/click) with emails in the last 180 days.

This scenario runs once a week. First, to not break the GDRP rules, we check if a customer still has `emailing` consent. If that is true, the customer has to pass these conditions to receive an email: be part of the Lapsing segment, and his latest purchase must date back to 3-15 months ago. The 'Personalized Reactivation Email' frequency is limited to one email per 30 days, but no more than two emails overall are received from this campaign.

The email content consists of displaying the last bought product based on aggregate `[LPRC] Last Purchased Product [data for email]`and afterward displaying products from the recommendation engine `[LPRC] Top viewed products [Reactivation Campaign for Disengaged Email Subscribers]` which are the most viewed products on the website in the past 14 days.

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

To evaluate, open the evaluation dashboard, enter the email's name (e.g. Reactivation Campaign for Disengaged Email Subscribers), set the [attribution window for revenue in hours](https://documentation.bloomreach.com/engagement/docs/use-case-evaluation#benefitrevenue-calculations) (e.g. 24) and click the `Refresh` button in the upper right corner to see the results.

If you encounter any problems, read [this article](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) for insights on evaluating the use case.

> 💡 Tip
>
> Don’t forget to regularly check the results so you can optimize the use case for better performance.

# Additional Resources

Learn how to [enhance and optimize email](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.