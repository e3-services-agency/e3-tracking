# Use case library: Use Case Center extension (T-4-07)

`.claude/team/samples/use-case-library-ucc.json` is a second `e3-use-case-library` v1 file (D-47,
D-55, D-57), built from the Bloomreach Use Case Center documentation stored in
`samples/br-docs/use-case-center/<section>/` (email, web personalization, omnichannel, mobile
messaging, paid media, analytics). It imports through the same
`src/domain/import/useCaseLibrary.ts` parser and `use-case-templates` preview/apply routes as
`use-case-library-sample.json`; the two files are independent and can both be imported into the
global template library. It parses with zero warnings, has 86 templates with unique
`UCC-<section>-<nn>` codes, and every requirement targets a Bloomreach standard event, standard
customer property, main-catalog field, or standard consent key (D-55) — never a literal client
event name.

A template's `default_requirements` cover only what this app can express with the five requirement
target kinds plus `catalog_attribute`/`consent` (D-57): events, event/variant properties, customer
properties, catalog attributes and consents. Where a Use Case Center page's logic depends on a
Bloomreach aggregate, recommendation engine, prediction, or another non-tracking asset (evaluation
dashboards, AI segments, ad-platform syncs), the template keeps only the tracking-side
requirements — the events and properties that feed that asset — and the `description` field says
so explicitly, plus which page's requirements section to read for the rest.

Requirement levels: `R` (required) mirrors the source page's own requirements section or its
described trigger condition; `O` (optional) marks a secondary or suppression signal (for example a
`checkout` event that stops a cart-abandonment message once checkout has started).

### `target_kind` for the triggering event

A `variant`/`variant_property` requirement resolves through the project's standard event mapping,
including its filter condition (D-55); an unfiltered/unconditioned `variant` with no matching
mapping resolves to a permanent `gap`, because the mapping step has no variant to offer (there is
no bare-event picker for a `variant` target). Only `add_to_cart` and `purchase` carry a
condition-bearing standard mapping on the fixture project and in typical client data (a cart
"add" action, a successful purchase status), so those two standard events are the only ones this
library targets with `variant`/`variant_property`. Every other standard event used here
(`view_item`, `search`, `return_item`, `returned_purchase`) is a plain occurrence check with no
natural discriminator, so its requirements use `event`/`event_property` instead — these resolve
through the mapping's event and client event name alone, with no variant needed.

Every `variant`/`variant_property` requirement also carries an explicit `condition` (`add_to_cart`:
`{property_name: "action", value: "add"}`; `purchase`: `{property_name: "purchase_status", value:
"success"}`) so it still resolves through `use-case-template.dal.ts`'s exact-condition variant
fallback on a project whose standard event mapping itself carries no variant, not only through the
mapping.

### Tags: derived from each page's own header badges, not inferred

Every template's `tags` come from the three badges at the top of its Use Case Center page ("Use
Case maturity", "What to expect", "Use Case goal") plus an explicit "Industry:" line where the page
has one — never guessed from the page title or category. The mapping tables below are applied
uniformly so the same badge word always produces the same tag; where a badge phrase has no close
match in the D-57 vocabulary, the nearest kpi implied by the page's own subject is used and, on the
handful of templates where that is not obvious (`UCC-omni-05`, `UCC-analytics-01/02/04/05/06/07/08/09/11`),
noted here rather than per template.

**Tier** (`Use Case maturity`): `Basic` -> `essentials`; `Advanced` -> `advanced`; `Champion` ->
`advanced` (the vocabulary has no separate top tier for "Champion"; treated as the top of the
`advanced` bucket). `loyal_ai`, `sustainability` and `omnichannel` are used only where a page's own
badge literally names them — none of the 86 source pages do, so no template carries those three
tier values.

**Goal** (`Use Case goal`): `Acquisition` -> `acquire_customers`; `Retention` -> `increase_retention`;
`Performance` -> `drive_traffic`; `Insights` / `Analytics` -> `analyze_data`; `Grow database` ->
`grow_database`; `Drive traffic/Acquisition` -> `drive_traffic`.

**KPI** (`What to expect`, free text): `RPV` / `Revenue per visitor` -> `revenue_per_visitor`;
`ROI` -> `revenue`; `AOV` -> `average_order_value`; `CLTV` / `CLV` -> `cltv`; `Conversion rate(s)` /
`CTR` -> `conversion_rate`; `Lead generation` / `Active subscriber base` -> `active_subscribers`;
`Purchase Frequency` -> `purchase_frequency`; `Return rate(s)` / `ROI` on a returns page -> `return_rate`;
plain `Revenue` -> `revenue`. A few pages use a vaguer phrase with no direct vocabulary match
("get data insights", "Strategic insights", "Higher customer satisfaction", "Customer
segmentation", "Deliverability metrics"); those templates carry the single kpi value closest to the
page's own subject: `UCC-omni-05` Product expiration reminder's "Higher customer satisfaction" ->
`purchase_frequency`, as a repeat-purchase proxy; `UCC-analytics-01` Apple Mail segmentation's
"Customer segmentation" -> `active_subscribers`; `UCC-analytics-02` Black Friday's "get data
insights" -> `revenue`, since the page is revenue-focused; `UCC-analytics-04` CLTV dashboard's
"Strategic insights" -> `cltv`, from the page's own title; `UCC-analytics-05` Email deliverability's
"Deliverability metrics" -> `active_subscribers`, the closest subscriber-health proxy; `UCC-analytics-06`
Email performance's "Learn more about your active subscriber base" -> `active_subscribers`;
`UCC-analytics-07` Executive dashboard's "get data insights" -> `revenue`, an executive summary's
usual headline metric; `UCC-analytics-08` Key customer segments' "get data insights" ->
`purchase_frequency`, from the page's own segment-by-purchase-history subject; `UCC-analytics-09`
Returned items' "Get data insights" -> `return_rate`, from the page's own title; `UCC-analytics-11`
Time zone segmentation's "Strategic insights" -> `active_subscribers`, the closest send-time-relevant
metric. Where a badge lists several KPIs (`UCC-analytics-03` Conversion dashboard: "Insights into
RPV, AOV, Revenue"), all matching vocabulary values are kept (`kpis` is an array).

## Email (24, `samples/br-docs/use-case-center/email-use-cases/`)

Every email template's page checks `emailing`/newsletter consent in its trigger logic, so every one
carries `consent newsletter R` in addition to what is listed below.

| Code | Name | Prerequisites |
| --- | --- | --- |
| UCC-email-01 | Abandoned browse email | `view_item` (`product_id`), customer email |
| UCC-email-02 | Abandoned cart email with recommendations | `add_to_cart` (`product_id`, `total_price`), customer email |
| UCC-email-03 | Abandoned search email flow | `search` or `view_item`, customer email |
| UCC-email-04 | Automated favorite brand newsletter with new items | `purchase`, `view_item` (`category_level_1`), customer email |
| UCC-email-05 | Automated newsletter for new items of interest | `view_item` (`category_level_1`), customer email |
| UCC-email-06 | Automated price drop alert email for items in cart | `add_to_cart` (`product_id`, `price`), catalog `price`, customer email |
| UCC-email-07 | Automated price drop email alert | `view_item` (`product_id`, `price`), catalog `price`, customer email |
| UCC-email-08 | Automated restock email alert | `view_item` (`product_id`, `stock_level`), customer email |
| UCC-email-09 | Bi-weekly product recommendation newsletter | `purchase`, customer email |
| UCC-email-10 | Birthday campaign | customer `birthday`, email |
| UCC-email-11 | Personalized abandoned cart email | `add_to_cart` (`product_id`, `total_price`), customer email |
| UCC-email-12 | Post-cancellation follow-up email flow | `returned_purchase` (`purchase_status`, `purchase_id`), customer email |
| UCC-email-13 | Post-holiday feedback | `purchase` (`purchase_id`), customer email |
| UCC-email-14 | Post-purchase email with recommendations | `purchase` (`purchase_id`), `purchase_item` (`product_id`), customer email |
| UCC-email-15 | Post-purchase NPS survey email | `purchase` (`purchase_id`), customer email |
| UCC-email-16 | Pre-travel engagement email flow | `purchase` (`purchase_id`), customer email |
| UCC-email-17 | Purchase anniversary recommendations | `purchase` (`purchase_id`), customer email |
| UCC-email-18 | Reactivation campaign for disengaged email subscribers | customer email |
| UCC-email-19 | Reactivation campaign for lapsing and lapsed | `purchase` (`purchase_id`), customer email |
| UCC-email-20 | Refer-a-friend campaign | customer email |
| UCC-email-21 | Refill reminder email campaign | `purchase`, `purchase_item` (`product_id`), customer email |
| UCC-email-22 | Retention campaign for repeat purchasers | `purchase` (`purchase_id`), customer email |
| UCC-email-23 | Weather-influenced campaign | customer email only (the page derives location from `session_start` SDK events and a webhook-fed weather catalog, both outside tracking; see the template description) |
| UCC-email-24 | Welcome flow | customer email |

## Web personalization (28, `samples/br-docs/use-case-center/web-personalization-use-cases/`)

| Code | Name | Prerequisites |
| --- | --- | --- |
| UCC-web-01 | Abandoned browse banner with recommendations | `view_item` (`product_id`) |
| UCC-web-02 | Abandoned browse banner | `view_item` (`product_id`) |
| UCC-web-03 | Abandoned cart banner | `add_to_cart` (`product_id`, `total_price`) |
| UCC-web-04 | AI-segmented single opt-in email subscription banner | newsletter consent, customer email |
| UCC-web-05 | Banner notification for customers with high return rates | `view_item` (`product_id`) — the page body describes the same per-product trigger as UCC-web-06, despite the customer-level title; see the template description |
| UCC-web-06 | Banner notification for frequently returned items | `view_item` (`product_id`) |
| UCC-web-07 | Birthday reminder banner | customer `birthday` |
| UCC-web-08 | Browser tab animation | `add_to_cart` |
| UCC-web-09 | Cart consolidation banner | `add_to_cart` (`product_id`) |
| UCC-web-10 | Customizable customer acquisition weblayer | customer email |
| UCC-web-11 | Discount countdown banner | catalog `discount_percentage` only (site-wide trigger, not per product; `view_item` is optional for a per-product variant) |
| UCC-web-12 | Easy access discount code banner | customer email, `add_to_cart` (both optional) |
| UCC-web-13 | Gamified banners with email collection | newsletter consent, customer email |
| UCC-web-14 | Gamified banners | `view_item` (optional) |
| UCC-web-15 | Global and product-specific badges | catalog `item_id` (custom boolean badge columns are a per-client Data Manager configuration, not expressible here) |
| UCC-web-16 | Interactive post-purchase feedback banner | `purchase` (`purchase_id`) |
| UCC-web-17 | Interactive subscriber banner | newsletter consent, customer email |
| UCC-web-18 | Location-based social proof banner | `view_item` (`product_id`) |
| UCC-web-19 | Multistep zero-party data banner | customer email, newsletter consent (both optional) |
| UCC-web-20 | Next-day delivery countdown banner | `add_to_cart` (`product_id`), catalog `stock_level` (optional) |
| UCC-web-21 | On-exit mobile banner | `add_to_cart` (`product_id`) |
| UCC-web-22 | Previous searched destination reminder | `view_item` (the page's own logic targets a recently viewed item, not a search) |
| UCC-web-23 | Quiz banner with product recommendations | customer email (optional), `view_item` (optional) |
| UCC-web-24 | Recommendations carousel banner | `view_item` (`product_id`) |
| UCC-web-25 | Single opt-in subscription banner | newsletter consent, customer email |
| UCC-web-26 | Social proof banner | `view_item` (`product_id`) |
| UCC-web-27 | YouTube video banner | `view_item` (`product_id`) |
| UCC-web-28 | Zero-party data banner | customer email (optional) |

## Omnichannel (8, `samples/br-docs/use-case-center/omnichannel-use-cases/`)

| Code | Name | Prerequisites |
| --- | --- | --- |
| UCC-omni-01 | Email and SMS reactivation campaign | `purchase` (`purchase_id`), customer email, newsletter consent |
| UCC-omni-02 | Omnichannel abandoned cart flow | `add_to_cart` (`product_id`, `total_price`), customer email, newsletter consent |
| UCC-omni-03 | Omnichannel post-purchase NPS survey | `purchase` (`purchase_id`), customer email |
| UCC-omni-04 | Personalized reengagement journey | `purchase`, customer email, newsletter consent |
| UCC-omni-05 | Product expiration reminder | `purchase`, `purchase_item` (`product_id`), customer email |
| UCC-omni-06 | Reactivation campaign for promising and needs-attention segments | `purchase` (`purchase_id`), customer email, newsletter consent |
| UCC-omni-07 | Reactivation of lapsing customers with contextual personalization | `purchase`, customer email |
| UCC-omni-08 | RFM omnichannel winback campaign | `purchase` (`total_price`), customer email |

## Mobile messaging (10, `samples/br-docs/use-case-center/mobile-messaging-use-cases/`)

| Code | Name | Prerequisites |
| --- | --- | --- |
| UCC-mobile-01 | Abandoned browse SMS | `view_item` (`product_id`), customer phone, SMS consent |
| UCC-mobile-02 | Mobile SMS subscription banner | customer phone, SMS consent |
| UCC-mobile-03 | RCS interactive product recommendation flow | customer phone, SMS consent |
| UCC-mobile-04 | SMS double opt-in subscription with zero-party data collection | customer phone, SMS consent |
| UCC-mobile-05 | SMS subscription banner with offer | customer phone, SMS consent |
| UCC-mobile-06 | SMS subscription DOI checkout banner | `checkout`, customer phone, SMS consent |
| UCC-mobile-07 | SMS subscription via text evaluation | customer phone, SMS consent |
| UCC-mobile-08 | SMS subscription with email collection | customer phone, email, SMS consent |
| UCC-mobile-09 | Welcome SMS | customer phone, SMS consent |
| UCC-mobile-10 | WhatsApp interactive product recommendation flow | customer phone, SMS consent |

## Paid media (4, `samples/br-docs/use-case-center/paid-media-use-cases/`)

| Code | Name | Prerequisites |
| --- | --- | --- |
| UCC-paid-01 | CLTV-based lookalike targeting for paid ads | `purchase` (`total_price`), customer email, retargeting consent |
| UCC-paid-02 | Paid ad optimization using audience predictions | `purchase`, retargeting consent |
| UCC-paid-03 | Paid ads optimized for email engagement | customer email, newsletter and retargeting consent |
| UCC-paid-04 | Social media ad audiences | `purchase`/`add_to_cart` (optional), retargeting consent |

## Analytics (12, `samples/br-docs/use-case-center/analytics-use-cases/`)

| Code | Name | Prerequisites |
| --- | --- | --- |
| UCC-analytics-01 | Apple Mail segmentation dashboard | customer email, newsletter consent |
| UCC-analytics-02 | Black Friday dashboard | `purchase` (`total_price`, `purchase_status`) |
| UCC-analytics-03 | Conversion dashboard | `view_item`, `add_to_cart`, `purchase` (`total_price`) |
| UCC-analytics-04 | Customer lifetime value dashboard | `purchase` (`total_price`), customer email |
| UCC-analytics-05 | Email deliverability dashboard | customer email, newsletter consent |
| UCC-analytics-06 | Email performance dashboard | customer email, newsletter consent |
| UCC-analytics-07 | Executive dashboard | `purchase` (`total_price`), customer email |
| UCC-analytics-08 | Key customer segments and insights dashboard | `purchase` (`purchase_id`), customer email |
| UCC-analytics-09 | Returned items dashboard | `return_item` (`product_id`), `purchase` |
| UCC-analytics-10 | Subscriber and unsubscriber monitoring dashboard | customer email, newsletter consent |
| UCC-analytics-11 | Time zone segmentation | customer `address`, email |
| UCC-analytics-12 | RFM customer segmentation | `purchase` (`purchase_status`, `total_price`) — `samples/br-docs/use-case-center/analytics-use-cases/rfm-customer-segmentation/rfm-segmentation.md`, a subfolder page under the analytics section; 18 supporting customer attributes and the score/segment-table lookup are a Bloomreach scenario outside tracking |

## Not included

- `samples/br-docs/use-case-center/omnichannel-use-cases/omnichannel-overview.md` — a concept
  overview page, not a single deployable use case with its own requirements section.
- `samples/br-docs/use-case-center/compound-value-use-cases/` (3 pages: AI-driven customer
  acquisition, online-offline customer journeys, reengagement with Loomi AI) — outside the plan's
  six sections; each combines several already-templated building blocks (paid ads, omnichannel
  messaging, Loomi AI) into a value narrative rather than its own distinct set of tracking
  requirements, so none gets its own template.
- `samples/br-docs/use-case-center/about-use-case-center/` (10 pages: how to meet requirements,
  adjust/test/enhance/evaluate a banner or email, the Use Case Center FAQ) — how-to and reference
  guides for the Use Case Center product itself, not use-case pages with their own requirements.
- `samples/br-docs/use-case-center/analytics-use-cases/rfm-customer-segmentation/rfm-segmentation-business-use.md` —
  a companion narrative article ("what to do with each of the 11 RFM segments once
  `UCC-analytics-12` has assigned them"), not a separate deployable use case with its own
  requirements section.

## Import and instantiate

Paste the file on the Use case templates page (`POST /api/use-case-templates/import/preview` then
`POST /api/use-case-templates/import/apply`); every template previews as `create` on an empty
library, matching an existing template by `code` on re-import (D-47). Instantiating a template onto
a project resolves each `standard_event`/`property_name` through the project's standard event
mapping first, falling back to an exact-name match, then a mapping step for anything left
unresolved (D-55); unresolved rows become `gap` requirements.
