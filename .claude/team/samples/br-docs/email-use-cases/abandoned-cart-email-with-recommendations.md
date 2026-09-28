---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Abandoned cart email with recommendations

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Advanced</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>increase in RPV</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Performance</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## What to expect from this use case

Abandoned Cart Flow with Recommendations sends a personalized email to customers who leave items in their cart, recommending additional items they might be interested in, thereby increasing the conversion rate. Moreover, this use case directly impacts the success of upselling strategies by allowing marketers to suggest a broader range of products without endangering the initial purchase, leading to a rise in average order value and, ultimately, revenue.

> 💡 Tip
>
> Visit our [microsite](https://www.bloomreach.com/en/products/engagement/plug-and-play/abandoned-cart-email-with-recommendations) to read more about this and other use cases developed by a team of Bloomreach experts.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/cc2b36872a6ac790f9fd156d16e6bee00f600c30e999bbecc9b766d6b3983657-Abandoned_Cart_Email_With_Recommendations2x.png",
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

With this use case, you’ll get a:

* Ready-to-use abandoned cart email with recommendations email
* AI-based recommendations engine
* Pre-defined evaluation dashboard
* Aggregate displaying products in the email

## How to deploy the use case

After downloading the use case, follow these steps:

### Step 1: Meet the requirements

Verify if the data in your project meets the requirements. Follow this [step-by-step setup guide](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements) in case of problems.

### Step 2: Understand the use case logic

After a customer abandons their basket, they receive an email with the personalization of the items in the cart and additional items they may be interested in.

Once the customer updates their shopping cart, we check if the customer has `emailing` consent to do not break the GDPR rules. If that is true, the customer has to pass the following conditions to receive an email: the customer was not part of any Abandoned cart campaign in the last `7 days`, hasn't purchased anything in the last `7 days` and, simultaneously, didn't make a purchase `3 hours` since their latest cart update. The 'Abandoned Cart' email frequency is limited to one email per 7 days.

The email includes personalization of items that the customer has already added to their cart (taken from aggregate `[LACR] Latest cart products`) as well as items viewed by similar customers, taking into consideration implicit positive user feedback (based on the recommendation engine `[LACR] Customer who viewed this also viewed [Abandoned Cart Emails With Recommendations]`).

Follow the description and labels in the scenario in case of uncertainty.

> 💡 Tip
>
> The logic of this use case is built on best practices and only requires adjustments if you want to further customize the use case. Get instant value by launching this campaign in just a few clicks.
>
> However, we highly recommend you adjust the use case design and copy to fit your business needs.

### Step 3: Adjust the use case

Now that you understand the use case logic, you can set up the use case according to your preference.

#### 3.1 Email settings

If you decide to customize the email settings, follow [this detailed guide](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-email-design-and-settings-in-the-use-case-center#settings) to make the adjustments.

#### 3.2 Design and copy

Customize the email visuals and copy to align with your company's brand identity.

Otherwise, you can go [through this guide](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-email-design-and-settings-in-the-use-case-center) for more information.

To adjust the email template with products in the email node, follow [this](https://documentation.bloomreach.com/engagement/docs/customize-the-email-node-in-use-case-center) guide.

#### 3.3 A/B test

[A/B test](https://documentation.bloomreach.com/engagement/docs/ab-tests) the use case to better understand the email performance and revenue generated.

This use case's A/B test traffic distribution is set to variant A at 50 % and the control group at 50 %. We recommend keeping this distribution as it brings quick and statistically significant results.

Learn more about the dos and don'ts when modifying your A/B tests in [this guide](https://documentation.bloomreach.com/engagement/docs/ab-tests#prepare-for-an-ab-test).

#### 3.4 AI-based recommendation engine

The recommendation engine in this use case takes up to 24 hours to train before showcasing the right products in the banner.

> ❗️ Warning
>
> Wait 24 hours after downloading the use case before starting it, as the recommendation engine needs this time to train itself. The recommendation engine starts to train itself automatically.

### Step 4: Test and run the use case

When you are done adjusting the use case, we recommend to always [test the use case](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-email-in-the-use-case-center) before deployment. When testing, double-check if the use case design, copy, and settings work as preferred.

> ❗️ Warning
>
> You should only deploy a use case after testing. Testing prevents sending unfinished or imperfect campaigns to your customer base.

Run the use case once the testing is over. When you open the email, click the `Start` button in the upper right corner to launch the campaign.

### Step 5: Evaluate the results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt and ready-to-use evaluation dashboard specifically included in this use case to measure and analyze relevant data.

To evaluate, open the evaluation dashboard, enter the email's name (for example, Abandoned Cart Email with Recommendations), set the [attribution window for revenue in hours](https://documentation.bloomreach.com/engagement/docs/use-case-evaluation#benefitrevenue-calculations) (for example, 24) and click the `Refresh` button in the upper right corner to see the results.

If you encounter any problems, read [this article](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) for insights on evaluating the use case.

> 💡 Tip
>
> Don’t forget to regularly check the results so you can optimize the use case for better performance.

## More resources

Learn how to [enhance and optimize email](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.