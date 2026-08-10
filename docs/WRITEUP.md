# Architecture & Technical Design Write-Up

**Project:** AI Agent Workflow Automation Platform  
**Architecture:** Monorepo (Next.js 15, PostgreSQL, Hasura GraphQL Engine, Nhost Auth & Functions)  
**Author:** Staff Software Architect & Lead Engineer  

---

## 1. Database Schema Design & Trade-Offs

The PostgreSQL database schema is structured around a strict multi-tenant hierarchy:

```
organizations ──> org_members ──> auth.users
  │
  └──> workflows ──> workflow_steps
         │         └──> workflow_triggers
         └──> workflow_runs ──> step_runs
```

### Key Design Trade-Offs:

1. **Normalized Lifecycle vs. JSONB Step Configuration:**
   - Structural execution entities (`workflows`, `workflow_steps`, `workflow_runs`, `step_runs`) use strict relational tables with Foreign Keys (`ON DELETE CASCADE`), UUID v4 identifiers (`gen_random_uuid()`), and `TIMESTAMPTZ` audit timestamps.
   - Step configurations (`workflow_steps.config`) are stored as `JSONB`. This provides schema flexibility for heterogeneous step types (`llm_call`, `http_request`, `conditional_branch`, `approval_gate`, `notify`, `db_write`) while enforcing structural validation server-side via Zod schemas before execution.

2. **Server-Side Aggregations (`org_usage_summary` & `workflow_run_stats`):**
   - Implemented as PostgreSQL `CREATE VIEW` objects tracked directly in Hasura metadata.
   - Computes quota limits, monthly run usage, average execution duration (`completed_at - started_at`), and success rates on the database server.
   - Respected by the same Hasura row-level permissions as core tables, guaranteeing that Organization B users cannot query Organization A metrics.

3. **Database-Level Quota Enforcer (`quota_check_and_increment`):**
   - Uses an atomic PL/pgSQL function executing `SELECT ... FOR UPDATE` on the `organizations` table.
   - Prevents race conditions during concurrent workflow triggers, enforcing strict quota boundaries before starting execution.

---

## 2. Two-Layer Authorization Architecture

Security is enforced using a defense-in-depth model combining Hasura Row-Level Security (Layer 1) and Server-Side Action Business Logic (Layer 2).

```
Client Request
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1: Hasura Row Permissions (GraphQL Engine)            │
│ Filters queries & mutations using X-Hasura-User-Id         │
│ Verification: org_members -> organization -> resource      │
└─────────────────────────────┬───────────────────────────────┘
                              │ Validated Session & Scope
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ LAYER 2: Hasura Action & Function Handlers (Backend Engine)  │
│ Server-side re-verification & business rule enforcement:    │
│  - Owner-only step types (db_write, notify)                 │
│  - Owner-only triggers (webhook)                            │
│  - Approver membership & step status validation            │
│  - Atomic database FOR UPDATE row locking                   │
└─────────────────────────────────────────────────────────────┘
```

### Concrete Enforcement Examples:

- **Layer 1 Example (Cross-Org UUID Isolation):**
  If a malicious user from Organization B attempts to query `workflow_runs(where: { id: { _eq: "<Org-A-Run-UUID>" } })`, Hasura evaluates the row permission filter (`workflow.organization.org_members.user_id = X-Hasura-User-Id`). The query returns empty/null as if the UUID does not exist.

- **Layer 2 Example (Business Rule Enforcement):**
  An `editor` role in Organization A can edit standard workflow steps, but if they attempt to insert a `db_write` or `notify` step, Layer 2 authorization (`assertCanAddStepType`) inside the Action handler catches the restriction and rejects the mutation with HTTP `403 FORBIDDEN`. Hasura row permissions alone cannot distinguish between step types; Layer 2 business logic enforces these granular controls.

---

## 3. Approval Gate Pause & Resume State Machine

The `approval_gate` step enables human-in-the-loop workflows.

```
       [Step Execution]
              │
              ▼
   (Is step approval_gate?)
              │ YES
              ▼
   ┌──────────────────────┐
   │ step_run: paused     │ ──> Emits GraphQL Subscription
   │ workflow_run: paused │     Frontend displays "Approve" button
   └──────────┬───────────┘
              │ User invokes approveStep(step_run_id)
              ▼
   ┌────────────────────────────────────────────────────────┐
   │ Backend Action Authorization:                          │
   │ 1. Verify user membership in workflow organization    │
   │ 2. Verify user role (owner | editor)                  │
   │ 3. Lock step_run FOR UPDATE (prevent double approve)  │
   │ 4. Set step_run: completed, approved_by, approved_at  │
   │ 5. Set workflow_run: running                          │
   └──────────┬─────────────────────────────────────────────┘
              │
              ▼
   [Resume Workflow Engine loop from step N+1]
```

### Execution Resumption:
When execution resumes, `WorkflowEngine.executeRun()` hydrates previous step outputs from existing `completed` step runs stored in the database, skips already finished steps, and continues execution from the exact step position following the approval gate.
