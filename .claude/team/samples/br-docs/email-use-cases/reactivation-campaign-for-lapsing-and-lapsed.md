---
updatedAt: 2026-08-13T15:39:27.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Reactivation campaign for 'Lapsing' and 'Lapsed' subscribers

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
        <p>Increase in active subscriber base</p>
    </a>
  </div>
  
  <div class="card-with-icon-wrapper">
     <a class="card-with-icon-item card-with-icon-item-1">
      <div class="icons-wrapper">
      	<img src="https://files.readme.io/9fae711-Group_7036.svg"/>
      	<img src="https://files.readme.io/a8fee62-3._Results.svg" class="icon"/>
      </div>
      <p>Use Case goal: 
        <p>Retention</p>
     
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

The [Reactivation Campaign](https://www.bloomreach.com/en/products/engagement/plug-and-play/reactivation-campaign-for-lapsing-and-lapsed-subscribers) is designed for 'Lapsing' and 'Lapsed' subscribers who have not engaged with emails over the past 90 days. You can learn more about the [recommended customer segmentation](https://documentation.bloomreach.com/engagement/docs/email-health-list#recommended-segments) based on email engagement.

'Lapsing' and 'Lapsed' subscribers will enter a 77-day reactivation flow intended to reengage them and move them back to the 'Active' segment. If they remain inactive throughout this period, they will be automatically unsubscribed to help maintain a healthy email list.

Implementing this strategy can significantly increase your active subscriber base, improve retention, and boost sales by bringing inactive customers back into the buying cycle.

<Image src="https://files.readme.io/bed00d8ff7728cf685ac4ab4809fef1627556bcd76ec790668ce00d499c44f5a-BR_Use_Case_Image__Reactivation_Campaign_for_Lapsing_and_Lapsed_Subscribers2x.png" align="center" width="80% " border={true} />

### Key features

* Personalized recommendations: Send tailored product recommendations based on each subscriber's history.
* Incentive offers: Provide incentives with best sellers to encourage reengagement.
* Feedback collection: Gather feedback to understand why subscribers became inactive.
* Evaluation dashboard: Use a prebuilt evaluation dashboard to measure and analyze campaign performance and user behavior.
* Automatic unsubscription: Maintain a healthy email list by automatically unsubscribing inactive subscribers.

## Use case items

With this use case, you’ll get:

* Retention campaign for 'Lapsing' and 'Lapsed' subscribers: email campaign scenario.

* Recommendation engine: with the help of two recommendations, you can display products in your email campaigns.

* **Evaluation dashboard**: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

### Understand the use case logic

This use case aims to reduce churn and cultivate an active, engaged subscriber base. The email campaign scenario contains the following steps:

#### 1. Segment identification

Identify subscribers in the 'Lapsing' or 'Lapsed' segment.

#### 2. GDPR compliance

Check for emailing consent to comply with GDPR rules.

#### 3. Eligibility criteria

Ensure the subscriber:

* Was never part of the Reactivation campaign.
* Gave consent more than 90 days ago.
* Engaged with emails previously but not in the last 90 days.
* Hasn't made a purchase or visited the website in the last 90 days.

#### 4. Email series

Send a series of 6 reactivation emails:

1. Personalized Recommendations
2. Incentive with best sellers
3. Incentive Reminder with best sellers
4. Feedback
5. Stay Subscribed
6. Unsubscription

#### Waiting times

The waiting times between emails are 7, 21, 28, 7, and 14 days.

#### Engagement check

Subscribers continue to receive the next email in the series only if they haven't engaged with any email, made a purchase, or visited the website in the meantime.

### Adjust the use case

Now that you understand the use case logic, you can set up the use case according to your needs.

#### Email settings

Follow this detailed guide to [customize your email settings](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-email-design-and-settings-in-the-use-case-center#settings).

#### Design and copy

Customize the email visuals and copy to align with your company's brand identity.

Learn how to [adjust the email template with products](https://documentation.bloomreach.com/engagement/docs/customize-the-email-node-in-use-case-center) in the email node.

### Test and run the use case

Test a use case before deploying it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-email-in-the-use-case-center) ensures you don't send unfinished or imperfect campaigns to your customer base.

Once the testing is over, run the use case. Open the email and click the **Start** button in the top right corner to launch the campaign.

### Evaluate the results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt [evaluation dashboard](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) to measure and analyze relevant data.

1. Open the evaluation dashboard
2. Enter the email's name. For example, Reactivation campaign for 'Lapsing' and 'Lapsed' subscribers.
3. Set the [attribution window for revenue in hours](https://documentation.bloomreach.com/engagement/docs/use-case-evaluation#benefitrevenue-calculations), for example, 24.
4. Click **Refresh** to see the results.
5. Check campaign results regularly to optimize performance.

<Image src="https://files.readme.io/1fabcfd09dbd9346bbaa8549a9531df10ae8aa009fe9ae87401655137f23eb80-image.png" align="center" width="1px" />