---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Single opt-in subscription banner

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
        <p>Lead generation</p>
    </a>
  </div>
  
  <div class="card-with-icon-wrapper">
     <a class="card-with-icon-item card-with-icon-item-1">
      <div class="icons-wrapper">
      	<img src="https://files.readme.io/9fae711-Group_7036.svg"/>
      	<img src="https://files.readme.io/a8fee62-3._Results.svg" class="icon"/>
      </div>
      <p>Use Case goal: 
        <p>Grow database</p>
     
    </a>
  </div>
</div>

<style>
  
</style>
`}</HTMLBlock>

## Use case description

The [single opt-in subscription banner](https://documentation.bloomreach.com/engagement/docs/single-opt-in-subscription-banner) shows website visitors an email signup form that grows your newsletter list. The banner checks that visitors enter a correctly formatted email address and explains what they're signing up for, including the benefits. Bloomreach clients using this banner have seen up to a 69% improvement in leads captured.

<Image src="https://files.readme.io/c1bedb397d8e9939a0d2320bf624c8f4546d3adc5193a1f181278ac799a2e985-image.png" border={true} />

### Key features

* Validates the email format before submission to keep your subscriber list clean.
* Explains the value of subscribing directly in the banner copy.
* Updates the visitor's email property and newsletter consent automatically after they subscribe.

## Use case items

With this use case, you'll get a:

* **Banner:** Single opt-in subscription banner, a weblayer shown to visitors who haven't given newsletter consent.
* **Evaluation dashboard:** Email Single Opt-In Banner Evaluation Dashboard, which tracks consents collected, current subscribers, and banner performance.

## How to deploy the use case

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/use-case-requirements). The Use Case Center lists requirements for each use case during the deployment process.

### Understand the use case logic

The banner appears to visitors who haven't given newsletter consent. To limit how often it shows, the banner only displays to visitors who haven't closed it that day and haven't seen it more than twice already that day, up to a maximum of 5 times per 30 days. To target visitors more likely to subscribe, the banner only shows to visitors who have viewed at least 3 products during their current session. The banner works on both desktop and mobile devices.

When a visitor subscribes, Bloomreach automatically updates their email property and newsletter consent. The banner also tracks the event attribute `data_source` with the value `single opt-in weblayer`. No change is needed for this tracking.

This use case runs without an A/B test, since the goal is to maximize the number of new subscribers rather than compare banner variants.

### Adjust the use case

Now that you understand the use case logic, you can set up the use case according to your needs.

#### Banner settings

Access the banner and go to the **Settings** tab to adjust the [banner settings](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-banner-design-and-settings-in-the-use-case-center#settings). Pay attention to:

* **Consent category:** Match the naming exactly to your project's **Project settings > Privacy management > Consents > Consent management**.
* **Audience:** Exclude visitors who already gave newsletter consent, and add frequency capping so visitors aren't shown the banner too often.

#### Design and copy

Access the banner and go to **Design > Editor** to customize the [banner visuals and copy](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-banner-design-and-settings-in-the-use-case-center#design--copy) to reflect your company's brand identity, including the header text, body text, placeholder, success messages, and privacy policy link.

### Test and run the use case

[Test](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-banner-in-the-use-case-center) the use case before deploying it. Testing ensures you don't show an unfinished or imperfect banner to your visitors.

Once testing is over, run the use case. Open the banner and click **Start** to launch the campaign.

### Evaluate the results

Run the use case for a few days to see the impact.

After this initial period, use the prebuilt [evaluation dashboard](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) to measure and analyze relevant data:

1. Open the Email Single Opt-In Banner Evaluation Dashboard.
2. Check the consents collected, current subscribers, and click rate metrics against your own historical data.
3. Adjust the comparison time frame in the dashboard if needed.

## Other resources

Learn how to [enhance and optimize your banner](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center#banner) with tips from Bloomreach experts.

Additionally, learn more about [weblayers](https://documentation.bloomreach.com/engagement/docs/web-layers) and [consent management](https://documentation.bloomreach.com/engagement/docs/consent-management).

<br />