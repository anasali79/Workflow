ALTER TABLE public.inbox_events DROP COLUMN IF EXISTS event_type;
DROP INDEX IF EXISTS inbox_events_event_type_idx;
