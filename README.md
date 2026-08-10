# AI Agent Workflow Automation Platform (n8n-style)

A production-quality, multi-tenant AI Agent Workflow Automation Platform built on Next.js 15, PostgreSQL, Hasura GraphQL Engine, Nhost Auth, and Nhost Functions.

---

## Key Features

- **Multi-Tenant Organization Architecture:** Organization-based scoping with strict role-based access control (`owner`, `editor`, `viewer`).
- **Ordered Workflow Builder:** Visual ordered step pipeline builder (`LLM Call`, `HTTP Request`, `Conditional Branch`, `Approval Gate`, `Notify`, `DB Write`).
- **Human-in-the-Loop Approval Gates:** Execution pauses automatically at `approval_gate` steps, requiring authorized human approval to resume execution via Hasura Actions.
- **4 Trigger Types (Shared Engine Convergence):** Manual trigger, Webhook HTTP POST trigger (with idempotency support), Scheduled Cron trigger (15-minute cadence), and Database Event trigger (`inbox_events`).
- **Real-Time GraphQL Subscriptions:** Live step execution state, attempt counters, and status updates delivered to the browser without polling via WebSocket (`graphql-ws`).
- **Two-Layer Security Authorization:** Hasura Row-Level Security (Layer 1) + Server-Side Action Business Logic (Layer 2).
- **Server-Side Aggregations:** Quota monitoring and workflow run statistics powered by PostgreSQL `CREATE VIEW` objects (`org_usage_summary` & `workflow_run_stats`).
- **Security Protections:** SSRF protection blocking private network/metadata targets (e.g. `169.254.169.254`), atomic database quota locking, no dynamic `eval()`.

---

## Tech Stack

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Apollo Client (HttpLink + WebSocketLink).
- **Backend & Platform:** Nhost, Hasura GraphQL Engine, PostgreSQL 14+, Nhost Auth, Nhost Functions (Node.js ESM).
- **AI Integration:** Groq LLM API (`llama-3.3-70b-versatile`) with OpenRouter / Gemini fallbacks.

---

## Repository Monorepo Structure

```
workflow-agent-platform/
├── apps/
│   └── web/                        # Next.js 15 SaaS Dashboard Frontend
│       ├── app/                    # App Router (Protected routes, login, signup)
│       ├── components/             # Reusable UI components & AppShell
│       ├── features/               # Feature-specific modules & auth forms
│       ├── hooks/                  # React hooks & Organization Context Provider
│       ├── lib/                    # Nhost & Apollo client setup
│       ├── providers/              # App, Nhost, Apollo, and Org Providers
│       └── ...
│
├── backend/                        # Backend Engine Services & Functions
│   ├── functions/                  # Nhost Serverless Function Handlers
│   │   ├── trigger-workflow-run/   # Hasura Action handler
│   │   ├── approve-step/           # Hasura Action handler with FOR UPDATE lock
│   │   ├── webhook-trigger/        # Public HTTP POST webhook endpoint
│   │   ├── scheduled-trigger/      # Cron-triggered scheduled scan handler
│   │   └── db-event-trigger/       # Hasura Event Trigger webhook handler
│   │
│   ├── services/                   # Modular Core Engine Services
│   │   ├── workflow-engine/        # Shared Workflow Engine & repository
│   │   ├── authorization/          # Layer 2 business authorization
│   │   ├── quota/                  # Atomic PL/pgSQL quota enforcer
│   │   ├── llm/                    # Groq/OpenRouter/Gemini client
│   │   ├── http/                   # HTTP client with SSRF guard
│   │   ├── notifications/          # Slack webhook & email provider
│   │   └── database/               # PostgreSQL pool connection
│   │
│   └── utils/                      # SSRF guard, template, conditional evaluator
│
├── hasura/                         # Hasura Metadata & Migrations
│   ├── metadata/                   # Tracked tables, permissions, actions, cron triggers
│   └── migrations/                 # Hasura schema migrations
│
├── database/                       # Raw SQL Schema & Seed Data
│   ├── migrations/                 # 001_initial_schema, 002_views, 003_inbox_events
│   └── seeds/                      # Demo seed data (Org A, Org B, sample workflows)
│
├── docs/                           # Comprehensive Architecture & Write-Up Docs
│   ├── architecture.md             # System topology & data flow
│   ├── authorization.md            # Layer 1 vs Layer 2 security model
│   ├── workflow-engine.md          # Step handlers & state transitions
│   ├── deployment.md               # Vercel & Nhost deployment guide
│   ├── demo-script.md              # End-to-end demo walkthrough & recording guide
│   └── WRITEUP.md                  # ~1 page architecture summary deliverable
│
├── tests/                          # Test Suite
│   └── unit/                       # Vitest unit tests (authorization, SSRF, evaluator)
│
├── package.json                    # Workspace monorepo root
└── README.md                       # Project documentation
```

---

## Local Setup & Quickstart

### 1. Prerequisites
- Node.js >= 20
- PostgreSQL database or Nhost local stack

### 2. Environment Setup
Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Database Migrations & Hasura Setup
Run database migrations and apply Hasura metadata:

```bash
# Apply database schema
npm run db:migrate

# Apply Hasura metadata & permissions
npm run hasura:apply

# Seed demo data
npm run db:seed
```

### 5. Run Web Application & Backend Tests

```bash
# Run Vitest unit tests (25 tests passing)
npm run test

# Run Next.js Web App
npm run dev
```

Visit `http://localhost:3000` to access the application.

---

## Demo Credentials & Seed Data

- **Organization A:**
  - Owner: `owner-orga@example.com` / `password123`
  - Editor: `editor-orga@example.com` / `password123`
  - Viewer: `viewer-orga@example.com` / `password123`
- **Organization B:**
  - Owner: `owner-orgb@example.com` / `password123`
