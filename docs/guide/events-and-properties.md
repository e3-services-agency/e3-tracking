# Events and properties

## Events

An event is a Bloomreach event type such as `purchase` or `view_item`. Each has a **class**:

- **custom**: defined and implemented by the client. These are what the migration is about and the only ones that are checked and certified.
- **sdk** and **platform**: produced by Bloomreach itself (`session_start`, `page_visit`, `campaign`, `consent`, ...). Informational only.

An event has an owner, a status, a priority, triggers (with the page URLs where it fires) and optionally screenshots per trigger. In the event editor drag several images onto a trigger's drop zone (or click it to browse), reorder them with the arrows, or remove one with the cross (removing an image from a trigger does not delete the uploaded file); the event card and the shared view show every image and the lightbox steps through all of them. An event can have several triggers.

The Events table has a search box (name or description, filters as you type) and every column header sorts: click once for ascending, again for descending, a third time to go back to the original order. Events that have variants show a small arrow next to the name; the **Expand all variants** button opens or closes every event's variants at once.

## Properties

A property is a field, either **event**-scoped or **customer**-scoped. It is defined once per project and attached to any number of events. It carries a name, a data type, data formats (for example `email`, `uri`, `money`, `iso8601_date`), PII status and a source.

A property of type array can carry an **item schema**: the fields every list item must have, checked per item.

### Definitions: one property, several meanings

The same property can mean slightly different things on different events (a different description, allowed values or examples). Instead of duplicating the property, open it on the Properties page and add a **named definition**. Every property has a `general` definition; an event chooses which definition its link uses. In the event editor, click **Definitions** on a linked property to see them as nested rows (name, description, allowed values, formats, example) and pick the one this event uses with the radio button. The data type always stays on the property.

### Bundles

A bundle is a named group of properties you add to an event in one step (for example the properties every purchase event carries). Open the **Bundles** tab on the Properties page: each bundle shows its property count and the events that use it (an event uses a bundle when it links every property of it). Expand a bundle to see its properties with data type and type, rename it, edit its membership with a checkbox list, or delete it. A bundle in use asks for confirmation ("Delete anyway"); the events keep their properties. The Properties tab has the same search box and column sorting as Events, and a property's own editor still lets you tick the bundles it belongs to.

## Attaching a property to an event

An attachment (event property) records:

- **Required**: whether every observation must include it. A missing required property is an error finding.
- **Role**: `normal`, `discriminator` or `context`.
- Status, source, payload key and priority.

The linked-properties list, including the **Add bundle** picker, is available when you create an event too; the list is saved right after the event is created.

### Roles and variants

A **discriminator** property splits one event into **variants**: `cart_update[action=add]` and `cart_update[action=remove]` are two variants of `cart_update`. Only discriminators create variants; conditions are equals or in-lists on one or two discriminators.

A **context** property (for example page location: product page, listing, minicart) never creates a variant. QA reports a variant by context coverage grid instead of asking you to write every combination.

## Rules

A rule is a declarative check on an event (or one variant), for example "the sum of item price times quantity equals the purchase total within a tolerance". Rules run as part of the definition-versus-observations comparison and produce findings. Templates for common cases can be applied from the event.

## The event card

Open an event card for the complete view: owner, status, certification and its reasons, properties with definitions, variants, contexts, triggers, identity, rules, findings, an expected payload and code snippets (GTM, Web SDK, Tracking API). The card has a **Copy as Markdown** button that copies an AI-friendly text version.
