# End-to-End Demo Script & Recording Guide

This document provides exact step-by-step instructions for reproducing the final end-to-end demo scenario and recording a 2–5 minute walkthrough video.

---

## Final Demo Scenario Checklist

| Step | Goal | Action / Expected Result |
| :--- | :--- | :--- |
| **Step 1** | Login as Org A Owner | Sign in with Org A Owner credentials. Observe Dashboard showing Organization A and role `owner`. |
| **Step 2** | Open Workflow | Navigate to `/workflows` -> Open sample workflow (`LLM -> HTTP -> Conditional -> Approval Gate -> Notify`). |
| **Step 3** | Execute Workflow | Click **▶ Execute Workflow**. Observe live subscription (`/workflows/[id]/runs`): <br> `LLM` (Completed) -> `HTTP` (Completed) -> `Conditional` (Completed) -> `Approval Gate` (**Paused**). |
| **Step 4** | Human Approval | Sign in as Org A Editor/Owner. Click **✓ Approve Step**. Observe live subscription update immediately to `Completed` for Approval & Notify steps. |
| **Step 5** | Non-Manual Trigger | Send POST request to Webhook Trigger URL `POST /webhook/workflow/<triggerId>`. Observe new run start automatically without clicking Run. |
| **Step 6** | Security & Cross-Org Test | Sign in as Organization B User. Attempt to view, trigger, or approve Org A workflow. Observe HTTP 403 / Hasura isolation blocking access. |

---

## Screen Recording Instructions

**Recommended Tool:** OBS Studio, Loom, QuickTime, or Windows Snipping Tool (Win + Shift + R).

### Video Recording Sequence (2-5 Minutes):

1. **Start Recording (0:00 - 0:30):**
   - Open browser to `http://localhost:3000/login`.
   - Log in as `owner-orga@example.com` / `password123`.
   - Show the **Dashboard**: Point out Organization A name, role badge (`owner`), and the **Quota Usage bar** (backed by Postgres `org_usage_summary` view).

2. **Workflow Builder Inspection (0:30 - 1:15):**
   - Click **Workflows** in the sidebar.
   - Click on the Sample Workflow (`LLM Call -> HTTP Request -> Conditional Branch -> Approval Gate -> Notify`).
   - Show the step configuration inspector on the right.

3. **Execution & Live Subscription (1:15 - 2:30):**
   - Click **▶ Execute Workflow**.
   - Navigate to **View Runs / Live Status**.
   - Observe real-time GraphQL Subscription updates:
     - `LLM Call` -> Completed
     - `HTTP Request` -> Completed
     - `Conditional Branch` -> Completed
     - `Approval Gate` -> **Paused (Waiting for approval)** banner appears.

4. **Approval Step Resumption (2:30 - 3:15):**
   - Click the orange **✓ Approve Step** button.
   - Watch the live status instantly update:
     - `Approval Gate` -> Completed
     - `Notify Step` -> Completed
     - Overall Run Status -> **Completed**.

5. **Webhook Trigger Demonstration (3:15 - 4:00):**
   - Copy the Webhook URL from the workflow trigger config: `http://localhost:1337/v1/functions/webhook-trigger/webhook/workflow/<triggerId>`.
   - Send a curl / PowerShell POST request:
     ```powershell
     Invoke-RestMethod -Method POST -Uri "http://localhost:1337/v1/functions/webhook-trigger/webhook/workflow/<triggerId>" -Headers @{"X-Webhook-Secret"="dev_webhook_secret"}
     ```
   - Show that a new run appears in the execution list automatically without clicking Run.

6. **Cross-Organization Isolation Verification (4:00 - 4:45):**
   - Log out and log in as Organization B user (`owner-orgb@example.com`).
   - Paste the Organization A workflow URL (`/workflows/<org-a-workflow-id>`).
   - Show that the page displays "Workflow Not Found" (Hasura row permissions block cross-org UUID access).
   - Stop recording.
