---
updatedAt: 2026-03-30T20:07:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Conversion dashboard

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Basic</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Insights into RPV, AOV, Revenue</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal:  \n        <p>Insights</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

A [conversion dashboard](https://www.bloomreach.com/en/products/engagement/plug-and-play/conversion-dashboard?_gl=1*a58q0f*_up*MQ..\&gclid=Cj0KCQjwxeyxBhC7ARIsAC7dS39FlCxD-1YAFmrHDTbpnTCr5YgXwwp8RQDWwhyjy33YUMJ7g5diUK4aApIpEALw_wcB) is an easy tool for understanding conversion data from session\_start to purchase.

This dashboard monitors the main conversion touchpoints, such as website browsing until purchase, checkout process, and repetitive purchases. Therefore, it helps you identify where to focus your business's attention.

Direct access to the conversion data enables you to optimize your conversion rates using real-time insights. This helps drive product page conversion, increase overall RPV, and improve business performance.Based on data from this use case, you can optimize your campaigns and marketing strategies to drive conversion rates and focus on the groups currently performing the best.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/ccd3a34-ACVD_Conversion_Dashboard.gif",
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

* **Evaluation dashboard**: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

### Understand the use case logic

The Conversion Dashboard shows the purchase funnel, split across devices, and session conversion by traffic source.

Firstly, you will be able to understand roughly how successful they are in converting your clients from session starts to purchase. Secondly, you can narrow this data by looking at traffic sources, device types, and the country of origin.

### Adjust the assets

Go through these assets in Use Case Setup step and make the necessary adjustments:

* Device - Event Segmentation—Check if all the devices tracked in your project are covered within the categories. Do not hesitate to create a new segment if needed.
* Purchase Definition and Attribution—All metrics and reports in the Website performance block work with a purchase event defined as ‘purchase\_status’ equals ‘success’ and an attribution window 60 minutes from session\_start. If your project's naming conventions are different, please adjust them accordingly. You can also change the attribution window there.
* Purchase Definition—All other funnels and reports use the purchase status 'success'. If your project's naming conventions are different, please adjust them accordingly.

After setting up the dashboard, go through the numbers and check if they correspond to the reality of your project. Observe the interconnection of some of the reports as well.

> 💡 Tip
>
> Don’t forget to regularly check the results so you can optimize the use case for better performance.