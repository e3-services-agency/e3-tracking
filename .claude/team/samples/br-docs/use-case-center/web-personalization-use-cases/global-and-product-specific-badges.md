---
updatedAt: 2026-08-04T10:32:09.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Global and product-specific badges

<HTMLBlock>{`
<div class="feature-integrations-wrapper">
  <div class="card-with-icon-wrapper">
     <a class="card-with-icon-item card-with-icon-item-1">
      <div class="icons-wrapper">
      	<img src="https://files.readme.io/a8d39c9-Group_6991.svg"/>
      	<img src="https://files.readme.io/1482713-1._Clock_Icon.svg" class="icon"/>
      </div>
      <p>Use Case maturity: 
        <p>Champion</p>
    </a>
  </div>
  
  <div class="card-with-icon-wrapper">
     <a class="card-with-icon-item card-with-icon-item-1">
      <div class="icons-wrapper">
      	<img src="https://files.readme.io/3762a90-Group_7035.svg"/>
      	<img src="https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg" class="icon"/>
      </div>
      <p>What to expect: 
        <p>Increase in conversion rates</p>
    </a>
  </div>
  
  <div class="card-with-icon-wrapper">
     <a class="card-with-icon-item card-with-icon-item-1">
      <div class="icons-wrapper">
      	<img src="https://files.readme.io/9fae711-Group_7036.svg"/>
      	<img src="https://files.readme.io/a8fee62-3._Results.svg" class="icon"/>
      </div>
      <p>Use Case goal: 
        <p>Performance</p>
     
    </a>
  </div>
</div>

<style>
  
</style>
`}</HTMLBlock>

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

Display badges on product detail pages to communicate company policies and product-specific offers to your customers. These badges serve as a mid-funnel marketing tactic that drives conversion by highlighting key product attributes like "eco-friendly," "sale," or "new-in." You can display multiple badges simultaneously, control their priority order, and customize their appearance to match your brand.

<Callout icon="📘" theme="info">
  ### Note

  This use case supports product detail pages (PDP) only. Product listing/category pages (PLP) aren't supported.
</Callout>

<Image src="https://files.readme.io/624e8ce3db1a46af29ff3639ccc2aaf2d74cfb579aa7da7766974e764f0c2f4d-Global_And_Product_Specific_Badges.jpg" align="center" border={true} />

### Key features

* **Communicate policies and offers effectively:** Display company-wide badges (free shipping, sale) or product-specific badges (eco-friendly, vegan, best-seller) to inform purchase decisions.
* **Flexible badge management:** Choose which badges to display, set their quantity, and define display order based on your marketing priorities.
* **Customizable appearance:** Adjust badge shapes, shadows, positioning, and styling to align with your brand identity.
* **A/B testing built-in:** Measure the impact of badges on conversion rates and revenue through integrated testing functionality.

## Use case items

With this use case, you'll get a:

* **Badge Product Page Container:** A weblayer container that manages badge display on product pages, controlling the number of badges shown, their order, animation, and position within product images.
* **Global badges:** Two pre-configured badges (Free Shipping, Sale) that display across all products when applicable company policies are active.
* **Product-specific badges:** Ten customizable badges (New-in, Black Friday, Recycled, Christmas, Best Seller, Eco-friendly, Last Chance, Last Minute, Vegan, Cruelty-free) that display on products marked in your catalog.
* **Evaluation dashboards:** Pre-built dashboards that track badge performance metrics including conversion rates, revenue uplift, and A/B test significance.

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

**For global badges:**

You need a regularly updated product catalog where:

* Items are identified by product ID that matches the product ID on your website (usually available in the `dataLayer`).
* The catalog includes the `item_id` attribute.

**For product-specific badges:**

You need a product catalog with:

* Items identified by product ID matching your website (usually available in the `dataLayer`).
* Boolean attributes for each badge you want to display. You can either:
  * Import new columns into your existing product catalog with boolean attributes for badges you'll use.
  * Create a separate product catalog specifically for badges.

Required boolean attributes (import only those you'll use):

* `new_in`
* `black_friday`
* `recycled`
* `sale`
* `christmas`
* `best_seller`
* `eco_friendly`
* `last_chance`
* `last_minute`
* `vegan`
* `cruelty_free`
* `fair_trade`
* `locally_sourced`
* `organically_produced`

Products marked as `true` for an attribute will display that badge. Products marked as `false` won't display the badge.

### Understand the use case logic

The badge system displays customizable badges on product detail pages to communicate offers and policies. When a customer visits a product page, the system checks which badges should appear based on badge type (global or product-specific) and displays them according to your configured priority order.

**How the system works:**

1. **Customer visits product page:** The Badge Product Page Container loads and identifies the product ID from your website's data layer.
2. **Badge eligibility check:**
   * **Global badges:** System checks if badges are active (started) in the platform.
   * **Product-specific badges:** System queries your product catalog to check which boolean attributes are set to `true` for that product.
3. **Display logic:** Eligible badges appear on the product image based on your configured order (priority), with badge 1 displaying at the top.
4. **A/B test assignment:** Visitors are randomly assigned to see badges (Variant A) or no badges (Control Group) based on your traffic distribution settings.
5. **Tracking:** The system tracks banner show/click events for evaluation purposes if tracking is enabled.

**Adjustable aspects:**

* Badge quantity and priority order for display
* Badge appearance (shape, shadow, image, positioning)
* Product ID source from your website
* CSS selector for badge placement on product images
* Traffic distribution for A/B testing (default: 50/50)
* Tracking settings for individual badges

### Adjust the use case

Now that you understand the use case logic, you can set up the use case according to your needs.

#### Product page container setup

The Badge Product Page Container manages all badge display on product pages. Configure this container before setting up individual badges.

**Product ID configuration**

Find the product ID from your website's data layer. This typically exists in a `productDetail` object used for Google Analytics.

To verify your data layer structure:

1. Open a product detail page.
2. Right-click and select **Inspect**.
3. Open the **Console** tab.
4. Type `dataLayer` and press Enter.
5. Check if the structure matches this pattern:

```javascript
dataLayer.find(item => item.event === 'productDetail').ecommerce.detail.products[0].id
```

In the Badge Product Page Container weblayer:

1. Open the **Settings** tab.
2. Locate the **Product Id JavaScript Expression** parameter.
3. Paste your product ID code.

<Image src="https://files.readme.io/2304569f72600484962ccb7f72e2d045ffd868e149beeabf5c141521d8d74c9f-Product_Id_JavaScript_Expression_Global_Product_Specific_Badges.pdf_2025-12-09_11-27-48.png" alt="Badge Product Page Container weblayer editor showing the Product Id JavaScript Expression parameter field with example code. Highlight the parameter field where users paste their code." align="center" border={true} />

If your product detail object has a different name (for example, `productDetailImpression`) or structure, adjust the code accordingly.

**CSS selector for image placement**

Find the CSS selector for the element that contains your product image:

1. Open a product detail page.
2. Right-click and select **Inspect**.
3. Open **Elements**.
4. Click the "Select an element in the page to inspect it" button.

<Image src="https://files.readme.io/b866ee2a6efbd1c03188148b0533ce970e677f4bf41d8b699826b139cffbfcaf-Social_proof_banner_-_Product_image_container_configuration.png" alt="Browser developer tools with the &quot;Select an element&quot; button highlighted in the Elements inspector toolbar." align="center" border={true} />

5. Click on the product image.
6. Select the `<div>` element directly above the highlighted `<img>` element in the code.

<Image src="https://files.readme.io/4436fa934af7ef661177e39a298d132203cd5d8acad0a466e041756468fcba4d-selectors_WGLB_Global_Product_Specific_Badges.pdf_2025-12-09_11-48-00.png" alt="Browser developer tools with the product image element highlighted, and the parent div element selection process. Show the code structure with arrows indicating which element to select." align="center" border={true} />

7. Right-click the `<div>` element and select **Copy > Copy selector**.

<Image src="https://files.readme.io/123c5c92712f0ac019aeb97fd5480a1ff39e7203d56208b4e74c851960764cce-copy_selector_WGLB_Global_Product_Specific_Badges.pdf_2025-12-09_11-52-01.png" align="center" width="80% " border={true} />

Example selector:

```
#lightgallery > div.product-gallery-slider.owl-carousel.owl-theme.owl-loaded.owl-drag > div.owl-stage-outer > div > div.owl-item.active > div
```

In the Badge Product Page Container weblayer:

1. Locate the **Target Element Selector CSS** parameter.
2. Paste the CSS selector you copied.

<Image src="https://files.readme.io/64d215f275957e7ad42ec50daf0c3e8d1141945e9a657604f9d9e4667d125a81-image.png" alt="Badge Product Page Container weblayer editor showing the Target Element Selector CSS parameter field with example CSS selector value." align="center" border={true} />

**Background worker ID setup**

Ensure the background worker ID is correctly configured in the container's JavaScript code:

1. Open the **Badge Product Page Container** weblayer.
2. Click **<>** to access the code editor.
3. Open the **JS** tab.
4. Find `WEBLAYER_CONDITIONAL_VIEW`.
5. Verify the value matches the ID from the Aggregated background worker URL.

To find the background worker ID:

1. Open the **Aggregated background worker (don't touch, don't start)** weblayer.
2. Copy the ID from the URL (the part matching `banners/[ID]?action=design`).

<Image src="https://files.readme.io/135be02d758967e93bba9ea47159d54dde9e3b0d01fca7888486025d385b72e9-image.png" alt="Aggregated background worker URL in the browser address bar with the banner ID portion highlighted" align="center" border={true} />

3. Replace the value in the container code if different.

**Launch the container**

After configuration, click **Start** in the top right corner of the Badge Product Page Container to activate the badge display system.

#### Product catalog configuration

**For product-specific badges only.** Global badges don't require catalog configuration.

Set up your product catalog to control which badges appear on which products:

**Catalog structure**

Your catalog should include:

* `item_id` (primary key matching product IDs on your website)
* Boolean columns for each badge type you want to use

Example CSV structure:

```
item_id,new_in,sale,eco_friendly,best_seller
123,true,false,true,false
456,false,true,false,true
```

**Import process**

1. Navigate to **Data & Assets > Catalogs**.
2. Select your product catalog or create a new one.
3. Import your CSV file with boolean badge attributes.
4. Verify the import completed successfully.

The system will display badges on products where the corresponding attribute is set to `true`.

#### Badge configuration

Configure each badge you want to display. This applies to both global badges (Free Shipping, Sale) and product-specific badges (New-in, Eco-friendly, etc.).

**For product-specific badges only:**

1. Open the badge weblayer (for example, Product Badge \[specific] Eco-friendly product).
2. Set the **Catalog Name** parameter to your product catalog name.
3. Set the **Catalog Attribute** parameter to the corresponding column name (for example, `eco_friendly`).

<Image src="https://files.readme.io/0853ed5901c5762301d481529ecc618e3b5d8adc558a86e2b09ac736bb060b39-image.png" alt="product-specific badge weblayer editor showing the Catalog Name and Catalog Attribute parameter fields filled in with example values." align="center" border={true} />

**For all badges (global and product-specific):**

Configure these parameters:

* **Badge Image URL:** Enter the URL for your badge image. Change this to use custom badge designs.
* **Badge Title:** Set the tracking value that appears in banner events under the `badge title` attribute. Used for analytics purposes only.
* **Display on detail page:** Check this option to enable badge display on product pages.&#x20;
* **Shape:** Select the badge shape (circle, square, etc.).
* **Drop Shadow:** Check to add a shadow effect to the badge.
* **Track banner event for evaluation:** Enable tracking to monitor individual badge performance. Recommended during initial evaluation only, as this consumes MPEs during ongoing use.
* **Order:** Set the display priority (1 = top position). Badges display vertically in order, with number 1 appearing at the top.

<Image src="https://files.readme.io/c4124c43fbb6867abdc022751062ca52b81f2a027d9e3cd901e0c1baf153c3b3-image.png" alt="Badge weblayer editor showing all configuration parameters (Badge Image URL, Badge Title, Display options, Shape, Drop Shadow, Order)." align="center" border={true} />

**Launch individual badges**

After configuration, click **Start** on each badge weblayer you want to display.

#### A/B test setup

Set up [A/B testing](https://documentation.bloomreach.com/engagement/docs/ab-tests) at the Badge Product Page Container level to measure whether displaying badges improves conversion and revenue.

**Test configuration:**

* **Variant A:** Customers see configured badges on product pages.
* **Control Group:** Customers see no badges.
* **Recommended split:** 50/50 for faster significance, or 80/20 once positive results are confirmed.

**To configure the test:**

1. Open the **Badge Product Page Container** weblayer.
2. Go to the **A/B test** tab.
3. Adjust the traffic distribution between Variant A and Control Group.
4. Save your changes.

The test tracks whether badge visibility impacts customer purchase behavior and revenue generation.

**When to adjust distribution:**

* **Initial testing:** Use 50/50 split to reach statistical significance faster.
* **After proving value:** Switch to 90/10 or remove Control Group entirely to maximize badge exposure while maintaining ongoing validation.
* **Regular check-ups:** Periodically re-enable A/B testing (every 3 months) to verify continued positive performance.

### Test and run the use case

Test the use case before deploying it. Testing ensures you don't send unfinished or imperfect campaigns to your customer base.

**Testing approach 1: Restricted page**

1. Open each badge weblayer's **Settings** tab.
2. Set **Show on** to match a testing page URL not accessible to the public (for example, `https://www.yoursite.com/en#test`).
3. Click **Start** on the badge weblayers and Badge Product Page Container.
4. Navigate to the test page URL to verify display.
5. Click **Stop** when testing completes.

**Testing approach 2: Audience filtering**

1. Open each badge weblayer's **Settings** tab.
2. Under **Audience**, select **Customers who...**.
3. Filter by tester identifiers (for example, `hard_id` of you and your colleagues).
4. Click **Start** on the badge weblayers and Badge Product Page Container.
5. Visit product pages as a filtered user to verify display.
6. Click **Stop** when testing completes.

**Testing checklist:**

* Verify badges display in correct priority order.
* Test on multiple browsers and devices.
* Confirm A/B test assignment works (check if you're in Variant A or Control Group).
* Validate tracking events fire correctly for both groups.
* Check badge positioning and appearance on different product images.

**Launch the use case:**

1. Remove testing restrictions from badge weblayers.
2. Configure final settings in each badge's **Settings** tab.
3. Click **Start** on all badge weblayers you want to display.
4. Verify the **Badge Product Page Container** is running.

### Evaluate the results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt evaluation dashboard to measure and analyze relevant data:

1. Open the **\[WGLB] Product Badges - Use Case Evaluation** dashboard.
2. Verify the `[WBSB] weblayer target` event segmentation uses the correct `banner_id` for the Badge Product Page Container.
3. Check the `[WBSB] purchase_banner target` segmentation:
   * Attribution window is set correctly (default: 24 hours).
   * Purchase status filter matches your project's successful purchase definition.
4. Review these key metrics regularly:
   * **Revenue Uplift:** Extra revenue generated by Variant A compared to Control Group.
   * **Unique Conversion Rate Uplift:** Percentage difference in conversion between groups.
   * **Statistical significance:** Must reach 98%+ before making decisions.
5. Check the **\[WGLB] Product Badges - Use Case Evaluation - Specific Single badge** dashboard to evaluate individual badge performance.

For individual badge evaluation:

1. Open the **\[WGLB] Product Badges - Use Case Evaluation - Specific Single badge** dashboard.
2. Update the `[Banner] Weblayer target - Specific single badge event` segmentation to match the `banner_id` of the badge you want to evaluate.
3. Monitor badge-specific conversion and revenue metrics.

**Important metrics to monitor:**

* **Impressions:** Count of badge displays.
* **Visitors:** Unique customers who saw badges.
* **Revenue:** Total purchase value within attribution window.
* **Conversion Rate:** Percentage of impressions converted to purchases.
* **Unique Conversion Rate:** Percentage of visitors who made purchases.
* **Average Order Value:** Revenue per purchase.
* **Revenue Per Visitor:** Average revenue per customer who saw badges.

Check results regularly to identify optimization opportunities as soon as possible.

## Other resources

Learn how to enhance and optimize badge performance with different tips and tricks from Bloomreach experts.

**Create custom badges:**

You can create your own custom badges beyond the pre-configured options. Design badge images that communicate your unique company policies or seasonal campaigns, then add them as new weblayers following the same configuration pattern as existing badges.

**Related documentation:**

* [How to meet the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements)
* [A/B testing dos and don'ts](https://documentation.bloomreach.com/engagement/docs/ab-tests#prepare-for-an-ab-test)
* [Use case evaluation](https://documentation.bloomreach.com/engagement/docs/use-case-evaluation)
* [Weblayers documentation](https://documentation.bloomreach.com/engagement/docs/weblayers)