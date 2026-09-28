---
updatedAt: 2026-03-30T20:07:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Time zone segmentation

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Basic</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Strategic insights</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Insights</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

Sending messages at the right time matters. A campaign sent at 9 AM works great for your customers in New York, but wakes up those in Los Angeles at 6 AM. Time zone segmentation use case automatically group your customers by their local time zones based on geographic location data, allowing you to send messages at appropriate times for each customer's location.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/18fa619bfc31af128a2dcc36054fc9afddf186a50326b55ef1eda8d43e5bcf81-Timezone-aware_Silent_Hours_image2x_1_1.jpg",
        "",
        ""
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

## Key features

* **Personalized message timing**: Schedule campaigns that reach each customer at the most appropriate hour in their time zone.
* **Reduced opt-outs**: Avoid frustrating customers with poorly timed messages that arrive at inconvenient hours.
* **Automatic time zone grouping**: Segments customers by time zone using location data from customer attributes and behavioral events.
* **Works with existing features**: Integrates with [Time zones](time-zones) feature, [Silent hours](silent-hours), scenarios, and campaigns for precise audience targeting.
* **Ready to use**: Three pre-built segmentations covering US, EU, or combined regions.
* **Customizable**: Add new time zones or adjust existing segments to match your customer distribution.

## Use case items

This use case includes three pre-configured time zone segmentations:

* US time zone segmentation
* EU time zone segmentation
* US + EU time zone segmentation

## How the segmentations work

Each time zone in this use case is built using two segments with identical names. This structure enables cascading logic, where the segmentation checks multiple data sources in a priority order to determine each customer's time zone. The system starts with the most reliable information and moves to alternatives when the preferred data isn't available.

The segmentation follows this priority order:

1. **Primary data source - Customer attribute**: The segmentation first checks the customer's `country` attribute (for EU segmentations) or `state` attribute (for US segmentations). If this attribute exists, the system assigns the customer to the corresponding time zone.
2. **Secondary data source - Behavioral data**: If the customer doesn't have a country or state attribute, the segmentation looks at `session_start` events to find the most common country (EU) or state (US) across the customer's sessions. The system then assigns the time zone based on this data.

**Time zone precedence for multi-time zone regions**: When a state or country spans multiple time zones, the segmentation assigns customers to the earliest time zone. For example, if a customer's location could be either EST or CST, they're placed in EST.

## How to deploy the use case

### Meet the requirements

Check if the data in your project [meets the requirements](how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

### Adjust time zone segmentations

You can customize the pre-built segmentations by editing existing segments or adding new time zones to match your specific customer distribution.

#### Edit an existing segment

1. Go to **Analysis > Segmentations**.
2. Select the segmentation you want to adjust (US, EU, or US+EU).
3. Click **Edit**.
4. Select the specific segment to view its current logic. You'll see:
   * **Customer attribute filter**: Contains either `country` or `state` with the full name or 2-letter code.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/8c1977caaf062e803b0c528676bfef0e551565080f2863bcf98189aabff0a63a-Timezone_-_state.png",
        "",
        ""
      ],
      "align": "center",
      "sizing": "80% ",
      "border": true
    }
  ]
}
[/block]

* **Aggregate filter**: Contains `most_common.session_start.country` or `most_common.session_start.state` with the full name.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/f4f401ba68cf338d00e43c37988bd03476c68dcdb7d0379a2919d0196eead597-Timezone_-_session_start.png",
        "",
        ""
      ],
      "align": "center",
      "sizing": "80% ",
      "border": true
    }
  ]
}
[/block]

5. Make your adjustments to the filters as needed.

> ❗️ Important
>
> If you're editing logic for a specific time zone (such as EST), remember to edit all segments for that time zone. Each time zone has multiple segments that work together.

6. Click **Save segmentation**.

#### Add a new time zone segment

1. Navigate to **Analysis > Segmentations**.
2. Select the segmentation you want to expand.
3. Click **Edit**.
4. Click the **+** icon to add a segment.
5. Name the segment using the time zone abbreviation (for example, "JST" for Japan Standard Time).
6. Add the logic for this segment:
   * Include customer attribute filters for countries or states in this time zone.
   * Include aggregate filters for behavioral data fallback.
7. Position the segment correctly in the order. Segments are arranged from latest to earliest time zones (for example, PST before EST).
8. Click **Save segmentation**.

#### Add additional cascading steps

If you want to extend the cascading logic beyond the default two steps (customer attribute and behavioral data), you can add a third or more fallback data sources:

1. Go to **Analysis > Segmentations**.
2. Select the segmentation you want to extend.
3. Click **Edit**.
4. Click the **+** icon to add a segment.
5. Name the segment with the exact same time zone abbreviation as existing segments (for example, "EST" if you're adding to existing EST segments).
6. Add your additional fallback logic.
7. Position the segment in the correct order within the cascading sequence.
8. Click **Save segmentation**.

### Segmentation rules

Keep these rules in mind when customizing time zone segmentations:

* **Segment order matters**: The segmentation evaluates segments in order from top to bottom. The first matching criteria assigns the customer to that time zone. Ensure that your customer attribute filters appear before aggregate filters for the same time zone.
* **Naming consistency is required**: All segments for the same time zone must have identical names. For example, all segments for EST must be named exactly "EST" for the cascading logic to work correctly.

## Other resources

* [Time zones](time-zones)
* [Silent hours](silent-hours)