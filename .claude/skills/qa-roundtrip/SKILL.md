---
name: qa-roundtrip
description: Browser-driven QA procedure and import/export round-trip tests against the Bloomreach JSON fixtures for e3-tracking. Load before testing any task or closing a phase.
---

# QA round trip

Fixtures: `.claude/team/samples/customer-events-export.json`, `data-mapping.json`, `expiration-settings.json`.

## Standard scenarios
1. **App boots**: start via the `run` skill or `.claude/launch.json`; no console errors on load.
2. **Mapping import**: paste `data-mapping.json`. Expect a diff listing events, variants (`cart_update[action=add]` mapped to add_to_cart, `purchase[purchase_status=success]`), renames (purchase_item total_price to price), consents (newsletter to brand_consent), and the empty catalog block flagged. Apply. Verify entities exist.
3. **Expiration import**: paste `expiration-settings.json`. Expect per-event expiration set (session_start 3 months, page_visit 30 days, consent disabled) and the `other` default recorded.
4. **Events export import**: paste `customer-events-export.json`. Expect observations created and findings at least for:
   - `type_mismatch`: purchase.total_price "28" string vs Number
   - `shape_inconsistent`: product_ids array on purchase, string on checkout and cart_update
   - `type_mismatch`: purchase_item.is_new "TRUE" string vs Boolean
   - `rounding_drift`: purchase_item.price 28.4 vs purchase.total_price 28 (if the rule is implemented)
   - `unknown_variant` if a discriminator value is outside the enum
5. **Export**: export mapping and expiration JSON. Diff against the fixtures; every difference must be explained by an intended change.
6. **CSV export**: export events and properties as CSV; confirm headers and row counts.
7. **Certified logic**: an event with zero error findings across all three comparisons shows `certified`; introduce a mismatch and confirm it drops.

8. **Data Manager round trip** (phase 2, D-28): paste `data-manager-customers.json`, preview shows 101 properties in groups Personal Data, Campaign Data, Order Data plus the default group; apply; paste `data-manager-events.json`, preview shows 61 events incl. purchase with total_price typed string from data and the MentionMe group; apply; export both and deep-equal against the fixtures with no ignored fields. Run comparison: findings with comparison id data_manager for purchase.total_price, purchase_item.price and quantity (string in Data Manager vs number in the definition).

## Reporting
Post `PASS` or `FAIL` on the board. For each failure: numbered steps, expected, actual, console or network evidence. Save exports under `.claude/team/reports/qa/<TASK-ID>/`.
