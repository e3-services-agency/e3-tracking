# Identification and sources

This page explains how the plan answers "which id identifies this customer, and when".

## Identity rules

Each identity rule names one identifier (`cookie`, `email_id`, `cart_id`), says whether it is hard or soft, and says how it is set:

- **By an event.** Pick a trigger event. The identifier is learned when that event fires.
- **By a standalone call.** Leave the trigger event empty and fill in the SDK call and the trigger text. Example: GTM on the checkout page sends `identify({cookie, cart_id})` with no event at all.

The Identity rules page shows **Set by** (the event or the standalone call, with its source) and **Carried by** (the events that send the identifier in `customer_ids`) for every rule.

## Identification flow

Above the table, the page writes the **Identification flow** paragraph for you, in plain English. It says when each identifier is first set and which events identify the customer by it. When a standalone call sets an identifier, the paragraph names the merge: events that send only that identifier are merged into the profile through it. Copy it with the button, or read it in the event card, the tracking document, the HTML export and the shared view.

## Identifiers per event

In the event editor, the **Identifiers** block shows which identifiers the event sends in `customer_ids`.

- Client web and SDK events carry the cookie and every identifier set by an `identify` call.
- Server (Tracking API) events carry the identifiers whose rule has the same source as the event.
- Tick or untick boxes to override this for one event; **Reset to derived** brings the default back.

The Tracking API snippet on the event card fills `customer_ids` from these identifiers. When QA data records `customer_ids` and an event lacks one of its identifiers, comparison 3 raises an "Identifier missing from customer_ids" warning.

## Source colours

Every source has a colour from a fixed palette of eight. A new source gets one automatically from its system (Shopify is blue, a custom backend purple and so on); change it in the source editor. The coloured dot appears on the Sources page, the Events table (sortable Source column), the event card, the Identity rules page and the shared view.
