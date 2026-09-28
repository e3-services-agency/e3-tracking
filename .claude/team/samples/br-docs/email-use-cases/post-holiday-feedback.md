---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Post-holiday feedback

Industry: travel & hospitality

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Basic</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Increase in CLTV</p>\n    </a>\n  </div>\n \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Retention</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

# What to Expect From This Use Case

Customers will receive a Net Promoter Score (NPS) survey via email two days after returning from their holiday. If they do not respond, a reminder email will be sent within the first week of their return.

> 💡 Tip
>
> Visit our [microsite](https://www.bloomreach.com/en/products/engagement/plug-and-play/post-holiday-feedback) to read more about this and other use cases developed by a team of Bloomreach experts.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/e9c8d34-Post-Holiday-Feedback.gif",
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

* Post-Holiday Feedback email scenario
* NPS Survey

# How to deploy the Use Case

After downloading the use case, follow these steps:

## Step 1: Meet the Requirements

Verify if the data in your project meets the requirements. Follow this [step-by-step setup guide](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements) in case of problems.

## Step 2: Understand the Use Case Logic

Customers will receive an NPS (Net Promoter Score) survey via email two days after returning from their holiday. If they do not respond to the initial email, a reminder will be sent within the first week of their return.

The scenario activates upon the completion of a booking. Subsequently, each customer is placed in a wait node and is released two days after their holiday return. We then verify if this was their most recent completed booking to prevent triggering the scenario multiple times for the same booking or canceled bookings. Additionally, we ensure that the customer has not received an NPS (Net Promoter Score) campaign in the last 30 days to avoid excessive communication. Following these checks, the NPS email is dispatched. If there is no engagement with the NPS email, a reminder is sent five days later.

The second part of this scenario is tailored according to the received NPS score, triggering specific flows based on the three categories:

* **Good NPS (Scores of 3 or 4, labeled as Good or Amazing)**: The objective here is to capitalize on the positive feedback. Encourage customers to make their next booking promptly and introduce them to your Loyalty Club, if applicable, to enhance their engagement further.

* **Average NPS (Score of 2, labeled as Average)**: This is an opportunity to show that you've heard their feedback and are committed to improving. Consider offering a personalized selection or showcasing your best sellers that will likely deliver a superior experience for them next time.

* **Bad NPS (Score of 1, labeled as Bad)**: Express your apologies for any disappointment experienced and offer a voucher to amend the situation. The goal is to regain customers' trust and encourage them to give your service another chance.

Before sending each email, we verify the customer's consent is valid.

Optional:

* if you decide to rename the survey, don't forget to rename it also in the email block in Action section

*Please refer to the scenario descriptions for step-by-step information on use case deployment.*

> 👍 Information
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

## Step 4: Test and Run the Use Case

When you are done adjusting the use case, we recommend to always [test the use case](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-email-in-the-use-case-center) before deployment. When testing, double-check if the use case design, copy, and settings work as preferred.

> ❗️ Warning
>
> You should only deploy a use case after testing. Testing prevents sending unfinished or imperfect campaigns to your customer base.

Run the use case once the testing is over. When you open the email, click the `Start` button in the upper right corner to launch the campaign.

# Additional Resources

Learn how to [enhance and optimize email](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.