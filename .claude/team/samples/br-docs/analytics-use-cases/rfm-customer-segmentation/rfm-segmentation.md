---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# RFM customer segmentation

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
        <p>Insights into CLTV</p>
    </a>
  </div>
  
  <div class="card-with-icon-wrapper">
     <a class="card-with-icon-item card-with-icon-item-1">
      <div class="icons-wrapper">
      	<img src="https://files.readme.io/9fae711-Group_7036.svg"/>
      	<img src="https://files.readme.io/a8fee62-3._Results.svg" class="icon"/>
      </div>
      <p>Use Case goal: 
        <p>Insights</p>
     
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

[RFM Segmentation](https://www.bloomreach.com/en/products/engagement/plug-and-play/rfm-segmentation) visualizes value trends in your customer base with an automated dashboard. It includes a best-practice RFM segmentation to segment and trigger marketing campaigns to drive Customer Loyalty and Revenue Per Visitor. RFM segmentation helps to distinguish where your revenue comes from and which customers are your core audience. By segmenting your customer base according to the RFM factors (Recency, Frequency, Monetary), you’ll get a holistic overview, which allows for better targeting of campaigns at customers based on how loyal they are to the brand and hence increase upsell, RVP and other essential metrics.

<Image src="https://files.readme.io/74a615b-LRFM-RFM-segmentation.gif" align="center" />

## Use case items

With this use case, you’ll get an:

* RFM scenario

* **Evaluation dashboard**: A comprehensive dashboard provides insights into user behavior, campaign performance, and overall engagement metrics. The dashboard allows you to evaluate the effectiveness of your marketing strategies and make data-driven decisions.

<Embed title="" typeOfEmbed="youtube" url="https://www.youtube.com/watch?v=ABbyPTwmLTU" href="https://www.youtube.com/watch?v=ABbyPTwmLTU" html="%3Ciframe%20class%3D%22embedly-embed%22%20src%3D%22%2F%2Fcdn.embedly.com%2Fwidgets%2Fmedia.html%3Fsrc%3Dhttps%3A%2F%2Fwww.youtube.com%2Fembed%2FABbyPTwmLTU%3Ffeature%3Doembed%26display_name%3DYouTube%26url%3Dhttps%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DABbyPTwmLTU%26image%3Dhttps%3A%2F%2Fi.ytimg.com%2Fvi%2FABbyPTwmLTU%2Fhqdefault.jpg%26key%3D7788cb384c9f4d5dbbdbeffd9fe4b92f%26type%3Dtext%2Fhtml%26schema%3Dyoutube%22%20width%3D%22854%22%20height%3D%22480%22%20scrolling%3D%22no%22%20title%3D%22YouTube%20embed%22%20frameborder%3D%220%22%20allow%3D%22autoplay%3B%20fullscreen%3B%20encrypted-media%3B%20picture-in-picture%3B%22%20allowfullscreen%3D%22true%22%3E%3C%2Fiframe%3E" />

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

<Callout icon="🚧" theme="warn">
  ### Important

  This RFM scenario requires 18 available customer attributes to function properly. Ensure your project has sufficient attribute capacity before deployment, as insufficient attributes can cause implementation issues.
</Callout>

### Understand the use case logic

All customers with at least one purchase are segmented based on the Recency, Frequency, and Monetary value of their purchases. The RFM segmentation allows for better targeting of campaigns based on how loyal the customers are to the brand and hence increases upsell, CLTV, and RVP.

The scenario runs `2` times per month for all customers with at least one purchase. The **'Initial flow'** ensures the first data load on all customers, and the **'Repeat flow'** tracks incremental changes.

The RFM segment is tracked under customer property `rfm_segment`. If the customer changed the segment, the previous value would be tracked under the customer property `previous_rfm_segment` allowing us to see the movements between segments.

Going more in-depth, the Initial flow assigns recency\_score, frequency\_score, and monetary\_score as customer properties based on their positioning in recency, frequency, and monetary reports per the Jinja below.

```json Jinja
{# Calculating the RFM segments #}
{% set recency_score = 1
  if r_value < r_report.rows [3][3]
  else (2 if r_value < r_report.rows [2][3]
  else (3 if r_value < r_report.rows [1][3]
  else (4 if r_value < r_report.rows [0][3]
  else (5 if r_value > r_report.rows [1][3] ))))%}

{% set frequency_score = 1
  if f_value < f_report.rows [1][3]
  else (2 if f_value < f_report.rows [2][3]
  else (3 if f_value < f_report.rows [3][3]
  else (4 if f_value < f_report.rows [4][3]
  else (5 if f_value > f_report.rows [3][3] ))))%}

{% set monetary_score = 1
  if m_value <= m_report.rows [0][3]
  else (2 if m_value <= m_report.rows [1][3]
  else (3 if m_value <= m_report.rows [2][3]
  else (4 if m_value <= m_report.rows [3][3]
  else (5 if m_value > m_report.rows [3][3] ))))%}
```

<br />

Based on the individual scores, a rfm\_score is populated, where the \~ operator joins the neighboring scores as strings and concatenates (e.g., recency\_score = 3, frequency\_score = 2, monetary\_score = 1 -> rfm\_score = 321).

```json Jinja
{% set rfm_score = recency_score ~ frequency_score ~ monetary_score %}
{% set rfm_score = rfm_score | int %}
```

<br />

Once these values are populated, a relevant customer segment (rfm\_segment) is assigned to a customer based on the RFM group; see the values checking customer profiles.

<Table align={["left","left"]}>
  <thead>
    <tr>
      <th>
        Customer segment
      </th>

      <th>
        Scores
      </th>
    </tr>
  </thead>

  <tbody>
    <tr>
      <td>
        1. Champions
      </td>

      <td>
        555, 554, 544, 545, 454, 455, 445
      </td>
    </tr>

    <tr>
      <td>
        2. Loyal
      </td>

      <td>
        543, 444, 435, 355, 354, 345, 344, 335
      </td>
    </tr>

    <tr>
      <td>
        3. Potential loyalist
      </td>

      <td>
        553, 551, 552, 541, 542, 533, 532, 531, 452, 451, 442, 441, 431, 453, 433, 432, 423, 353, 352, 351, 342, 341, 333, 323
      </td>
    </tr>

    <tr>
      <td>
        4. New customers
      </td>

      <td>
        512, 511, 422, 421, 412, 411, 311
      </td>
    </tr>

    <tr>
      <td>
        5. Promising
      </td>

      <td>
        525, 524, 523, 522, 521, 515, 514, 513, 425, 424, 413, 414, 415, 315, 314, 313
      </td>
    </tr>

    <tr>
      <td>
        6. Need attention
      </td>

      <td>
        535, 534, 443, 434, 343, 334, 325, 324
      </td>
    </tr>

    <tr>
      <td>
        7. About to sleep
      </td>

      <td>
        331, 321, 312, 221, 213, 231, 241, 251
      </td>
    </tr>

    <tr>
      <td>
        8. Cannot lose them but losing
      </td>

      <td>
        155, 154, 144, 214, 215, 115, 114, 113
      </td>
    </tr>

    <tr>
      <td>
        9. At risk
      </td>

      <td>
        255, 254, 245, 244, 253, 252, 243, 242, 235, 234, 225, 224, 153, 152, 145, 143, 142, 135, 134, 133, 125, 124
      </td>
    </tr>

    <tr>
      <td>
        10. Hibernating customers
      </td>

      <td>
        332, 322, 233, 232, 223, 222, 132, 123, 122, 212, 211
      </td>
    </tr>

    <tr>
      <td>
        11. Losing but engaged<br />(last email `campaign clicked` in the last 180 days or last `session_start` in the last 90 days)
      </td>

      <td>
        111, 112, 121, 131, 141, 151
      </td>
    </tr>

    <tr>
      <td>
        12. Lost customers
      </td>

      <td>
        111, 112, 121, 131, 141, 151
      </td>
    </tr>
  </tbody>
</Table>

#### How scenario calculates the segments

The scenario turns the recency, frequency, and monetary aggregates and transforms them into customer properties, which can be seen in a report for each. The segments are then determined from these values using the following [table](https://docs.google.com/spreadsheets/d/1MDq0rnL-SoVduZ3_9id_SWiB_eM5Gp6A4JTW3ZUPMq4/edit#gid=1754925540).

By default, the RFM scenario runs every month to ensure the RFM segmentation is up to date with the recent changes in your customer base. However, feel free to adjust the repeat trigger node to more closely match your requirements (for example, repeat every day) if you wish to have most up-to-date information.

### Test and run the use case

Test a use case before deploying it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-banner-in-the-use-case-center) ensures you don't send unfinished or imperfect campaigns to your customer base.

Once the testing is over, run the use case. Open the banner and click **Start** to launch the campaign.

### Evaluate the results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt [evaluation dashboard](https://documentation.bloomreach.com/engagement/docs/how-to-evaluate-a-use-case-in-the-use-case-center) to measure and analyze relevant data.

#### Calculate key metrics

Customers that made a purchase where the following conditions are matched:

* purchase\_status = success
* total\_price > 0
* CLTV is calculated from the total\_price attribute of the purchase event

The RFM segmentation works by dividing the customers based on their Recency, Frequency, and Monetary (RFM) scores. It does so in relative terms, creating percentual parts of your customer base. Through this, you will be able to see how different customers fall within different R F M values, and these then get calculated into overall RFM segments. The segmentation can be used for marketing campaigns to drive Customer Loyalty and RPV.

Find more information and related action steps regarding different segments of your customers calculated based on the RFM score in the RFM Dashboard.

#### Known limitations

This is a dynamic RFM Use Case. This means the RFM segments are updated monthly based on your customer base dynamics.

Dynamic RFM is editable; however, for all intents and purposes, it's designed as a "ready-to-use" black-box tool. It's built as a best-practice use case. It automatically slices your customer base into quantiles and automatically assigns the segments for each customer based on these quantiles.

Dynamic RFM is editable but due to its design, it is not easy to make changes on these assignments.

### Enhance your scenario

Include other key metrics that the client business is evaluating regularly and put them into perspective of the various CLV groups.

### For advanced users

As mentioned above, Dynamic RFM is editable but due to its design, it is not easy to make changes on these assignments.

If you want to make changes; you need to understand:

1. How the portfolio is sliced in the Recency Report, Frequency Report and Monetary Report; all of which can be found in this use case's initiative folder.
2. How each customer's recency, frequency and lifetime value is calculated via Recency Aggregate, Frequency Aggregate and Monetary Aggregate; all of which can be found in this use case's initiative folder.
3. How the **Set attribute&#x20;**&#x6E;ode in the RFM Scenario assigns numeric scores to each customer based on their position within the reports — the Jinja logic that drives this is described in the [Understand the use case logic](#understand-the-use-case-logic) section above. The scenario can be found in this use case's initiative folder with the name "RFM Scenario".
4. How the numeric assignments are used to assign the final RFM segment via the segmentation asset called "RFM", which can be found in this use case's initiative folder.

## Reports

To compare your reports more efficiently, you can set the maximum/minimum limits for both primary and secondary axes. For more detailed information, see the documentation.

Observe movements in the segments in RFM Segments - Bloomreach segmentation.

The values in this segment are calculated from an expression, which pulls out values from yet another segmentation. These segmentations contain a dynamic condition - for example, recency aggregate (value on a customer profile) is less than r\_score\_2\_threshold, a customer attribute pulled from a recency report.

The threshold values can change over time based on the customer base purchase behavior. Usually, they would be a static value in a report, but given that these customer attributes are populated with every scenario run, it's done automatically.

Once you collect enough data, you can observe the segment movements in different time frames over time.