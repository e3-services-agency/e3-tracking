---
updatedAt: 2026-08-13T15:33:51.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Pre-travel engagement email flow

Industry: travel & hospitality

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
        <p>Increase in AOV</p>
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

# What to Expect From This Use Case

The Interactive pre-travel engagement use case ensures customers receive a series of informative emails at 60, 30, 14, 7, and 1 day before departure. These emails offer essential pre-travel information and opportunities to enhance their experience through service upgrades. The scenario activates upon booking completion, evaluating the days until departure to determine the email sequence starting point. Before each email, the system checks for booking updates and valid customer consent and ensures no duplicate emails for the same booking.

<Callout icon="💡" theme="default">
  ### Tip

  Visit our [microsite](https://www.bloomreach.com/en/products/engagement/plug-and-play/pre-travel-engagement-email-flow) to read more about this and other use cases developed by a team of Bloomreach experts.
</Callout>

<Image src="https://files.readme.io/b93cc2b-Pre-Travel-Engagement.gif" align="center" />

## Use Case Items

With this use case, you’ll get a:

* Pre-travel engagement email scenario

# How to deploy the Use Case

After downloading the use case, follow these steps:

## Step 1: Meet the Requirements

Verify if the data in your project meets the requirements. Follow this [step-by-step setup guide](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements) in case of problems.

## Step 2: Understand the Use Case Logic

The scenario activates upon the completion of a booking. Customers are then evaluated based on the days until their departure to determine their starting point in the email sequence. For example, a customer who books 21 days before departure will enter the sequence with the '30-day' email. The communication flow initiates no more than 60 days before departure.

Before sending each email, we ensure:

* The 'booking has not been updated' prevents a booking from continuing the sequence if a newer booking has been tracked (e.g., booking change) and generates multiple messages. This also stops any canceled bookings from moving further.
* The customer's consent is confirmed to be valid.
* The customer has not previously received the same email for the current booking, which could occur, for instance, in cases of booking upgrades. To manage this, custom campaign tracking is set up to track each event's booking ID.
  * Details on the setup of [custom campaign tracking](https://documentation.bloomreach.com/engagement/docs/custom-campaign-tracking) can be found in the documentation. For this scenario, the attribute name should be 'booking\_id,' with the attribute value set as {{ event.booking_id }}. This configuration is included in all email templates within this scenario.

*Please refer to the scenario descriptions for step-by-step information on use case deployment.*

<Callout icon="👍" theme="okay">
  ### Information

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

Follow [this](https://documentation.bloomreach.com/engagement/docs/customize-the-email-node-in-use-case-center) guide to adjust the email template with products in the email node.

## Step 4: Test and Run the Use Case

When you are done adjusting the use case, we recommend to always [test the use case](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-email-in-the-use-case-center) before deployment. When testing, double-check if the use case design, copy, and settings work as preferred.

<Callout icon="❗️" theme="error">
  ### Warning

  You should only deploy a use case after testing. Testing prevents sending unfinished or imperfect campaigns to your customer base.
</Callout>

Run the use case once the testing is over. When you open the email, click the `Start` button in the upper right corner to launch the campaign.

# Additional Resources

Learn how to [enhance and optimize email](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.