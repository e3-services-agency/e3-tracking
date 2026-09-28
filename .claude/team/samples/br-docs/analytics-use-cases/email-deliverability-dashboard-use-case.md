---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Email deliverability dashboard use case

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Basic</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Deliverability metrics</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Insights</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

# What to Expect From This Use Case

This dashboard enables an overview of main metrics such as delivery rate and hard bounce. It provides detailed information about different aspects of deliverability to support the constant effort to have a good email reputation. Giving a deep insight into emailing metrics helps marketers understand their emails and audience and improve their campaigns and audience segmentations.

> 💡 Tip
>
> Visit our [microsite](https://www.bloomreach.com/en/products/engagement/plug-and-play/email-deliverability-dashboard) to read more about this and other use cases developed by a team of Bloomreach experts.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/c79266c-AE1D.gif",
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

* Evaluation Dashboard

# How to deploy the Use Case

After downloading the use case, follow these steps:

## Step 1: Meet the Requirements

Verify if the data in your project meets the requirements. Follow this [step-by-step setup guide](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements) in case of problems.

## Step 2: Understand the Use Case Logic

The prebuilt evaluation dashboard includes important deliverability emailing metrics.

The key components that you can adjust include:

* **Scenario**—You need to start the scenario. No further adjustments are necessary.
  * The scenario tracks email\_domain as a separate customer property for every customer with email value tracked. The aim is to isolate only the email domain value and use it in deliverability analysis.
* **Campaign Event Segmentation**—Adjust the definition of the 'exclude' segment.
  * This segmentation is used in the dashboard to filter out campaigns you do not wish to analyze, such as test campaigns. Do not change the order of the segments. If you do not wish to exclude any campaigns, leave the segmentation as it is.
* **Deliverability Dashboard**—Insert your emailing consent into the consent parameter.
  * Remember, a filter is used on the dashboard level that filters out only the campaigns narrowed down in the campaign event segmentation above.

> 💡 Tip
>
> To learn more on Email Deliverability Tips, visit [this article](https://documentation.bloomreach.com/engagement/docs/email-deliverability-tips?_gl=1*uji3ja*_ga*MTAwNzg5NDQxOC4xNzE1MzMxNzkw*_ga_QNZ568TB7S*MTcxODg5ODUyMS41MS4wLjE3MTg4OTg1MjEuNjAuMC4w). To go in depth on Email Marketing Metrics, read [this article](https://documentation.bloomreach.com/engagement/docs/email-marketing-metrics?_gl=1*uji3ja*_ga*MTAwNzg5NDQxOC4xNzE1MzMxNzkw*_ga_QNZ568TB7S*MTcxODg5ODUyMS41MS4wLjE3MTg4OTg1MjEuNjAuMC4w).