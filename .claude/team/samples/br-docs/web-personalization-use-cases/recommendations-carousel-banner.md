---
updatedAt: 2026-08-17T03:00:40.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Recommendations carousel banner

<HTMLBlock>{`
<div class="feature-integrations-wrapper">
  <div class="card-with-icon-wrapper">
     <a class="card-with-icon-item card-with-icon-item-1">
      <div class="icons-wrapper">
      	<img src="https://files.readme.io/a8d39c9-Group_6991.svg"/>
      	<img src="https://files.readme.io/1482713-1._Clock_Icon.svg" class="icon"/>
      </div>
      <p>Use Case maturity: 
        <p>Basic</p>
    </a>
  </div>
  
  <div class="card-with-icon-wrapper">
     <a class="card-with-icon-item card-with-icon-item-1">
      <div class="icons-wrapper">
      	<img src="https://files.readme.io/3762a90-Group_7035.svg"/>
      	<img src="https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg" class="icon"/>
      </div>
      <p>What to expect: 
        <p>Increase in RPV</p>
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

Drive conversions and improve your RPV with an on-site banner featuring personalized recommendations. Recommendations Carousel Banner displays a sequence of personalized product suggestions in a carousel format. It highlights products left in the customer's cart over the last 7 days or suggests similar items using the "Customers who bought this also bought" engine based on the customer's last viewed product. These banners are fully customizable, enabling you to optimize for conversions and increase revenue per visitor (RPV).

### Key features

* Personalized recommendations: Offers tailored product recommendations based on customer activity.
* Carousel display: Shows products in a looping format to keep users engaged.
* Flexible settings: Customize how many products are shown for both mobile and desktop.
* Targeted audience: Displays to customers with items in their cart from the last 7 days who haven’t bought anything in that time.

<Image src="https://files.readme.io/e45378cc4a3a664970c930d9cd1fbf0ca2a8431a7e257919da41829d62994d19-BR_Use_Case_Image__Recommendations_Carousel_Banner2x.jpg" alt="Recommendation carousel banner" align="center" border={true} />

## Use case items

With this use case, you’ll get an:

* Recommendations carousel banner: Displays an endless loop of personalized product recommendations, customizable for both mobile and desktop settings.

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

### Understand the use case logic

This system targets users who have items added to their cart in the last 7 days but haven't completed a purchase. Initially, the banner displays these cart items. If the cart items are insufficient, it switches to using the "Customers who bought this also bought" engine for recommendations, based on the last product viewed. Key adjustable aspects include:

* Product tracking: Track displayed product IDs with 'main\_product\_ids' for the aggregate view and 'reco\_product\_ids' for recommendations. Upon clicking a product, the clicked ID is recorded under 'product\_id', allowing you to prepare detailed reports on product interactions. The image below shows you the event tracking taken from a customer's profile:

<Image src="https://files.readme.io/ddb906eb18ba1b4c89e35e25d8aa90bc37f1aa96b4de5ef3447e743abeac7860-Recommendations_carrousel_banner_reco_id.png" align="center" width="60% " border={true} />

* Customization options: Adjust product display settings for frames and total items, and configure settings separately for mobile and desktop.

### Adjust the use case

Now that you understand the use case logic, you can set up the use case according to your needs.

#### Banner settings

Access the banner and go to the **Settings** tab to adjust the [banner settings](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-banner-design-and-settings-in-the-use-case-center#settings).

We recommend to adjust the Recommendation carousel banner separately for mobile and desktop.

#### Design and copy

Customize the [banner visuals and copy](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-banner-design-and-settings-in-the-use-case-center) to reflect your company's brand identity.

Open the banner use case and find the panel with adjustable parameters. For guidance, hover over the information icons next to each parameter.

#### A/B test

[A/B test](https://documentation.bloomreach.com/engagement/docs/ab-tests) the use case to better understand the banner performance and revenue generated.

This use case's A/B test traffic distribution is set to variant A at 80 % and the control group at 20 %. This means 80% of customers will see the banner (variant A), while 20% (the control group) will not. We recommend keeping this distribution as it brings quick and statistically significant results.

Learn more about the dos and don'ts of [modifying A/B test](https://documentation.bloomreach.com/engagement/docs/ab-tests#prepare-for-an-ab-test).

### Test and run the use case

Test a use case before deploying it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-banner-in-the-use-case-center) ensures you don't send unfinished or imperfect campaigns to your customer base.

Once the testing is over, run the use case. Open the banner and click **Start** to launch the campaign.

## Other resources

Learn how to [enhance and optimize the banner](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.

<Image src="https://files.readme.io/1fabcfd09dbd9346bbaa8549a9531df10ae8aa009fe9ae87401655137f23eb80-image.png" align="center" width="1px" />