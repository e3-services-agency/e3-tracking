---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Quiz banner with product recommendations

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Basic</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>increase in RPV</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Performance</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

The [Quiz Banner With Product Recommendations](https://www.bloomreach.com/en/products/engagement/plug-and-play/quiz-banner-with-product-recommendations) use case engages website visitors by asking two questions and offering personalized product suggestions based on their responses. This interaction collects zero-party data for use in future marketing efforts. The goal is to boost conversion rates and revenue per visitor by displaying the three most relevant products, improving the user experience, and helping visitors make informed purchase decisions.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/60f0bfcc2b378a1250d179e736e369073bed23fb3beb8b4dab5f68815e0a5c90-EPP-WQPR-Quiz-Banner-With-Product-Recommendations.gif",
        "",
        ""
      ],
      "align": "center"
    }
  ]
}
[/block]

## Use case items

With this use case, you’ll get an:

* Quiz banner with product answers: A quiz banner on the website engages visitors by asking two questions and then offers product recommendations based on their responses, gathering zero-party data.
* Answers tracking scenario: This scenario collects zero-party data, which can be used for future personalized campaigns. This scenario enables you to track these two answers as customer properties, thereby collecting zero-party data that can be utilized in future campaigns for long-term customer engagement and personalization.
* Evaluation dashboard: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

## How to deploy the use case

After downloading the use case, follow these steps:

### Meet the requirements

Check if the data in your project meets the requirements. Follow this [step-by-step setup guide](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements) in case of problems.

### Understand the use case logic

#### Quiz banner with product answers

A Quiz banner with product answers is displayed when a visitor arrives at your website and views more than one product daily. This ensures the quiz is shown only when the visitor is ready to engage. The quiz consists of two questions:

* What sounds the most appealing to you?
* For whom do you shop?

Three recommended products are shown based on these answers. The visitor’s responses are tracked and stored as zero-party data in their customer profile for future personalized campaigns.

You can customize the banner questions to suit your business needs.

To insert the recommended products for display, navigate to the **Products** section and enter the parameters.

For example, the quiz, which includes two questions with three answer options, can result in nine possible customer combinations. The following table summarizes the logic; you can use it as a reference when configuring the use case.

[block:parameters]
{
  "data": {
    "h-0": "",
    "h-1": "Question 1  \nAnswer 1",
    "h-2": "Question 1  \nAnswer 2",
    "h-3": "Question 1  \nAnswer 3",
    "0-0": "Question 2  \nAnswer 1",
    "0-1": "Answer 1 1 Items",
    "0-2": "Answer 2 1 Items",
    "0-3": "Answer 3 1 Items",
    "1-0": "Question 2  \nAnswer 2",
    "1-1": "Answer 1 2 Items",
    "1-2": "Answer 2 2 Items",
    "1-3": "Answer 3 2 Items",
    "2-0": "Question 2  \nAnswer 3",
    "2-1": "Answer 1 3 Items",
    "2-2": "Answer 2 3 Items",
    "2-3": "Answer 3 3 Items"
  },
  "cols": 4,
  "rows": 3,
  "align": [
    "left",
    "left",
    "left",
    "left"
  ]
}
[/block]

Example of a filled-in table:

|        | Reading books                              | Watching movies with my partner | Engaging in outdoor activities |
| :----- | :----------------------------------------- | :------------------------------ | :----------------------------- |
| Male   | 6809126699146,6809194070154, 6809194037386 | ...                             | ...                            |
| Female | 6809194004618,6809193971850, 6809193939082 | ...                             | ...                            |
| Kids   | ...                                        | ...                             | ...                            |

#### Answers tracking scenario

This scenario allows you to track the two quiz responses as customer properties, enabling the collection of zero-party data for future campaigns aimed at enhancing long-term customer engagement and personalization.

The scenario activates each time the banner is submitted, and the answers are recorded in the specified customer properties. Please refer to the notes in the scenario and adjust the flow according to your requirements.

This scenario is optional. If you choose not to track zero-party data as customer properties, you are not required to run the scenario. Zero-party data is always tracked in the banner event with the action labeled **submit**.

### Adjust the use case

Now that you understand the use case logic, you can set up the use case according to your preference.

#### Banner settings

If you decide to customize the banner logic, follow [this detailed guide](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-banner-design-and-settings-in-the-use-case-center#settings) to make the adjustments.

#### Design and copy

Customize the banner visuals and copy to align with your company's brand identity. See banner tooltips in case of uncertainty.

Otherwise, you can go [through this guide](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-banner-design-and-settings-in-the-use-case-center) for more information.

### Test and run the use case

Test a use case before deploying it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-banner-in-the-use-case-center) ensures you don't send unfinished or imperfect campaigns to your customer base.

Once the testing is over, run the use case. Open the banner and click **Start** to launch the campaign.

### Evaluate the results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt [evaluation dashboard](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) to measure and analyze relevant data.

1. Open the evaluation dashboard
2. Enter the banner's name. For example, Quiz banner with product recommendations.
3. Set the [attribution window for revenue in hours](https://documentation.bloomreach.com/engagement/docs/use-case-evaluation#benefitrevenue-calculations), for example, 24.
4. Click **Refresh** to see the results.
5. Check campaign results regularly to optimize performance.

## Other resources

Learn how to [enhance and optimize the banner](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.

## For advanced users

Add an A/B test to the use case to determine whether visitors who interact with the banner are more likely to convert to a purchase.