-- =============================================================================
-- 002_views_and_functions.sql
-- Aggregation views + atomic quota helper
-- =============================================================================

-- -----------------------------------------------------------------------------
-- org_usage_summary (REQUIRED aggregation)
-- Per organization for the current quota period:
--   quota_used, quota_limit, quota_remaining, runs_this_period
-- Tracked by Hasura in Phase 3 with the same org-membership filter as organizations.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.org_usage_summary AS
SELECT
  o.id AS organization_id,
  o.name AS organization_name,
  o.quota_used,
  o.quota_limit,
  GREATEST(o.quota_limit - o.quota_used, 0) AS quota_remaining,
  o.quota_period_start,
  (
    SELECT COUNT(*)::INTEGER
    FROM public.workflow_runs wr
    INNER JOIN public.workflows w ON w.id = wr.workflow_id
    WHERE w.organization_id = o.id
      AND wr.created_at >= o.quota_period_start
  ) AS runs_this_period
FROM public.organizations o;

COMMENT ON VIEW public.org_usage_summary IS
  'Dashboard aggregation: quota usage and run counts for the current billing period.';

-- -----------------------------------------------------------------------------
-- workflow_run_stats (optional secondary aggregation — useful on workflow detail)
-- Average duration, totals, and success rate for completed/failed runs.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.workflow_run_stats AS
SELECT
  w.id AS workflow_id,
  w.organization_id,
  COUNT(wr.id)::INTEGER AS total_runs,
  COUNT(wr.id) FILTER (WHERE wr.status = 'completed')::INTEGER AS completed_runs,
  COUNT(wr.id) FILTER (WHERE wr.status = 'failed')::INTEGER AS failed_runs,
  CASE
    WHEN COUNT(wr.id) FILTER (WHERE wr.status IN ('completed', 'failed')) = 0 THEN NULL
    ELSE (
      COUNT(wr.id) FILTER (WHERE wr.status = 'completed')::NUMERIC
      / COUNT(wr.id) FILTER (WHERE wr.status IN ('completed', 'failed'))::NUMERIC
    )
  END AS success_rate,
  AVG(
    EXTRACT(EPOCH FROM (wr.completed_at - wr.started_at))
  ) FILTER (
    WHERE wr.status = 'completed'
      AND wr.started_at IS NOT NULL
      AND wr.completed_at IS NOT NULL
  ) AS average_run_duration_seconds
FROM public.workflows w
LEFT JOIN public.workflow_runs wr ON wr.workflow_id = w.id
GROUP BY w.id, w.organization_id;

COMMENT ON VIEW public.workflow_run_stats IS
  'Per-workflow run statistics computed in SQL (not client-side).';

-- -----------------------------------------------------------------------------
-- quota_maybe_reset_period
-- If the current period has elapsed (1 month), reset usage and advance period start.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quota_maybe_reset_period(p_organization_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_start TIMESTAMPTZ;
BEGIN
  SELECT quota_period_start
  INTO v_period_start
  FROM public.organizations
  WHERE id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOW() >= (v_period_start + INTERVAL '1 month') THEN
    UPDATE public.organizations
    SET
      quota_used = 0,
      quota_period_start = date_trunc('month', NOW()),
      updated_at = NOW()
    WHERE id = p_organization_id;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- quota_check_and_increment
-- Atomically checks remaining quota and increments by 1 (per workflow run).
-- Returns TRUE if the run is allowed; FALSE if quota is exhausted.
-- Uses row lock to prevent concurrent bypass.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quota_check_and_increment(p_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_limit INTEGER;
  v_used INTEGER;
BEGIN
  PERFORM public.quota_maybe_reset_period(p_organization_id);

  SELECT quota_limit, quota_used
  INTO v_limit, v_used
  FROM public.organizations
  WHERE id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_used >= v_limit THEN
    RETURN FALSE;
  END IF;

  UPDATE public.organizations
  SET
    quota_used = quota_used + 1,
    updated_at = NOW()
  WHERE id = p_organization_id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.quota_check_and_increment(UUID) IS
  'Atomic quota consume (1 unit per workflow run). Call inside the run-start transaction.';

-- -----------------------------------------------------------------------------
-- Down-friendly notes: drop order for rollback scripts
-- DROP FUNCTION IF EXISTS public.quota_check_and_increment(UUID);
-- DROP FUNCTION IF EXISTS public.quota_maybe_reset_period(UUID);
-- DROP VIEW IF EXISTS public.workflow_run_stats;
-- DROP VIEW IF EXISTS public.org_usage_summary;
-- -----------------------------------------------------------------------------
