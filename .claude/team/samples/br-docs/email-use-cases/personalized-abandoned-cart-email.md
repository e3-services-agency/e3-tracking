---
updatedAt: 2026-08-24T12:36:48.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Personalized abandoned cart email

<HTMLBlock>{`
<div class="feature-integrations-wrapper">
  <div class="card-with-icon-wrapper">
     <a class="card-with-icon-item card-with-icon-item-1">
      <div class="icons-wrapper">
      	<img src="https://files.readme.io/a8d39c9-Group_6991.svg"/>
      	<img src="https://files.readme.io/1482713-1._Clock_Icon.svg" class="icon"/>
      </div>
      <p>Use Case maturity:</p>
      <p>Basic</p>
    </a>
  </div>
  
  <div class="card-with-icon-wrapper">
     <a class="card-with-icon-item card-with-icon-item-1">
      <div class="icons-wrapper">
      	<img src="https://files.readme.io/3762a90-Group_7035.svg"/>
      	<img src="https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg" class="icon"/>
      </div>
      <p>What to expect:</p>
      <p>Increase in AOV</p>
    </a>
  </div>
  
  <div class="card-with-icon-wrapper">
     <a class="card-with-icon-item card-with-icon-item-1">
      <div class="icons-wrapper">
      	<img src="https://files.readme.io/9fae711-Group_7036.svg"/>
      	<img src="https://files.readme.io/a8fee62-3._Results.svg" class="icon"/>
      </div>
      <p>Use Case goal:</p>
      <p>Performance</p>
    </a>
  </div>
</div>
`}</HTMLBlock>

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

# What to Expect From This Use Case

The Personalized Abandoned Cart Email is designed to reduce lost online sales by automatically sending personalized emails to customers who have left items in their digital shopping cart. These reminders intend to refocus the customers' attention on their pending purchases and increase the likelihood of conversion. By reconnecting with customers this way, the use case directly impacts key business metrics, such as conversion rates and Revenue per Visitor (RPV), while boosting overall customer engagement.

<Callout icon="💡" theme="default">
  ### Tip

  Visit our [microsite](https://www.bloomreach.com/en/products/engagement/plug-and-play/personalized-abandoned-cart-email) to read more about this and other use cases developed by a team of Bloomreach experts.
</Callout>

<Image src="https://files.readme.io/c47744a-LACP-Personalized-Abandoned-Cart.gif" align="center" />

# Use Case Items

With this use case, you’ll get a:

* Ready-to-use personalized abandoned cart email
* Pre-defined evaluation dashboard
* Aggregate displaying products in the email

# How to deploy the Use Case

After downloading the use case, follow these steps:

## Step 1: Meet the Requirements

Verify if the data in your project meets the requirements. Follow this [step-by-step setup guide](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements) in case of problems.

## Step 2: Understand the Use Case Logic

After customers abandon their basket, an email with personalized items in the cart is sent to them.

Once the customer updates their shopping cart, we check if the customer has `emailing` consent to not break the GDPR rules. If that is true, the customer has to pass the following conditions to receive an email: the customer was not part of any Abandoned cart campaign in the last `7 days`, hasn't purchased anything in the last `7 days` and, simultaneously, didn't make a purchase `3 hours` since their latest cart update. The 'Abandoned Cart' email frequency is limited to one email per 7 days.

The email content displays up to `4 products` that are currently in the customer's cart based on `[LACP] Latest cart products aggregate`.

Follow the description and labels in the scenario in case of uncertainty.

<Callout icon="💡" theme="default">
  ### Tip

  The logic of this use case is built on best practices and only requires adjustments if you want to further customize the use case. Get instant value by launching this campaign in just a few clicks.

  However, we highly recommend you adjust the use case design and copy to fit your business needs.
</Callout>

## Step 3: Adjust the Use Case

Now that you understand the use case logic, you can set up the use case according to your preference.

### 3.1 Email Settings

If you decide to customize the email settings, follow [this detailed guide](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-email-design-and-settings-in-the-use-case-center#settings) to make the adjustments.

### 3.2 Design & Copy

Customize the email visuals and copy to align with your company's brand identity.

Otherwise, you can go [through this guide](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-email-design-and-settings-in-the-use-case-center) for more information.

To adjust the email template with products in the email node, follow [this](https://documentation.bloomreach.com/engagement/docs/customize-the-email-node-in-use-case-center) guide.

### 3.3 A/B test

[A/B test](https://documentation.bloomreach.com/engagement/docs/ab-tests) the use case to better understand the email performance and revenue generated.

This use case's A/B test traffic distribution is set to variant A at 50 % and the control group at 50 %. We recommend keeping this distribution as it brings quick and statistically significant results.

Learn more about the dos and don'ts when modifying your A/B tests in [this guide](https://documentation.bloomreach.com/engagement/docs/ab-tests#prepare-for-an-ab-test).

## Step 4: Test and Run the Use Case

When you are done adjusting the use case, we recommend to always [test the use case](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-email-in-the-use-case-center) before deployment. When testing, double-check if the use case design, copy, and settings work as preferred.

<Callout icon="❗️" theme="error">
  ### Warning

  You should only deploy a use case after testing. Testing prevents sending unfinished or imperfect campaigns to your customer base.
</Callout>

Run the use case once the testing is over. When you open the email, click the `Start` button in the upper right corner to launch the campaign.

<Callout icon="👍" theme="okay">
  ### Congratulations!

  If you got here, you have successfully deployed this use case.
</Callout>

## Step 5: Evaluate results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt and ready-to-use evaluation dashboard specifically included in this use case to measure and analyze relevant data.

To evaluate, open the evaluation dashboard, enter the email's name (e.g. Personalized Abandoned Cart Email), set the [attribution window for revenue in hours](https://documentation.bloomreach.com/engagement/docs/use-case-evaluation#benefitrevenue-calculations) (e.g. 24) and click the `Refresh` button in the upper right corner to see the results.

If you encounter any problems, read [this article](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) for insights on evaluating the use case.

<Callout icon="💡" theme="default">
  ### Tip

  Don’t forget to regularly check the results so you can optimize the use case for better performance.
</Callout>

# Additional resources

Learn how to [enhance and optimize email](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.