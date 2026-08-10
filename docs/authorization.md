# Two-Layer Authorization Architecture

This document details the multi-tenant authorization security model of the AI Agent Workflow Automation Platform.

---

## Authorization Layers Overview

| Security Layer | Technology | Primary Purpose | Examples |
| :--- | :--- | :--- | :--- |
| **Layer 1** | Hasura Row Permissions | Multi-tenant organization data isolation | Prevents users in Organization B from reading Organization A workflows or execution logs. |
| **Layer 2** | Nhost Functions / Action Handlers | Step-level business logic & role restrictions | Enforces owner-only step types (`db_write`, `notify`), owner-only trigger creation (`webhook`), atomic approval locking. |

---

## Layer 1: Hasura Row-Level Security

Every tracked table in Hasura enforces permissions based on `X-Hasura-User-Id` session variables.

### Permission Filter Path:
```
requested_resource
  └──> workflow
        └──> organization
              └──> org_members (user_id = X-Hasura-User-Id)
```

If a user tries to access a resource by directly guessing a UUID from another organization, Hasura returns an empty result set (`404 / null`), preventing data leakage.

---

## Layer 2: Action Handler & Business Authorization

Certain sensitive operations require server-side re-validation:

1. **`triggerWorkflowRun` Action:**
   - Resolves organization via `workflow_id` server-side in PostgreSQL.
   - Verifies caller membership in `org_members`.
   - Requires caller role to be `owner` or `editor`.
   - Checks atomic usage quota in PostgreSQL before creating a run.

2. **`approveStep` Action:**
   - Resolves step run -> workflow run -> workflow -> organization.
   - Verifies approver role is `owner` or `editor`.
   - Verifies step type is strictly `approval_gate`.
   - Verifies step status is `paused`.
   - Executes `SELECT ... FOR UPDATE` locking to prevent race conditions or double-approvals.

3. **Step & Trigger Type Constraints:**
   - `db_write` and `notify` step types can only be added by `owner` role.
   - `webhook` trigger creation is restricted to `owner` role.
