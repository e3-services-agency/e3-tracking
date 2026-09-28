---
updatedAt: 2026-03-30T20:07:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Email performance dashboard use case

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Basic</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Learn more about your active subscriber base</p>\n    </a>\n  </div>\n  \n   <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Insights</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

With [Email performance dashboard use case](https://www.bloomreach.com/en/products/engagement/plug-and-play/email-performance-dashboard), you gain deep insights into email metrics, helping you understand your emails and audience, and improve your campaigns. Use the dashboard to analyze campaign success, identify potential problems, and adjust your strategy in real time.

Instead of evaluating each campaign individually, you can now use Email performance dashboard use case to cross-compare them. This saves you time and provides a comprehensive view of your campaign's performance.

> 👍 Performance dashboards are now available
>
> Try our new [Performance dashboards](https://documentation.bloomreach.com/engagement/docs/performance-dashboards) for improved analytics and multi-channel insights.

## Key features

* Metrics related to revenue and engagement are automatically calculated based on the Revenue attribution model.
* The dashboard considers users' time zones, which may result in different views of the data for different users.
* Provides a collection of reports including standard email deliverability, revenue, and 'negative' metrics reports.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/00378941a4b58183e0658e0249e4a96596237d2a9d8c760294a9c8b1580875a9-43-AEPD-Email-Performance-Dashboard-v22x.gif",
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

#### Check prerequisites

Ensure your [Data mapping](https://documentation.bloomreach.com/engagement/docs/data-manager) reflects the following events set within this project:

* purchase event with event attributes
  * purchase\_status: success
  * total\_price
* consent with event attributes
  * action = reject
  * category
* session start with event attributes
  * utm\_source
  * utm\_medium

### Understand the use case logic

* The dashboard helps you understand their email performance, identify areas for investment, and improve strategies without manual dashboard preparation.
* It provides insights into revenue and engagement metrics, helping you analyze campaign success, identify potential problems, and adjust strategies in real time.
* Instead of evaluating each campaign individually, the use case allows for cross-comparison of campaigns.

### Adjust the use case

Now that you understand the use case logic, you can set up the use case according to your needs.

#### Customize campaigns

Define which campaigns to include or exclude in evaluation reports using event segmentation. Name segments to exclude as 'exclude' and those to include as 'campaign target.'

> 📘 Note
>
> Do not rename segments. If you do, you must select new segments in the reports on this dashboard.

#### Set attribution window

The default attribution window for email communication is 48 hours after an open or click, linked to the purchase event. To adjust the attribution window or refine the purchase definition (e.g., status 'successful'), modify the event segmentation:

* Purchase target definition (event segmentation): Adjust the status and attribution window in hours.
* Conversions according to 'last click': Adjust the purchase event status. No attribution window in hours applies here because 'last click' attribution is used.

If the main purchase event is not defined as 'purchase,' create a new segmentation and update all related expressions, including the time between campaign open/click and purchase (hours). Replace this segmentation and all purchase events in the relevant assets with the new event segmentation specific to your project.

#### Adjust the reports

Customize your reports in Email performance dashboard use case contains as follows:

##### 1. Campaign Group results

The report focuses on revenue and emailing metrics by campaign groups defined by clients (such as newsletters and automated campaigns). Modify the setup accordingly:

* Access Campaign Group event segmentation to arrange campaign events into categories.
* Adjust existing segments or create new ones based on the ‘campaign\_name’ in your project.
* Agree on naming principles for campaigns. For example, all newsletter campaigns should contain ‘NL’ in the campaign\_name, and all automated campaigns should contain ‘AE’ in the campaign\_name.

##### 2. Adjust time frames

Some reports are restricted to a specific time, e.g., ‘\[last 90 days]’. To change the time period:

1. Set the time filter on the top right corner to your desired value.
2. Go to **Event Filter** at the bottom of the report and adjust campaign - `sent_timestamp` - matches range to your desired value.
3. If the row consists of an aggregate, adjust the time frame of this aggregate to match the above.\
   For example, Campaign Group results (attribution 48 hours to opened/clicked emails) \[last 30 days] report.

> 📘 Note
>
> Both filters should match the same time frame. The time frame used depends on the expiration of the campaign events in your project.

#### Define consent

Unsubscription metrics are defined by ‘consent’ event with action ‘reject’. Go to the following reports and select the correct consent ‘category’ for emailing communication:

* Unsubscriptions \[last 90 days] - select ‘category’ in the ‘Event Filter’ at the bottom of the report.
* Unsubscriptions by campaign \[last 30 days] - select ‘category’ in the ‘Event Filter’ at the bottom of the report.

## Evaluate the results regularly

After setting up the necessary metrics, the dashboard will serve as an out-of-the-box evaluation tool. No further adjustments are necessary.

To understand the metrics deeply, read the [dashboard interpretation](https://documentation.bloomreach.com/engagement/docs/email-performance-dashboard-use-case-center#dashboard-interpretation) section. Check the evaluation dashboard regularly to spot any need for improvements to your campaigns.

### Dashboard interpretation

The dictionary below helps understand metrics and their calculation in the evaluation dashboard.

#### Attribution model

* Attribution window: Considers in this use case all purchases made within 48h since email open or click.

#### Revenue calculation

* Revenue: Total value of all purchases made by customers impacted by the campaign within the attribution window.
* Buyers: All customers impacted by the campaign who made a purchase within the attribution window.
* Purchases: All purchases made by customers impacted by the campaign within the attribution window.
* Conversion rates (CR): Percentage of customer interactions converted into purchases within the attribution window.
* Unique Conversion rate from Opened (UCR): The proportion of customers who have seen the campaign (have opened or clicked on the email) and were converted into a purchase within the attribution window.
* Average Order Value (AOV): Average revenue from one purchase/order.
* Revenue Per Recipient (RPR): Average revenue per customer that received the email campaign.
* Revenue Per Buyer (RPB): Average revenue per customer with at least one purchase within the attribution window.

#### Email/Campaign metrics

There are two types of metrics:

* non-unique (number of events)
* unique (number of customers)

Example: One customer opens the email three times. Non-unique open metrics = 3, unique open metric = 1.

Find below the recommended industry benchmarks for email campaign metrics:

#### Ecommerce benchmark for ‘positive’ emailing metrics

* Unique Delivery rate: 99% and above
* Unique Open rate: 20% and above
* Unique Click rate from opened: 15% and above

#### Ecommerce benchmark for ‘negative’ emailing metrics

* Unique Hard Bounce rate: less than 1%, aim for less than 0.5% long-term
* Unique Soft Bounce rate: less than 2%
* Unique Unsubscribe rate: less than 0.5%4
* Unique Complained ‘Spam’ rate: less than 0.1%
* Unique Pre Blocked rate: less than 0.01%
* Unique Clicked\_honeypot rate: less than 1%