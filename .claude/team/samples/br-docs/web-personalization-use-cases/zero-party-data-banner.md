---
updatedAt: 2026-07-29T08:00:39.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Zero-party data banner

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Basic</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Increase in RPV</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Acquisition</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

Benefit from increased conversion rates by personalizing your campaigns with zero-party data. Our customers have seen a 3x increase in conversion rates using this approach. The [Zero-party data banner](https://www.bloomreach.com/en/products/engagement/plug-and-play/zero-party-data-banner) enables you to gather valuable insights directly from your customers without any coding required. This banner offers extensive customization options, allowing you to set specific questions to collect data that enhances your ability to personalize customer experiences and boost conversions.

Watch the video below to see how to set up and customize the Zero-party data banner for your campaigns:

[block:embed]
{
  "html": "<iframe class=\"embedly-embed\" src=\"//cdn.embedly.com/widgets/media.html?src=https%3A%2F%2Fwww.youtube.com%2Fembed%2FxWB4K2h-YRI%3Ffeature%3Doembed&display_name=YouTube&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DxWB4K2h-YRI&image=https%3A%2F%2Fi.ytimg.com%2Fvi%2FxWB4K2h-YRI%2Fhqdefault.jpg&type=text%2Fhtml&schema=youtube\" width=\"854\" height=\"480\" scrolling=\"no\" title=\"YouTube embed\" frameborder=\"0\" allow=\"autoplay; fullscreen; encrypted-media; picture-in-picture;\" allowfullscreen=\"true\"></iframe>",
  "url": "https://www.youtube.com/watch?v=xWB4K2h-YRI",
  "title": "Zero-Party Data Banner",
  "favicon": "https://www.youtube.com/favicon.ico",
  "image": "https://i.ytimg.com/vi/xWB4K2h-YRI/hqdefault.jpg",
  "provider": "youtube.com",
  "href": "https://www.youtube.com/watch?v=xWB4K2h-YRI",
  "typeOfEmbed": "youtube"
}
[/block]

### Key features

* Zero-Party Data Collection: Directly gather data from customers by asking tailored questions.
* No-Code Customization: Easily configure the banner without needing any coding skills.
* Flexible Design Options: Customize the look and content to align with your brand and campaign goals.
* Enhanced Personalization: Use collected data to create more relevant and engaging customer experiences.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/da64a121e640b1b533d98feba0e358de275ca699b0332adf4d6fa04be91d27bb-BR_Use_Case_Image__Zero-Party_Data_Banner2x_1.jpg",
        "",
        "Zero-party data banner interface showing customizable survey form with multiple question types and branding options"
      ],
      "align": "center"
    }
  ]
}
[/block]

## Use case items

With this use case, you’ll get an:

* Zero-Party data banner: A fully customizable tool that helps you gather important customer insights directly through the banner.
* Questions Excel file: Spreadsheet for managing and updating survey questions.
* Report: Dashboard for monitoring and analyzing banner responses.

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

### Understand the use case logic

The zero-party banner provides comprehensive data capture and customer acquisition capabilities. This banner offers flexible data collection and consent management, allowing you to gather valuable customer insights through customizable surveys and forms.

**Core capabilities:**

* **Customizable setup:** Define your sign-up source and manage consent categories
* **Customer attribute updates:** Seamlessly update customer profiles with collected information
* **Acquisition capture integration:** Include acquisition capture as the final step, directing customers to a thank you page
* **Visual control:** Personalize background options and set triggering rules for optimal user experience

#### Step 1: Configure question parameters

Use the Excel spreadsheet template to structure your questions. The template includes essential columns like "order," "question," "required status," and "question type."

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/5c7e26955305381169dc3761affbc53b1d672797c8f0645368ec26c799ee4e6b-Zero-party_data_banner_-_Questions_file_matrix_.png",
        "",
        "Excel spreadsheet template showing question matrix with columns for order, question type, required status, and conditional logic parameters"
      ],
      "align": "center",
      "border": true,
      "caption": "Excel template interface"
    }
  ]
}
[/block]

**Question setup process:**

* Download the provided Excel spreadsheet template and fill it out with your desired questions and answers.
* Copy the content directly into the "Question order" input within the weblayer.
* The system dynamically generates your questions for a smooth setup.
* Test single questions by copying only a portion of your spreadsheet to preview before finalizing.

**Available question types:**

* **Selection questions:** Multiple-choice or dropdown options for structured data collection
* **Free text input:** Open-ended responses for qualitative insights
* **Date input:** Capture specific date information from customers
* **Dynamic question flow:** Set up conditional flows based on customer answers for personalized journeys

#### Step 2: Customize visual appearance

You have complete control over the visual presentation of your banner.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/4585e83cb95205dceeec2ede11fe5c3fbcd54d96bda7b15c29e8efde21dd4a7b-Zero-party_data_banner_-_styling.png",
        "",
        "Banner customization interface showing answer button styling options, color controls, background settings, and spacing adjustments"
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

**Answer button customization:**

* Customize text color, background color, and border width for answer buttons
* Fine-tune answer button images with responsive design that adapts to text size
* Control spacing between answers and buttons for optimal user experience

**Display options:**

* Choose to display questions "one per page" for a focused experience or "all on one page" for a comprehensive overview
* Set whether answers are single-choice or multiple-choice
* Configure required answers to ensure essential data collection before customers can proceed

#### Step 3: Configure banner settings and audience

* Follow tooltips next to each parameter in the banner interface
* Adjust audience settings to target your specific use case
* Define frequency capping to control how many times visitors see the banner
* Choose display method: embedded page element or popup overlay
* Configure optional features: voucher code copy functionality, weblayer chaining, enhanced exit intent logic

#### Step 4: Launch and monitor performance

**Tracking implementation:**\
The tracking follows best practices for collecting and storing zero-party data. One event with an `action` of `survey_response` is sent per question, meaning each answer generates a specific event for detailed analysis.

Event tracking examples:

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/c58478a796a21663cdf7f04115122ead5bd14078b66ff076404ecc4ff5ce1112-Zero-party_data_banner_-_banner_show.png",
        "",
        "banner showing open question responses"
      ],
      "align": "center",
      "sizing": "60% ",
      "border": true,
      "caption": "Example of tracking open question and answer"
    }
  ]
}
[/block]

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/7902df453ef53da92f2b94f567a4786d46a4706a9f9fd7129ce767eb4ace75e2-Zero-party_data_banner_-_banner_action_show.png",
        "",
        "Example of banner show"
      ],
      "align": "center",
      "sizing": "60% ",
      "border": true
    }
  ]
}
[/block]

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/27947004ac6c4cd3b71df49a2417510044ce9d7dbe67b830a132c4a45e1a84dc-Zero-party_data_banner_-_banner_questions_1-5.png",
        "",
        "Example of tracking scale question 1-5 and answer"
      ],
      "align": "center",
      "sizing": "60% ",
      "border": true,
      "caption": "Example of tracking scale question 1-5 and answer"
    }
  ]
}
[/block]

**Performance monitoring:**

* Access aggregated event data through the integrated report
* Monitor different questions and corresponding answers
* Update customer attributes automatically based on survey responses
* Set up scenarios to transfer zero-party data from events to customer attributes for enhanced campaign personalization

### Test and run the use case

Test a use case before deploying it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-banner-in-the-use-case-center) ensures you don't send unfinished or imperfect campaigns to your customer base.

Once the testing is over, run the use case. Open the banner and click **Start** to launch the campaign.