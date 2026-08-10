-- =============================================================================
-- demo_seed.sql
-- Demo organizations, sample workflow (LLM → HTTP → Conditional → Approval → Notify),
-- and all four trigger types.
--
-- IMPORTANT — Auth users:
--   Nhost Auth owns auth.users. Create these accounts first (signup or Auth admin),
--   then set the user UUID constants below (or use scripts/link-demo-members).
--
-- Default demo emails (create with password DemoPass123!):
--   Org A: owner@acme.demo, editor@acme.demo, viewer@acme.demo
--   Org B: owner@beta.demo, editor@beta.demo
-- =============================================================================

BEGIN;

-- Fixed IDs for reproducible demos / UUID-guessing security tests
-- Organizations
-- a1111111-1111-4111-8111-111111111111 = Acme Corp (Org A)
-- b2222222-2222-4222-8222-222222222222 = Beta Inc  (Org B)

-- ---------------------------------------------------------------------------
-- Replace these with real auth.users.id values after signup
-- ---------------------------------------------------------------------------
-- NULL (set before running, or skip member inserts and use link script)
DO $$
DECLARE
  -- PLACEHOLDER UUIDs — replace with real Nhost user IDs before seeding members
  org_a_owner  UUID := NULLIF(current_setting('app.demo_org_a_owner', true), '')::UUID;
  org_a_editor UUID := NULLIF(current_setting('app.demo_org_a_editor', true), '')::UUID;
  org_a_viewer UUID := NULLIF(current_setting('app.demo_org_a_viewer', true), '')::UUID;
  org_b_owner  UUID := NULLIF(current_setting('app.demo_org_b_owner', true), '')::UUID;
  org_b_editor UUID := NULLIF(current_setting('app.demo_org_b_editor', true), '')::UUID;

  org_a UUID := 'a1111111-1111-4111-8111-111111111111';
  org_b UUID := 'b2222222-2222-4222-8222-222222222222';
  wf_a  UUID := 'c3333333-3333-4333-8333-333333333333';
  step1 UUID := 'd4444444-4444-4444-8444-444444444401';
  step2 UUID := 'd4444444-4444-4444-8444-444444444402';
  step3 UUID := 'd4444444-4444-4444-8444-444444444403';
  step4 UUID := 'd4444444-4444-4444-8444-444444444404';
  step5 UUID := 'd4444444-4444-4444-8444-444444444405';
  trg_manual UUID := 'e5555555-5555-4555-8555-555555555501';
  trg_webhook UUID := 'e5555555-5555-4555-8555-555555555502';
  trg_sched UUID := 'e5555555-5555-4555-8555-555555555503';
  trg_dbevent UUID := 'e5555555-5555-4555-8555-555555555504';
  created_by UUID;
BEGIN
  -- Prefer owner user id; fall back to a stable nil-like sentinel for workflow.created_by
  -- so schema seed can run before members are linked.
  created_by := COALESCE(org_a_owner, '00000000-0000-4000-8000-000000000001'::UUID);

  INSERT INTO public.organizations (id, name, quota_limit, quota_used, quota_period_start)
  VALUES
    (org_a, 'Acme Corp', 100, 0, date_trunc('month', NOW())),
    (org_b, 'Beta Inc', 50, 0, date_trunc('month', NOW()))
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        quota_limit = EXCLUDED.quota_limit,
        updated_at = NOW();

  IF org_a_owner IS NOT NULL THEN
    INSERT INTO public.org_members (organization_id, user_id, role)
    VALUES (org_a, org_a_owner, 'owner')
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  IF org_a_editor IS NOT NULL THEN
    INSERT INTO public.org_members (organization_id, user_id, role)
    VALUES (org_a, org_a_editor, 'editor')
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  IF org_a_viewer IS NOT NULL THEN
    INSERT INTO public.org_members (organization_id, user_id, role)
    VALUES (org_a, org_a_viewer, 'viewer')
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  IF org_b_owner IS NOT NULL THEN
    INSERT INTO public.org_members (organization_id, user_id, role)
    VALUES (org_b, org_b_owner, 'owner')
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  IF org_b_editor IS NOT NULL THEN
    INSERT INTO public.org_members (organization_id, user_id, role)
    VALUES (org_b, org_b_editor, 'editor')
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  INSERT INTO public.workflows (id, organization_id, name, description, status, created_by)
  VALUES (
    wf_a,
    org_a,
    'Incident Triage Demo',
    'LLM classify → HTTP enrich → conditional → approval → Slack notify',
    'active',
    created_by
  )
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        status = EXCLUDED.status,
        updated_at = NOW();

  -- Clear and re-insert steps for idempotent reseeding of the demo workflow
  DELETE FROM public.workflow_steps WHERE workflow_id = wf_a;

  INSERT INTO public.workflow_steps (id, workflow_id, position, name, type, config) VALUES
  (
    step1, wf_a, 0, 'LLM Call', 'llm_call',
    jsonb_build_object(
      'model', 'llama-3.3-70b-versatile',
      'systemPrompt', 'You are an incident classifier. Reply with a short label and whether the issue is urgent.',
      'userPrompt', 'Classify this incident message and include the word urgent if severity is high: {{trigger.payload.message}}',
      'temperature', 0.2,
      'maxTokens', 512
    )
  ),
  (
    step2, wf_a, 1, 'HTTP Request', 'http_request',
    jsonb_build_object(
      'method', 'GET',
      'url', 'https://httpbin.org/get',
      'headers', jsonb_build_object('Accept', 'application/json'),
      'queryParams', jsonb_build_object('source', 'workflow-agent-demo'),
      'body', NULL,
      'timeoutMs', 10000,
      'expectedStatus', jsonb_build_array(200)
    )
  ),
  (
    step3, wf_a, 2, 'Conditional Branch', 'conditional_branch',
    jsonb_build_object(
      'sourceStepPosition', 0,
      'path', 'output.text',
      'operator', 'contains',
      'expectedValue', 'urgent',
      'trueBranch', jsonb_build_object('action', 'continue'),
      'falseBranch', jsonb_build_object('action', 'skip_to_position', 'position', 5)
    )
  ),
  (
    step4, wf_a, 3, 'Approval Gate', 'approval_gate',
    jsonb_build_object(
      'message', 'Review LLM classification before sending the notification.'
    )
  ),
  (
    step5, wf_a, 4, 'Notify', 'notify',
    jsonb_build_object(
      'provider', 'slack',
      'messageTemplate', 'Workflow {{workflowName}} completed. Summary: {{previousOutput}}'
    )
  );

  DELETE FROM public.workflow_triggers WHERE workflow_id = wf_a;

  INSERT INTO public.workflow_triggers (id, workflow_id, type, config, enabled) VALUES
  (
    trg_manual, wf_a, 'manual', '{}'::jsonb, TRUE
  ),
  (
    trg_webhook, wf_a, 'webhook',
    jsonb_build_object(
      'secret', 'demo-webhook-secret-change-me',
      'idempotencyHeader', 'X-Idempotency-Key'
    ),
    TRUE
  ),
  (
    trg_sched, wf_a, 'scheduled',
    jsonb_build_object('cron', '*/15 * * * *'),
    FALSE
  ),
  (
    trg_dbevent, wf_a, 'database_event',
    jsonb_build_object(
      'sourceTable', 'inbox_events',
      'operation', 'INSERT',
      'condition', jsonb_build_object('status', 'new')
    ),
    TRUE
  );

  RAISE NOTICE 'Demo seed applied for Acme Corp workflow %', wf_a;
  RAISE NOTICE 'Webhook trigger id: %', trg_webhook;
  IF org_a_owner IS NULL THEN
    RAISE NOTICE 'Member rows skipped — set app.demo_org_* GUCs or run scripts/link-demo-members after signup.';
  END IF;
END $$;

COMMIT;
