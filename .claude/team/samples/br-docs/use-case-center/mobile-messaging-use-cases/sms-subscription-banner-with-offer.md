---
updatedAt: 2026-08-17T03:43:04.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# SMS subscription banner with offer

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
        <p>increase in Lead Generation</p>
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

## Use case description

Acquire new customers and reward them for their subscription with a predefined banner with two-tap technology that effortlessly incentivizes your customers to consent to communication. In this [Use Case](https://www.bloomreach.com/en/products/engagement/plug-and-play/sms-subscription-banner-with-offer), the email subscription will need to be confirmed via double opt-in SMS, enhancing your customer loyalty and sending your customers a voucher code as a reward.

<Image src="https://files.readme.io/3fe64ab-SMS_592x382_LSDO.gif" align="center" />

## Use case items

With this use case, you’ll get an:

* SMS subscription banner with offer sign-up banner

* Double opt-in SMS processing from SMS subscription banner with offer sign-up unit

* **Evaluation dashboard**: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

### Understand the use case logic

### Scenario - Double Opt-in SMS Processing from SMS Subscription Banner with Offer Sign-Up Unit

This use case enables easy double opt-in SMS subscription and consent tracking for new subscribers and, additionally, rewards new SMS subscribers with a discount code.

After the initial step - subscribing through the *SMS Subscription Banner with Offer Sign-up Banner* to receive SMS communication, the customer goes through this automated consent (opt-in) management and voucher automatization scenario. First, we check if the customer hasn't granted their `SMS` consent yet. If they haven't, we send them an SMS asking them to sign up for your brand's marketing communication by replying 'YES' (the keyword from Project Settings) to the SMS. In the edge case that they are an existing subscribers , we notify them via SMS that their phone number has been already subscribed.

In case they are new subscribers (flow 2), we check if the customer's consent was tracked, whether they opted in through the scenario of the campaign *SMS Subscription Banner with Offer Sign-up Banner* (also a part of this use case) and if this is their first time to opt in. When all conditions are met, we send them an SMS voucher code.

<br />