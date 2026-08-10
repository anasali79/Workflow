"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { gql, useMutation, useQuery } from "@apollo/client";
import { useAccessToken } from "@nhost/react";
import { useOrganization } from "@/hooks/use-organization";
import { AppShell } from "@/components/layout/app-shell";
import { UserMenu } from "@/components/auth/user-menu";

const WORKFLOW_DETAIL_QUERY = gql`
  query GetWorkflowDetail($workflowId: uuid!) {
    workflows_by_pk(id: $workflowId) {
      id organization_id name description status
      workflow_steps(order_by: { position: asc }) {
        id position name type config
      }
      workflow_triggers {
        id type config enabled
      }
    }
  }
`;

const UPDATE_STEP_CONFIG_MUTATION = gql`
  mutation UpdateStepConfig($stepId: uuid!, $config: jsonb!, $name: String!) {
    update_workflow_steps_by_pk(pk_columns: { id: $stepId }, _set: { config: $config, name: $name }) {
      id name config
    }
  }
`;

const TOGGLE_TRIGGER_MUTATION = gql`
  mutation ToggleTrigger($triggerId: uuid!, $enabled: Boolean!) {
    update_workflow_triggers_by_pk(pk_columns: { id: $triggerId }, _set: { enabled: $enabled }) {
      id enabled
    }
  }
`;

type Props = { params: Promise<{ workflowId: string }> };

interface StepRecord {
  id: string; position: number; name: string; type: string; config: Record<string, unknown>;
}
interface TriggerRecord {
  id: string; type: string; config: Record<string, unknown>; enabled: boolean;
}

const STEP_META: Record<string, { icon: string; label: string; badgeClass: string; desc: string }> = {
  llm_call: { icon: "🧠", label: "LLM Call", badgeClass: "badge-purple", desc: "Calls AI model (Groq Llama 3.3 / GPT-4o) with custom prompts." },
  http_request: { icon: "🌐", label: "HTTP Request", badgeClass: "badge-blue", desc: "Calls external HTTP REST APIs (GET, POST, PUT, DELETE)." },
  conditional_branch: { icon: "🔀", label: "Conditional Branch", badgeClass: "badge-amber", desc: "Routes pipeline logic based on step outputs." },
  approval_gate: { icon: "🔒", label: "Approval Gate", badgeClass: "badge-red", desc: "Pauses execution until owner approves." },
  notify: { icon: "🔔", label: "Notify", badgeClass: "badge-green", desc: "Delivers live notifications to Slack webhooks or emails." },
  db_write: { icon: "💾", label: "DB Write", badgeClass: "badge-gray", desc: "Saves outputs directly into PostgreSQL database." },
};

const DEFAULT_CONFIGS: Record<string, Record<string, unknown>> = {
  llm_call: {
    model: "llama-3.3-70b-versatile",
    systemPrompt: "You are a helpful assistant.",
    userPrompt: "Summarize this: {{trigger.payload.message}}",
    temperature: 0.7,
    maxTokens: 512,
  },
  http_request: {
    method: "GET",
    url: "https://jsonplaceholder.typicode.com/posts/1",
    headers: {},
    body: null,
    timeoutMs: 10000,
  },
  conditional_branch: {
    sourceStepPosition: 0,
    path: "text",
    operator: "contains",
    expectedValue: "urgent",
    trueBranch: { action: "continue" },
    falseBranch: { action: "skip_next_n", count: 1 },
  },
  approval_gate: { message: "Require human approval before proceeding." },
  notify: { provider: "slack", messageTemplate: "Workflow {{workflowName}} completed: {{previousOutput}}", webhookUrl: "" },
  db_write: { targetTable: "workflow_artifacts", fieldMapping: { content: "{{stepOutputs.0.text}}" } },
};

// ── Visual Form Helpers ──
function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {label}
        </label>
        {hint && <span style={{ fontSize: "11px", color: "var(--muted)" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ── 1. LLM Call Visual Form ──
function LlmCallForm({ config, onChange, disabled }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void; disabled: boolean }) {
  const set = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  const temp = Number(config.temperature ?? 0.7);

  function insertVar(varTag: string) {
    const current = String(config.userPrompt ?? "");
    set("userPrompt", current ? `${current} ${varTag}` : varTag);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <FormField label="AI Model" hint="Select provider engine">
        <select
          className="wf-input"
          value={String(config.model ?? "llama-3.3-70b-versatile")}
          disabled={disabled}
          onChange={(e) => set("model", e.target.value)}
        >
          <option value="llama-3.3-70b-versatile">🦙 Llama 3.3 70B Versatile (Groq - Ultra Fast)</option>
          <option value="llama-3.1-8b-instant">⚡ Llama 3.1 8B Instant (Groq)</option>
          <option value="gemma2-9b-it">💎 Gemma 2 9B (Groq)</option>
          <option value="gpt-4o-mini">🟢 GPT-4o Mini (OpenAI)</option>
          <option value="gpt-4o">🧠 GPT-4o (OpenAI)</option>
          <option value="claude-3-haiku-20240307">🟧 Claude 3 Haiku (Anthropic)</option>
        </select>
      </FormField>

      <FormField label="System Prompt" hint="Model role behavior instructions">
        <textarea
          className="wf-input" rows={2}
          value={String(config.systemPrompt ?? "")}
          disabled={disabled}
          onChange={(e) => set("systemPrompt", e.target.value)}
          placeholder="e.g. You are an expert AI agent that processes input data."
        />
      </FormField>

      <FormField label="User Prompt" hint="Main prompt text">
        <textarea
          className="wf-input" rows={4}
          value={String(config.userPrompt ?? "")}
          disabled={disabled}
          onChange={(e) => set("userPrompt", e.target.value)}
          placeholder="e.g. Process input: {{trigger.payload.message}}"
        />
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
          <span style={{ fontSize: "11px", color: "var(--muted)", alignSelf: "center" }}>Insert variable:</span>
          {["{{trigger.payload.message}}", "{{trigger.payload.input}}", "{{stepOutputs.0.text}}"].map((tag) => (
            <button
              key={tag} type="button" disabled={disabled}
              onClick={() => insertVar(tag)}
              style={{
                background: "var(--bg-3)", border: "1px solid var(--border-2)",
                borderRadius: "6px", padding: "2px 8px", fontSize: "11px",
                color: "var(--accent-hover)", cursor: "pointer", fontFamily: "monospace",
              }}
            >
              + {tag}
            </button>
          ))}
        </div>
      </FormField>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <FormField label="Temperature" hint={`Value: ${temp}`}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <input
              type="range" min="0" max="1" step="0.05"
              value={temp} disabled={disabled}
              onChange={(e) => set("temperature", parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: "var(--accent)", cursor: "pointer" }}
            />
            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--accent-hover)", width: "36px" }}>
              {temp.toFixed(2)}
            </span>
          </div>
        </FormField>

        <FormField label="Max Tokens" hint="Completion length">
          <input
            className="wf-input" type="number" min="1" max="8192"
            value={Number(config.maxTokens ?? 512)}
            disabled={disabled}
            onChange={(e) => set("maxTokens", parseInt(e.target.value) || 512)}
          />
        </FormField>
      </div>
    </div>
  );
}

// ── 2. HTTP Request Visual Form ──
function HttpRequestForm({ config, onChange, disabled }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void; disabled: boolean }) {
  const set = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: "12px" }}>
        <FormField label="HTTP Method">
          <select
            className="wf-input"
            value={String(config.method ?? "GET")}
            disabled={disabled}
            onChange={(e) => set("method", e.target.value)}
          >
            {["GET", "POST", "PUT", "PATCH", "DELETE"].map(m => <option key={m}>{m}</option>)}
          </select>
        </FormField>
        <FormField label="Endpoint URL" hint="Supports {{variables}}">
          <input
            className="wf-input" type="text"
            value={String(config.url ?? "")}
            disabled={disabled}
            onChange={(e) => set("url", e.target.value)}
            placeholder="https://api.example.com/data"
          />
        </FormField>
      </div>

      <FormField label="Request Headers (JSON)" hint='e.g. {"Authorization": "Bearer token"}'>
        <textarea
          className="wf-input font-mono" rows={2}
          defaultValue={JSON.stringify(config.headers ?? {}, null, 2)}
          disabled={disabled}
          onBlur={(e) => {
            try { set("headers", JSON.parse(e.target.value)); } catch { /* ignore */ }
          }}
        />
      </FormField>

      <FormField label="Request Body" hint="For POST/PUT payloads">
        <textarea
          className="wf-input font-mono" rows={3}
          value={String(config.body ?? "")}
          disabled={disabled}
          onChange={(e) => set("body", e.target.value || null)}
          placeholder='{"key": "value"}'
        />
      </FormField>
    </div>
  );
}

// ── 3. Conditional Branch Visual Form (Simplified) ──
function ConditionalBranchForm({ config, onChange, disabled, steps }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void; disabled: boolean; steps?: Array<{ position: number; name: string }> }) {
  const set = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  const trueBranch = (config.trueBranch as Record<string, unknown>) ?? { action: "continue" };
  const falseBranch = (config.falseBranch as Record<string, unknown>) ?? { action: "continue" };

  const operatorLabels: Record<string, string> = {
    contains: "contains the word",
    equals: "is exactly equal to",
    not_equals: "is NOT equal to",
    not_contains: "does NOT contain",
    gt: "is greater than (number)",
    lt: "is less than (number)",
    exists: "exists (not empty)",
  };

  const branchActionLabel: Record<string, string> = {
    continue: "✅ Continue to the next step",
    fail: "🛑 Stop & fail the workflow",
    skip_next_n: "⏭ Skip next step",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* IF block */}
      <div style={{ background: "var(--bg-3)", border: "1px solid var(--border-2)", borderRadius: "14px", padding: "18px" }}>
        <p style={{ fontSize: "13px", fontWeight: 800, color: "var(--foreground)", marginBottom: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ background: "var(--accent)", color: "white", borderRadius: "6px", padding: "2px 8px", fontSize: "12px" }}>IF</span>
          Check this condition…
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <FormField label="Which step's output?">
            <select
              className="wf-input"
              value={String(config.sourceStepPosition ?? 0)}
              disabled={disabled}
              onChange={(e) => set("sourceStepPosition", parseInt(e.target.value))}
            >
              {steps && steps.length > 0 ? (
                steps.map((s) => (
                  <option key={s.position} value={s.position}>
                    Step {s.position + 1}: {s.name}
                  </option>
                ))
              ) : (
                <option value={0}>Step 1 (position 0)</option>
              )}
            </select>
          </FormField>

          <FormField label="Look at the field" hint='e.g.  text  or  status'>
            <input
              className="wf-input" type="text"
              value={String(config.path ?? "")}
              disabled={disabled}
              onChange={(e) => set("path", e.target.value)}
              placeholder="text"
            />
          </FormField>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <FormField label="Condition">
              <select
                className="wf-input"
                value={String(config.operator ?? "contains")}
                disabled={disabled}
                onChange={(e) => set("operator", e.target.value)}
              >
                {Object.entries(operatorLabels).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </FormField>
            {config.operator !== "exists" && (
              <FormField label="Value to match">
                <input
                  className="wf-input" type="text"
                  value={String(config.expectedValue ?? "")}
                  disabled={disabled}
                  onChange={(e) => set("expectedValue", e.target.value)}
                  placeholder="e.g. urgent"
                />
              </FormField>
            )}
          </div>
        </div>
      </div>

      {/* THEN / ELSE blocks */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
        <div style={{ background: "var(--green-dim)", border: "1px solid #10b98130", borderRadius: "14px", padding: "16px" }}>
          <p style={{ fontSize: "12px", fontWeight: 800, color: "var(--green)", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ background: "#10b981", color: "white", borderRadius: "6px", padding: "2px 8px", fontSize: "11px" }}>THEN</span>
            Condition is TRUE
          </p>
          <select
            className="wf-input"
            value={String(trueBranch.action ?? "continue")}
            disabled={disabled}
            onChange={(e) => set("trueBranch", { action: e.target.value, ...(e.target.value === "skip_next_n" ? { count: 1 } : {}) })}
          >
            {Object.entries(branchActionLabel).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        <div style={{ background: "var(--red-dim)", border: "1px solid #ef444430", borderRadius: "14px", padding: "16px" }}>
          <p style={{ fontSize: "12px", fontWeight: 800, color: "var(--red)", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ background: "#ef4444", color: "white", borderRadius: "6px", padding: "2px 8px", fontSize: "11px" }}>ELSE</span>
            Condition is FALSE
          </p>
          <select
            className="wf-input"
            value={String(falseBranch.action ?? "continue")}
            disabled={disabled}
            onChange={(e) => set("falseBranch", { action: e.target.value, ...(e.target.value === "skip_next_n" ? { count: 1 } : {}) })}
          >
            {Object.entries(branchActionLabel).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

// ── 4. Approval Gate Visual Form ──
function ApprovalGateForm({ config, onChange, disabled }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void; disabled: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div style={{ background: "var(--amber-dim)", border: "1px solid #f59e0b30", borderRadius: "12px", padding: "16px" }}>
        <p style={{ fontSize: "14px", fontWeight: 700, color: "var(--amber)", marginBottom: "4px" }}>🔒 Human Approval Gate</p>
        <p style={{ fontSize: "12px", color: "var(--muted)" }}>
          Execution will pause at this step until an owner approves it from the Live Runs page.
        </p>
      </div>
      <FormField label="Approval Prompt Message">
        <textarea
          className="wf-input" rows={3}
          value={String(config.message ?? "")}
          disabled={disabled}
          onChange={(e) => onChange({ ...config, message: e.target.value })}
          placeholder="Please review output from Step 1 before resuming execution."
        />
      </FormField>
    </div>
  );
}

// ── 5. Notify Visual Form ──
function NotifyForm({ config, onChange, disabled }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void; disabled: boolean }) {
  const set = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <FormField label="Notification Channel">
        <select
          className="wf-input"
          value={String(config.provider ?? "slack")}
          disabled={disabled}
          onChange={(e) => set("provider", e.target.value)}
        >
          <option value="slack">💬 Slack Webhook</option>
          <option value="email">📧 Email Notification</option>
        </select>
      </FormField>

      <FormField label="Slack / Webhook URL" hint="Direct Webhook Endpoint (e.g. https://hooks.slack.com/services/...)">
        <input
          className="wf-input" type="text"
          value={String(config.webhookUrl ?? "")}
          disabled={disabled}
          onChange={(e) => set("webhookUrl", e.target.value)}
          placeholder="https://hooks.slack.com/services/..."
        />
      </FormField>

      <FormField label="Message Template" hint="Dynamic template variables supported">
        <textarea
          className="wf-input" rows={3}
          value={String(config.messageTemplate ?? "")}
          disabled={disabled}
          onChange={(e) => set("messageTemplate", e.target.value)}
          placeholder="Workflow {{workflowName}} completed. Output: {{previousOutput}}"
        />
      </FormField>
    </div>
  );
}

// ── 6. DB Write Visual Form ──
function DbWriteForm({ config, onChange, disabled }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void; disabled: boolean }) {
  const fieldMapping = (config.fieldMapping as Record<string, unknown>) ?? {};
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <FormField label="Target Database Table">
        <select
          className="wf-input"
          value={String(config.targetTable ?? "workflow_artifacts")}
          disabled={disabled}
          onChange={(e) => onChange({ ...config, targetTable: e.target.value })}
        >
          <option value="workflow_artifacts">workflow_artifacts (Public Schema)</option>
        </select>
      </FormField>
      <FormField label="Content Mapping" hint="Use {{stepOutputs.0.text}} for step output">
        <input
          className="wf-input font-mono" type="text"
          value={String(fieldMapping.content ?? "")}
          disabled={disabled}
          onChange={(e) => onChange({ ...config, fieldMapping: { ...fieldMapping, content: e.target.value } })}
          placeholder="{{stepOutputs.0.text}}"
        />
      </FormField>
    </div>
  );
}

// ── Main Workflow Builder Component ──
export default function WorkflowDetailPage({ params }: Props) {
  const { workflowId } = use(params);
  const router = useRouter();
  const { currentRole } = useOrganization();
  const accessToken = useAccessToken();
  const isOwner = currentRole === "owner";
  const isViewer = currentRole === "viewer";

  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<Record<string, unknown>>({});
  const [editingName, setEditingName] = useState<string>("");
  const [triggering, setTriggering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingWorkflow, setDeletingWorkflow] = useState(false);
  const [addingStep, setAddingStep] = useState(false);

  const [showAddStep, setShowAddStep] = useState(false);
  const [newStepType, setNewStepType] = useState("llm_call");
  const [newStepName, setNewStepName] = useState("");

  // Trigger management state
  const [showAddTrigger, setShowAddTrigger] = useState(false);
  const [newTriggerType, setNewTriggerType] = useState("manual");
  const [addingTrigger, setAddingTrigger] = useState(false);
  const [deletingTriggerId, setDeletingTriggerId] = useState<string | null>(null);
  const [copiedTriggerId, setCopiedTriggerId] = useState<string | null>(null);
  const [copiedSecretId, setCopiedSecretId] = useState<string | null>(null);

  // Schedule picker state
  const [schedPreset, setSchedPreset] = useState("every_day");
  const [schedHour, setSchedHour] = useState("09");      // hour part HH
  const [schedMin, setSchedMin] = useState("00");        // minute part MM
  const [schedDay, setSchedDay] = useState("1");         // day of week (0=Sun,1=Mon…)

  function buildCron(): string {
    switch (schedPreset) {
      case "every_5min":  return "*/5 * * * *";
      case "every_10min": return "*/10 * * * *";
      case "every_15min": return "*/15 * * * *";
      case "every_30min": return "*/30 * * * *";
      case "every_hour":  return `0 * * * *`;
      case "every_day":   return `${parseInt(schedMin)} ${parseInt(schedHour)} * * *`;
      case "every_week":  return `${parseInt(schedMin)} ${parseInt(schedHour)} * * ${schedDay}`;
      default:            return "0 9 * * *";
    }
  }

  const { data, loading, refetch } = useQuery(WORKFLOW_DETAIL_QUERY, { variables: { workflowId } });
  const [updateStepConfig] = useMutation(UPDATE_STEP_CONFIG_MUTATION);
  const [toggleTrigger] = useMutation(TOGGLE_TRIGGER_MUTATION);

  const workflow = data?.workflows_by_pk;
  const steps: StepRecord[] = workflow?.workflow_steps ?? [];
  const triggers: TriggerRecord[] = workflow?.workflow_triggers ?? [];
  const selectedStep = steps.find((s) => s.id === selectedStepId);

  function handleSelectStep(step: StepRecord) {
    setSelectedStepId(step.id);
    setEditingConfig(step.config ?? {});
    setEditingName(step.name);
  }

  async function handleSaveStepConfig() {
    if (!selectedStepId || isViewer) return;
    setSaving(true);
    try {
      await updateStepConfig({
        variables: { stepId: selectedStepId, config: editingConfig, name: editingName },
      });
      await refetch();
      alert("✅ Step configuration saved!");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddStep(e: React.FormEvent) {
    e.preventDefault();
    if (isViewer || addingStep) return;
    if (["db_write", "notify"].includes(newStepType) && !isOwner) {
      alert(`Only organization owners can add ${newStepType} steps.`);
      return;
    }
    setAddingStep(true);
    try {
      const res = await fetch("/api/add-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflow_id: workflowId,
          name: newStepName.trim() || STEP_META[newStepType]?.label || newStepType,
          type: newStepType,
          config: DEFAULT_CONFIGS[newStepType] ?? {},
        }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.message || "Failed to add step");
      setShowAddStep(false);
      setNewStepName("");
      await refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add step");
    } finally {
      setAddingStep(false);
    }
  }

  async function handleDeleteStep(stepId: string) {
    if (isViewer) return;
    try {
      const res = await fetch("/api/delete-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step_id: stepId }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.message || "Delete step failed");
      if (selectedStepId === stepId) setSelectedStepId(null);
      await refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete step");
    }
  }

  async function handleDeleteWorkflow() {
    if (isViewer || !workflow) return;
    if (!confirm(`Delete workflow "${workflow.name}"?`)) return;

    setDeletingWorkflow(true);
    try {
      const res = await fetch("/api/delete-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow_id: workflowId }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.message || "Delete workflow failed");
      router.push("/workflows");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete workflow");
      setDeletingWorkflow(false);
    }
  }

  async function handleToggleTrigger(triggerId: string, currentEnabled: boolean) {
    if (isViewer) return;
    try {
      await toggleTrigger({ variables: { triggerId, enabled: !currentEnabled } });
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to toggle trigger");
    }
  }

  async function handleAddTrigger(e: React.FormEvent) {
    e.preventDefault();
    if (isViewer || addingTrigger) return;
    setAddingTrigger(true);
    try {
      const config: Record<string, unknown> = {};
      if (newTriggerType === "scheduled") {
        config.cron = buildCron();
      }
      const res = await fetch("/api/add-trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow_id: workflowId, type: newTriggerType, config }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.message || "Failed to add trigger");
      setShowAddTrigger(false);
      setNewTriggerType("manual");
      await refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add trigger");
    } finally {
      setAddingTrigger(false);
    }
  }

  async function handleDeleteTrigger(triggerId: string) {
    if (isViewer) return;
    setDeletingTriggerId(triggerId);
    try {
      const res = await fetch("/api/delete-trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger_id: triggerId }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.message || "Failed to delete trigger");
      await refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete trigger");
    } finally {
      setDeletingTriggerId(null);
    }
  }

  async function handleRun() {
    if (isViewer) return;
    setTriggering(true);
    try {
      const res = await fetch("/api/trigger-workflow-run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ workflow_id: workflowId }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.message || "Run failed");
      router.push(`/workflows/${workflowId}/runs`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Run failed");
    } finally {
      setTriggering(false);
    }
  }

  if (loading) {
    return (
      <AppShell title="Workflow Builder" description="Loading…">
        <div style={{ textAlign: "center", padding: "80px 0", color: "var(--muted)", fontSize: "14px" }}>
          Loading workflow builder…
        </div>
      </AppShell>
    );
  }

  if (!workflow) {
    return (
      <AppShell title="Not Found" description="">
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <p style={{ color: "var(--muted)", fontSize: "14px" }}>Workflow not found.</p>
          <Link href="/workflows" style={{ color: "var(--accent-hover)", fontSize: "13px", marginTop: "12px", display: "inline-block" }}>
            ← Back to Workflows
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={workflow.name}
      description={workflow.description || "Visual Pipeline Builder & Step Configuration"}
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <UserMenu />
          <Link href={`/workflows/${workflowId}/runs`}>
            <span style={{
              padding: "8px 16px", borderRadius: "10px", border: "1px solid var(--border-2)",
              fontSize: "13px", fontWeight: 600, color: "var(--muted)", cursor: "pointer", display: "inline-block",
            }}>
              📊 View Runs
            </span>
          </Link>
          <button
            disabled={isViewer || triggering}
            onClick={handleRun}
            style={{
              padding: "8px 18px", borderRadius: "10px", border: "none",
              background: "var(--accent)", color: "white", fontWeight: 600, fontSize: "13px",
              cursor: isViewer || triggering ? "not-allowed" : "pointer", opacity: isViewer ? 0.5 : 1,
            }}
          >
            {triggering ? "Starting…" : "▶ Execute Pipeline"}
          </button>
          <button
            disabled={isViewer || deletingWorkflow}
            onClick={handleDeleteWorkflow}
            style={{
              padding: "8px 14px", borderRadius: "10px",
              border: "1px solid var(--red-dim)", background: "var(--red-dim)",
              fontSize: "13px", fontWeight: 600, color: "var(--red)",
              cursor: isViewer || deletingWorkflow ? "not-allowed" : "pointer",
            }}
            title="Delete entire workflow"
          >
            {deletingWorkflow ? "Deleting…" : "🗑 Delete"}
          </button>
        </div>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "20px" }}>

        {/* Left Column: Triggers & Pipeline Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Triggers */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "16px", padding: "18px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--foreground)", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>⚡</span> Triggers
              </h3>
              {!isViewer && (
                <button
                  type="button"
                  onClick={() => setShowAddTrigger((v) => !v)}
                  style={{
                    background: "var(--bg-3)", border: "1px solid var(--border-2)",
                    borderRadius: "8px", padding: "4px 10px", fontSize: "12px",
                    fontWeight: 600, color: "var(--accent-hover)", cursor: "pointer",
                  }}
                >
                  {showAddTrigger ? "× Cancel" : "+ Add"}
                </button>
              )}
            </div>

            {/* Add Trigger inline form */}
            {showAddTrigger && (
              <form
                onSubmit={handleAddTrigger}
                style={{
                  background: "var(--bg-3)", border: "1px solid var(--accent-glow)",
                  borderRadius: "12px", padding: "14px", marginBottom: "14px",
                  display: "flex", flexDirection: "column", gap: "10px",
                }}
              >
                <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent-hover)", textTransform: "uppercase" }}>New Trigger</p>

                <FormField label="Trigger Type">
                  <select
                    className="wf-input"
                    value={newTriggerType}
                    onChange={(e) => setNewTriggerType(e.target.value)}
                  >
                    <option value="manual">🖱 Manual — run by clicking button</option>
                    <option value="webhook">🔗 Webhook — triggered by external HTTP call</option>
                    <option value="scheduled">🕐 Schedule — runs on a cron schedule</option>
                    <option value="database_event">🗄 Database Event — triggered by DB change</option>
                  </select>
                </FormField>

                {newTriggerType === "scheduled" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <FormField label="Run this workflow…">
                      <select
                        className="wf-input"
                        value={schedPreset}
                        onChange={(e) => setSchedPreset(e.target.value)}
                      >
                        <optgroup label="⏱ Every N minutes">
                          <option value="every_5min">Every 5 minutes</option>
                          <option value="every_10min">Every 10 minutes</option>
                          <option value="every_15min">Every 15 minutes</option>
                          <option value="every_30min">Every 30 minutes</option>
                        </optgroup>
                        <optgroup label="🕐 Hourly / Daily / Weekly">
                          <option value="every_hour">Every hour (at :00)</option>
                          <option value="every_day">Every day at a specific time</option>
                          <option value="every_week">Every week on a specific day</option>
                        </optgroup>
                      </select>
                    </FormField>

                    {(schedPreset === "every_day" || schedPreset === "every_week") && (
                      <div style={{ display: "grid", gridTemplateColumns: schedPreset === "every_week" ? "1fr 1fr 1fr" : "1fr 1fr", gap: "10px" }}>
                        {schedPreset === "every_week" && (
                          <FormField label="Day of week">
                            <select className="wf-input" value={schedDay} onChange={(e) => setSchedDay(e.target.value)}>
                              <option value="0">Sunday</option>
                              <option value="1">Monday</option>
                              <option value="2">Tuesday</option>
                              <option value="3">Wednesday</option>
                              <option value="4">Thursday</option>
                              <option value="5">Friday</option>
                              <option value="6">Saturday</option>
                            </select>
                          </FormField>
                        )}
                        <FormField label="Hour (24h)">
                          <select className="wf-input" value={schedHour} onChange={(e) => setSchedHour(e.target.value)}>
                            {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map(h => (
                              <option key={h} value={h}>{h}:00</option>
                            ))}
                          </select>
                        </FormField>
                        <FormField label="Minute">
                          <select className="wf-input" value={schedMin} onChange={(e) => setSchedMin(e.target.value)}>
                            {["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"].map(m => (
                              <option key={m} value={m}>:{m}</option>
                            ))}
                          </select>
                        </FormField>
                      </div>
                    )}

                    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 12px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "11px", color: "var(--muted)" }}>Cron:</span>
                      <code style={{ fontSize: "12px", color: "var(--accent-hover)", fontFamily: "monospace" }}>{buildCron()}</code>
                    </div>
                  </div>
                )}

                {newTriggerType === "webhook" && (
                  <div style={{ background: "var(--surface)", border: "1px solid #10b98130", borderRadius: "8px", padding: "12px" }}>
                    <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--green)", marginBottom: "4px" }}>🔗 How it works</p>
                    <p style={{ fontSize: "11px", color: "var(--muted)", lineHeight: "1.6" }}>
                      After adding, you&apos;ll get a <strong>unique webhook URL</strong> that you can call from anywhere (Postman, another service, etc.) with a <code>POST</code> request to instantly run this workflow.
                    </p>
                  </div>
                )}

                <button
                  type="submit" disabled={addingTrigger}
                  style={{
                    background: addingTrigger ? "var(--surface-2)" : "var(--accent)",
                    color: "white", border: "none",
                    borderRadius: "8px", padding: "7px 14px", fontSize: "12px",
                    fontWeight: 600, cursor: addingTrigger ? "not-allowed" : "pointer",
                    alignSelf: "flex-end",
                  }}
                >
                  {addingTrigger ? "Adding…" : "✓ Add Trigger"}
                </button>
              </form>
            )}

            {/* Triggers list */}
            {triggers.length === 0 && !showAddTrigger ? (
              <p style={{ fontSize: "12px", color: "var(--muted)", margin: 0 }}>No triggers yet. Click <strong>+ Add</strong> to configure one.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {triggers.map((tr) => {
                  const TRIGGER_ICONS: Record<string, string> = {
                    manual: "🖱", webhook: "🔗", scheduled: "🕐", database_event: "🗄",
                  };
                  const TRIGGER_LABELS: Record<string, string> = {
                    manual: "Manual", webhook: "Webhook", scheduled: "Schedule", database_event: "DB Event",
                  };
                  const isDeleting = deletingTriggerId === tr.id;
                  const isCopied = copiedTriggerId === tr.id;
                  const cronVal = (tr.config as Record<string, unknown>)?.cron as string | undefined;

                  // Build the friendly cron description
                  function describeCron(cron: string): string {
                    if (cron === "*/5 * * * *")  return "Every 5 minutes";
                    if (cron === "*/10 * * * *") return "Every 10 minutes";
                    if (cron === "*/15 * * * *") return "Every 15 minutes";
                    if (cron === "*/30 * * * *") return "Every 30 minutes";
                    if (cron === "0 * * * *")    return "Every hour";
                    const parts = cron.split(" ");
                    if (parts.length === 5) {
                      const [m, h, , , dow] = parts;
                      const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
                      const timeStr = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
                      if (dow === "*") return `Every day at ${timeStr}`;
                      return `Every ${days[parseInt(dow)] ?? dow} at ${timeStr}`;
                    }
                    return cron;
                  }

                  // Webhook URL: POST /webhook/workflow/<triggerId>
                  const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL ||
                    `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.functions.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1`;
                  const webhookUrl = `${backendBase}/webhook/workflow/${tr.id}`;
                  const webhookSecret = process.env.NEXT_PUBLIC_WEBHOOK_SECRET || "dev_webhook_secret_key_12345";
                  const isSecretCopied = copiedSecretId === tr.id;

                  function copyWebhookUrl() {
                    navigator.clipboard.writeText(webhookUrl).then(() => {
                      setCopiedTriggerId(tr.id);
                      setTimeout(() => setCopiedTriggerId(null), 2000);
                    });
                  }

                  function copyWebhookSecret() {
                    navigator.clipboard.writeText(webhookSecret).then(() => {
                      setCopiedSecretId(tr.id);
                      setTimeout(() => setCopiedSecretId(null), 2000);
                    });
                  }

                  return (
                    <div
                      key={tr.id}
                      style={{
                        background: "var(--bg-3)", border: "1px solid var(--border)",
                        borderRadius: "10px", padding: "10px 12px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "16px" }}>{TRIGGER_ICONS[tr.type] ?? "⚡"}</span>
                          <div>
                            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--foreground)" }}>
                              {TRIGGER_LABELS[tr.type] ?? tr.type}
                            </span>
                            {tr.type === "scheduled" && cronVal && (
                              <p style={{ fontSize: "11px", color: "var(--muted)", margin: 0 }}>{describeCron(cronVal)}</p>
                            )}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <button
                            type="button" disabled={isViewer}
                            onClick={() => handleToggleTrigger(tr.id, tr.enabled)}
                            className={`toggle ${tr.enabled ? "on" : ""}`}
                          />
                          {!isViewer && (
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => handleDeleteTrigger(tr.id)}
                              style={{
                                background: "none", border: "none",
                                fontSize: "13px", cursor: isDeleting ? "not-allowed" : "pointer",
                                color: "var(--muted)", padding: "2px 4px",
                              }}
                              title="Remove trigger"
                              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--red)"; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--muted)"; }}
                            >
                              {isDeleting ? "…" : "🗑"}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Webhook URL & Secret box */}
                      {tr.type === "webhook" && (
                        <div style={{ marginTop: "10px", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: "8px", padding: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
                          {/* URL section */}
                          <div>
                            <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
                              Webhook URL — POST to trigger
                            </p>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <code style={{
                                flex: 1, fontSize: "10.5px", color: "var(--accent-hover)", fontFamily: "monospace",
                                background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: "6px",
                                padding: "6px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block",
                              }}>
                                {webhookUrl}
                              </code>
                              <button
                                type="button"
                                onClick={copyWebhookUrl}
                                style={{
                                  flexShrink: 0, padding: "5px 10px", borderRadius: "8px",
                                  border: isCopied ? "1px solid #10b981" : "1px solid var(--border-2)",
                                  background: isCopied ? "#10b98120" : "var(--bg-3)",
                                  color: isCopied ? "var(--green)" : "var(--muted)",
                                  fontSize: "11px", fontWeight: 600, cursor: "pointer",
                                  transition: "all 0.2s",
                                }}
                              >
                                {isCopied ? "✓ Copied!" : "📋 Copy URL"}
                              </button>
                            </div>
                          </div>

                          {/* Secret Header section */}
                          <div>
                            <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
                              Header Security — x-webhook-secret
                            </p>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <code style={{
                                flex: 1, fontSize: "10.5px", color: "var(--foreground)", fontFamily: "monospace",
                                background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: "6px",
                                padding: "6px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block",
                              }}>
                                x-webhook-secret: {webhookSecret}
                              </code>
                              <button
                                type="button"
                                onClick={copyWebhookSecret}
                                style={{
                                  flexShrink: 0, padding: "5px 10px", borderRadius: "8px",
                                  border: isSecretCopied ? "1px solid #10b981" : "1px solid var(--border-2)",
                                  background: isSecretCopied ? "#10b98120" : "var(--bg-3)",
                                  color: isSecretCopied ? "var(--green)" : "var(--muted)",
                                  fontSize: "11px", fontWeight: 600, cursor: "pointer",
                                  transition: "all 0.2s",
                                }}
                              >
                                {isSecretCopied ? "✓ Copied!" : "🔑 Copy Secret"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pipeline Steps List */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "16px", padding: "18px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--foreground)", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>🔗</span> Pipeline Steps ({steps.length})
              </h3>
              <button
                type="button" disabled={isViewer}
                onClick={() => setShowAddStep((v) => !v)}
                style={{
                  background: "var(--bg-3)", border: "1px solid var(--border-2)",
                  borderRadius: "8px", padding: "4px 10px", fontSize: "12px",
                  fontWeight: 600, color: "var(--accent-hover)", cursor: "pointer",
                }}
              >
                {showAddStep ? "× Cancel" : "+ Add Step"}
              </button>
            </div>

            {/* Inline Add Step Form */}
            {showAddStep && (
              <form onSubmit={handleAddStep} style={{ background: "var(--bg-3)", border: "1px solid var(--accent-glow)", borderRadius: "12px", padding: "14px", marginBottom: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent-hover)", textTransform: "uppercase" }}>Add New Step</p>

                <FormField label="Step Type">
                  <select
                    className="wf-input"
                    value={newStepType}
                    onChange={(e) => setNewStepType(e.target.value)}
                  >
                    {Object.entries(STEP_META).map(([type, meta]) => (
                      <option key={type} value={type} disabled={["db_write", "notify"].includes(type) && !isOwner}>
                        {meta.icon} {meta.label}{["db_write", "notify"].includes(type) && !isOwner ? " (Owner only)" : ""}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Step Name">
                  <input
                    className="wf-input" type="text"
                    placeholder={STEP_META[newStepType]?.label ?? "Step name"}
                    value={newStepName}
                    onChange={(e) => setNewStepName(e.target.value)}
                  />
                </FormField>

                <button
                  type="submit" disabled={addingStep}
                  style={{
                    background: addingStep ? "var(--surface-2)" : "var(--accent)",
                    color: "white", border: "none",
                    borderRadius: "8px", padding: "7px 14px", fontSize: "12px",
                    fontWeight: 600, cursor: addingStep ? "not-allowed" : "pointer", alignSelf: "flex-end",
                  }}
                >
                  {addingStep ? "Adding…" : "✓ Save Step"}
                </button>
              </form>
            )}

            {/* Step Nodes List */}
            {steps.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "var(--muted)", fontSize: "12px" }}>
                No steps added yet. Click &quot;+ Add Step&quot; above.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {steps.map((st, idx) => {
                  const meta = STEP_META[st.type] ?? { icon: "⚙️", label: st.type, badgeClass: "badge-gray", desc: "" };
                  const isSelected = st.id === selectedStepId;

                  return (
                    <div key={st.id} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div
                        onClick={() => handleSelectStep(st)}
                        className={`step-node ${isSelected ? "selected" : ""}`}
                        style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: "10px" }}
                      >
                        <span style={{
                          width: "26px", height: "26px", borderRadius: "8px",
                          background: "var(--bg-3)", border: "1px solid var(--border-2)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "13px", flexShrink: 0,
                        }}>
                          {meta.icon}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--foreground)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {st.name}
                          </p>
                          <span className={`badge ${meta.badgeClass}`} style={{ marginTop: "2px" }}>
                            {meta.label}
                          </span>
                        </div>
                        <span style={{ fontSize: "10px", color: "var(--muted)", flexShrink: 0 }}>
                          #{idx + 1}
                        </span>
                      </div>

                      {!isViewer && (
                        <div style={{ display: "flex", justifyContent: "flex-end", paddingRight: "2px" }}>
                          <button
                            type="button"
                            onClick={() => handleDeleteStep(st.id)}
                            style={{
                              background: "none", border: "none",
                              fontSize: "11px", fontWeight: 600, color: "var(--muted)",
                              cursor: "pointer", padding: "2px 8px",
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--red)"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--muted)"; }}
                          >
                            🗑 Delete step
                          </button>
                        </div>
                      )}

                      {idx < steps.length - 1 && (
                        <div style={{ display: "flex", justifyContent: "center", padding: "2px 0" }}>
                          <div style={{ width: "1.5px", height: "12px", background: "var(--border-2)" }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Form Config Editor */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "16px", padding: "24px", minHeight: "520px", display: "flex", flexDirection: "column" }}>
          {selectedStep ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px", flex: 1 }}>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "28px" }}>{STEP_META[selectedStep.type]?.icon ?? "⚙️"}</span>
                  <div>
                    <input
                      type="text" value={editingName} disabled={isViewer}
                      onChange={(e) => setEditingName(e.target.value)}
                      style={{
                        background: "transparent", border: "none", borderBottom: "1px solid var(--border-2)",
                        fontSize: "16px", fontWeight: 700, color: "var(--foreground)", outline: "none",
                        width: "240px", paddingBottom: "2px",
                      }}
                    />
                    <p style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>
                      Position {selectedStep.position} — {STEP_META[selectedStep.type]?.label ?? selectedStep.type}
                    </p>
                  </div>
                </div>

                <button
                  type="button" disabled={isViewer || saving}
                  onClick={handleSaveStepConfig}
                  style={{
                    background: "var(--accent)", color: "white", border: "none",
                    borderRadius: "10px", padding: "8px 18px", fontSize: "13px",
                    fontWeight: 600, cursor: isViewer || saving ? "not-allowed" : "pointer",
                    opacity: isViewer || saving ? 0.5 : 1,
                  }}
                >
                  {saving ? "Saving…" : "💾 Save Changes"}
                </button>
              </div>

              {/* Form Inputs */}
              <div style={{ flex: 1, overflowY: "auto" }}>
                {selectedStep.type === "llm_call" && (
                  <LlmCallForm config={editingConfig} onChange={setEditingConfig} disabled={isViewer} />
                )}
                {selectedStep.type === "http_request" && (
                  <HttpRequestForm config={editingConfig} onChange={setEditingConfig} disabled={isViewer} />
                )}
                {selectedStep.type === "conditional_branch" && (
                  <ConditionalBranchForm config={editingConfig} onChange={setEditingConfig} disabled={isViewer} steps={steps.filter(s => s.id !== selectedStep.id).map(s => ({ position: s.position, name: s.name }))} />
                )}
                {selectedStep.type === "approval_gate" && (
                  <ApprovalGateForm config={editingConfig} onChange={setEditingConfig} disabled={isViewer} />
                )}
                {selectedStep.type === "notify" && (
                  <NotifyForm config={editingConfig} onChange={setEditingConfig} disabled={isViewer} />
                )}
                {selectedStep.type === "db_write" && (
                  <DbWriteForm config={editingConfig} onChange={setEditingConfig} disabled={isViewer} />
                )}
              </div>

            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: "12px" }}>
              <span style={{ fontSize: "42px" }}>👈</span>
              <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--foreground)" }}>Select a step to configure</p>
              <p style={{ fontSize: "13px", color: "var(--muted)", maxWidth: "280px" }}>
                Click any step on the left pipeline panel to edit its parameters, or click <strong>&quot;📊 View Runs&quot;</strong> to view execution history.
              </p>
            </div>
          )}
        </div>

      </div>
    </AppShell>
  );
}
