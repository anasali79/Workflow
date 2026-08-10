-- =============================================================================
-- 003_inbox_events_event_type.sql
-- Adds event_type column to inbox_events for fine-grained db_event trigger matching.
--
-- workflow_triggers rows of type 'database_event' can now filter by:
--   config.watchedColumn = "event_type"
--   config.watchedValue  = "order.placed"   (example)
-- =============================================================================

ALTER TABLE public.inbox_events
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'generic';

CREATE INDEX IF NOT EXISTS inbox_events_event_type_idx
  ON public.inbox_events (event_type);

COMMENT ON COLUMN public.inbox_events.event_type IS
  'Application-defined event classifier (e.g. order.placed, user.signup). '
  'Used by database_event trigger config to filter which workflows to fire.';
