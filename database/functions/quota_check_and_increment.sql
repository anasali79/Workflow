-- Standalone copy of quota helper for reference / selective re-apply.
-- Canonical definition lives in database/migrations/002_views_and_functions.sql

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
