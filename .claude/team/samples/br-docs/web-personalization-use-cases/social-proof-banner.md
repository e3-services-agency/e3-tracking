---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Social proof banner

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

This use case provides a [social proof banner](https://www.bloomreach.com/en/products/engagement/plug-and-play/standard-social-proof-banner) displaying "X customers are looking at this" on product detail pages using real-time Bloomreach CDP data. This solution has generated up to 36% increases in conversion rates by creating purchase urgency.

### Key features

* **Displays the number of customers viewing the product in real time:** Shows live data of how many customers viewed a product in the last 7 days
* **Increases urgency and importance of the item:** Creates psychological pressure to encourage faster purchase decisions
* **Helps recover potential lost sales by motivating users to purchase:** Converts hesitant shoppers through social proof validation
* **Promotes a personalized shopping experience:** Adapts to your product page layout and branding with customizable thresholds

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/0d85985e3c54754af34774b9cdbe4dcdf5a7279038b2ff827a211f1df839ec98-BR_Use_Case_Image__Social_Proof_Banner2x.png",
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

* Social Proof Banner: A banner appears on product detail pages showing how many other customers are currently viewing the product, driving urgency and increasing conversion rates.

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

### Understand the use case logic

The system displays a weblayer banner when customers visit product detail pages. The banner shows how many other customers viewed the same product during the last 7 days using real-time information.

**Step-by-step scenario setup:**

1. **Customer visits product page:** Triggers the social proof banner system
2. **View count check:** Queries the product view count report for that product ID
3. **Threshold validation:** Banner appears only if view count meets minimum threshold
4. **A/B test execution:** Randomly assigns visitors to see banner (Variant A - 80%) or not (Control Group - 20%)
5. **Banner display:** Shows overlay banner with "X customers are looking at this"
6. **Conversion tracking:** Tracks whether banner influences purchase behavior

Only products in the product view count report will display the banner.

### Adjust the use case

Now that you understand the use case logic, you can set up the use case according to your needs.

#### Banner settings

Access the banner **Settings** tab to adjust [banner settings](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-banner-design-and-settings-in-the-use-case-center#settings).

**Configuration notes:**

* **Design > Settings:** Not relevant since banner runs on the tag. Set audience settings on the tag instead.
* **Design > A/B test:** Update the default 80:20 split. Goal is to compare conversion rates between Variant A and Control Group.

#### Design and copy

Customize [banner visuals and copy](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-banner-design-and-settings-in-the-use-case-center) to reflect your brand identity. Open the banner use case and find the panel with adjustable parameters.

**View threshold:** Defines minimum `view_counts` required to display the banner. This threshold must be in the code of every variant, including control group, or A/B test evaluation will be corrupted.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/4e90f93344d2a0d26df81bbd3dfcf1157ac6cd334c634199a3fc9f6c087da90e-Social_proof_banner_-_threshold.png",
        "",
        ""
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

#### Product image container configuration

**Product Image Container Class Name:** Identify the class name of the element holding the product image. The weblayer will be added on top of your product image.

**To find the class name:**

1. Open your product detail page.
2. Right-click and select **Inspect**.
3. Open **Elements** and find the button for "Select an element in the page to inspect it".
4. Click the button, then click on the product image on your site.
5. This highlights the element in the code.
6. Select the element directly above the highlighted piece of code.
7. Identify the class of that element in the row above the highlighted code.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/b866ee2a6efbd1c03188148b0533ce970e677f4bf41d8b699826b139cffbfcaf-Social_proof_banner_-_Product_image_container_configuration.png",
        "",
        "![Product page inspection showing how to identify the product image container class name using browser developer tools"
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

**Example:** If you find `product-single__image-wrapper supports-js`, set this as your Class Name parameter.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/6e47c7720ea35dc3270ad683e0dc5fa0386aea1ca67845c6a64376e7e76c4dc6-Social_proof_banner_-_Product_image_container_configuration2.png",
        "",
        ""
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

**To adjust basic CSS styling:** Use parameters or click **<>** to access HTML/CSS/JS code directly.

#### Control group weblayer customization

**Design > Control Group**

When using A/B testing, you must change the `report_id` in the Control Group code:

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/b4e34047a73228fd796f9925c9701b9235a360c371e8b9d787b9857c50db3895-Social_proof_banner_-_report_id_change.png",
        "",
        "Control Group configuration interface showing code editor with highlighted values for viewThreshold and report_value_by_key parameters"
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

1. Change the report ID on line 3 to match the report ID used in **Product View Count Report ID** in the "Design > Editor > Visual (parameters) editor"
2. Adjust these highlighted values:

* **viewThreshold (line 2):** Set to the same value as Variant A
* **report\_value\_by\_key (line 3):** Set to the same ID as your 'Product View Count' report

#### Product view count report configuration

**Check the '\[WSSP] Product View Count' report:**

This report determines how many people are viewing each item by looking at the item ID and counting the number of views.

**Configuration steps:**

* **Timeframe adjustment:** By default, it's set to 7 days. You can adjust this to your needs (for example, last 60 minutes for views during the last hour)
* **Time frame setting:** Make sure you set it to 'relative' time frame
* The report serves as the data source for determining view counts that appear in your social proof banner

#### Social proof banner trigger setup

Go to the 'Social proof banner trigger' asset and adjust these parameters:

**Banner ID:** Enter the correct Banner ID for the weblayer "Social proof banner" in this initiative. Find the ID in the URL of the weblayer after opening it.

**Product ID From Product Page:** Add the code piece that identifies the product ID on your website's product page. You can get (or "parse") the product\_id either from the URL or as a JavaScript variable.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/63e597d3ecd7c2acf8d3e1ef4d2d93079a7604913d25e2bc90be87105d134f2a-Social_proof_banner_trigger.png",
        "",
        "![Social proof banner trigger configuration interface showing custom JavaScript code settings and parameters"
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

**Settings configuration:**

* **Fire on:** Make sure this only contains product page URLs (for example, Page URL containing `/products/`)
* **Audience filter:** Set up here, not in the banner, as these settings will be applied. However, we don't recommend any audience filter for this use case.

#### JavaScript code customization

**Design > Editor > Code > JavaScript**

You can adjust the minimum number of views required for the weblayer to display within the JavaScript section.

**Key code elements:**

```javascript
var viewThreshold = [[view_threshold]];
var count = parseInt("{{ report_value_by_key('[[product_view_report_id]]', params.product_id) or 0 }}");
if (count < viewThreshold) {
   return;
}

 
```

**Customization example**:\
To set the threshold to 10 views and work with report ID '5f4195d42608e0d51e531bae':

```javascript
var viewThreshold = 10;
var count = parseInt("{{ report_value_by_key('5f4195d42608e0d51e531bae', params.product_id) or 0 }}");
if (count < viewThreshold) {
    return;
}
 
```

Make sure to set the report ID to match your product view count report ID.

### Test and run the use case

Test a use case before deploying it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-banner-in-the-use-case-center) ensures you don't send unfinished or imperfect campaigns to your customer base.

**Testing steps:**

1. **Start the trigger:** Launch the trigger code in Tag Manager. Don't start the weblayer separately, as it's already invoked from the trigger code in the tag.

2. **Set up test conditions:** Go to Tag Manager Settings and in 'Audience' select 'Customers who...'. Filter only the testers (for example, by filtering by cookie).

3. **Test in real conditions:** Verify the weblayer displays correctly on product pages meeting your threshold requirements.

4. **Run the banner:** Once you're satisfied with testing results, configure the weblayer to match desired display settings in the Settings tab and click **Save**. Don't click **Start** on the banner itself, since it's triggered via 'Social proof banner trigger'.

5. **Launch:** Open the Trigger and if everything is set correctly, click **Start** to launch the weblayer.

## Other resources

Learn how to [enhance and optimize the banner](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.

**Additional documentation:**

* [View count banner ](https://documentation.bloomreach.com/engagement/docs/view-count-banner)- public documentation