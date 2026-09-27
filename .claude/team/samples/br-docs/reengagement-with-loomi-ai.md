

---
updatedAt: 2026-09-15T13:22:33.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Compound value: Reengagement with Loomi

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
        <p>Increase in cart recovery rate</p>
    </a>
  </div>
  
  <div class="card-with-icon-wrapper">
     <a class="card-with-icon-item card-with-icon-item-1">
      <div class="icons-wrapper">
      	<img src="https://files.readme.io/9fae711-Group_7036.svg"/>
      	<img src="https://files.readme.io/a8fee62-3._Results.svg" class="icon"/>
      </div>
      <p>Use Case goal: 
        <p>Revenue recovery & margin protection</p>
     
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

[This compound value use case](https://www.bloomreach.com/en/use-cases/reengagement-with-loomi-ai) recovers abandoned carts through personalized messages sent at the right time, on the right channel, for each customer. Loomi handles send time optimization, preferred channel prediction, and discount decisions — maximizing recovery while protecting margin. Adding SMS, web, and mobile app to your abandonment email flow can yield an additional 15%+ uplift in recovered revenue.

### Key features

* **Consent-based omnichannel routing:** Routes each customer to the right channel combination based on their actual consent status — no customer goes unreachable.
* Loomi**&#x20;preferred channel prediction:** For customers with both email and SMS consent, Loomi predicts which channel they're most likely to engage with first.
* **Send time optimization (STO):** Sends every message at the individually optimal time within a 24-hour window, maximizing open and click probability per customer.
* **Contextual personalization for margin protection:** AI-powered testing decides per customer whether to show a discount or not, preventing blanket discounting and protecting margin.
* **3-touch progressive escalation:** Each branch follows a 3-touch pattern with a purchase check between every touch. The sequence stops as soon as a customer converts.
* **Silent hours compliance:** Holds messages during configured silent hours (default: 9pm–9am) to respect customer time and support regulatory compliance.

<Image src="https://files.readme.io/42f429e72c55092705c376df70abbadfd071f5da3cb0667188ce3c5ba5f822c2-Maximize_Re-Engagement_with_Loomi2x.jpg" align="center" border={true} />

## Use case items

With this compound value use case, you'll get a:

* **Abandonment recovery scenario:** The main scenario containing all four consent branches, Loomi predictions, contextual personalization, and the full 3-touch sequence per branch.
* **6 abandoned cart email templates:** Email 1 (soft reminder), Email 2 with discount, Email 2 without discount, Email 3 with discount, Email 3 without discount — built with the BEE Editor using product recommendation blocks.
* **6 abandoned cart SMS templates:** Matching SMS versions for each email touch, with and without discount variants.
* **2 mobile push notification templates:** "Your cart is waiting!" push messages for Android and Huawei.
* **2 web push notification templates:** Browser push notifications with a "Checkout now" action button.
* **2 cart recovery weblayers:** "Complete Your Purchase" weblayer banners — with and without discount variants — for customers without any messaging consent.

## How to deploy the use case

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

**Events required:**

| Event         | Key properties                     | Purpose                          |
| ------------- | ---------------------------------- | -------------------------------- |
| `cart_update` | `product_list` (must have a value) | Triggers the abandonment flow    |
| `purchase`    | `purchase_status = "success"`      | Exits the customer from the flow |

**Consent categories required:**

| Category             | Consent key            | Channel  |
| -------------------- | ---------------------- | -------- |
| Newsletter           | `newsletter`           | Email    |
| Marketing SMS        | `marketing sms`        | SMS      |
| Mobile Notification  | `mobile notification`  | App push |
| Browser Notification | `browser notification` | Web push |

Loomi**&#x20;predictions required:**

| Prediction                                   | Purpose                                                           | Values                                                                                                                           |
| -------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Preferred Channel (`predicted_best_channel`) | Routes Email+SMS customers to their best channel first            | `Email`, `SMS`                                                                                                                   |
| Last Cart Timestamp                          | Verifies the most recent cart update for abandonment confirmation | [Timestamp ](https://documentation.bloomreach.com/engagement/docs/imports-best-practices#use-the-right-timestamp-format)(number) |

**Required&#x20;**Bloomreach**&#x20;packages:** Email Marketing, Loomi Platform (Data Engine), Loomi Journey Personalization (STO, Contextual Personalization).

**Optional packages:** Mobile Messaging (SMS), App Personalization (Push), Web Personalization (Weblayers).

<Callout icon="📘" theme="info">
  ### Note

  A minimum of 30 days of customer engagement history is recommended for accurate STO and channel prediction results.
</Callout>

### Understand the use case logic

The scenario runs as a single flow triggered by `cart_update` events. After entry and qualification, customers split into four branches based on their consent status.

**Entry and qualification**

Before sending any message, the scenario confirms the cart is genuinely abandoned and the customer is reachable:

1. **Trigger:** `cart_update` event with `product_list` having a value.
2. **Wait 2 hours:** Confirms the cart is genuinely abandoned, not a mid-session pause.
3. **Abandonment verification:** Checks that this is still the customer's most recent cart and that no successful purchase has occurred since the cart update.
4. **Known user check:** The customer must have a `registered` ID. Anonymous users stop here — they can't receive personalized messaging.

**Consent-based routing**

Customers who qualify enter one of four branches:

| Branch      | Channels used                                     |
| ----------- | ------------------------------------------------- |
| Email + SMS | Email and SMS, with Loomi channel prediction |
| Email only  | Email                                             |
| SMS only    | SMS                                               |
| No consent  | Mobile push → Web push → Weblayer                 |

**Email + SMS branch**

The most sophisticated branch, using all three Loomi features. Loomi predicts the customer's preferred channel and sends touch 1 there first. Touches 2 and 3 use contextual personalization to decide both the channel and whether to include a discount. Each touch is sent at the customer's individually optimal time via STO, with a purchase check in between.

**Email only and SMS only branches**

Same 3-touch pattern on a single channel. Touch 1 is a soft reminder with no discount. Touches 2 and 3 use contextual personalization to decide whether to include a discount, optimizing for clicks. STO and purchase checks apply between every touch.

**No consent branch**

For customers without email or SMS consent, the scenario tries three channels in order — mobile push, web push, and weblayer — stopping as soon as the customer has consent for one. The weblayer is the last option, shown on the customer's next site visit if no push consent exists.

**Timing strategy**

| Stage                        | Wait duration               | Purpose                                    |
| ---------------------------- | --------------------------- | ------------------------------------------ |
| Initial abandonment          | 2 hours                     | Confirm genuine abandonment                |
| STO window (between touches) | 24 hours                    | Find individually optimal send time        |
| Push wait (between touches)  | 21 hours                    | Slightly shorter for urgency               |
| Silent hours                 | 9pm–9am (customer timezone) | Regulatory compliance and customer respect |

### Adjust the use case

Now that you understand the use case logic, you can set the use case to your needs.

#### Set up event tracking

Verify your project tracks the required cart\_update and purchase events before running the scenario. See [Meet the requirements](https://documentation.bloomreach.com/engagement/docs/reengagement-with-loomi-ai#meet-the-requirements) for the full event and property details.

#### Enable Loomi

* **Send time optimization:** Use the **wait node** in the scenario to send each message at the customer's individually optimal time. STO is also available in SMS and email campaigns under the **Schedule** setting.
* **Preferred channel prediction:** Create a prediction model that outputs `"Email"` or `"SMS"`. Link it to the `predicted_best_channel` condition node by updating the prediction ID.
* **Last cart timestamp expression:** Create an expression that returns the timestamp of the most recent `cart_update` event. Link it to all abandonment verification condition nodes by updating the expression ID.

<Callout icon="🚧" theme="warn">
  ### Warning

  Update all expression and prediction IDs throughout the scenario to match your project's IDs. The demo uses IDs starting with `692dd28...` — these won't work in your project.
</Callout>

#### Configure channels

* **Email:** Set up your email sender. Update `sender_email` and `sender_name` in all email nodes.
* **SMS:** Configure your SMS provider credentials and update the sender field. Update the link shortener domain from `brxdemo.eu` to your own.
* **Mobile push:** Enable mobile push integration. The demo targets Android and Huawei — adjust `target_platforms` in push nodes if you also need iOS. The no consent branch checks `app_version` in the last 3 hours to verify recent app activity before sending.
* **Web push:** Configure browser push notifications. Update the icon URL and action URL in push nodes.

#### Configure contextual personalization

The scenario uses contextual personalization to decide whether to show a discount — and in the Email + SMS branch, which channel to use. Open each node and verify the paid media consent corresponds to consent in your project, then review the variant setup:

* **Email + SMS branch, touch 2:** 80% AI-decided, 20% manual A/B. Five variants mixing email and SMS, with and without discount. Update the segmentation and aggregate IDs to your project's equivalents.
* **Email only and SMS only branches, touch 2 and 3:** 80% AI-decided, 20% manual A/B. Two variants — with discount and without discount.
* **Email + SMS branch, touch 3:** 100% AI-decided. By this point the AI has enough data from touches 1 and 2 to make confident per-customer decisions — no manual split needed.
* **No consent branch, weblayer:** 2 variants — with discount and without discount.

#### Configure silent hours

The scenario holds messages during silent hours to respect customer time. The default is 9pm–9am in the US/Pacific timezone, adapting to the customer's local timezone.

Update the timezone and hours to match your customer base:

* **European brands:** Consider 10pm–8am in the customer's local timezone.
* **Global brands:** `adapt_to_customer_timezone` is enabled by default — verify this is on.

#### Review frequency policy

* **Email:** Uses the default frequency policy — respects your project's global frequency cap.
* **SMS:** Uses an unlimited policy — consider adding a cap if your customers are sensitive to SMS volume.
* **Push:** Uses an unlimited policy.

#### Customize email design and copy

* `logo_image_url`, company name, and navigation links — set via project variables.
* Email subject line (default: "Your cart is waiting for you!").
* Recommendation block ID — update to match your project's recommendation model.
* Discount offer value and copy in discount variants.

#### Customize SMS templates

* Default message: "Your cart items are waiting for you! Don't miss out!"
* Add cart item details, discount codes, and cart deep links.
* Update the link shortener domain from `brxdemo.eu` to your own.

#### Customize weblayer

* Update the banner link to your cart page URL.
* Adjust colors: `backgroundColor`, `bodyTextColor`, `headerTextColor`.
* By default the weblayer triggers on any page — consider restricting it to product or cart pages only.

### Test and run the use case

Test a use case before deploying it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-banner-in-the-use-case-center) ensures you don't send unfinished or imperfect campaigns to your customer base.

#### Test event tracking

1. Add items to cart on your site.
2. Verify the `cart_update` event appears in the customer profile with `product_list` populated.
3. Complete a purchase and verify the `purchase` event appears with `purchase_status = "success"`.

#### Test abandonment verification

1. Add items to cart and wait 2+ hours without purchasing.
2. Verify the customer enters the scenario in the Evaluate tab.
3. Complete a purchase and verify the customer exits at the next purchase check.

#### Test consent routing

Create test customers with different consent combinations and verify each enters the correct branch:

* Email + SMS consent → Email + SMS branch.
* Email consent only → Email only branch.
* SMS consent only → SMS only branch.
* No consent → No consent branch (push or weblayer).

#### Test Loomi features

* **Channel prediction:** In the Email + SMS branch, verify that `predicted_best_channel` correctly routes customers to the email-first or SMS-first path.
* **Contextual personalization:** After sufficient traffic (100+ customers per variant recommended), check the contextual personalization node's performance tab to confirm the AI is learning.
* **Silent hours:** Trigger the scenario for a test customer during silent hours (after 9pm) and verify the message is held until the next morning.

#### Run the use case

Once testing is complete, start the scenario in production. Monitor the first 48 hours for delivery rates, open rates, and click rates per branch. After 14 days, review contextual personalization results (discount vs. no-discount) and overall recovery rate.

## Advanced setup
reengagement-with-loomi-ai
**Multi-industry application**

The scenario works beyond retail by changing the trigger and purchase check events to match your industry's funnel:

| Industry | Trigger event       | "Cart" equivalent    |
| -------- | ------------------- | -------------------- |
| Retail   | `cart_update`       | Standard cart        |
| Travel   | `booking_search`    | Booking abandonment  |
| Finance  | `application_start` | Application drop-off |
| Telco    | `plan_configure`    | Plan selection       |

**Browse abandonment variant**

Duplicate the scenario and adjust:

* **Trigger:** `view_item` event with a minimum of 3+ views in a session and no `add_to_cart`.
* **Messaging:** Shift from "You left items in your cart" to "Still interested in \[category]?"
* **Initial wait:** 4–6 hours instead of 2.
* **Recommendations:** Use "Similar to viewed" instead of "Items in cart."

**Cost optimization**

The progressive escalation design minimizes cost by starting with the cheapest effective channel and only moving to higher-cost channels when needed. Purchase checks between every touch prevent wasted sends.

| Channel  | Typical recovery rate |
| -------- | --------------------- |
| Email    | 3–5% per touch        |
| SMS      | 5–8% per touch        |
| Push     | 2–4% per touch        |
| Weblayer | 1–2% (passive)        |

**Product recommendations**

The email templates include product recommendation blocks. Update the recommendation ID in the email template to match your project's recommendation model. Use "Items in cart" or "Similar to viewed" recommendation templates for best relevance.