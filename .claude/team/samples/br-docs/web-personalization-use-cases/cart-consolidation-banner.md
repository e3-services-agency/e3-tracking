---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Cart consolidation banner

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Advanced</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Decrease in return rates</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Performance</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

Reduce return rates and help shoppers find the right size with a real-time checkout banner that appears when customers add multiple sizes of the same product to their cart. This use case displays a dynamic banner that highlights duplicate items, leads shoppers to your sizing guide, and prevents accidental multi-size orders. By guiding customers to the right size before purchase, you can decrease return rates and improve customer satisfaction.

### Key features

* **Real-time cart detection**: Automatically identifies when customers add multiple sizes of the same product.
* **Checkout-optimized display**: Appears at the critical moment when customers review their purchase.
* **Sizing guide integration**: Directs customers to your existing sizing resources.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/24880db9dcbf7f0866a137705ca10da84cdf2a28647242670c5917ad0bd898d4-Cart_Consolidation_Banner.jpg",
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

* **Cart consolidation banner**:  weblayer that appears on the checkout page when customers have multiple sizes of the same product in their cart.

* **Evaluation dashboard**: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

## Understand the use case logic

The Cart consolidation banner uses a tag-based trigger system to detect and respond to customer behavior in real time:

1. The checkout tag monitors your checkout page for the checkout event.
2. When a customer reaches checkout, the tag evaluates products in their cart.
3. If the tag detects multiple sizes of the same product (matching product IDs), it triggers the banner.
4. The banner displays with your customized messaging and sizing guide link.
5. Customers can click through to your sizing guide to confirm their size before completing purchase.

### Checkout tag setup

The checkout tag detects when customers add multiple sizes of the same product and triggers the banner display.

1. Open your checkout page in a web browser.
2. Right-click anywhere on the page and select **Inspect**.
3. Navigate to the **Console** tab.
4. Type `dataLayer` and press **Enter** to view your site's data structure.
5. Locate the checkout event and product ID fields in the `dataLayer` output.
6. Copy the dynamic values you identified.
7. In Bloomreach, open the **Checkout tag**.
8. Paste your `checkout event` (rows 1-2) and `product ID` (rows 8-9) values into the event section:
9. Make sure the tag references the `banner ID` of the **Cart consolidation banner** (row 29). This connects the trigger logic to the banner display.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/be54335469d802ec6befca74bfa1bb1b6f5c4ed621066eae2e7a6c8739e31815-Monosnap_Checkout_Tag__Plug_and_Play_PROD__Bloomreach_2025-12-04_14-14-14.png",
        "",
        ""
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

10. To configure display page, go to the **Settings** tab in Checkout tag and select **Page containing URL** in the **Fire on** field.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/3cdefc8c3b16a224366dfe305dfff1a00c1c2223027becdbbb54de55a5784910-Checkout_Tag_settings.png",
        "",
        "Display page settings showing Fire on field with checkout URL pattern"
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

11. Enter the URL pattern for your checkout page (for example, `yoursite.com/checkout` or `yoursite.com/cart/review`). This ensures the tag only fires on your checkout page.

> 📘 Note
>
> The banner settings aren't relevant for this use case since the banner runs on the tag. Set all audience and display settings on the checkout tag instead. The banner itself should remain configured but not started independently.

### Customize design and messaging

Customize the [banner visuals and copy](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-banner-design-and-settings-in-the-use-case-center) to reflect your brand identity and messaging style.

1. Open the **Cart consolidation banner** in the Use Case Center.
2. Navigate to the **Design - Editor** tab.
3. Update the banner text to match your brand voice.
4. Add the URL link to your sizing guide page.
5. Adjust colors, fonts, and layout to align with your brand guidelines.

### Test the banner

Test the use case before launching it to your full customer base. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-banner-in-the-use-case-center) helps you catch issues and verify the banner displays correctly.

**Set up your test:**

1. Launch the **Checkout tag** in Tag Manager (don't start the banner separately, as it's triggered by the tag).
2. In Tag Manager Settings, go to **Audience** and select **Customers who...**.
3. Filter to include only test users (for example, by filtering by cookie or email domain).
4. In the **Fire on** field, confirm the page matches your checkout URL.

**Run your test:**

1. Add multiple sizes of the same product to your cart.
2. Go to your checkout page.
3. Verify the banner displays correctly with your customized messaging.
4. Click the sizing guide link to confirm it leads to the correct page.
5. Test on different devices and browsers to ensure consistent display.

**Troubleshooting tips:**

* If the banner doesn't appear, verify the product identifiers match your `dataLayer` structure.
* If the banner appears on the wrong pages, double-check your URL pattern in the **Fire on** field.
* If styling looks incorrect, review your design customizations in the **Editor** tab.

### Launch the banner

Once you're satisfied with testing results, launch the banner to your customers.

1. Open the **Cart Consolidation Banner** settings.
2. Configure your desired settings in the **Settings** tab.
3. Click **Save** (don't click Start on the banner itself, since it's triggered via the Checkout tag).
4. Open the **Checkout tag**.
5. Remove any test audience filters from the Audience settings.
6. Verify all settings are configured correctly.
7. Click **Start** to launch the tag.

The banner will now display automatically whenever customers add multiple sizes of the same product to their cart.

## Other resources

Learn how to [enhance and optimize the banner](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/1fabcfd09dbd9346bbaa8549a9531df10ae8aa009fe9ae87401655137f23eb80-image.png",
        "",
        ""
      ],
      "align": "center",
      "sizing": "1px"
    }
  ]
}
[/block]