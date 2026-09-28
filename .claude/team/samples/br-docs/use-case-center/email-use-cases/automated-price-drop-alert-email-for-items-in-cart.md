---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Automated price drop alert email for items in cart

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity:</p>\n        <p>Advanced</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect:</p>\n        <p>increase in RPV</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal:</p>\n        <p>Performance</p>\n     \n    </a>\n  </div>\n</div>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

# What to expect from this use case

Automated price drop alert email for items in cart offers a strategically automated solution for engaging customers who have shown buying intent. It sends tailored email notifications about price drops on items left in the shopping cart, offering an incentive to complete the purchase. By capitalizing on this keen interest, the use case increases Revenue per Visitor and improves conversion rates.

> 💡 Tip
>
> Visit our [microsite](https://www.bloomreach.com/en/products/engagement/plug-and-play/automated-price-drop-alert-email-for-items-in-cart) to read more about this and other use cases developed by a team of Bloomreach experts.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/afe5f28-30-Automated-Price-Drop-Alert-Email-for-Items-in-Cart.gif",
        "",
        ""
      ],
      "align": "center"
    }
  ]
}
[/block]

# Use case items

With this use case, you’ll get a:

* Ready-to-use automated price drop alert email for items in cart
* Pre-defined evaluation dashboard

# How to deploy the use case

After downloading the use case, follow these steps:

## Step 1: Meet the requirements

Verify if the data in your project meets the requirements. Follow this [step-by-step setup guide](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements) in case of problems.

## Step 2: Understand the use case logic

A customer gets an email when there’s been a price drop in a product that the customer added to the cart and not purchased previously.

The scenario is triggered when customers put a product in the cart. To comply with GDPR, it first checks for `emailing` consent.  Any products bought in the last 30 days are excluded from the price drop alert. After a 24-hour delay, it verifies if the customer still hasn't purchased or removed the product from the cart. Afterward, the product is added to a 'watchdog' list (customer attribute 'watchdog\_price\_automatic\_cart\_update') created on the customer profile.

Daily, the scenario checks if the price of any product in the 'watchdog' list has dropped by more than 10%, in which case a special 'watchdog event' triggers an email to the customer. Before sending an 'Automated Price Drop Alert Email for Items in Cart,' it ensures the customer still has `emailing` consent. The Automated Price Drop Alert Email for Items in Cart' frequency is limited to one email per `14` days.

The email includes personalizing items the customer has put in the cart previously and whose price has dropped. Both old and new prices are displayed based on the data in the product catalog.

To remove a particular product from the 'watchdog' list, at least one of the following conditions must apply:

* The customer received the 'Automated Price Drop Email'
* The customer did NOT receive the email, but was in the Control Group of the A/B test
* The product was being monitored in the 'watchdog' list for more than `30 days`
* The customer has purchased the product

Follow the description and labels in the scenario in case of uncertainty.

> 💡 Tip
>
> The logic of this use case is built on best practices and only requires adjustments if you want to further customize the use case. Get instant value by launching this campaign in just a few clicks.
>
> However, we highly recommend you adjust the use case design and copy to fit your business needs.

## Step 3: Adjust the use case

Now that you understand the use case logic, you can set up the use case according to your preference.

### 3.1 Email settings

If you decide to customize the email settings, follow [this detailed guide](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-email-design-and-settings-in-the-use-case-center#settings) to make the adjustments.

### 3.2 Design & copy

Customize the email visuals and copy to align with your company's brand identity.

Otherwise, you can go [through this guide](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-email-design-and-settings-in-the-use-case-center) for more information.

Follow [this](https://documentation.bloomreach.com/engagement/docs/customize-the-email-node-in-use-case-center) guide to adjust the email template with products in the email node.

### 3.3 A/B test

[A/B test](https://documentation.bloomreach.com/engagement/docs/ab-tests) the use case to better understand the email performance and revenue generated.

This use case's A/B test traffic distribution is set to variant A at 50 % and the control group at 50 %. We recommend keeping this distribution as it brings quick and statistically significant results.

Learn more about the dos and don'ts when modifying your A/B tests in [this guide](https://documentation.bloomreach.com/engagement/docs/ab-tests#prepare-for-an-ab-test).

## Step 4: Test and run the use case

When you are done adjusting the use case, we recommend to always [test the use case](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-email-in-the-use-case-center) before deployment. When testing, double-check if the use case design, copy, and settings work as preferred.

> ❗️ Warning
>
> You should only deploy a use case after testing. Testing prevents sending unfinished or imperfect campaigns to your customer base.

Run the use case once the testing is over. When you open the email, click the `Start` button in the upper right corner to launch the campaign.

> 👍 Congratulations!
>
> If you got here, you have successfully deployed this use case.

## Step 5: Evaluate the results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt and ready-to-use evaluation dashboard specifically included in this use case to measure and analyze relevant data.

To evaluate, open the evaluation dashboard, enter the email's name (e.g., Automated Price Drop Alert Email for Items in Cart), set the [attribution window for revenue in hours](https://documentation.bloomreach.com/engagement/docs/use-case-evaluation#benefitrevenue-calculations) (e.g., 24), and click the `Refresh` button in the upper right corner to see the results.

If you encounter any problems, read [this article](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) for insights on evaluating the use case.

> 💡 Tip
>
> Don’t forget to regularly check the results so you can optimize the use case for better performance.

# Additional resources

Learn how to [enhance and optimize email](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.