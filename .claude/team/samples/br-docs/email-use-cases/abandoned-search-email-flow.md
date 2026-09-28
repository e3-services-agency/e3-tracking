---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Abandoned search email flow

Industry: Travel

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Advanced</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Increase in Lead Generation</p>\n    </a>\n  </div>\n \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Acquisition</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

The [Abandoned Search](https://www.bloomreach.com/en/products/engagement/plug-and-play/abandoned-search-email-flow) targets customers who began searching for travel options, such as flights, hotels, or car rentals but did not complete a booking. Travel companies can personalize follow-up communications using data from these abandoned searches to encourage customers to return and finalize their bookings.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/ce06d08ba082982a4d88d94f2a91e68560574322b0679e2d485585c7f514d2e7-OTAS-Abandoned-Search.gif",
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

* Abandoned search email

## How to deploy the use case

After downloading the use case, follow these steps:

### Meet the requirements

Verify if the data in your project meets the requirements. Follow this [step-by-step setup guide](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements) in case of problems.

### Understand the use case logic

This use case involves re-engaging users who left the site without completing their travel booking to encourage them to return and finalize their plans.

Choose between two flows for this use case, depending on your preference for displaying personalized content in the email and based on the data available in your data structure:

* Flow 1: Triggered when the session ends, using aggregates to populate personalized email content
  * if you decide on flow 1, adjust the aggregates in the Use case setup step
* Flow 2: Triggered by each view\_item event, pulling email content directly from the event using Jinja templates
  * if you decide on flow 2, consider if the data in your data structure are complete for the view\_item event

Customers enter the flow after 2 hours if they have provided valid consent. Customers who made a booking within the last seven days are excluded to prevent over-targeting. The use case targets customers who viewed an item in their last session but didn’t add it to their cart. The frequency for this campaign is capped at one email every seven days.

The email content includes the last item viewed, including its name, start date, destination, and URL. You can customize the content based on your specific data structure and event tracking setup.

### Adjust the use case

Now that you understand the use case logic, you can set up the use case according to your preference.

#### Email settings

If you decide to customize the email settings, follow [this detailed guide](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-email-design-and-settings-in-the-use-case-center#settings) to make the adjustments.

#### Design and copy

Customize the email visuals and copy to align with your company's brand identity.

Otherwise, you can go [through this guide](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-email-design-and-settings-in-the-use-case-center) for more information.

Follow [this](https://documentation.bloomreach.com/engagement/docs/customize-the-email-node-in-use-case-center) guide to adjust the email template with products in the email node.

#### A/B test

[A/B test](https://documentation.bloomreach.com/engagement/docs/ab-tests) the use case to better understand the email performance and revenue generated.

This use case's A/B test traffic distribution is set to variant A at 80 % and the control group at 20 %. We recommend keeping this distribution as it brings quick and statistically significant results.

Learn more about the dos and don'ts when modifying your A/B tests in [this guide](https://documentation.bloomreach.com/engagement/docs/ab-tests#prepare-for-an-ab-test).

### Test and run the use case

When you are done adjusting the use case, we recommend to always [test the use case](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-email-in-the-use-case-center) before deployment. Double-check if the use case design, copy, and settings work as preferred when testing.

Run the use case once the testing is over. When you open the email, click the `Start` button in the upper right corner to launch the campaign.

## Other resources

Learn how to [enhance and optimize email](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.

## For advanced users

If your search funnel consists of different steps that you track, consider dividing the Abandoned search use case into multiple use cases based on the step where the abandonment happened.