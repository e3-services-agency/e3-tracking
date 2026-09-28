---
updatedAt: 2026-03-30T20:07:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Subscriber and unsubscriber monitoring dashboard

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Basic</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Lead generation</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Insights</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

Subscriber and unsubscriber monitoring dashboard offers a comprehensive solution for tracking and analyzing subscriber activities. It allows you to monitor both new subscriptions and unsubscriptions in real time, helping you optimize your marketing and engagement strategies.

This tool provides a centralized dashboard view with data-driven insights into your subscriber base. It helps you understand trends and make informed decisions to enhance customer satisfaction.

### Key features

* Tracks both new subscribers and unsubscribers
* Provides visualizations, charts, and metrics for analysis
* Centralized view for easy access to subscriber data.
* Helps in optimizing marketing and engagement strategies.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/5c3c78731e6c0f66e31ea192cfe85f90b6aa96e37a2168129efefb9a3a19011c-BR_Use_Case_Image__Subscriber_and_Unsubscriber_Dashboard2x.png",
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

1. Go to **Data Manager** > **Customer properties** to ensure the following properties are tracked:

* `Newsletter Consent category`
* `email_invalid`
* Configure the following properties:\
  `newsletter_subscribed_date`\
  `historical_subscribed_date`\
  `newsletter_unsubscribed_date`

2. Verify **Events** in Data Manager:

* `consent` (action: accept/reject, category: newsletter, timestamp)
* `double_opt_in` (action: transferred, source, category: newsletter)
* `campaign` (status: delivered, campaign\_name)
* `session_start `(path, utm\_medium)

3. Ensure **Data mapping** aligns with your project's naming conventions. Adjust any differences in data attribute names (for example, "total\_price" vs. "full\_amount").
4. Adjust segmentations to match your event and property names.

### Understand the use case logic

The dashboard collects and processes "consent" event data, extracts timestamps, and assigns them to customer properties using aggregates. This ensures accurate tracking of current and historical subscriber data and unsubscription dates, even when dealing with inconsistent consent event firing.

The scenario includes immediate property updates and daily tracking, with customer properties like:

The use case tracks subscriber activity by processing "consent" events. When a "consent" event (accept/reject) occurs, the scenario captures its timestamp and assigns it to relevant customer properties using aggregates.

It distinguishes between:

* current subscribers (`newsletter_subscribed_date`).
* all past subscribers, including those who have unsubscribed (`historical_subscribed_date`).
* current unsubscribers who were previously subscribed (`newsletter_unsubscribed_date`).

The scenario operates in two parts: immediate updates upon a "consent" event and a daily tracking process to ensure all properties are accurately filled, providing a comprehensive and up-to-date view of subscriber evolution.

### Clone the Use Case

1. Navigate to **Initiatives** > **\[ASUD] Subscribers & Unsubscribers Monitoring Dashboard**.
2. Click **Clone into Project**. Review dependencies and conflicts, then click **Apply** and **Start cloning**.

### Test and run the use case

* Test a use case before deploying it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-banner-in-the-use-case-center) ensures you don't send unfinished or imperfect campaigns to your customer base.
* Configure settings and ensure dependencies are resolved.
* Start the scenario to begin tracking subscriber activities.
* Monitor results through the evaluation dashboard and make necessary adjustments.

### Evaluate the results

* Remember to run the use case for a few days to see the impact.
* Use the evaluation dashboard to monitor data, trends, and insights.
* Adjust metrics and settings based on performance and business needs.