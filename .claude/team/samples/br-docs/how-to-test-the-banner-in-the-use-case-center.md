

---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# How to test the banner in the Use Case Center

This guide will walk you through how to test the banner in the Use Case Center.

<Callout icon="💡" theme="default">
  ### Tip

  Bloomreach experts recommend that you always test the banner before deployment.
</Callout>

Testing the banner before hitting the yellow "Start" button allows you to double-check for errors and make final adjustments in the copy and design before customers see it.

Test the banner in the following way:

1. Make a copy of the banner
   1. Hit the three dots in the upper right corner next to the yellow "Start" button
   2. Click on Save as new
   3. Save the banner copy
2. Now that you are in the banner copy, go to banner settings and delete all Customer Filters in the Audience section

<Image src="https://files.readme.io/4ce30a4-Screenshot_2024-02-28_at_23.39.10.png" align="center" />

3. After deleting all the filters, insert a new one with your cookie. This step ensures that the banner appears only on your website linked to the specific cookie
   1. Click on + Add filter condition
   2. Choose Customer and click on a cookie from the list of IDS
   3. Insert your cookie -> learn how to get your cookie in [this](https://documentation.bloomreach.com/engagement/docs/exponea-console) article
4. Hit the "Start" button
5. Go to your website to see the banner in action

<Callout icon="❗️" theme="error">
  ### Warning

  Some banners are related to products and are displayed only on specific pages of your website. Find this detail in use case documentation.
</Callout>

Suppose you adjust the pre-defined Audience settings by adding more customer filters. We recommend testing the banner use case with all the customer filters to ensure the banner will perform as expected.