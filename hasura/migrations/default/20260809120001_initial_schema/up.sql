-- =============================================================================
-- 001_initial_schema.sql
-- Workflow Agent Platform — core tables, constraints, indexes
-- Requires: PostgreSQL 14+ (gen_random_uuid via pgcrypto)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Helper: bump updated_at on row change
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- organizations
-- -----------------------------------------------------------------------------
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  quota_limit INTEGER NOT NULL DEFAULT 100,
  quota_used INTEGER NOT NULL DEFAULT 0,
  quota_period_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organizations_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT organizations_quota_limit_positive CHECK (quota_limit > 0),
  CONSTRAINT organizations_quota_used_nonnegative CHECK (quota_used >= 0),
  CONSTRAINT organizations_quota_used_lte_limit CHECK (quota_used <= quota_limit)
);

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- -----------------------------------------------------------------------------
-- org_members
-- -----------------------------------------------------------------------------
CREATE TABLE public.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT org_members_role_valid CHECK (role IN ('owner', 'editor', 'viewer')),
  CONSTRAINT org_members_org_user_unique UNIQUE (organization_id, user_id)
);

CREATE INDEX org_members_organization_id_idx ON public.org_members (organization_id);
CREATE INDEX org_members_user_id_idx ON public.org_members (user_id);
CREATE INDEX org_members_org_user_idx ON public.org_members (organization_id, user_id);

CREATE TRIGGER org_members_set_updated_at
  BEFORE UPDATE ON public.org_members
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- -----------------------------------------------------------------------------
-- workflows
-- -----------------------------------------------------------------------------
CREATE TABLE public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workflows_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT workflows_status_valid CHECK (status IN ('draft', 'active', 'archived'))
);

CREATE INDEX workflows_organization_id_idx ON public.workflows (organization_id);
CREATE INDEX workflows_org_status_idx ON public.workflows (organization_id, status);

CREATE TRIGGER workflows_set_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- -----------------------------------------------------------------------------
-- workflow_steps
-- -----------------------------------------------------------------------------
CREATE TABLE public.workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workflow_steps_position_nonnegative CHECK (position >= 0),
  CONSTRAINT workflow_steps_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT workflow_steps_type_valid CHECK (
    type IN (
      'llm_call',
      'http_request',
      'db_write',
      'notify',
      'conditional_branch',
      'approval_gate'
    )
  ),
  CONSTRAINT workflow_steps_workflow_position_unique UNIQUE (workflow_id, position)
);

CREATE INDEX workflow_steps_workflow_id_idx ON public.workflow_steps (workflow_id);
CREATE INDEX workflow_steps_workflow_position_idx ON public.workflow_steps (workflow_id, position);

CREATE TRIGGER workflow_steps_set_updated_at
  BEFORE UPDATE ON public.workflow_steps
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- -----------------------------------------------------------------------------
-- workflow_triggers
-- -----------------------------------------------------------------------------
CREATE TABLE public.workflow_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows (id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workflow_triggers_type_valid CHECK (
    type IN ('manual', 'webhook', 'scheduled', 'database_event')
  )
);

CREATE INDEX workflow_triggers_workflow_id_idx ON public.workflow_triggers (workflow_id);
CREATE INDEX workflow_triggers_type_enabled_idx ON public.workflow_triggers (type, enabled);

CREATE TRIGGER workflow_triggers_set_updated_at
  BEFORE UPDATE ON public.workflow_triggers
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- -----------------------------------------------------------------------------
-- workflow_runs
-- -----------------------------------------------------------------------------
CREATE TABLE public.workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  triggered_by UUID,
  trigger_type TEXT NOT NULL,
  idempotency_key TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workflow_runs_status_valid CHECK (
    status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')
  ),
  CONSTRAINT workflow_runs_trigger_type_valid CHECK (
    trigger_type IN ('manual', 'webhook', 'scheduled', 'database_event')
  ),
  CONSTRAINT workflow_runs_completed_after_started CHECK (
    completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at
  )
);

CREATE INDEX workflow_runs_workflow_id_created_at_idx
  ON public.workflow_runs (workflow_id, created_at DESC);
CREATE INDEX workflow_runs_status_idx ON public.workflow_runs (status);
CREATE UNIQUE INDEX workflow_runs_workflow_idempotency_uidx
  ON public.workflow_runs (workflow_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TRIGGER workflow_runs_set_updated_at
  BEFORE UPDATE ON public.workflow_runs
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- -----------------------------------------------------------------------------
-- step_runs
-- -----------------------------------------------------------------------------
CREATE TABLE public.step_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id UUID NOT NULL REFERENCES public.workflow_runs (id) ON DELETE CASCADE,
  workflow_step_id UUID NOT NULL REFERENCES public.workflow_steps (id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending',
  input JSONB,
  output JSONB,
  error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT step_runs_status_valid CHECK (
    status IN ('pending', 'running', 'completed', 'failed', 'paused', 'skipped')
  ),
  CONSTRAINT step_runs_attempt_count_nonnegative CHECK (attempt_count >= 0),
  CONSTRAINT step_runs_run_step_unique UNIQUE (workflow_run_id, workflow_step_id),
  CONSTRAINT step_runs_completed_after_started CHECK (
    completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at
  )
);

CREATE INDEX step_runs_workflow_run_id_idx ON public.step_runs (workflow_run_id);
CREATE INDEX step_runs_run_status_idx ON public.step_runs (workflow_run_id, status);
CREATE INDEX step_runs_workflow_step_id_idx ON public.step_runs (workflow_step_id);

CREATE TRIGGER step_runs_set_updated_at
  BEFORE UPDATE ON public.step_runs
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- -----------------------------------------------------------------------------
-- inbox_events — watched source for database_event triggers
-- -----------------------------------------------------------------------------
CREATE TABLE public.inbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inbox_events_status_valid CHECK (status IN ('new', 'processed', 'ignored'))
);

CREATE INDEX inbox_events_org_created_at_idx
  ON public.inbox_events (organization_id, created_at DESC);
CREATE INDEX inbox_events_status_idx ON public.inbox_events (status);

CREATE TRIGGER inbox_events_set_updated_at
  BEFORE UPDATE ON public.inbox_events
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- -----------------------------------------------------------------------------
-- workflow_artifacts — controlled target for db_write steps
-- -----------------------------------------------------------------------------
CREATE TABLE public.workflow_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  workflow_run_id UUID NOT NULL REFERENCES public.workflow_runs (id) ON DELETE CASCADE,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX workflow_artifacts_org_idx ON public.workflow_artifacts (organization_id);
CREATE INDEX workflow_artifacts_run_idx ON public.workflow_artifacts (workflow_run_id);

-- -----------------------------------------------------------------------------
-- webhook_idempotency — duplicate webhook protection
-- -----------------------------------------------------------------------------
CREATE TABLE public.webhook_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id UUID NOT NULL REFERENCES public.workflow_triggers (id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  workflow_run_id UUID NOT NULL REFERENCES public.workflow_runs (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT webhook_idempotency_trigger_key_unique UNIQUE (trigger_id, idempotency_key)
);

CREATE INDEX webhook_idempotency_trigger_id_idx ON public.webhook_idempotency (trigger_id);

-- -----------------------------------------------------------------------------
-- Comments (schema documentation for operators)
-- -----------------------------------------------------------------------------
COMMENT ON TABLE public.organizations IS 'Tenant root; quota is enforced per organization.';
COMMENT ON TABLE public.org_members IS 'Maps auth.users to organizations with owner|editor|viewer roles.';
COMMENT ON TABLE public.workflows IS 'Automation definition belonging to exactly one organization.';
COMMENT ON TABLE public.workflow_steps IS 'Ordered steps; config stored as validated JSONB.';
COMMENT ON TABLE public.workflow_triggers IS 'manual|webhook|scheduled|database_event entry points.';
COMMENT ON TABLE public.workflow_runs IS 'One execution instance of a workflow.';
COMMENT ON TABLE public.step_runs IS 'Per-step execution state for live subscriptions.';
COMMENT ON TABLE public.inbox_events IS 'Watched table for Hasura Event Trigger (database_event).';
COMMENT ON TABLE public.workflow_artifacts IS 'Allowlisted destination for db_write step handler.';
COMMENT ON TABLE public.webhook_idempotency IS 'Stores webhook idempotency keys to prevent duplicate runs.';
