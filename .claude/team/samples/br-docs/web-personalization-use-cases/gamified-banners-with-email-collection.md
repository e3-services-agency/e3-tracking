---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Gamified banners with email collection

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Advanced</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>increase in Lead Generation</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Acquisition</p>\n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

This[ use case](https://www.bloomreach.com/en/products/engagement/plug-and-play/gamified-banners-with-email-collection) provides five gamified banners and a fully automated emailing scenario. You can customize these banners to reflect your brand's identity, increase your email subscribers and conversions, and add some fun to the website's user experience with gamification. Enrich your customers' experience on your website with a little reward.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/6767e54-WGAE_copy_3.gif",
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

* Aggregate worker

* 5 Gamified banner templates to choose from: Mobile Scratchcard, Desktop Scratchcard, Pexeso, Deal Wheel, and Pick-A-Gift

* Scenario covering the voucher assignment logic and sending out the reward email

* **Evaluation dashboard**: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

## How to deploy the use case

After downloading the use case, follow these steps.

### Create a dummy voucher pool

To download the use case, you must create a [dummy voucher pool](https://documentation.bloomreach.com/engagement/docs/vouchers-1#import-voucher-codes) in your project:

1. Create a dummy voucher pool named "vouchers."
2. Manually create the voucher catalog without the need to add any real vouchers.

Note that you can delete the voucher catalog later if needed.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

### Understand the use case logic

This use case consists of 5 gamified banner templates. You can choose the one that corresponds to your business needs. The banner is triggered on a website through an Aggregate worker.

A customer comes to the website where the gamified banner is displayed. The customer enters an email address (thus subscribing to single-opt-in emailing consent) to play the game. The reward is displayed directly in the banner, and an email with a reward code is sent to the customer’s email address.

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

* If you do not want to delete other banner variants, go to the A/B test tab and assign 100% in traffic distribution to your preferred banner and 0% to the Control group. If you decide to split the traffic with the Control group, the customer might get the voucher assigned but never receive it via email, so we do not recommend this setup.

> ❗️ Warning
>
> The control group should be avoided to ensure your entire audience can participate in this use case.

You can go [through this guide](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-banner-design-and-settings-in-the-use-case-center) for more information on banner design & copy adjustments.

#### Voucher assignment email scenario

For detailed information, read and follow the description in the scenario, which consists of Steps 0, 1, and 2.

Step 1 consists of assigning a random voucher to any customer who sees the Gamified banner on the website.

* Adjust the voucher probability distribution; the **Control Group should always be 0%**.
* Add the corresponding voucher pools.

Step 2 includes two email nodes: 'Gamified email—voucher' and 'Gamified email—voucher again.'

* Gamified email—voucher: This is the first email the customer will receive after engaging in the game.
* Gamified email—voucher again: This is a reminder email sent to customers who have tried to play the game again but have already received a discount code in a previous email. This email will include the discount code they have received but haven't used.

#### Import vouchers

Create one voucher pool for each reward category that customers will receive (e.g., if you have 3 voucher categories, create and import a voucher pool for each).

### Test the use case

Test a use case before deploying it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-banner-in-the-use-case-center) ensures you don't send unfinished or imperfect campaigns to your customer base.

Once the testing is over, run the use case. Open the banner and click **Start** to launch the campaign.

#### Vouchers for testing

During testing, you will assign vouchers to the test customer profiles. This change is irreversible—you must only assign the [vouchers](https://documentation.bloomreach.com/engagement/docs/vouchers-1) you are willing to use for testing. Therefore, it is recommended that you create a testing voucher pool or import vouchers dedicated to testing.

#### Testing

To test the use case, start the Aggregate worker and not the banners, as the Aggregate worker will start the banner automatically and start the Voucher assignment scenario.

1. Open gamified banners, decide on the banner template you want to run, delete other banners, and turn off the A/B test to delete the Control group. **Do not Start the banner; the use case is run through Aggregate Worker.**
2. Copy banner\_id, open the Aggregate worker, and enter the ID into the predefined parameter.
3. Adjust Aggregate worker audience settings to test the banner on your testing profile. Click on the Settings tab to insert a new filter with your cookie.
   1. Click on + Add filter condition.
   2. Choose IDs, cookie and insert your testing [cookie](https://documentation.bloomreach.com/engagement/docs/exponea-console).
4. Start the Aggregate worker.
5. Start the scenario covering the voucher assignment logic.
6. Go to your website to see the banner in action.
   1. Insert your testing email to test the banner and the email scenario. Did you receive an email with the correct voucher assigned?

### Run the use case

To run the gamified banner use case, follow these steps:

1. Open Gamified banners and copy the [banner\_id](https://documentation.bloomreach.com/engagement/docs/using-campaign-id#where-to-find-the-id-campaign_id). Do not Start the banners.
2. Open the Aggregate worker and enter the banner ID into the predefined parameter.
3. Go to Aggregate worker Settings and choose the Audience to display the gamified banner.
4. Start" the Aggregate worker.
5. Open the scenario with the Voucher Assignment and click the "Start" button.

> 👍 Information
>
> To run the use case, start the Aggregate worker and the Voucher Assignment scenario. **Do not start the banner**.

### Evaluate the results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt [evaluation dashboard](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) to measure and analyze relevant data.

## Other resources

Learn how to [enhance and optimize the banner](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.

We strongly recommend testing multiple variants of one banner:

* change: wording, banner placement, audience filtering.