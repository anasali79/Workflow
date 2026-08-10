ALTER TABLE public.inbox_events
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'generic';

CREATE INDEX IF NOT EXISTS inbox_events_event_type_idx
  ON public.inbox_events (event_type);

COMMENT ON COLUMN public.inbox_events.event_type IS
  'Application-defined event classifier (e.g. order.placed, user.signup). '
  'Used by database_event trigger config to filter which workflows to fire.';
