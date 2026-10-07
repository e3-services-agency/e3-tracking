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

## Identity snippets

The Identity rules page, the event card, the HTML export and the shared view show the identify, update and anonymize snippets in the same four forms as event snippets: **GTM / dataLayer** (a proposed contract: a `bloomreach_<call>` push preceded by the reset push; it needs a trigger in the shared E3 GTM template for the `bloomreach_<call>` events, the template ships only the event forwarding today), **Web SDK** (`brweb.identify`, `brweb.update`, `brweb.anonymize`), **Web SDK (legacy)** (`exponea.*`) and **Tracking API** (a customers call with `customer_ids` and `properties`, or the anonymize endpoint). A standalone call keeps its comment with the trigger; when its source collects through the Tracking API, the SDK forms show the server-side instruction instead of an SDK call.

## Configuring an identity rule

Open a rule from the Identity rules page; the sheet has four sections. **Identifier** picks one of the project's identifiers from a dropdown (or "New identifier…" to create one inline with its name and type); the hard or soft type is shown read-only because it belongs to the identifier, not to the rule. **Set by** says how it is learned: when an event is sent (the source is taken from that event), by a standalone identify call with no event (SDK call, trigger text and source; a live line shows how the trigger reads and which identifiers the call binds), or not defined yet. **Carried by** lists the project events grouped by implementation method; events that carry the identifier by default are ticked and marked derived. Ticking or unticking an event changes that event's own identifiers list, the same list the event editor shows, and a live preview shows this rule's sentence of the identification flow. Clicking the Set by or Carried by cell in the table opens the sheet on that section. An event that would end up with no identifiers of its own goes back to the derived default. **Meta** holds owner, tracker, priority and status.

When the event of a rule set by an event has sources, the rule takes the source of that event: a source you chose by hand is kept when it is one of the event's sources, otherwise the event's first source is used. An event with no source never clears a source already set. An event can also be set to carry no identifier at all ("Carries no identifier" in the event editor, or by unticking its last identifier in the Carried by list); "Reset to derived" brings the default back.

## Identifiers vs identity rules

The project's identifiers (hard IDs, soft IDs and the cookie) are fixed once, like in the Bloomreach project settings, and live in the **Identifiers** block on the Settings page. Add one inline, rename it (identity rules and event identifier lists that use it follow), change its type, reorder, or delete it; delete is disabled while a rule or an event still uses it. Each name opens the Identity rules page.

An identity rule is not an identifier: it is one **act of identifying** with one of them (when it is set, by which event or standalone call, from which source, and which events carry it). Several rules may act on the same identifier, for example a `cart_id` set on the checkout page by GTM and also by the backend; the Identification flow reads them as one sentence per identifier ("cart_id is set when ..., and also when ..."). Importers and the MCP can keep posting rules with `identifier_name` and `identity_type`: the identifier is found or created for them. The identifiers list is also in the tracking document (`identifiers[]`), the HTML export and the shared view.
