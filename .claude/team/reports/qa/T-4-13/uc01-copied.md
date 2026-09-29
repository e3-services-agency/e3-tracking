# Use case: UC-01 - Abandoned cart

- Type: marketing

## Narrative

Abandoned cart is a marketing use case. Recovers carts abandoned after an add-to-cart event with no completed checkout.

## Flow

1. The site sends `cart_update[action=add]` with required `product_id`, `total_price`.
2. The site sends `checkout`.

## Customer data

- Customer property `email` (required).

## Requirements

| # | Target | Level | Status |
| --- | --- | --- | --- |
| 1 | cart_update[action=add] | R | resolved |
| 2 | cart_update[action=add].product_id | R |  |
| 3 | cart_update[action=add].total_price | R |  |
| 4 | checkout | O |  |
| 5 | email | R |  |
