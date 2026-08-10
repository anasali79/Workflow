# Hasura permission integration tests

Run after migrations + metadata apply + seed (`demo_seed_with_placeholder_users.sql`).

Use three JWTs (or Nhost login tokens) for:

| User | Placeholder UUID | Org | Role |
|------|------------------|-----|------|
| Acme owner | `f1111111-1111-4111-8111-111111111101` | A | owner |
| Acme viewer | `f1111111-1111-4111-8111-111111111103` | A | viewer |
| Beta owner | `f2222222-2222-4222-8222-222222222201` | B | owner |

Stable resource IDs from seed:

- Org A workflow: `c3333333-3333-4333-8333-333333333333`
- Org A: `a1111111-1111-4111-8111-111111111111`

## 1. Org A owner — allowed reads

```graphql
query OrgAOwnerWorkflows {
  workflows(where: { organization_id: { _eq: "a1111111-1111-4111-8111-111111111111" } }) {
    id
    name
    workflow_steps(order_by: { position: asc }) { position type name }
    usage_summary: organization { usage_summary { quota_used quota_limit quota_remaining runs_this_period } }
  }
}
```

**Expected:** Demo workflow with 5 steps; quota fields populated.

## 2. Org B user — UUID guessing (must fail)

```graphql
query OrgBGuessingOrgA {
  workflows_by_pk(id: "c3333333-3333-4333-8333-333333333333") {
    id
    name
  }
}
```

**Expected:** `null` (not an error — zero rows pass filter).

```graphql
query OrgBGuessingSteps {
  workflow_steps(where: { workflow_id: { _eq: "c3333333-3333-4333-8333-333333333333" } }) {
    id
    type
  }
}
```

**Expected:** `[]`

```graphql
query OrgBGuessingUsage {
  org_usage_summary(where: { organization_id: { _eq: "a1111111-1111-4111-8111-111111111111" } }) {
    quota_used
  }
}
```

**Expected:** `[]`

## 3. Viewer — cannot mutate workflow

```graphql
mutation ViewerUpdateWorkflow {
  update_workflows_by_pk(
    pk_columns: { id: "c3333333-3333-4333-8333-333333333333" }
    _set: { name: "Hacked" }
  ) {
    id
  }
}
```

**Expected:** `null` / permission error (no update permission for viewer).

## 4. Viewer — cannot insert notify step

```graphql
mutation ViewerInsertNotifyStep {
  insert_workflow_steps_one(
    object: {
      workflow_id: "c3333333-3333-4333-8333-333333333333"
      position: 99
      name: "Bad notify"
      type: notify
      config: {}
    }
  ) {
    id
  }
}
```

**Expected:** permission error (viewer has no insert; editor would also fail on `notify` type).

## 5. Editor — cannot insert webhook trigger

Use Acme editor JWT (`f1111111-1111-4111-8111-111111111102`):

```graphql
mutation EditorInsertWebhook {
  insert_workflow_triggers_one(
    object: {
      workflow_id: "c3333333-3333-4333-8333-333333333333"
      type: webhook
      config: { secret: "x" }
      enabled: true
    }
  ) {
    id
  }
}
```

**Expected:** permission error (webhook trigger owner-only).

## 6. Subscription isolation

```graphql
subscription StepRunsLive($workflow_run_id: uuid!) {
  step_runs(where: { workflow_run_id: { _eq: $workflow_run_id } }) {
    id
    status
  }
}
```

Use a `workflow_run_id` belonging to Org A while authenticated as Org B.

**Expected:** empty stream / no rows.

## 7. Actions (Layer 2 — Phase 5)

After functions are deployed:

- Viewer `triggerWorkflowRun` → 403 from handler
- Org B `approveStep` on Org A step → 403
- Owner `triggerWorkflowRun` → creates run
