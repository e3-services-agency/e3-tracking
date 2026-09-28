---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# WhatsApp interactive product recommendation flow

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Advanced</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Increase in revenue</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Retention</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

## Use case description

The [WhatsApp interactive product recommendation](https://www.bloomreach.com/en/products/engagement/plug-and-play/whatsapp-interactive-product-recommendation-flow) flow enables you to create personalized shopping experiences through conversational messaging. This use case transforms traditional product discovery by engaging customers in interactive conversations that capture their preferences and deliver tailored product recommendations.

Customers receive WhatsApp messages with quick-reply buttons that guide them through a preference-gathering journey. Based on their responses, the system automatically segments customers and delivers personalized product recommendations that align with their stated needs. This approach creates a win-win scenario: you collect valuable zero-party data while customers receive curated product suggestions that help them find what they're looking for more efficiently.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/c40991c02088df2e3a6ae51937d8a1167738131ec727c03efe186dcec1ce88d0-Whatsapp_Automated_Response_Flow-02.png",
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

* **Interactive messaging flow**: Multi-step WhatsApp conversation with quick-reply buttons
* **Automatic segmentation**: Dynamic customer grouping based on response combinations
* **Zero-party data collection**: Direct preference capture through customer interactions
* **Personalized recommendations**: Targeted product suggestions based on collected preferences
* **Event tracking**: Comprehensive response monitoring through campaign events
* **Flexible configuration**: Customizable message count and response options

## Use case items

When you deploy this use case, you'll receive:

* **WhatsApp response flow**: Complete multi-message conversation sequence
* **Segmentation structure**: Pre-built customer segments covering all response combinations

## How to deploy the use case

### Prerequisites

Before implementing this use case, ensure you have:

* **WhatsApp integration**: Active WhatsApp Business API integration in your Bloomreach project
* **Link shortener**: Required module for WhatsApp functionality (the use case can't be deployed without this module)
* **Template approval**: Access to create and deploy WhatsApp message templates

> 📘 Need assistance?
>
> Contact your Customer Success Manager if you need to add WhatsApp as a channel or have integration questions.

### Understanding the flow logic

The recommendation flow works through a structured conversation process:

1. **Initial engagement**: Existing customers receive a WhatsApp template message with quick-reply buttons asking about their preferences.
2. **Response collection**: Customer selections trigger the next message in the sequence, with each response recorded as a campaign event.
3. **Preference gathering**: The flow continues through multiple questions (default: 3 messages) to build a complete preference profile.
4. **Recommendation delivery**: Based on collected responses, customers receive a final message with personalized product recommendations.

#### Response tracking

Customer responses are tracked as campaign events with these specifications:

* **Action type**: `whatsapp`
* **Status**: `incoming_message`
* **Message field**: Contains the customer's actual response text

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/acadbe90517099f0cfe2be37b3c42d9ee73f0f1cc3969e312a3ec96c57019306-WhatsApp_prod_reco_flow_-_campaign_event.png",
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

### Set up WhatsApp templates

#### Create your initial template

1. **Download the template form**: Copy this [template creation form](https://docs.google.com/spreadsheets/d/1NHWcMH5kiI6i_S9ANh_rXrr4dCveh8AL/edit?usp=sharing\&ouid=102104427952135996362\&rtpof=true\&sd=true)
2. **Complete template details**: Fill out the message template portion with your specific content
3. **Submit for creation**: Send the completed form to your Customer Success Manager for template approval and creation

#### Configure the initial message

1. **Access message settings**: Double-click the **Initial message** node in your flow
2. **Set up sender and template**:
   * **Sender**: Select your WhatsApp integration
   * **Template**: Choose the template created in the previous step
   * **Dynamic content**: Fill in any variable portions of your template
3. **Configure message settings**:

* **Frequency policy**: Select your relevant frequency policy
* **Consent**: Choose the appropriate consent category

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/dc9cd4662c36af90c3b93f9f26503c2e3add860d04c20b1b6061e90122c0f301-WhatsApp_prod_reco_flow_-_example_message.png",
        "",
        ""
      ],
      "align": "center",
      "sizing": "30% ",
      "border": true
    }
  ]
}
[/block]

#### Set up message 2

1. **Choose message type**: Select either List Message or Choice Message format
   * Delete the unused node type
   * Connect the selected node to your flow
2. **Configure creative content**:
   * **Sender**: Select your WhatsApp integration
   * **Title**: Write your message subject
   * **Description**: Add your main message content
   * **Button name**: Name your options list
   * **List items**: Create your customer selection options
3. **Apply message settings**:
   * **Frequency policy**: Select your relevant frequency policy
   * **Consent**: Choose the appropriate consent category

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/5d4f469ccd14cad8bfd6d50d7fcaa7a0dfcc68ffe5e3f91e828320e5ca4283f2-WhatsApp_prod_reco_flow_-_message_2-4.png",
        "",
        ""
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

#### Set up message 3

Repeat the same configuration process as Message 2, customizing the creative content and settings for your third preference-gathering message.

#### Update trigger keywords

After configuring your message content, update the event triggers to match your response options:

1. **Access trigger settings**: Double-click the **On Event** trigger for Message 2
2. **Remove default keywords**: Delete 'response 1', 'response 2', and 'response 3'

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/de54109b74fe40892ab4ab013d2b8b384a2bac7f1064da83f66f96e8c1501ce7-WhatsApp_prod_reco_flow_-_trigger_update.png",
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
2. **Set up creative content**:
   * **Sender**: Select your WhatsApp integration
   * **Message**: Write your recommendation message and include the product link
   * **Images**: Contact your Customer Success Manager if you want to include product images (requires template creation)
3. **Apply message settings**:
   * **Frequency policy**: Select your relevant frequency policy
   * **Consent**: Choose the appropriate consent category

#### Connect segments to recommendations

1. **Link to segments**: Connect your recommendation node to the relevant customer segment in the segmentation node
2. **Create additional recommendations**:
   * Select your configured node and click the 'duplicate' icon
   * Update the creative content and settings for each unique segment
   * Repeat until all segments have corresponding recommendation messages

### Configure segmentation

The use case includes two types of segmentations that work together to deliver personalized recommendations:

#### Customer segmentations

The use case creates three primary customer segmentations that encompass all possible response combinations:

* **Initial Response 1**: Customers who selected the first option in Message 1
* **Initial Response 2**: Customers who selected the second option in Message 1
* **Initial Response 3**: Customers who selected the third option in Message 1

Each initial segmentation contains multiple sub-segments representing every possible combination of answers across all three questions (for example: 1,1,1 or 2,4,3).

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/821d652325ea921fd7734fccbc0cd5bbc0938cef96ca5e32b97f07d5bcd0e1b1-WhatsApp_prod_reco_flow_-_segmentation.png",
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

* **Initial Message Response (WhatsApp)**: Defines keywords for Message 1 responses
* **2nd Message Response (WhatsApp)**: Defines keywords for Message 2 responses
* **3rd Message Response (WhatsApp)**: Defines keywords for Message 3 responses

#### Update segmentation keywords

To customize the segmentation for your responses, you only need to update the event segmentations:

1. **Access event segmentations**: Navigate to **Data Manager** > **Definitions** > **Event Segmentation**
2. **Update initial message responses**: Select **Initial Message Response (WhatsApp)** event segmentation
3. **Modify response keywords**: For each 'Response' option, update the message field to match your actual response text

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/7f190ea2cd18f7b4a296aa229e57b9fc803e4c916f4e91ef14f56007fa1a5891-WhatsApp_prod_reco_flow_-_response_update.png",
        "",
        ""
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

4. **Update subsequent messages**: Repeat this process for '2nd Message Response (WhatsApp)' and '3rd Message Response (WhatsApp)' segmentations

> ❗️ Important
>
> You can adjust customer segmentation names ("Initial Response...") but never change event segmentation names ("Initial Message Response").

## Other resources

For additional WhatsApp implementation guidance:

* [WhatsApp integration documentation](https://documentation.bloomreach.com/engagement/docs/whatsapp)
* [Create WhatsApp messages guide](https://documentation.bloomreach.com/engagement/docs/create-whatsapp-messages)