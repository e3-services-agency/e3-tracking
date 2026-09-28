---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# RCS interactive product recommendation flow

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Advanced</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Increase in revenue</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Retention</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

## Use case description

The [RCS interactive product recommendation](https://www.bloomreach.com/en/products/engagement/plug-and-play/rcs-interactive-product-recommendation-flow) flow enables you to create personalized shopping experiences through conversational messaging. This use case transforms traditional product discovery by engaging customers in interactive conversations that capture their preferences and deliver tailored product recommendations.

Customers receive RCS messages with quick-reply buttons that guide them through a preference-gathering journey. Based on their responses, the system automatically segments customers and delivers personalized product recommendations that align with their stated needs. This approach creates a win-win scenario: you collect valuable zero-party data while customers receive curated product suggestions that help them find what they're looking for more efficiently.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/027cf45d8c295051f3a5fce0f8bd46327e308a1d4db7901fe33e2fb7d42a95c9-RCS_Interactive_Product_Recommendation_Flow2x.jpg",
        "",
        ""
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

## Key features

* **Interactive conversation flow**: Multi-step RCS messaging sequence with intuitive quick-reply buttons
* **Dynamic segmentation**: Automated grouping based on response combinations across multiple touchpoints
* **Zero-party data collection**: Direct capture of customer preferences through conversational interactions
* **Personalized recommendations**: Targeted product suggestions based on individual customer response patterns
* **Campaign event tracking**: Comprehensive monitoring of customer interactions and response data
* **Flexible configuration**: Customizable message sequences and response options to match campaign objectives

## Use case items

When you deploy this use case, you'll receive:

* **RCS response flow**: Complete multi-message conversation sequence
* **Segmentation structure**: Pre-built customer segments covering all response combinations

## How to deploy the use case

### Prerequisites

Before implementing this use case, ensure you have:

* **RCS integration**: Active RCS Business API integration in your Bloomreach project
* **Link shortener**: Required module for RCS functionality (the use case can't be deployed without this module)

> 📘 Need assistance?
>
> Contact your Customer Success Manager if you need to add RCS as a channel or have integration questions.

### Understanding the flow logic

The recommendation flow works through a structured conversation process:

1. **Initial engagement**: Customers receive an RCS message with quick-reply buttons asking about their preferences.
2. **Response collection**: Each customer selection triggers the next message in the sequence while recording the response as a campaign event.
3. **Preference gathering**: The conversation continues through multiple questions (typically 3 messages) to develop a comprehensive customer preference profile.
4. **Recommendation delivery**: Based on the complete response pattern, customers receive a final message with personalized product recommendations.

#### Response tracking

Customer responses are tracked as campaign events with these specifications:

* **Action type**: `RCS`
* **Status**: `incoming_message`
* **Message field**: Contains the customer's actual response text

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/ddec3805bb69289ca9412f37aa9f2a53a62b7cb16ddf58ffdda354e207d43fdb-RCS_campaign_event.png",
        "",
        ""
      ],
      "align": "center",
      "sizing": "60% ",
      "border": true
    }
  ]
}
[/block]

#### Message structure

The default template includes:

* **Message 1**: 3 quick-reply options for initial preference capture
* **Messages 2-3**: 4 quick-reply options each for detailed preference gathering
* **Message 4**: Personalized product recommendation based on response combination

You can adjust the number of messages and response options to match your campaign needs.

### Set up RCS templates

#### Configure the initial message

1. **Access message configuration**: Double-click the **Initial Message** node in your conversation flow
2. **Configure message content**:
   * **Sender**: Select your RCS integration
   * **Title**: Create your message subject line
   * **Description**: Write your main message content
   * **Button name**: Name your options list
   * **List items**: Define the customer selection options
3. **Apply message settings**:
   * **Frequency policy**: Select your relevant frequency policy
   * **Consent**: Choose the appropriate consent category

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/45b6ef24393ccf17d5250e08c014d363766c6293094e1ef5ca9b7c11c827f7fa-RCS_message_responses.png",
        "",
        "RCS message interface displaying three quick-reply button options for initial customer preference selection"
      ],
      "align": "center",
      "sizing": "30% ",
      "border": true
    }
  ]
}
[/block]

#### Configure message 2

1. **Access message configuration**: Double-click the **Example Message 2** node in your conversation flow
2. **Configure message content**:
   * **Sender**: Select your RCS integration
   * **Title**: Create your message subject line
   * **Description**: Write your main message content
   * **Button name**: Name your options list
   * **List items**: Define the customer selection options
3. **Apply message settings**:
   * **Frequency policy**: Select your relevant frequency policy
   * **Consent**: Choose the appropriate consent category

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/927d9d501f43d29b3b3ea6e937bbf4c34dc981429f05db1e0da977d092038197-RCS_message_responses_adjust.png",
        "",
        ""
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

#### Configure message 3

Follow the same configuration process as Message 2, customizing the content and settings for your third preference-gathering message.

#### Update trigger keywords

After configuring your message content, update the event triggers to match your response options:

1. **Access trigger configuration**: Double-click the **On Event** trigger for Message 2
2. **Remove default keywords**: Delete the placeholder responses ('response 1', 'response 2', 'response 3')

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/26ceaab738c6d66ac456941f1ca0ef14878b6e1282f8983a23becd5f015d1a20-RCS_message_responses_setttings.png",
        "",
        ""
      ],
      "align": "center",
      "sizing": "80% ",
      "border": true
    }
  ]
}
[/block]

3. **Add your keywords**: Input the actual response text from Message 1
4. **Repeat for subsequent messages**: Update triggers for Messages 3 and 4 to match their respective previous message responses

### Set up product recommendation messages

#### Configure recommendation content

1. **Access recommendation node**: Double-click the **Product Recommendation #1** node
2. **Configure message content**:
   * **Sender**: Select your RCS integration
   * **Message**: Write your recommendation message and include the product link
   * **Images**: Contact your customer success manager if you want to include product images (requires additional configuration)
3. **Apply message settings**:
   * **Frequency policy**: Select your relevant frequency policy
   * **Consent**: Choose the appropriate consent category

#### Connect segments to recommendations

1. **Link to customer segments**: Connect your recommendation node to the relevant customer segment within the segmentation node
2. **Create additional recommendations**:
   * Select your configured node and click the 'duplicate' icon
   * Update the message content and settings for each unique customer segment
   * Continue until all segments have corresponding recommendation messages

## Configure customer segmentation

The use case includes two types of segmentations that work together to deliver personalized recommendations:

#### Customer segmentations

The use case creates three primary customer segmentations that encompass all possible response combinations:

* **Initial Response 1**: Customers who selected the first option in Message 1
* **Initial Response 2**: Customers who selected the second option in Message 1
* **Initial Response 3**: Customers who selected the third option in Message 1

Each primary segmentation contains multiple sub-segments representing every possible combination of answers across all three questions (for example: 1,1,1 or 2,4,3).

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/64429c7db8c1a2f7b0419fb836f89d6a32558244e0521ed19f0cd0f544bba91d-RCS_funnel_responses_adjust.png",
        "",
        ""
      ],
      "align": "center",
      "sizing": "80% ",
      "border": true
    }
  ]
}
[/block]

#### Event segmentations

Event segmentations manage the keyword logic centrally, making updates more efficient. These control what responses the customer segmentations look for:

* **Initial Message Response (RCS)**: Defines keywords for Message 1 responses
* **2nd Message Response (RCS)**: Defines keywords for Message 2 responses
* **3rd Message Response (RCS)**: Defines keywords for Message 3 responses

#### Update segmentation keywords

To customize the segmentation for your responses, you only need to update the event segmentations:

1. **Access event segmentations**: Navigate to **Data Manager** > **Definitions** > **Event Segmentation**
2. **Update initial message responses**: Select **Initial Message Response (RCS)** event segmentation
3. **Modify response keywords**: For each **Response** option, update the message field to match your actual response text

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/04b2c6d5daa078c423672496f8936b48f255d605016e86f683919741c5ba3d81-RCS_message_response_1.png",
        "",
        ""
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

4. **Update subsequent messages**: Repeat this process for **2nd Message Response (RCS)** and **3rd Message Response (RCS)** segmentations

> ❗️ Important
>
> You can adjust customer segmentation names ("Initial Response...") but never change event segmentation names ("Initial Message Response").

## Other resources

For additional RCS implementation guidance:

* [RCS integration documentation](https://documentation.bloomreach.com/engagement/docs/rcs)
* [RCS setup for mobile messaging](https://documentation.bloomreach.com/engagement/docs/rcs-setup-for-mobile-messaging)