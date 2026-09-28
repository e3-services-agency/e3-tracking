---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Gamified banners

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Advanced</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Conversion rate</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Acquisition</p>\n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

This [use case](https://www.bloomreach.com/en/products/engagement/plug-and-play/gamified-banners) provides five gamified banners to be displayed on a website. Gamified banners engage users with interactive elements, boosting interaction rates and conversions by making marketing content more dynamic and enjoyable.

You can customize these banners to reflect your brand's identity, increase your email subscribers and conversions, and add some fun to the website's user experience with gamification.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/44cee293f446933e6af48658007bba90ae540f7431afd38249e265094cdafd15-Gamified-Banners-UC.png",
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

With this use case, you’ll get:

* Aggregate worker that triggers the gamified banner on a website

* 5 Gamified banner templates to choose from: Mobile Scratchcard, Desktop Scratchcard, Pexeso, Deal Wheel, and Pick-A-Gift

* Automated scenario covering the voucher assignment logic

* **Evaluation dashboard**: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

## How to deploy the use case

After downloading the use case, follow these steps.

### Create a dummy voucher pool

To download the use case, you must create a [dummy voucher pool](https://documentation.bloomreach.com/engagement/docs/ucc-faq#why-do-i-need-to-create-a-dummy-catalog-for-some-use-cases) in your project:

1. [Create a dummy voucher pool](https://documentation.bloomreach.com/engagement/docs/vouchers-1#import-voucher-codes) named "vouchers."
2. Manually create the voucher catalog without the need to add any real vouchers.

This allows the system to simulate assigning vouchers to customers without using actual vouchers. Once the use case is fully set up and tested, you should replace the dummy catalog with a real voucher catalog and delete the dummy catalog if needed.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

### Understand the use case logic

When a customer visits the website, they trigger the Aggregate Worker tag. The Aggregate Worker checks whether the customer is allowed to receive vouchers (`GAME_voucher_block` is NOT set to `True`).

If this condition is met, the tag checks whether the customer has no voucher currently assigned (both `GAME_voucher` & `GAME_reward` has to be empty).

If all the above conditions are met, `GAME_trigger_event` is created. This event triggers the Scenario, which assigns a random voucher to the customer who will see it in the displayed Weblayer on the webpage.

The scenario can be used further to reset the entire campaign and allow the customers to participate more than once.

### Adjust the use case

Now that you understand the use case logic, you can set up the use case according to your needs.

#### Aggregate worker

If you wish to target a specific customer group with this use case, you can adjust audience filtering in Aggregate worker settings, not banner settings.

The current audience filtering is set to:

* Not in the Control Group
* Do not have Newsletter consent
* Have not engaged with or closed the gamified banner in the past 15 minutes

The audience is set according to our best practices, and we do not recommend any changes.

#### Gamified banners

Customize the banner visuals and copy to align with your company's brand identity. See banner tooltips ℹ️ in case of uncertainty.

Do not adjust audience settings in the banner campaign. To set up an Audience, you need to adjust the audience in the Aggregate worker.

Select the banner template you want to run, delete other banners, and turn off the A/B test to delete the Control group.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/f449025f3ce532857679bbc2b639e810115be6460b790e1ab388d60d0863fb27-banner-ab.png",
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

If you do not want to delete other banner variants, go to the A/B test tab and assign 100% in traffic distribution to your preferred banner and 0% to the Control group. If you decide to split the traffic with the Control group, the customer might get the voucher assigned but never receive it via email, so we do not recommend this setup.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/45d3880c9d8a0bf87d264d81aa16479e9bf071b51f4484a8c7f8b77dd081123b-banner-ab-all.png",
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

> 🚧 Warning
>
> The control group should be avoided to ensure your entire audience can participate in this use case.

You can go [through this guide](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-banner-design-and-settings-in-the-use-case-center) for more information on banner design & copy adjustments.

#### Voucher assignment email scenario

For detailed information, read and follow the description in the scenario, which consists of two steps.

**Step 1** consists of creating new customer attributes: `GAME_voucher` and `GAME_reward`.

* `GAME_voucher` = voucher code as tracked in the voucher catalog and assigned at the very beginning.\
  `GAME_reward` = voucher type as described in the next flow, for example 20%.

> 📘 Note
>
> The vouchers are assigned to all customers (matching the campaign requirements), even those who choose not to interact with the banner eventually.
>
> This is a technical requirement in order to show the voucher reward directly in the banner after the game is played.

**Step 2** consists of assigning a random voucher to any customer who sees the Gamified banner on the website.

* Adjust the voucher probability distribution; the **Control Group should always be 0%**.
* Add the corresponding voucher pools.

#### Import vouchers

Create one voucher pool for each reward category that customers will receive. For example, if you have three voucher categories, create and import a voucher pool for each.

### Test the use case

Test a use case before deploying it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-banner-in-the-use-case-center) ensures you don't send unfinished or imperfect campaigns to your customer base.

Once the testing is over, run the use case. Open the banner and click **Start** to launch the campaign.

#### Vouchers for testing

During testing, you will assign vouchers to the test customer profiles. This change is irreversible—you must only assign the [vouchers](https://documentation.bloomreach.com/engagement/docs/vouchers-1) you are willing to use for testing. Therefore, it is recommended that you create a testing voucher pool or import vouchers dedicated to testing.

#### Testing

To test the use case, start the Aggregate worker and not the banners, as the Aggregate worker will start the banner automatically and start the Voucher assignment scenario.

1. Open gamified banners, decide on the banner template you want to run, delete other banners, and turn off the A/B test to delete the Control group. **Do not Start the banner; the use case is run through Aggregate Worker.**
2. Copy `banner_id`, open the Aggregate worker, and enter the ID into the predefined parameter.
3. Adjust Aggregate worker audience settings to test the banner on your testing profile. Click on the **Settings** tab to insert a new filter with your cookie.
   1. Click on **+ Add filter condition**.
   2. Choose IDs, cookie and insert your testing [cookie](https://documentation.bloomreach.com/engagement/docs/exponea-console).
4. Start the Aggregate worker.
5. Start the scenario covering the voucher assignment logic.
6. Go to your website to see the banner in action.

### Run the use case

To run the gamified banner use case, follow these steps:

1. Open Gamified banners and copy the [banner\_id](https://documentation.bloomreach.com/engagement/docs/using-campaign-id#where-to-find-the-id-campaign_id) . Do not Start the banners.
2. Open the Aggregate worker and enter the banner ID into the predefined parameter.
3. Go to Aggregate worker Settings and choose the Audience to display the gamified banner.
4. Start the Aggregate worker.
5. Open the scenario with the Voucher Assignment and click the **Start** button.

> 🚧 Warning
>
> To run the use case, start the Aggregate worker and the Voucher Assignment scenario. **Do not start the banner**.

### Evaluate the results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt [evaluation dashboard](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) to measure and analyze relevant data.

## Other resources

Learn how to [enhance and optimize the banner](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.

We strongly recommend testing multiple variants of one banner. You can change and experiment with:

* wording,
* banner placement,
* audience filtering.