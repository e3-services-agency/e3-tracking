# Use case library: Use Case Center extension (T-4-07)

`.claude/team/samples/use-case-library-ucc.json` is a second `e3-use-case-library` v1 file (D-47,
D-55, D-57), built from the Bloomreach Use Case Center documentation stored in
`samples/br-docs/use-case-center/<section>/` (email, web personalization, omnichannel, mobile
messaging, paid media, analytics). It imports through the same
`src/domain/import/useCaseLibrary.ts` parser and `use-case-templates` preview/apply routes as
`use-case-library-sample.json`; the two files are independent and can both be imported into the
global template library. It parses with zero warnings, has 85 templates with unique
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

## Email (24, `samples/br-docs/use-case-center/email-use-cases/`)

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
| UCC-email-09 | Bi-weekly product recommendation newsletter | `purchase`, customer email, newsletter consent |
| UCC-email-10 | Birthday campaign | customer `birthday`, email, newsletter consent |
| UCC-email-11 | Personalized abandoned cart email | `add_to_cart` (`product_id`, `total_price`), customer email |
| UCC-email-12 | Post-cancellation follow-up email flow | `returned_purchase` (`purchase_status`, `purchase_id`), customer email |
| UCC-email-13 | Post-holiday feedback | `purchase` (`purchase_id`), customer email |
| UCC-email-14 | Post-purchase email with recommendations | `purchase` (`purchase_id`), `purchase_item` (`product_id`), customer email |
| UCC-email-15 | Post-purchase NPS survey email | `purchase` (`purchase_id`), customer email |
| UCC-email-16 | Pre-travel engagement email flow | `purchase` (`purchase_id`), customer email |
| UCC-email-17 | Purchase anniversary recommendations | `purchase` (`purchase_id`), customer email |
| UCC-email-18 | Reactivation campaign for disengaged email subscribers | customer email, newsletter consent |
| UCC-email-19 | Reactivation campaign for lapsing and lapsed | `purchase` (`purchase_id`), customer email |
| UCC-email-20 | Refer-a-friend campaign | customer email, newsletter consent |
| UCC-email-21 | Refill reminder email campaign | `purchase`, `purchase_item` (`product_id`), customer email |
| UCC-email-22 | Retention campaign for repeat purchasers | `purchase` (`purchase_id`), customer email |
| UCC-email-23 | Weather-influenced campaign | customer `address`, email, newsletter consent |
| UCC-email-24 | Welcome flow | customer email, newsletter consent |

## Web personalization (28, `samples/br-docs/use-case-center/web-personalization-use-cases/`)

| Code | Name | Prerequisites |
| --- | --- | --- |
| UCC-web-01 | Abandoned browse banner with recommendations | `view_item` (`product_id`) |
| UCC-web-02 | Abandoned browse banner | `view_item` (`product_id`) |
| UCC-web-03 | Abandoned cart banner | `add_to_cart` (`product_id`, `total_price`) |
| UCC-web-04 | AI-segmented single opt-in email subscription banner | newsletter consent, customer email |
| UCC-web-05 | Banner notification for customers with high return rates | `return_item` (`product_id`) |
| UCC-web-06 | Banner notification for frequently returned items | `view_item` (`product_id`) |
| UCC-web-07 | Birthday reminder banner | customer `birthday` |
| UCC-web-08 | Browser tab animation | `add_to_cart` |
| UCC-web-09 | Cart consolidation banner | `add_to_cart` (`product_id`) |
| UCC-web-10 | Customizable customer acquisition weblayer | customer email |
| UCC-web-11 | Discount countdown banner | `view_item` (`product_id`), catalog `discount_percentage` |
| UCC-web-12 | Easy access discount code banner | customer email, `add_to_cart` (optional) |
| UCC-web-13 | Gamified banners with email collection | newsletter consent, customer email |
| UCC-web-14 | Gamified banners | `view_item` (optional) |
| UCC-web-15 | Global and product-specific badges | catalog `stock_level`, `discount_percentage` |
| UCC-web-16 | Interactive post-purchase feedback banner | `purchase` (`purchase_id`) |
| UCC-web-17 | Interactive subscriber banner | newsletter consent, customer email |
| UCC-web-18 | Location-based social proof banner | `view_item` (`product_id`) |
| UCC-web-19 | Multistep zero-party data banner | customer email, newsletter consent (both optional) |
| UCC-web-20 | Next-day delivery countdown banner | `add_to_cart` (`product_id`), catalog `stock_level` |
| UCC-web-21 | On-exit mobile banner | `add_to_cart` (`product_id`) |
| UCC-web-22 | Previous searched destination reminder | `search` |
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

## Analytics (11, `samples/br-docs/use-case-center/analytics-use-cases/`)

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

## Not included

`samples/br-docs/use-case-center/omnichannel-use-cases/omnichannel-overview.md` is a concept
overview page, not a single deployable use case with its own requirements section, so it has no
template.

## Import and instantiate

Paste the file on the Use case templates page (`GET/POST /api/use-case-templates/import/preview`
then `/apply`); every template previews as `create` on an empty library, matching an existing
template by `code` on re-import (D-47). Instantiating a template onto a project resolves each
`standard_event`/`property_name` through the project's standard event mapping first, falling back
to an exact-name match, then a mapping step for anything left unresolved (D-55); unresolved rows
become `gap` requirements.
