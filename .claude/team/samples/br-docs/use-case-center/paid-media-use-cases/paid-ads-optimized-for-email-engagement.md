---
updatedAt: 2026-09-02T15:52:30.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Paid ads optimized for email engagement

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
        <p>increase in RPV</p>
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

[Paid Ads Optimized for email engagement](https://www.bloomreach.com/en/products/engagement/plug-and-play/paid-ads-optimized-for-email-engagement) focuses on enhancing advertising efficiency by creating Ad Audiences based on customers' email engagement levels. By segmenting customers, businesses can make strategic decisions about ad spend, avoiding squandering resources on customers who are already actively engaged via email.

This approach directly impacts the efficiency and effectiveness of paid media advertising, potentially leading to increased revenue and lowered cost-per-acquisition for businesses, as demonstrated by real-life client experiences.

<Image src="https://files.readme.io/eb18d02-LABE_-_Paid-Ads-Optimized-for-Email-Engagement.gif" align="center" />

## Use case items

With this use case, you’ll get an:

* Paid Ads scenario

* Email consent segmentation

* Campaign segmentation

* **Evaluation dashboard**: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

### Understand the use case logic

#### Scenario - targeting based on email engagement

This scenario allows you to create Ad Audiences based on the email engagement of your customers which can help you to better target them with paid advertisements and create an omnichannel strategy.

This scenario is triggered daily. In order to comply with GDPR rules, we check if a customer has given us `Paid Media` consent. If they did, we check if a customer has a valid email or phone number as an identifier. After, we check if the customer belongs to any of email engagement segment OR went through this scenario in the last 90 days. The later is to include customers that are no longer part of the segments but might be still in your ads audiences and thus they need to be removed from them.

According to the email engagement segmentation, two situations may occur:

* If customer is in **Low email engagement** segment, we ensure he is added into corresponding audience.  If he is NO longer part of the segment, we make sure he is removed from the corresponding Low engagement audience.
* If customer is in **High email engagement** segment, we ensure he is added into corresponding High engagement audience.  If he is NO longer part of the segment, we make sure he is removed from the audience.

**BE AWARE THAT THE ACTION OF ADDING AD AUDIENCES WEBHOOKS IS REQUIRED!**

You can learn more about general Ads Best Practices in [this](https://documentation.bloomreach.com/engagement/docs/ads-best-practices) article.

### Evaluate the results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt [evaluation dashboard](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) to measure and analyze relevant data.

1. Open the evaluation dashboard
2. Set the [attribution window for revenue in hours](https://documentation.bloomreach.com/engagement/docs/use-case-evaluation#benefitrevenue-calculations), for example, 24.
3. Click **Refresh** to see the results.
4. Check campaign results regularly to optimize performance.