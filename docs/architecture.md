# Platform Architecture

This document describes the end-to-end technical architecture of the AI Agent Workflow Automation Platform.

```
Next.js Frontend (React 19, Tailwind CSS, Apollo Client)
                  │
                  │ GraphQL Queries, Mutations & Real-time Subscriptions
                  ▼
         Nhost / Hasura Engine
       ┌──────────┴──────────┐
       │ PostgreSQL (v14+)   │ Auth (JWT & Roles)
       └──────────┬──────────┘
                  │
                  │ Hasura Actions / Event Triggers / Cron Triggers
                  ▼
  Nhost Functions (Node.js ESM)
       │
       ├── Workflow Engine Core
       │    ├── Authorization Service (Layer 2 Business Rules)
       │    ├── Quota Service (Atomic DB locking)
       │    └── Step Handlers
       │         ├── LLM Handler (Groq / OpenRouter / Gemini)
       │         ├── HTTP Handler (SSRF Guarded)
       │         ├── Conditional Branch Handler
       │         ├── Approval Gate Handler
       │         ├── Notify Handler (Slack Webhook)
       │         └── DB Write Handler (Workflow Artifacts)
       │
       └── External Integration Services
```

## Architectural Layers & Separation of Concerns

1. **Frontend (Apps/Web):**
   - Next.js 15 App Router with TypeScript.
   - Apollo Client with WebSocketLink (`graphql-ws`) for real-time GraphQL Subscriptions.
   - Zero business logic inside React components; components consume custom hooks and typed GraphQL operations.

2. **GraphQL & Data Layer (Hasura & PostgreSQL):**
   - Single source of truth in PostgreSQL.
   - Hasura provides instant GraphQL APIs for CRUD operations and live subscriptions.
   - `org_usage_summary` & `workflow_run_stats` SQL views tracked in Hasura for server-side aggregation.

3. **Backend Orchestration (Nhost Functions & Workflow Engine):**
   - Modular engine with Strategy Pattern for step handlers (`LlmCallHandler`, `HttpRequestHandler`, `ApprovalGateHandler`, etc.).
   - Shared entry point `WorkflowEngine.triggerRun()` handles all 4 trigger types (`manual`, `webhook`, `scheduled`, `database_event`).
