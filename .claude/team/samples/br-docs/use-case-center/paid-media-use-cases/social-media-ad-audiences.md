---
updatedAt: 2026-07-29T08:00:39.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Social media ad audiences

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Basic</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Increase in Revenue</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Performance</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

[Social media ad audiences](https://www.bloomreach.com/en/products/engagement/plug-and-play/social-media-ad-audiences) helps you retarget your paid ads more effectively by leveraging Bloomreach's audience segmentation. This use case can enhance your ad reach by focusing on specific customer segments, driving overall marketing efficiency, and improving your e-commerce business performance.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/f9a3b99-LTAU_Social-Media-And-Audiences.gif",
        null,
        ""
      ],
      "align": "center"
    }
  ]
}
[/block]

## Use case items

With this use case, you’ll get:

* Ad audiences scenario - add to the audience
* Ad audiences scenario - remove from the audience

[block:embed]
{
  "html": "<iframe class=\"embedly-embed\" src=\"//cdn.embedly.com/widgets/media.html?src=https%3A%2F%2Fwww.youtube.com%2Fembed%2FWPPb-fZVH-E%3Ffeature%3Doembed&display_name=YouTube&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DWPPb-fZVH-E&image=https%3A%2F%2Fi.ytimg.com%2Fvi%2FWPPb-fZVH-E%2Fhqdefault.jpg&key=7788cb384c9f4d5dbbdbeffd9fe4b92f&type=text%2Fhtml&schema=youtube\" width=\"854\" height=\"480\" scrolling=\"no\" title=\"YouTube embed\" frameborder=\"0\" allow=\"autoplay; fullscreen; encrypted-media; picture-in-picture;\" allowfullscreen=\"true\"></iframe>",
  "url": "https://www.youtube.com/watch?v=WPPb-fZVH-E",
  "title": "Ad Audience Best Practices",
  "favicon": "https://www.google.com/favicon.ico",
  "image": "https://i.ytimg.com/vi/WPPb-fZVH-E/hqdefault.jpg",
  "provider": "youtube.com",
  "href": "https://www.youtube.com/watch?v=WPPb-fZVH-E",
  "typeOfEmbed": "youtube"
}
[/block]

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

### Understand the use case logic

This use case consists of two scenarios and leverages customer segmentation to create audience groups for your paid account. Build unique customer segments to target ads effectively.

#### Scenario 1 - ADS add/remove retargeting based on segmentation

To set up the social media ad audiences scenario, follow these steps:

##### 1. Define your audience segments

Create unique customer segments based on their purchase history. For example, segment customers into groups like:

* Loyal (5+ purchases)
* Potential loyal (3+ purchases)
* Lost (0 purchases)

##### 2. Daily trigger

Schedule the scenario to run daily. This ensures your ad audiences are updated regularly, adding new customers and removing those who no longer fit the segment.

##### 3. Check consent

Verify if a customer has given Paid Media consent. This step ensures you comply with GDPR rules.

##### 4. Validate identifiers

Confirm the customer has a valid email or phone number as an identifier.

##### 5. Segment check

Determine if the customer belongs to any segments you want to push. Also, check if the customer went through this scenario in the last 90 days. This includes customers who are no longer in the segments but still in your ad audiences, so they need removal.

For example, if a customer is in the Loyal \*\*segment, add them to the corresponding audience. Remove them from the audience if they are no longer part of the segment.

##### 6. Adjust segmentation and naming

Customize the segmentation and audience names to fit your needs. Proper naming helps manage and track the effectiveness of your campaigns.

##### 7. Add webhooks

Implement webhooks to automate adding and removing customers from ad audiences.

#### Scenario 2 - ADS Remove customers from audiences \[servicing scenario]

Follow these steps to remove customers from all audiences:

##### 1. Trigger the scenario

Start when a customer rejects Paid Media consent.

##### 2. Wait

Pause for 2 minutes to account for any unintended rejections.

##### 3. Check re-subscription

Verify if the customer has re-subscribed during the wait time.

##### 4. Verify identifiers

Ensure the customer has a valid email or phone number for removal.

##### 5. Confirm audience addition

Attempt to remove the customer only if they were previously added to any audience.

##### 6. Add webhooks

Ensure you add ad audiences webhooks.

### Test and run the use case

Test a use case before deploying it. Testing ensures you don't send unfinished or imperfect campaigns to your customer base.