---
updatedAt: 2026-07-16T10:04:41.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# How to customize the email node in the Use Case Center

Please refer to this documentation for editing an email scenario with products in the email node. Our use cases provide a template for the email node, making edits easier.

The email node with products consists of an HTML Block and Custom rows.

The HTML Block varies depending on the use case, with Recommendation Result and Catalog Result blocks fetching specific products for display.

Custom rows contain editable product details like images, titles, and prices.

## HTML Block

Products for the HTML block are sourced from the [product catalog](https://documentation.bloomreach.com/engagement/docs/catalogs) within your project. Make sure your product catalog is correctly mapped in the [Data Mapping.](https://documentation.bloomreach.com/engagement/docs/data-manager#mapping)

The recommendation block displays products according to a particular type of [recommendation](https://documentation.bloomreach.com/engagement/docs/recommendations) engine within the email node. Each use case is built with a predefined recommendation block tailored to the use case's needs.

A Catalog block displays products based on the pre-defined logic of the scenario (events or aggregates).

<Callout icon="❗️" theme="error">
  ### Warning

  If you decide to adjust the HTML block, advanced HTML skills are required.
</Callout>

## Custom Rows

Custom rows allow you to edit content related to products directly in the [visual editor](https://documentation.bloomreach.com/engagement/docs/email-editors) of the email node.

<Callout icon="💡" theme="default">
  ### Tip

  If you’re hesitant about making direct changes within the email node, consider duplicating the email scenario to test the modifications first.
</Callout>

<Image src="https://files.readme.io/c112805-rows_dispay.png" align="center" width="50% " />

<Callout icon="❗️" theme="error">
  ### Warning

  Avoid deleting custom rows to prevent potential disruption of the logic and ensure proper functionality of the Jinja.
</Callout>

Custom rows are divided into **logic** and **visual** rows.

### Logic Rows

This logic row defines how many rows of products will be shown in the email. Only the number (in this case, number 2) is editable.

<Image src="https://files.readme.io/a4bb224-editable_number.png" align="center" />

For example, if the pre-defined template consists of two rows with two products in each row and you wish to increase the number of products - insert the number 3 in the equation instead, and there will be three rows of two products in the email.

Click on the number and rewrite it according to your preference.

The second logic row is the ending row at the end of the email. Do not edit the ending row.

<Image src="https://files.readme.io/34f8e65-endfor.png" align="center" width="10% " />

The ending row must always be in the email due to code logic. If you delete the ending row, the email will not be saved, or no content will be displayed.

<Callout icon="❗️" theme="error">
  ### Warning

  We highly recommend keeping all the rest in the logic rows untouched to maintain its functionality, unless you are a Jinja master.
</Callout>

### Visual rows

There are five editable visual rows in every email node:

1. Product's Image
2. Title of the product
3. ~~Original price~~ - displayed only if the product is on discount (meaning it's original price is higher than the current price))
4. Price - the current price of the product from the product catalog
5. CTA Button

<Image src="https://files.readme.io/07f129f-visual_rows_desc.png" align="center" width="75% " />

To make any visual changes to these rows, click on the row you want to edit and make changes in the visual options menu on the right side.

<Image src="https://files.readme.io/b803373-visual_rows.png" align="center" />

You cannot change content, only the visuals of the pre-defined template. For example, change the image's width, font, color, and size of the text; the same goes for the CTA button.

If you change the currency from the default €, copy-paste the new currency, replacing the €. Remember to replace the currency in the original and current price as well.

You can also change the order of the visual rows using the drag & drop function on the left side.

<Image src="https://files.readme.io/5b4f8bc-drag_and_drop.png" align="center" />

When you are done with adjustments, remember to "Save" the use case and [test](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-email-in-the-use-case-center) it before you hit the "Start" button.