# Database Design

## Overview

PostgreSQL is the system of record for organizations, membership, workflows, runs, and controlled side effects (`inbox_events`, `workflow_artifacts`). Auth identities live in Nhost `auth.users`; `org_members.user_id` references those UUIDs without a hard FK (auth schema ownership stays with Nhost).

## Tables

| Table | Purpose |
|-------|---------|
| `organizations` | Tenant root + quota counters |
| `org_members` | user ↔ org with `owner` \| `editor` \| `viewer` |
| `workflows` | Automation definition (`draft` \| `active` \| `archived`) |
| `workflow_steps` | Ordered steps; type-specific `config` JSONB |
| `workflow_triggers` | `manual` \| `webhook` \| `scheduled` \| `database_event` |
| `workflow_runs` | Execution instance + optional `idempotency_key` |
| `step_runs` | Per-step live state for GraphQL subscriptions |
| `inbox_events` | Watched source for database_event Hasura trigger |
| `workflow_artifacts` | Allowlisted `db_write` destination |
| `webhook_idempotency` | Dedup store for webhook retries |

## Key design tradeoffs

1. **JSONB step/trigger config** — Flexible per-type settings without schema churn; validated in application layer (Zod) before insert/update. Normalized config tables would be safer for queryability but slower to evolve.
2. **No FK from `org_members.user_id` → `auth.users`** — Avoids coupling public migrations to Nhost auth internals; integrity enforced by seed/link scripts and Action handlers.
3. **`step_runs.workflow_step_id` ON DELETE RESTRICT** — Preserves historical run integrity; UI should archive workflows rather than delete steps with runs.
4. **Quota: 1 unit per workflow run** — Atomic `quota_check_and_increment` with `FOR UPDATE` prevents concurrent bypass. Period auto-resets monthly.

## Aggregation

### Primary (required): `org_usage_summary`

SQL view exposing `quota_used`, `quota_limit`, `quota_remaining`, `quota_period_start`, `runs_this_period`.

**Why this view:** Dashboard requirement (“Usage: 72 / 100”) and direct alignment with quota enforcement. Tracked in Hasura (Phase 3) with the same membership filter as `organizations`.

### Secondary: `workflow_run_stats`

Per-workflow `total_runs`, `completed_runs`, `failed_runs`, `success_rate`, `average_run_duration_seconds`. Optional UI panel on workflow detail.

## Applying migrations

Canonical SQL:

```
database/migrations/001_initial_schema.sql
database/migrations/002_views_and_functions.sql
```

Mirrored for Hasura CLI under `hasura/migrations/default/`.

```powershell
$env:DATABASE_URL = "postgres://..."
.\scripts\apply-migrations.ps1
```

```bash
export DATABASE_URL="postgres://..."
./scripts/apply-migrations.sh
```

## Seeding

1. Create demo users in Nhost Auth (`owner@acme.demo`, etc.).
2. Copy their user UUIDs.
3. Run:

```powershell
.\scripts\seed-demo.ps1 `
  -OrgAOwner "<uuid>" -OrgAEditor "<uuid>" -OrgAViewer "<uuid>" `
  -OrgBOwner "<uuid>" -OrgBEditor "<uuid>"
```

For local SQL-only tests without Auth:

```powershell
.\scripts\seed-demo.ps1 -UsePlaceholders
```

### Stable demo IDs

| Entity | UUID |
|--------|------|
| Org A (Acme) | `a1111111-1111-4111-8111-111111111111` |
| Org B (Beta) | `b2222222-2222-4222-8222-222222222222` |
| Demo workflow | `c3333333-3333-4333-8333-333333333333` |
| Webhook trigger | `e5555555-5555-4555-8555-555555555502` |

## Verification

```bash
psql "$DATABASE_URL" -f database/scripts/verify_schema.sql
```
