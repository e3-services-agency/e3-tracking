---
updatedAt: 2026-08-17T03:36:59.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# SMS subscription DOI checkout banner

<HTMLBlock>{`
<div class="feature-integrations-wrapper">
  <div class="card-with-icon-wrapper">
     <a class="card-with-icon-item card-with-icon-item-1">
      <div class="icons-wrapper">
      	<img src="https://files.readme.io/a8d39c9-Group_6991.svg"/>
      	<img src="https://files.readme.io/1482713-1._Clock_Icon.svg" class="icon"/>
      </div>
      <p>Use Case maturity: 
        <p>Advanced</p>
    </a>
  </div>
  
  <div class="card-with-icon-wrapper">
     <a class="card-with-icon-item card-with-icon-item-1">
      <div class="icons-wrapper">
      	<img src="https://files.readme.io/3762a90-Group_7035.svg"/>
      	<img src="https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg" class="icon"/>
      </div>
      <p>What to expect: 
        <p>Increase in Lead Generation</p>
    </a>
  </div>
  
  <div class="card-with-icon-wrapper">
     <a class="card-with-icon-item card-with-icon-item-1">
      <div class="icons-wrapper">
      	<img src="https://files.readme.io/9fae711-Group_7036.svg"/>
      	<img src="https://files.readme.io/a8fee62-3._Results.svg" class="icon"/>
      </div>
      <p>Use Case goal: 
        <p>Acquisition</p>
     
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

## What to Expect From this Use Case

The SMS Subscription DOI Checkout Banner use case provides a dynamic, easy, and incentivized pathway to build and manage your SMS subscriber list straight from checkout. This use case enables easy double opt-in SMS subscription and consent tracking for new subscribers and, additionally, rewards new SMS subscribers with a discount code.

### Key features

* Simplifies the subscription process, making it user-friendly and efficient.
* Double opt-in process that ensures that users confirm their subscription through a two-step verification.
* Helps with consent management for SMS subscriptions, making it easier to distinguish new subscribers from existing ones.
* Offers reward perks such as discount codes to encourage new subscriptions.

<Image src="https://files.readme.io/45848b84a6e15d855c69ba3b19b3688cf5da249208652f20a970d0b8a5b58653-LSIC-SMS-Subscription-DOI-Checkout-Banner.gif" align="center" />

## Use Case Items

With this use case, you’ll get a:

* SMS subscription banner: This banner appears during the checkout process, providing a dynamic and incentivized pathway for users to subscribe to SMS updates. This banner helps manage consent for SMS subscriptions, enhances communication reach, and incentivizes new subscriptions by offering discount codes, thereby boosting customer engagement and consent tracking.
* Double opt-in scenario: A double-opt-in scenario ensures that users confirm their subscription to SMS updates by completing a two-step verification process. This process helps maintain a healthy and engaged subscriber list, improves deliverability, and ensures compliance with consent regulations.
* Evaluation Dashboard: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

## How to deploy the Use Case

After downloading the use case, follow these steps:

### Meet the Requirements

Verify if the data in your project meets the requirements. Follow this [step-by-step setup guide](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements) in case of problems.

### Understand the Use Case Logic

After subscribing through the *Checkout Consent Banner* to receive SMS communication, the customer goes through an automated consent (opt-in) management and voucher automatization scenario.

The use case initially checks if the customer granted their `SMS` consent. If not, they receive an SMS asking them to sign up for your brand's marketing communication by replying 'YES' to the SMS. If they are an existing subscriber, they will be notified via SMS that their phone number has already been subscribed.

If the customer is a new subscriber, the use case checks if the customer's consent was tracked, whether they opted in through the scenario of the campaign Checkout Consent Banner, and whether this is their first time opting in.

When all conditions are met, they receive an SMS voucher code.

### Adjust the Use Case

Now that you understand the use case logic, you can set up the use case according to your preference.

#### Banner Settings

Access the banner and go to the Settings tab to adjust the [banner settings]().

#### Design & Copy

Customize the [banner visuals and copy](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-banner-design-and-settings-in-the-use-case-center) to reflect your company's brand identity.

Open the banner use case and find the panel with adjustable parameters. For guidance, hover over the information icons next to each parameter.

### Test and Run the Use Case

Test a use case before deploying it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-banner-in-the-use-case-center) ensures you don't send unfinished or imperfect campaigns to your customer base.

Once the testing is over, run the use case. Open the banner and click **Start** to launch the campaign.

### Evaluate the Results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt [evaluation dashboard](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) to measure and analyze relevant data.

1. Open the evaluation dashboard
2. Enter the banner's name. For example, SMS subscription DOI checkout banner.
3. Set the [attribution window for revenue in hours](https://documentation.bloomreach.com/engagement/docs/use-case-evaluation#benefitrevenue-calculations), for example, 24.
4. Click **Refresh** to see the results.
5. Check campaign results regularly to optimize performance.

## Additional Resources

Learn how to [enhance and optimize the banner](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.