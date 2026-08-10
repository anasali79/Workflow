-- =============================================================================
-- demo_seed_with_placeholder_users.sql
-- Seeds orgs + workflow AND org_members using fixed placeholder user UUIDs.
-- Use ONLY in local/dev when you also insert matching auth.users rows, OR for
-- SQL-only permission tests that mock X-Hasura-User-Id.
--
-- Production/staging demos should prefer demo_seed.sql + link-demo-members.
-- =============================================================================

BEGIN;

INSERT INTO public.organizations (id, name, quota_limit, quota_used, quota_period_start)
VALUES
  ('a1111111-1111-4111-8111-111111111111', 'Acme Corp', 100, 0, date_trunc('month', NOW())),
  ('b2222222-2222-4222-8222-222222222222', 'Beta Inc', 50, 0, date_trunc('month', NOW()))
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, quota_limit = EXCLUDED.quota_limit, updated_at = NOW();

-- Placeholder user IDs (document in README / demo-script)
-- Org A
--   owner:  f1111111-1111-4111-8111-111111111101
--   editor: f1111111-1111-4111-8111-111111111102
--   viewer: f1111111-1111-4111-8111-111111111103
-- Org B
--   owner:  f2222222-2222-4222-8222-222222222201
--   editor: f2222222-2222-4222-8222-222222222202

INSERT INTO public.org_members (organization_id, user_id, role) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111101', 'owner'),
  ('a1111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111102', 'editor'),
  ('a1111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111103', 'viewer'),
  ('b2222222-2222-4222-8222-222222222222', 'f2222222-2222-4222-8222-222222222201', 'owner'),
  ('b2222222-2222-4222-8222-222222222222', 'f2222222-2222-4222-8222-222222222202', 'editor')
ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW();

INSERT INTO public.workflows (id, organization_id, name, description, status, created_by)
VALUES (
  'c3333333-3333-4333-8333-333333333333',
  'a1111111-1111-4111-8111-111111111111',
  'Incident Triage Demo',
  'LLM classify → HTTP enrich → conditional → approval → Slack notify',
  'active',
  'f1111111-1111-4111-8111-111111111101'
)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description, status = EXCLUDED.status, updated_at = NOW();

DELETE FROM public.workflow_steps WHERE workflow_id = 'c3333333-3333-4333-8333-333333333333';

INSERT INTO public.workflow_steps (id, workflow_id, position, name, type, config) VALUES
(
  'd4444444-4444-4444-8444-444444444401',
  'c3333333-3333-4333-8333-333333333333',
  0,
  'LLM Call',
  'llm_call',
  '{"model":"llama-3.3-70b-versatile","systemPrompt":"You are an incident classifier. Reply with a short label and whether the issue is urgent.","userPrompt":"Classify this incident message and include the word urgent if severity is high: {{trigger.payload.message}}","temperature":0.2,"maxTokens":512}'::jsonb
),
(
  'd4444444-4444-4444-8444-444444444402',
  'c3333333-3333-4333-8333-333333333333',
  1,
  'HTTP Request',
  'http_request',
  '{"method":"GET","url":"https://httpbin.org/get","headers":{"Accept":"application/json"},"queryParams":{"source":"workflow-agent-demo"},"body":null,"timeoutMs":10000,"expectedStatus":[200]}'::jsonb
),
(
  'd4444444-4444-4444-8444-444444444403',
  'c3333333-3333-4333-8333-333333333333',
  2,
  'Conditional Branch',
  'conditional_branch',
  '{"sourceStepPosition":0,"path":"output.text","operator":"contains","expectedValue":"urgent","trueBranch":{"action":"continue"},"falseBranch":{"action":"skip_to_position","position":5}}'::jsonb
),
(
  'd4444444-4444-4444-8444-444444444404',
  'c3333333-3333-4333-8333-333333333333',
  3,
  'Approval Gate',
  'approval_gate',
  '{"message":"Review LLM classification before sending the notification."}'::jsonb
),
(
  'd4444444-4444-4444-8444-444444444405',
  'c3333333-3333-4333-8333-333333333333',
  4,
  'Notify',
  'notify',
  '{"provider":"slack","messageTemplate":"Workflow {{workflowName}} completed. Summary: {{previousOutput}}"}'::jsonb
);

DELETE FROM public.workflow_triggers WHERE workflow_id = 'c3333333-3333-4333-8333-333333333333';

INSERT INTO public.workflow_triggers (id, workflow_id, type, config, enabled) VALUES
(
  'e5555555-5555-4555-8555-555555555501',
  'c3333333-3333-4333-8333-333333333333',
  'manual',
  '{}'::jsonb,
  TRUE
),
(
  'e5555555-5555-4555-8555-555555555502',
  'c3333333-3333-4333-8333-333333333333',
  'webhook',
  '{"secret":"demo-webhook-secret-change-me","idempotencyHeader":"X-Idempotency-Key"}'::jsonb,
  TRUE
),
(
  'e5555555-5555-4555-8555-555555555503',
  'c3333333-3333-4333-8333-333333333333',
  'scheduled',
  '{"cron":"*/15 * * * *"}'::jsonb,
  FALSE
),
(
  'e5555555-5555-4555-8555-555555555504',
  'c3333333-3333-4333-8333-333333333333',
  'database_event',
  '{"sourceTable":"inbox_events","operation":"INSERT","condition":{"status":"new"}}'::jsonb,
  TRUE
);

COMMIT;
