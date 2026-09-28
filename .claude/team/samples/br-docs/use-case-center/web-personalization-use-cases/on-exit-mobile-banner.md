---
updatedAt: 2026-08-17T02:44:19.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# On-Exit Mobile Banner

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
        <p>Revenue per visitor</p>
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

The [On-exit mobile banner](https://www.bloomreach.com/en/products/engagement/plug-and-play/on-exit-mobile-banner) use case identifies multiple mobile user behaviors that indicate that the user wants to leave the website and displays a banner to that user.

<Image src="https://files.readme.io/047a243b3123fb402f233db8afcf5fed1f6805d7f3fe93c982746b18957cfb1a-UCC_-_Onexit_Mobile_Banner.png" align="center" />

## Use case items

With this use case, you’ll get an:

* On-exit Mobile Banner: This banner is shown to mobile users who want to leave the website as soon as the users perform one of the six registered behaviors.

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

### Understand the use case logic

The banner is shown to users who perform one of the following behaviors:

**Back button detection** - Detects when a user presses the back button multiple times in a row.

**Fast scroll-up detection** - Detects when a user scrolls up from the bottom of the page to the top.

**Blur detection** - Detects when a user switches away to another window. The banner appears when the user leaves the page and remains there when they come back to the page.

**Return to Landing page** - Detects when a user returns to the home page/landing page.

**Inactivity delay** - Detects when a user is inactive by not scrolling or touching the screen.

**Trigger after page** -  Activates after the user visits specific web pages.

### Adjust the use case

Now that you understand the use case logic, you can set up the use case according to your needs.

#### Banner settings

Access the banner and go to the **Settings** tab to adjust the [banner settings](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-banner-design-and-settings-in-the-use-case-center#settings).

#### Design and copy

Customize the [banner visuals and copy](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-banner-design-and-settings-in-the-use-case-center) to reflect your company's brand identity.

Open the banner use case and find the panel with adjustable parameters. For guidance, hover over the information icons next to each parameter.

### Test and run the use case

Test a use case before deploying it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-banner-in-the-use-case-center) ensures you don't send unfinished or imperfect campaigns to your customer base.

Once the testing is over, run the use case. Open the banner and click **Start** to launch the campaign.

## Limitations

* For the triggers to work, the parameter `Trigger`  has to equal `On exit`.
* Back Button Detection is dependant on the mobile device:
  * iPhone / Google Chrome: Works without issue.
  * Android / Google Chrome: Engagement with the website is necessary before the behavior registers.
* Blur Detection is dependent on the mobile device.
  * iPhone / Google Chrome: Only works when the user switches tabs. Does not work when the user adds a new tab.
  * Android / Google Chrome: Works without issue.

## Other resources

Learn how to [enhance and optimize the banner](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.