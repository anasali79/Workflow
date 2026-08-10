# Deployment Guide

This document describes how to deploy the AI Agent Workflow Automation Platform to production using Vercel and Nhost.

---

## Architecture Deployment Target

- **Frontend (Next.js 15):** Vercel
- **Backend Services, Database & GraphQL Engine:** Nhost Cloud (PostgreSQL + Hasura Engine + Nhost Auth + Nhost Functions)

---

## Environment Variables Configuration

Set the following environment variables in Vercel & Nhost Console:

```env
# Nhost Frontend Configuration
NEXT_PUBLIC_NHOST_SUBDOMAIN=your-nhost-subdomain
NEXT_PUBLIC_NHOST_REGION=us-east-1

# Nhost Backend Secrets
DATABASE_URL=postgres://postgres:password@db.nhost.run:5432/nhost
HASURA_GRAPHQL_ADMIN_SECRET=your-admin-secret
INTERNAL_FUNCTION_SECRET=your-internal-function-secret

# LLM Integration
LLM_API_KEY=gsk_your_groq_api_key
LLM_MODEL=llama-3.3-70b-versatile
LLM_PROVIDER=groq

# Notifications & Triggers
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/XXX/YYY/ZZZ
WEBHOOK_SECRET=your_webhook_secret
SCHEDULED_TRIGGER_SECRET=your_scheduled_trigger_secret
```

---

## Hasura Metadata & Database Migrations

Apply database migrations and Hasura metadata to your production Nhost instance:

```bash
# Apply database schema migrations
powershell -ExecutionPolicy Bypass -File ./scripts/apply-migrations.ps1

# Track tables & apply Hasura metadata (permissions, relationships, actions)
powershell -ExecutionPolicy Bypass -File ./scripts/hasura-apply-metadata.ps1

# Seed initial organization and workflow data
powershell -ExecutionPolicy Bypass -File ./scripts/seed-demo.ps1
```
