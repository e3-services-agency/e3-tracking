---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Birthday reminder banner

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Advanced</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Increase in Purchase Frequency</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Retention</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

The [Birthday Reminder Banner](https://www.bloomreach.com/en/products/engagement/plug-and-play/birthday-reminder-banner) use case helps you collect the birthdays of one or two friends via a banner. Once their birthdays are approaching, you’ll receive an email reminder, ensuring you never miss congratulating them. This automated solution keeps you informed and prepared to celebrate your friends' special days.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/926a9159f1d45e63ed8450a65dd98582595444367fa5d87a80a889104d75ba27-EPP-WBRR-Birthday-Reminder-Banner.gif",
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

* Birthday reminder banner

* Birthday reminder email

* **Evaluation dashboard**: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

## How to deploy the use case

After downloading the use case, follow these steps:

### Meet the requirements

Verify if the data in your project meets the requirements. Follow this [step-by-step setup guide](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements) in case of problems.

### Understand the use case logic

The birthday reminder use case includes a banner where customers can enter the names and email addresses of up to two friends and select one of five product categories suitable for their gifts. An email reminder is sent to the customer two weeks before each friend's birthday and again on the birthday day.

Only customers with a valid email address and who have given email consent are targeted with the banner.

#### Banner

The banner includes Name, Birthday, and Choose a gift category for your friend input fields for your first and second friends.

You can define up to five different gift categories. If you want to define fewer categories, leave the rest blank; they will not show when the campaign is live. For example, if you want to give the customer two options, for Option 1, insert Toys, Option 2, Games, and leave Option 3, 4, and 5 blank. The minimum is to insert one option to run the use case.

Your customer must fill in details for at least one customer to Submit the banner.

#### Email

##### First flow

The first flow saves the data from the Birthday Reminder Banner into customer properties so they can be used in email communication.

##### Second flow

The second flow is triggered daily and consists of five pairs of branches representing the five gift categories defined in the banner.

To comply with GDPR rules, we verify that the customer has given newsletter consent after the Repeat daily trigger node. Each category is then divided into checks for friend\_1's and friend\_2's birthdays.

An email reminder is sent 14 days before the birthday, personalized with condition rows for either friend\_1 or friend\_2 and featuring a recommendation engine corresponding to the chosen gift category. Do not remove the condition rows for the use case to function correctly.

Another email is sent on the exact birthday, replicating the personalization and recommendation logic from the first email.

### Adjust the use case

Now that you understand the use case logic, you can set up the use case according to your preference.

#### Banner

##### Banner settings

Access the banner and go to the **Settings** tab to adjust the [banner settings](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-banner-design-and-settings-in-the-use-case-center#settings).

##### Design and copy

Customize the [banner visuals and copy](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-banner-design-and-settings-in-the-use-case-center) to reflect your company's brand identity.

Open the banner use case and find the panel with adjustable parameters. For guidance, hover over the information icons next to each parameter.

#### Email

##### Email settings

If you decide to customize the email settings, follow [this detailed guide](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-email-design-and-settings-in-the-use-case-center#settings) to make the adjustments.

##### Design and copy

Open the email node to adjust the email design and settings.

##### Friend's birthday email - 2 weeks before

The content for either friend\_1 or friend\_2 is personalized using [row display condition](https://documentation.bloomreach.com/engagement/docs/email-editors#row-display-condition). For this use case to function, the condition rows must be kept in the email design for friend\_1 and friend\_2. These rows are dynamic; only the corresponding row will be displayed to the recipient.

If both friends have birthdays on the same day, both rows will be displayed to the recipient.

Make sure the correct row conditions are chosen and check the recommendation block.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/cde9dc0e27555694e0766c7f0dbf20d8165fdecf019f9aa63e8eaf81b806ac0a-Screenshot_2024-09-10_at_00.44.46.png",
        "",
        ""
      ],
      "align": "center"
    }
  ]
}
[/block]

##### Friend's birthday email - today

As in the previous email, ensure the correct row conditions are chosen and check the recommendation block.

[Customize the email visuals and copy](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-email-design-and-settings-in-the-use-case-center) further to align with your company's brand identity.

#### Recommendation engine

Open the email node to adjust the recommendation engine.

Make sure that the correct recommendation engine is chosen for both emails. Click on the Recommendations HTML block > CONFIGURE BLOCK and check the Recommendation ID. There is a corresponding engine for each category branch. For example, for Category 1, there is Most bought products from category 1 ... engine.

These engines consist of most bought products in the specific category in last 30 days.

#### Segmentation

If you decide to change the gift categories, open segmentations for both friends and adjust the customer filter for each category. For example, currently category 1 equals Toys - if you decide to change this insert category of your choice into the segments.

### Test and run the use case

Test a use case before deploying it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-banner-in-the-use-case-center) ensures you don't send unfinished or imperfect campaigns to your customer base.

Once the testing is over, run the use case. Open the banner and click **Start** to launch the campaign.

### Evaluate the results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt [evaluation dashboard](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) to measure and analyze relevant data.

1. Open the evaluation dashboard
2. Enter the banner's name. For example, Birthday reminder banner.
3. Set the [attribution window for revenue in hours](https://documentation.bloomreach.com/engagement/docs/use-case-evaluation#benefitrevenue-calculations), for example, 24.
4. Click **Refresh** to see the results.
5. Check campaign results regularly to optimize performance.

## Other resources

Learn how to [enhance and optimize the banner](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/1fabcfd09dbd9346bbaa8549a9531df10ae8aa009fe9ae87401655137f23eb80-image.png",
        "",
        ""
      ],
      "align": "center",
      "sizing": "1px"
    }
  ]
}
[/block]