---
updatedAt: 2026-08-17T03:15:53.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Omnichannel post-purchase NPS survey

<HTMLBlock>{`
<div class="feature-integrations-wrapper">
  <div class="card-with-icon-wrapper">
     <a class="card-with-icon-item card-with-icon-item-1">
      <div class="icons-wrapper">
      	<img src="https://files.readme.io/a8d39c9-Group_6991.svg"/>
      	<img src="https://files.readme.io/1482713-1._Clock_Icon.svg" class="icon"/>
      </div>
      <p>Use case maturity: 
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
        <p>Increase in CLTV</p>
    </a>
  </div>
  
  <div class="card-with-icon-wrapper">
     <a class="card-with-icon-item card-with-icon-item-1">
      <div class="icons-wrapper">
      	<img src="https://files.readme.io/9fae711-Group_7036.svg"/>
      	<img src="https://files.readme.io/a8fee62-3._Results.svg" class="icon"/>
      </div>
      <p>Use case goal: 
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

After a customer completes a purchase, you want to measure their satisfaction and collect actionable feedback. [This use case](https://www.bloomreach.com/en/products/engagement/plug-and-play/omnichannel-post-purchase-nps-survey) automatically sends a Net Promoter Score (NPS) survey by email 14 days after purchase (timing is adjustable). If the customer doesn’t respond to the email but visits your website, a banner (weblayer) with the same survey appears.

This omnichannel approach increases response rates, helps you reach customers who ignore email, and provides valuable insights to improve your customer experience.

## Key features

* Collects post-purchase feedback via email and website weblayer.
* Reaches non-responders by displaying the survey as a banner on your website.
* Segments customers based on NPS score for targeted follow-up.
* Uses conditional follow-up questions to gather detailed feedback.
* Excludes product returners from receiving the survey.
* Supports both native and third-party surveys for flexibility.
* Tracks and visualizes NPS results in a custom dashboard, separated by channel.

<Image src="https://files.readme.io/32c2834adbf376abf157171b180accf9bf5b8942ad88bb4e445f1a946a623536-BR_Use_Case_Image__Omnichannel_Post-Purchase_NPS_Survey2x.jpg" align="center" border={true} />

## Use case items

* **Evaluation dashboard:** Visualizes NPS results from both email and weblayer.
* **Automated NPS email:** Sends the survey to customers with valid email and consent, after a set delay.
* **Automated NPS weblayer:** Displays the survey as a banner to customers who visit your site but haven’t responded to the email.
* **NPS segmentation:** Groups customers by their NPS score.
* **Conditional survey logic:** Shows different follow-up questions based on the NPS score.

## How to deploy the use case

### Understand the scenario logic

1. Customer makes a purchase and enters the NPS flow.
2. NPS email is sent after a set delay (default: 14 days) to customers with valid email and consent.
3. Exclude customers who returned their product (if return tracking is set up).
4. Email contains a 1–10 NPS scale. Clicking a score opens the survey with follow-up questions tailored to that score.
5. **If no email response:** When the customer visits your website within 21 days of purchase, a weblayer banner with the survey appears (shown up to three times).
6. All survey responses are tracked for analysis.

### Customize your survey

You can use either **Bloomreach native surveys** or a **third-party survey tool**.

Use the following tabs in Bloomreach to customize your NPS Survey:

* **Design > Form** to manage questions.
* **Design > Translation** for custom texts and post-survey messages.
* **Design > CSS and JS** for styling and advanced customization.

#### A. Set up your survey structure

1. Add the main NPS question: “How likely are you to recommend us to your friends and family?”

<Image src="https://files.readme.io/e804a41d50753b6f665a77df643e055413c6d23df05f3691cecc7904fada6e74-NPS_Survey_-_mandatory_question.png" alt="NPS survey question setup in Marketing survey editor" align="center" border={true} />

1. Configure conditional follow-up questions:

   * Assign follow-ups based on NPS score:
     * **Score 0–6:** Show questions for detractors.

   <Image src="https://files.readme.io/4e4896cb8495d075b1160b3f7e6ca58db0f0561e4253942b6f6825b74e28b866-NPS_Survey_rating_-_6_and_less.png" alt="![Conditional follow-up question configuration based on NPS score in survey editor - rating 6 and less" align="center" border={true} />

   * **Score 7–10:** Show questions for passives/promoters.

   <Image src="https://files.readme.io/c3c62863e49ee5e4bda44645129ac41742e1906ff182156dcca19b56065ca0c0-NPS_Survey_rating_-_7_and_more.png" alt="![Conditional follow-up question configuration based on NPS score in survey editor - rating 7 and more" align="center" border={true} />

   * For each follow-up section, list the NPS scores (numbers) that should trigger its questions. The section heading text itself doesn’t matter—only the numbers you specify.
   * You can assign the same score to multiple sections if you want some questions to appear for both high and low scores.
   * If you leave a score out of all section headings, customers who select that score will not see any follow-up questions.
   * The first section heading and the NPS score question are always shown (unless the score was already selected in the email).
   * The "Supplementary Information" section heading is always shown if any additional questions are displayed.
   * You can't make follow-up questions (triggered by NPS score) mandatory.

2. Edit and organize questions:
   * Add, edit, or remove questions as needed.
   * Update your dashboard if you change the question structure.
   * To see how survey answers are tracked and which question corresponds to which question\_id, perform a survey test and review the tracked `survey` event data on your tester profile.

#### C. Survey name and technical considerations

* Do not change the survey name unless necessary. If you must change it, update the survey name in the HTML of the email template as well.

  1. Click on the scale in your email template to access the HTML editor.
  2. Replace 'NPS Survey' with the name of your survey, and click **Done**.

  <Image src="https://files.readme.io/8ecc38ad09ef4a8d8a56900c6c415400340676460043ba4d6e9525a6dd72c185-NPS_survey_name_editing.png" alt="HTML editor in Marketing showing how to replace the survey name in NPS survey email template" align="center" border={true} />

* Don't modify the UTM parameters tracked within the same HTML block. Changing these will break the use case and disrupt reporting.

#### D. Link the survey to your NPS email

1. Connect the survey to the NPS scale in your email template:
   * Each score (1–10) in the email should link to the survey, passing the selected score.
   * **For third-party surveys**:
     1. Access the HTML editor by clicking on the NPS scale, which appears in the bottom right corner of the screen.
     2. Insert your survey URL within the quotation marks following the first equals sign, as shown in the screenshots below.
     3. It is crucial to maintain the UTM tracking parameter (for example, `?utm_term=NPS07`) for the use case to function properly.

<Image src="https://files.readme.io/7d437985c325241f20533b877198138de0cf99c014d8000467a9de664e6a6876-NPS_survey_HTML_editor.png" alt="Replacing NPS survey URLs in email template HTML editor" align="center" border={true} />

#### E. Configure weblayer survey (banner)

* Show the NPS survey as a banner to customers who didn’t open the email but visit your website within a set time (default: 21 days).
* Limit banner display to a maximum of three times per customer.
* When the customer clicks the 'submit' button, the system creates a `survey` event that stores both the NPS score and the customer’s answers. The evaluation dashboard and reports use this event.

<Image src="https://files.readme.io/e7d69ee1ed87c1db7bb1661cf37c13a5ef760bc25b3611f75ccb1a588c605a40-Survey_event.png" alt="Survey event details showing stored NPS score and customer answers in Marketing" align="center" border={true} />

* The banner survey is built in JavaScript and isn't linked to the Bloomreach app’s survey module.
* Enable **Track Survey Events** in banner settings to capture partial responses (an event is tracked after each step, storing partial answers).

<Image src="https://files.readme.io/fb49b335634055c595f4f75fd4734b3e99e9987205c2cd863531a3f6deeb20b7-NPS_Survey_Weblayer_modification.png" align="center" border={true} />

#### F. Test and launch

1. **Test the survey:**
   * Submit test responses and review the tracked `survey` event data in your tester profile.

2. **Start the survey:**
   * Use the **Start** button in the survey editor before launching the scenario.

### Maintenance and best practices

* Do not change the survey name unless you also update all related assets and tracking.
* Update dashboards and reports if you modify survey questions or URLs.
* [A/B test](https://documentation.bloomreach.com/engagement/docs/ab-tests)\*\* email and [banner designs](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-banner-design-and-settings-in-the-use-case-center), subject lines, and timing.
* Personalize surveys with Jinja to display purchased items.
* Send follow-up emails or use other channels (SMS, push) for non-responders.

For more details, see:

* Bloomreach [Surveys documentation](https://documentation.bloomreach.com/engagement/docs/surveys-1)
* [Net Promoter Score Survey documentation](https://documentation.bloomreach.com/engagement/docs/net-promoter-score-survey)