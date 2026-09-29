-- T-4-17 (D-63, D-53 amendment 6): client-side implementation contract.
--
-- events.implementation_method: how the event reaches Bloomreach (`client_web` dataLayer/GTM/Web
-- SDK, `server_api` Tracking API, `sdk_auto` emitted by the SDK or platform). events.dl_event_name:
-- the site's dataLayer event that carries this Bloomreach event (the variant's discriminator is
-- documented on the event; there is no per-variant column). properties.kind: `event` | `item` |
-- `state_list` | `context`; properties.derivation_json: for a state list
-- {source:'items', id_field, form:'ids'|'id_quantity', quantity_field}, for a total
-- {source:'items', sum:'price*quantity'}. Plain ADD COLUMNs, no table rebuild; the allowed values
-- are enforced with CHECK here and in the DALs (from src/domain/enums.ts).
ALTER TABLE events ADD COLUMN implementation_method TEXT NOT NULL DEFAULT 'client_web'
  CHECK (implementation_method IN ('client_web', 'server_api', 'sdk_auto'));
ALTER TABLE events ADD COLUMN dl_event_name TEXT;
ALTER TABLE properties ADD COLUMN kind TEXT NOT NULL DEFAULT 'event'
  CHECK (kind IN ('event', 'item', 'state_list', 'context'));
ALTER TABLE properties ADD COLUMN derivation_json TEXT;

-- Backfill events. server_api first (purchase, purchase_item, refund-like, consent), then sdk_auto
-- for every other sdk/platform class event; everything else keeps the client_web default.
UPDATE events SET implementation_method = 'server_api'
WHERE name IN ('purchase', 'purchase_item', 'consent') OR name LIKE '%refund%';
UPDATE events SET implementation_method = 'sdk_auto'
WHERE class IN ('sdk', 'platform') AND implementation_method = 'client_web';

-- Backfill properties: known list and total names only. Context (store_*, language, currency, ...)
-- is deliberately not guessed and stays `event`.
UPDATE properties SET
  kind = 'state_list',
  derivation_json = json_object('source', 'items', 'id_field', substr(name, 1, length(name) - 4) || '_id', 'form', 'ids')
WHERE scope = 'event' AND data_type = 'array' AND name LIKE '%\_ids' ESCAPE '\' AND length(name) > 4;
UPDATE properties SET
  kind = 'state_list',
  derivation_json = json_object('source', 'items', 'id_field', substr(name, 1, length(name) - 5) || '_id', 'form', 'id_quantity', 'quantity_field', 'quantity')
WHERE scope = 'event' AND data_type = 'array' AND name LIKE '%\_list' ESCAPE '\' AND length(name) > 5;
UPDATE properties SET
  kind = 'state_list',
  derivation_json = json_object('source', 'items', 'sum', 'quantity')
WHERE scope = 'event' AND name = 'total_quantity';
UPDATE properties SET
  kind = 'state_list',
  derivation_json = json_object('source', 'items', 'sum', substr(name, 7) || '*quantity')
WHERE scope = 'event' AND name LIKE 'total\_%' ESCAPE '\' AND name != 'total_quantity' AND data_type = 'number';
