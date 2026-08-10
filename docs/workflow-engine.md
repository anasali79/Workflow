# Workflow Execution Engine

This document details the design, state transitions, step handlers, and trigger convergence in the Workflow Engine.

---

## Shared Trigger Convergence

All trigger entry points converge on the exact same execution engine path:

```
Manual Trigger (Hasura Action) ──────┐
Webhook Trigger (HTTP POST) ────────┼──> WorkflowEngine.triggerRun()
Scheduled Cron (15-min cadence) ────┼──────> executeRun() -> Step Handler Loop
DB Event Trigger (Inbox Event) ─────┘
```

---

## Step Handler Strategy Architecture

Each step type is implemented as an isolated strategy handler implementing the `StepHandler` interface:

- `LlmCallHandler`: Calls Groq / OpenRouter / Gemini with system/user prompt template resolution.
- `HttpRequestHandler`: Executes SSRF-guarded HTTP GET/POST/PUT/PATCH/DELETE requests.
- `ConditionalBranchHandler`: Evaluates JSON field comparisons without `eval()`, setting `skipUntilPosition`.
- `ApprovalGateHandler`: Pauses execution, sets `step_run: paused` & `workflow_run: paused`.
- `NotifyHandler`: Sends Slack webhook or email notifications.
- `DbWriteHandler`: Safely writes output artifacts to controlled `workflow_artifacts` destination table.

---

## State Transition Machine

```
[Pending] ──> [Running] ──┬──> [Completed]
                          ├──> [Failed] (Retries exhausted or fatal error)
                          └──> [Paused] ──(approveStep)──> [Running] ──> [Completed]
```

### Resume Strategy:
When `approveStep` is invoked, the engine locks the step run `FOR UPDATE`, marks it `completed`, sets `workflow_run: running`, and re-invokes `executeRun()`. The engine hydrates previous step outputs from existing completed step runs in database, skipping finished steps and continuing from step `N+1`.
