---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Email and SMS reactivation campaign

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity:</p>\n        <p>Advanced</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect:</p>\n        <p>increase in CLTV</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal:</p>\n        <p>Retention</p>\n    </a>\n  </div>\n</div>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

[Email and SMS reactivation campaign](https://www.bloomreach.com/en/products/engagement/plug-and-play/email-and-sms-reactivation-campaign) presents a robust strategy for reconnecting with customers who've grown inactive over time. The intent is to reignite their interest through engaging customized emails and SMS, leading to possible conversions. It targets customers who have not purchased in over 90 days or interact less with previous marketing communications. The personalized touch in these communications leaves a lasting impression, significantly impacting customer retention and conversion rates—bringing dormant customers back into the buying cycle.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/f6b6e25-LOPR-Email-and-SMS-Reactivation-Campaign.gif",
        "",
        ""
      ],
      "align": "center"
    }
  ]
}
[/block]

## Use case items

With this use case, you’ll get an:

* Email and SMS reactivation campaign

* Recommendations engine

* **Evaluation dashboard**: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

### Understand the use case logic

Once a week, the 'Lapsing' customers are identified, and an email campaign with personalized recommended products is sent to them. If they do not engage with the email nor make a purchase, a follow-up SMS will be sent 5 days later.

Who is the lapsing customer? A customer who gave `emailing` consent more than three months ago and did not interact (open/click) with emails in the last 180 days.

This scenario is run once a week. First, to not break the GDRP rules, we check if a customer still has `emailing` consent. If that is true, the customer has to pass these conditions to receive an email: be part of the Lapsing segment, and his latest purchase dates back to 3-15 months ago. The 'Personalized Reactivation Email' frequency is limited to one email per 30 days but no more than two emails from this campaign.

After `5` days, if the customer has `SMS consent` and didn't engage with the email or purchase since the personalized reactivation email was sent, so a follow-up SMS was sent to this customer.

The email content displays the last bought product based on aggregate `[LOPR] Last Purchased Product [data for campaign]` followed by `3 products` based on recommendation engine `[LOPR] Top viewed products [Email and SMS Reactivation Campaign]`. The recommended products have been the top-viewed products on the website in the last 14 days.

The SMS content refers to the last product bought (same as above).

Follow the description and labels in the scenario in case of uncertainty.

### Adjust the use case

Now that you understand the use case logic, you can set up the use case according to your needs.

#### Email Settings

Access the email and go to the **Settings** tab to adjust the [email settings](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-email-design-and-settings-in-the-use-case-center#settings).

#### Design and Copy

Customize the [email visuals and copy](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-email-design-and-settings-in-the-use-case-center) to reflect your company's brand identity.

Adjust the [email template with products in the email node](https://documentation.bloomreach.com/engagement/docs/customize-the-email-node-in-use-case-center).

### Test and run the use case

Test a use case before deploying it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-email-in-the-use-case-center) ensures you don't send unfinished or imperfect campaigns to your customer base.

Once the testing is over, run the use case. Open the banner and click **Start** to launch the campaign.

### Evaluate the results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt [evaluation dashboard](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) to measure and analyze relevant data.

1. Open the evaluation dashboard
2. Enter the banner's name. For example, Email and SMS reactivation campaign.
3. Set the [attribution window for revenue in hours](https://documentation.bloomreach.com/engagement/docs/use-case-evaluation#benefitrevenue-calculations), for example, 24.
4. Click **Refresh** to see the results.
5. Check campaign results regularly to optimize performance.

## Other resources

Learn how to [enhance and optimize email](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.