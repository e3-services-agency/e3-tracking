---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Browser tab animation

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

## Use case description

The [Browser tab animation](https://www.bloomreach.com/en/products/engagement/plug-and-play/browser-tab-animation) re-engages customers who leave your website by displaying dynamic notifications, emojis, or flashing text in their browser tab. This attention-grabbing weblayer drives customers back to complete interrupted purchases or browsing sessions, boosting conversion rates through customizable messages like "Please come back" or "(1) Finish your purchase."

### Key features

* **Automatic triggering**: Activates when customers leave your website after a configurable timeout period.
* **Dynamic content options**: Display custom text, emojis, notifications, or icons in the browser tab.
* **Flashing animation**: Alternates between favicon and text to maximize attention-grabbing impact.
* **Fully customizable**: Parametric design allows complete control over messaging and timing.
* **A/B testing ready**: Built-in control group for testing effectiveness against baseline performance.
* **Flexible duration**: Configurable animation length and display persistence options.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/aa4f2a4d3dd93f3d71b7b921a21c1c1021a9cd092385c1aa41a179d2ab87d8f1-Browser_Tab_Animation_-_kopia.gif",
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

With this use case, you’ll get an:

* **Functional weblayer for browser tab**: Ready-to-deploy animation component with customizable parameters.

* **Evaluation dashboard**: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

### Understand the use case logic

The Browser tab animation operates on the following logic:

* **Trigger timing**: The animation displays 5 seconds after customers leave your site (configurable via `timeout` field).
* **Animation duration**: Runs for 7 seconds with alternating favicon and text display.
* **Display persistence**: Continues until customer interaction occurs.
* **Content rotation**: Alternates between custom text and visual elements to maximize impact.

### Adjust the use case

Follow these steps to set up the use case according to your needs:

#### 1. Configure timeout settings

* Set your preferred delay before animation triggers (default: 5 seconds).
* When you modify the `Timeout in seconds` parameter, update the corresponding value in the **Control Group** to maintain fair A/B testing. Open the **Control Group** and ensure line 2 reflects your timeout value converted to milliseconds.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/4c3549ed288ef930388032f278e6b039dab11e99eede3b79089f8901ab1c123e-Browser_tab_weblayer_settings.png",
        "",
        ""
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

#### 2. Customize messaging

* Define your browser tab text, emojis, or notification content.
* For example, use messages like "Please, come back" or "(1) Finish your purchase."

#### 3. Set animation duration

Adjust how long the flashing animation runs (default: 7 seconds).

#### 4. Choose traffic distribution

This use case's [A/B test](https://documentation.bloomreach.com/engagement/docs/ab-tests) traffic distribution is set to variant A at 80 % and the control group at 20 %. This means 80% of customers will see the banner (variant A), while 20% (the control group) will not. We recommend keeping this distribution as it brings quick and statistically significant results.

Learn more about the dos and don'ts of [modifying A/B test](https://documentation.bloomreach.com/engagement/docs/ab-tests#prepare-for-an-ab-test).

#### 6. Deploy and monitor

* Test a use case before deploying it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-banner-in-the-use-case-center) ensures you don't send unfinished or imperfect campaigns to your customer base.
* After testing, run the use case. Open the banner and click **Start** to launch the campaign.
* Remember to run the use case for a few days to see the impact.
* After this initial period, use the prebuilt [evaluation dashboard](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) to measure and analyze relevant data.
  1. Open the evaluation dashboard.
  2. Enter the banner's name. For example, Browser tab animation.
  3. Set the [attribution window for revenue in hours](https://documentation.bloomreach.com/engagement/docs/use-case-evaluation#benefitrevenue-calculations), for example, 24.
  4. Click **Refresh** to see the results.
* Check campaign results regularly to optimize performance.

## Other resources

Learn how to [enhance and optimize the banner](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.