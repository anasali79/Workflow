-- =============================================================================
-- verify_schema.sql
-- Smoke checks after migrations. Run: psql "$DATABASE_URL" -f database/scripts/verify_schema.sql
-- =============================================================================

DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(t, ', ')
  INTO missing
  FROM (
    SELECT unnest(ARRAY[
      'organizations',
      'org_members',
      'workflows',
      'workflow_steps',
      'workflow_triggers',
      'workflow_runs',
      'step_runs',
      'inbox_events',
      'workflow_artifacts',
      'webhook_idempotency'
    ]) AS t
  ) required
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = required.t
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing tables: %', missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'org_usage_summary'
  ) THEN
    RAISE EXCEPTION 'Missing view org_usage_summary';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'workflow_run_stats'
  ) THEN
    RAISE EXCEPTION 'Missing view workflow_run_stats';
  END IF;

  IF to_regprocedure('public.quota_check_and_increment(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Missing function quota_check_and_increment(uuid)';
  END IF;

  RAISE NOTICE 'Schema verification passed.';
END $$;

-- Constraint / index sanity samples
SELECT
  (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'org_members_org_user_idx') AS org_members_idx,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'org_members_role_valid') AS role_check,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'workflow_steps_workflow_position_unique') AS step_position_unique;
