-- Explicit step ordering for journey docs/export.
-- Stored as an ordered list of journeyStepNode ids.

alter table public.journeys
add column if not exists step_order_json jsonb null;

