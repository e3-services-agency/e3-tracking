# Import a legacy sheet

If a client already documented their tracking in the E3 Google-Sheet template (the "Data Tracking Document" workbook), you can fill an existing project from it instead of retyping. This is a command-line tool for E3 staff, not a page in the app. It never deletes anything and never overwrites a value you set.

## Before you start

1. Create the project in the app first, and add its two sources (a frontend one and a backend one). The importer does not create sources; it links events to them.
2. Download the sheet as `.xlsx` from Google Sheets. Keep the file outside the repository: it is client data.

## Dry run first

```
node scripts/import-tracking-sheet.mjs --xlsx "<file>.xlsx" --api http://127.0.0.1:3020 --project <project key> --report preview.json --profile scripts/profiles/<client>.json
```

Without `--apply` the tool only reads. It prints, per kind of item (property, event, event property link, catalog, catalog field, property-to-catalog link, identity rule), how many it would create, update, leave unchanged or skip, plus:

- **conflicts**: the sheet says one thing and the project already holds another non-empty value. The project value is kept.
- **skipped rows**: summary rows, group headers, duplicate rows, and cells that were errors in the sheet (`#REF!`, `#N/A`). A `#N/A` data type becomes `string` and is listed here.
- **needs client input**: items the sheet leaves open (the airline events, a source type of TBD, catalog fields with no data type).

`preview.json` holds the same, plus every planned request body.

## Apply

A profile (`--profile`, optional) holds the client specifics: the events the client has not defined yet, properties to attach to an event, the project industry and which event property is a discriminator. See `scripts/profiles/airshoppen.json`.

Add `--apply` to run it. The tool matches by name, so running it twice is safe: the second run reports everything as unchanged. Per item it will:

- create what is missing,
- fill only fields that are empty on an existing item,
- report a differing non-empty value as a conflict and leave it alone; when the existing value is only the schema default (status planned, class custom, implementation method client_web, link role normal, ...) the conflict is flagged `default` and is overwritten only with `--fill-defaults`,
- never delete.

## What is read from the sheet

| Sheet | Becomes |
|---|---|
| Events | events: description, purpose, page, trigger, identity note, owner, priority, status, class, implementation method, linked sources |
| Properties | event properties: category (emoji stripped), data type, formats, examples, PII |
| Customer Properties | customer properties; reserved names (email, phone, first_name, ...) keep their automatic category, the rest are `customer` |
| Events & Event Attributes | the links between events and properties, with the required flag; `action` on cart_update, view_item and consent becomes a discriminator (its allowed values are read from the description) |
| Identity | identity rules: hard or soft, trigger, a cookie or a JS SDK / GTM / frontend source links the frontend source, and only a hard id gets the `identify` call |
| Catalogs | the `products` and `variants` catalogs with their fields, searchable and required flags, a `item_id` lookup key and the `product_id` or `variant_id` companion field, plus the matching event property linked to the lookup key |
| Dropdowns | read for the value lists only |

Event class and how it reaches Bloomreach are inferred: system events are `sdk` (session events, page_visit) or `platform`; view_item, cart_update, view_category and checkout are `client_web`; purchase, purchase_item, consent, login, registration and voucher are `server_api`; otherwise the SOURCE TYPE column decides (Frontend, Backend, "Frontend / Backend" links both, TBD links none). Data formats that match the app's list become format tokens; the rest (trimmed, lowercase, integer) are kept in the property notes.

The profile's extra events are created with what the sheet knows and no properties from the attribute sheet, plus any properties the profile attaches. They are listed under "needs client input".

The project industry is set from the profile when it is empty.

## Missing sheets

A sheet that is not in the workbook produces a warning and the rest still imports.
