---
updatedAt: 2026-03-30T20:07:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Black Friday 2023

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Basic</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>get data insights</p>\n    </a>\n  </div>\n  \n   <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Insights</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

Get in-depth knowledge about [Black Friday](https://www.bloomreach.com/en/products/engagement/plug-and-play/black-friday-dashboard) campaign metrics with a unique and customized evaluation dashboard.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/330a9d3-LBFR-Black-Friday-GIF.gif",
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

* Assign Black Friday customer attribute scenario

* Assign the most common traffic source to your customer's scenario

* **Evaluation dashboard**: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

### Understand the use case logic

Start both use case scenarios, then take advantage of the data in the evaluation dashboard to make business decisions.

> 💡 Tip
>
> Run the use case two months prior the Black Friday to gain insights into your customer base and adjust your BF campaigns accordnigly.

#### Scenario 1 - Flag Black Friday Shoppers with Customer Attribute

The scenario aims to create a 'customer attribute flag' to identify different segments of your Black Friday shoppers from the previous year 2022.

Run this scenario to categorize your customers into segments of the `Black Friday Shoppers Segmentation` and flag them with a customer attribute `bf_shopper`. Take advantage of this data (from both the customer attribute and the segmentation) and apply them to your multichannel campaign communication and reporting.

#### Scenario 2 - The Most Common Traffic Source

This scenario creates a 'customer attribute flag' in your project with an aim to conserve the utm\_source information long after the data expiration will suppress the session\_start event.

The idea is to run the scenario now and then daily, so the information on utm\_source is being saved regularly. First, the scenario checks if the customer possesses a hard ID, and then whether the customer does not already have the customer attribute `most_common_traffic_source`. If they don't, the attribute is created in their customer profile.

Note that utm\_source identifies the traffic, so from which site, advertiser, or publication the user came. Make sure to leverage this data in your future campaigns and reporting.

> 💡 Tip
>
> The use case always needs to be adjusted to the right time-frame. Currently, this use case is adjusted for year 2023.