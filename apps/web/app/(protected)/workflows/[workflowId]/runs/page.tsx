"use client";

import { use, useState, useCallback } from "react";
import Link from "next/link";
import { gql, useMutation, useQuery, useSubscription } from "@apollo/client";
import { useOrganization } from "@/hooks/use-organization";
import { AppShell } from "@/components/layout/app-shell";


// ── Smart output panel: extracts LLM text prominently, then shows JSON ──
function OutputPanel({ data, isError = false, label = "Output" }: {
  data: unknown;
  isError?: boolean;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [viewRaw, setViewRaw] = useState(false);

  const copyText = useCallback(() => {
    const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, [data]);

  if (data === null || data === undefined) {
    return <p className="text-xs text-[var(--muted)] italic">No {label.toLowerCase()} available.</p>;
  }

  // Extract readable text from LLM outputs
  const asObj = (typeof data === "object" && !Array.isArray(data))
    ? (data as Record<string, unknown>)
    : null;
  const textContent: string | null =
    typeof data === "string" ? data
    : asObj?.text ? String(asObj.text)
    : asObj?.content ? String(asObj.content)
    : asObj?.message ? String(asObj.message)
    : asObj?.result ? String(asObj.result)
    : asObj?.response ? String(asObj.response)
    : asObj?.output ? String(asObj.output)
    : null;

  const hasStructuredData = asObj && Object.keys(asObj).length > 0;

  return (
    <div className="space-y-3">
      {/* Header toolbar */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: isError ? "#ff4d4d" : "var(--muted)" }}>
          {label}
        </span>
        <div className="flex items-center gap-2">
          {hasStructuredData && (
            <button
              onClick={() => setViewRaw(!viewRaw)}
              className="text-[10px] px-2 py-0.5 rounded border transition-colors"
              style={{
                borderColor: viewRaw ? "#7c75f3" : "var(--border-2)",
                color: viewRaw ? "#7c75f3" : "var(--muted)",
                background: viewRaw ? "rgba(124,117,243,0.1)" : "transparent",
              }}
            >
              {viewRaw ? "✦ Formatted" : "{ } Raw JSON"}
            </button>
          )}
          <button
            onClick={copyText}
            className="text-[10px] px-2 py-0.5 rounded border border-[var(--border-2)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            {copied ? "✓ Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {isError ? (
        // Error display
        <div className="p-4 rounded-xl bg-[#ff4d4d]/8 border border-[#ff4d4d]/25 space-y-2">
          <div className="flex items-center gap-2 text-[#ff4d4d] text-xs font-bold">
            <span>✕</span> Execution Error
          </div>
          <p className="text-xs text-[#ff4d4d]/90 leading-relaxed font-mono">
            {typeof data === "string" ? data : JSON.stringify(data)}
          </p>
        </div>
      ) : viewRaw || !hasStructuredData ? (
        // Raw JSON view
        <div className="bg-[var(--bg-3)] border border-[var(--border-2)] rounded-xl p-4 overflow-auto max-h-64">
          <pre className="text-[10px] font-mono leading-5 whitespace-pre-wrap text-[var(--foreground)]">
            {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
          </pre>
        </div>
      ) : (
        // Formatted view
        <div className="space-y-3">
          {/* Prominent text extraction for LLM outputs */}
          {textContent && (
            <div className="p-4 rounded-xl bg-[var(--bg-3)] border border-[var(--border-2)] space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#00c885]">Generated Text</span>
              <p className="text-sm text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">
                {textContent}
              </p>
            </div>
          )}

          {/* Structured key-value table for remaining fields */}
          {asObj && Object.keys(asObj).length > 0 && (
            <div className="rounded-xl border border-[var(--border-2)] overflow-hidden">
              {Object.entries(asObj)
                .filter(([k]) => !textContent || !["text", "content", "message", "result", "response", "output"].includes(k))
                .map(([key, val], i, arr) => (
                  <div
                    key={key}
                    className="flex items-start gap-3 px-4 py-2.5 text-xs"
                    style={{
                      background: i % 2 === 0 ? "var(--bg-3)" : "var(--surface-2)",
                      borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                    }}
                  >
                    <span className="text-[#7c75f3] font-mono font-bold shrink-0 min-w-[100px]">{key}</span>
                    <span className="text-[var(--foreground)] break-all leading-relaxed">
                      {typeof val === "object"
                        ? <code className="font-mono text-[10px] text-[#ffb020]">{JSON.stringify(val)}</code>
                        : typeof val === "boolean"
                        ? <span className="text-[#ffb020] font-bold">{String(val)}</span>
                        : typeof val === "number"
                        ? <span className="text-[#3b82f6] font-mono">{val}</span>
                        : String(val)
                      }
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const WORKFLOW_RUNS_QUERY = gql`
  query GetWorkflowRuns($workflowId: uuid!) {
    workflows_by_pk(id: $workflowId) {
      id
      name
      organization_id
      status
    }
    workflow_runs(
      where: { workflow_id: { _eq: $workflowId } }
      order_by: { created_at: desc }
      limit: 20
    ) {
      id
      status
      trigger_type
      triggered_by
      started_at
      completed_at
      error
      created_at
    }
  }
`;

const STEP_RUNS_SUBSCRIPTION = gql`
  subscription OnStepRunsChanged($workflowRunId: uuid!) {
    step_runs(
      where: { workflow_run_id: { _eq: $workflowRunId } }
      order_by: { workflow_step: { position: asc } }
    ) {
      id
      status
      input
      output
      error
      attempt_count
      approved_by
      approved_at
      started_at
      completed_at
      workflow_step {
        id
        position
        name
        type
      }
    }
  }
`;

const APPROVE_STEP_MUTATION = gql`
  mutation ApproveStep($stepRunId: uuid!, $approvedBy: uuid!) {
    update_step_runs_by_pk(
      pk_columns: { id: $stepRunId }
      _set: { status: "completed", approved_at: "now()", approved_by: $approvedBy }
    ) {
      id
      status
    }
  }
`;

type Props = { params: Promise<{ workflowId: string }> };

const STEP_META: Record<string, { icon: string; label: string; color: string }> = {
  llm_call:            { icon: "🧠", label: "LLM Call",           color: "#7c75f3" },
  http_request:        { icon: "🌐", label: "HTTP Request",        color: "#3b82f6" },
  conditional_branch:  { icon: "🔀", label: "Conditional Branch",  color: "#ffb020" },
  approval_gate:       { icon: "🔒", label: "Approval Gate",       color: "#ff4d4d" },
  notify:              { icon: "🔔", label: "Notify",              color: "#00c885" },
  db_write:            { icon: "💾", label: "DB Write",            color: "#8c9bb4" },
};

function statusColor(s: string) {
  if (s === "completed") return "#00c885";
  if (s === "failed")    return "#ff4d4d";
  if (s === "running")   return "#ffb020";
  if (s === "paused")    return "#7c75f3";
  return "#8c9bb4";
}
function statusIcon(s: string) {
  if (s === "completed") return "✓";
  if (s === "failed")    return "✕";
  if (s === "running")   return "⚙";
  if (s === "paused")    return "⏸";
  return "○";
}

function formatDuration(a?: string, b?: string) {
  if (!a || !b) return "—";
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
function formatAgo(d?: string) {
  if (!d) return "—";
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function WorkflowRunsPage({ params }: Props) {
  const { workflowId } = use(params);
  const { currentRole } = useOrganization();

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [showLogs, setShowLogs]   = useState(true);
  const [approving, setApproving] = useState(false);

  const { data: runsData, refetch } = useQuery(WORKFLOW_RUNS_QUERY, { variables: { workflowId } });
  const runs      = runsData?.workflow_runs ?? [];
  const workflow  = runsData?.workflows_by_pk;
  const activeRunId = selectedRunId ?? runs[0]?.id ?? "00000000-0000-0000-0000-000000000000";

  const { data: subStepData } = useSubscription(STEP_RUNS_SUBSCRIPTION, {
    variables: { workflowRunId: activeRunId },
    skip: !activeRunId,
  });
  const stepRuns = subStepData?.step_runs ?? [];

  const [approveStep] = useMutation(APPROVE_STEP_MUTATION);

  const activeStepRun = selectedStep
    ? stepRuns.find((sr: { id: string }) => sr.id === selectedStep) ?? null
    : stepRuns[0] ?? null;

  async function handleApprove(stepRunId: string) {
    setApproving(true);
    try {
      await approveStep({ variables: { stepRunId, approvedBy: "00000000-0000-0000-0000-000000000000" } });
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to approve step");
    } finally {
      setApproving(false);
    }
  }

  const currentRun = runs.find((r: { id: string }) => r.id === activeRunId) ?? runs[0];

  return (
    <AppShell
      title={workflow?.name ? `${workflow.name} — Execution Runs` : "Workflow Runs"}
      description="Live execution graph, step outputs, and real-time execution logs."
      actions={
        <div className="flex items-center gap-3">
          <Link
            href={`/workflows/${workflowId}`}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--bg-3)] border border-[var(--border-2)] text-xs text-[var(--foreground)] font-semibold hover:border-[#7c75f3] hover:text-[#7c75f3] transition-all shadow-sm"
          >
            ← Back to Builder
          </Link>
          {currentRun && (
            <span
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border shadow-sm"
              style={{
                background: `${statusColor(currentRun.status)}15`,
                color: statusColor(currentRun.status),
                borderColor: `${statusColor(currentRun.status)}40`,
              }}
            >
              <span className="text-sm">{statusIcon(currentRun.status)}</span>
              <span>{currentRun.status?.toUpperCase()}</span>
            </span>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-6 h-full">
        {/* ── Run Selector & History Header ── */}
        <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#00c885] animate-pulse" />
              <h3 className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
                Execution History ({runs.length})
              </h3>
            </div>
            
            {/* Quick stats pills */}
            {runs.length > 0 && (
              <div className="flex items-center gap-2 text-[11px]">
                <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-3)] border border-[var(--border-2)] text-[var(--muted)] font-medium">
                  Total: <strong className="text-[var(--foreground)]">{runs.length}</strong>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-[#00c885]/10 border border-[#00c885]/20 text-[#00c885] font-semibold">
                  ✓ Passed: {runs.filter((r: { status: string }) => r.status === "completed").length}
                </span>
                {runs.filter((r: { status: string }) => r.status === "failed").length > 0 && (
                  <span className="px-2.5 py-1 rounded-lg bg-[#ff4d4d]/10 border border-[#ff4d4d]/20 text-[#ff4d4d] font-semibold">
                    ✕ Failed: {runs.filter((r: { status: string }) => r.status === "failed").length}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Runs horizontal scrollable list */}
          <div className="flex items-center gap-3 overflow-x-auto pb-1.5 pt-0.5 scrollbar-thin">
            {runs.length === 0 ? (
              <div className="py-4 text-center w-full text-xs text-[var(--muted)] italic">
                No execution history yet. Click &quot;Run Workflow&quot; in the builder to execute pipeline.
              </div>
            ) : (
              runs.map((run: { id: string; status: string; created_at: string; started_at?: string; completed_at?: string; trigger_type?: string }) => {
                const isActive = activeRunId === run.id;
                const color = statusColor(run.status);
                const isSuccess = run.status === "completed";
                const isFail = run.status === "failed";
                const isRunning = run.status === "running";

                return (
                  <button
                    key={run.id}
                    onClick={() => { setSelectedRunId(run.id); setSelectedStep(null); }}
                    className={`shrink-0 text-left p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                      isActive
                        ? "shadow-md ring-2 ring-offset-1 ring-offset-[var(--bg)]"
                        : "hover:bg-[var(--surface-2)]"
                    }`}
                    style={{
                      background: isActive ? `${color}12` : "var(--bg-3)",
                      borderColor: isActive ? color : "var(--border-2)",
                      minWidth: "160px",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            isSuccess ? "bg-[#00c885]/20 text-[#00c885]" :
                            isFail ? "bg-[#ff4d4d]/20 text-[#ff4d4d]" :
                            isRunning ? "bg-[#ffb020]/20 text-[#ffb020] animate-spin" :
                            "bg-[var(--muted-2)]/20 text-[var(--muted)]"
                          }`}
                        >
                          {statusIcon(run.status)}
                        </span>
                        <span className="font-mono text-xs font-bold text-[var(--foreground)]">
                          #{run.id.slice(0, 7)}
                        </span>
                      </div>

                      <span className="text-[10px] text-[var(--muted)] capitalize px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)]">
                        {run.trigger_type || "manual"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10.5px] text-[var(--muted)] mt-2 pt-1.5 border-t border-[var(--border)]/50">
                      <span>{formatAgo(run.created_at)}</span>
                      <span className="font-mono text-[var(--foreground)] font-semibold">
                        {formatDuration(run.started_at, run.completed_at)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Main Content: Graph + Detail */}
        {runs.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Execution Graph */}
            <div className="lg:col-span-3 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider flex items-center gap-2">
                  <span>📊</span> Execution Flow Graph
                </h3>
                <span className="text-[10px] text-[#00c885] font-mono font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00c885] animate-ping" />
                  Live Sync Active
                </span>
              </div>

              {stepRuns.length === 0 ? (
                <div className="p-10 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-center space-y-2">
                  <span className="text-2xl">⏳</span>
                  <p className="text-xs text-[var(--muted)]">Initializing step execution data...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {stepRuns.map((sr: {
                    id: string;
                    status: string;
                    started_at?: string;
                    completed_at?: string;
                    attempt_count?: number;
                    workflow_step: { position: number; name: string; type: string }
                  }, idx: number) => {
                    const meta = STEP_META[sr.workflow_step.type] ?? { icon: "⚙", label: sr.workflow_step.type, color: "#8c9bb4" };
                    const isSelected = (activeStepRun?.id === sr.id);
                    const isApproval = sr.workflow_step.type === "approval_gate";
                    const isPaused   = sr.status === "paused";
                    const stColor    = statusColor(sr.status);

                    return (
                      <div key={sr.id} className="relative">
                        {/* Connecting flow line between steps */}
                        {idx < stepRuns.length - 1 && (
                          <div className="absolute left-6 top-full h-3 w-0.5 bg-[var(--border-2)] z-0 transform -translate-x-1/2" />
                        )}

                        <button
                          onClick={() => setSelectedStep(isSelected ? null : sr.id)}
                          className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 relative z-10 flex items-center justify-between gap-4 cursor-pointer ${
                            isSelected
                              ? "shadow-md ring-2 ring-offset-1 ring-offset-[var(--bg)]"
                              : "hover:border-[var(--border-2)] hover:bg-[var(--surface-2)]"
                          }`}
                          style={{
                            background: isSelected ? `${stColor}10` : "var(--surface)",
                            borderColor: isSelected ? stColor : "var(--border)",
                          }}
                        >
                          <div className="flex items-center gap-3.5 flex-1 min-w-0">
                            {/* Step Icon Box */}
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 shadow-sm"
                              style={{ background: `${meta.color}18`, border: `1px solid ${meta.color}35` }}
                            >
                              {meta.icon}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-[var(--foreground)]">
                                  Step {sr.workflow_step.position + 1}: {sr.workflow_step.name}
                                </span>
                                {isApproval && isPaused && (
                                  <span className="px-2 py-0.5 rounded-full bg-[#ffb020]/15 text-[#ffb020] text-[10px] font-bold border border-[#ffb020]/30 animate-pulse">
                                    ⏸ Awaiting Approval
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10.5px] text-[var(--muted)] mt-1">
                                <span className="font-semibold text-[var(--foreground)]">{meta.label}</span>
                                <span>•</span>
                                <span>Duration: {formatDuration(sr.started_at, sr.completed_at)}</span>
                                {sr.attempt_count && sr.attempt_count > 1 && (
                                  <>
                                    <span>•</span>
                                    <span className="text-[#ffb020]">{sr.attempt_count} attempts</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            {/* Status Badge */}
                            <span
                              className="text-[11px] font-bold px-3 py-1 rounded-xl flex items-center gap-1.5 shadow-sm border"
                              style={{
                                background: `${stColor}15`,
                                color: stColor,
                                borderColor: `${stColor}30`,
                              }}
                            >
                              <span>{statusIcon(sr.status)}</span>
                              <span className="capitalize">{sr.status}</span>
                            </span>

                            {/* Approve Button */}
                            {isApproval && isPaused && currentRole !== "viewer" && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleApprove(sr.id); }}
                                disabled={approving}
                                className="px-3.5 py-1.5 rounded-xl bg-[#00c885] hover:bg-[#00a86f] text-[#0b0e17] text-xs font-bold transition-all shadow-md cursor-pointer"
                              >
                                {approving ? "Approving..." : "✓ Approve Step"}
                              </button>
                            )}
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Step Detail / Summary */}
            <div className="lg:col-span-2 space-y-4">
              {/* Run Summary Card */}
              <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                  <h3 className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
                    Run Summary
                  </h3>
                  {currentRun && (
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-md border"
                      style={{
                        background: `${statusColor(currentRun.status)}15`,
                        color: statusColor(currentRun.status),
                        borderColor: `${statusColor(currentRun.status)}30`,
                      }}
                    >
                      {currentRun.status?.toUpperCase()}
                    </span>
                  )}
                </div>

                {currentRun && (
                  <div className="space-y-3 text-xs">
                    {[
                      { label: "Run ID",      value: currentRun.id.slice(0, 18) + "...", mono: true },
                      { label: "Trigger",     value: currentRun.trigger_type || "manual" },
                      { label: "Started",     value: formatAgo(currentRun.started_at ?? currentRun.created_at) },
                      { label: "Duration",    value: formatDuration(currentRun.started_at, currentRun.completed_at) },
                      { label: "Steps Count", value: `${stepRuns.length} steps` },
                    ].map(({ label, value, mono }) => (
                      <div key={label} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[var(--bg-3)] border border-[var(--border)]/50">
                        <span className="text-[var(--muted)] text-[11px] font-medium">{label}</span>
                        <span className={`font-semibold text-[var(--foreground)] ${mono ? "font-mono text-[10.5px] text-[#7c75f3]" : ""}`}>
                          {value}
                        </span>
                      </div>
                    ))}
                    {currentRun.error && (
                      <div className="p-3.5 rounded-xl bg-[#ff4d4d]/10 border border-[#ff4d4d]/25 text-[#ff4d4d] text-[11px] font-mono leading-relaxed">
                        <strong className="block mb-1 text-xs">Error Details:</strong>
                        {currentRun.error}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Selected Step Detail Panel */}
              {activeStepRun && (
                <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-sm space-y-4">
                  {/* Step header */}
                  <div className="flex items-center gap-3 border-b border-[var(--border)] pb-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 shadow-sm"
                      style={{
                        background: `${statusColor(activeStepRun.status)}15`,
                        border: `1px solid ${statusColor(activeStepRun.status)}30`,
                      }}
                    >
                      {(STEP_META[activeStepRun.workflow_step.type] ?? { icon: "⚙" }).icon}
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-[var(--foreground)]">
                        {activeStepRun.workflow_step.name}
                      </h3>
                      <p className="text-[10px] text-[var(--muted)] capitalize mt-0.5">
                        {activeStepRun.workflow_step.type.replace(/_/g, " ")} •{" "}
                        <span style={{ color: statusColor(activeStepRun.status) }} className="font-bold">
                          {activeStepRun.status}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Output */}
                  <OutputPanel
                    data={activeStepRun.error ? activeStepRun.error : activeStepRun.output}
                    isError={!!activeStepRun.error && !activeStepRun.output}
                    label="Step Output"
                  />

                  {/* Input */}
                  {activeStepRun.input && (
                    <OutputPanel
                      data={activeStepRun.input}
                      label="Step Input"
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live Execution Logs Terminal Drawer */}
        <div className="rounded-2xl bg-[#080b13] border border-[var(--border)] overflow-hidden shadow-lg">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="w-full flex items-center justify-between px-5 py-3 text-xs font-bold text-[#00c885] bg-[#0d1120] border-b border-[var(--border)] hover:bg-[#111827] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#00c885] animate-pulse" />
              <span>Real-Time Step Execution Logs</span>
            </div>
            <span className="text-[var(--muted)] text-[11px] font-mono">
              {showLogs ? "▼ hide console" : "▲ show console"}
            </span>
          </button>

          {showLogs && (
            <div className="p-5 font-mono text-[11px] space-y-2 max-h-64 overflow-y-auto bg-[#080b13] leading-relaxed">
              {stepRuns.length === 0 && (
                <p className="text-[#00c885]/60 italic">Waiting for live step execution events...</p>
              )}
              {stepRuns.map((sr: {
                id: string;
                status: string;
                started_at?: string;
                completed_at?: string;
                workflow_step: { position: number; name: string; type: string }
              }) => (
                <div key={sr.id} className="flex items-start gap-3 border-b border-[#ffffff08] pb-1.5">
                  <span className="text-[#5e6d8a] shrink-0 font-sans">
                    {sr.started_at
                      ? new Date(sr.started_at).toLocaleTimeString()
                      : "--:--:--"}
                  </span>
                  <span
                    className="font-bold shrink-0 text-[10.5px] px-1.5 py-0.2 rounded"
                    style={{
                      background: `${statusColor(sr.status)}18`,
                      color: statusColor(sr.status)
                    }}
                  >
                    [{sr.status.toUpperCase()}]
                  </span>
                  <span className="text-[#c3ceea]">
                    Step {sr.workflow_step.position + 1} ({sr.workflow_step.name}){" "}
                    {sr.status === "completed"
                      ? `finished in ${formatDuration(sr.started_at, sr.completed_at)}`
                      : sr.status === "failed"
                      ? `failed with error`
                      : sr.status === "running"
                      ? `executing logic...`
                      : sr.status === "paused"
                      ? `paused (awaiting approval gate)`
                      : `status: ${sr.status}`}
                  </span>
                </div>
              ))}
              {currentRun?.error && (
                <div className="flex items-start gap-3 text-[#ff4d4d] pt-1">
                  <span className="text-[#5e6d8a]">--:--:--</span>
                  <span className="font-bold">[RUN ERROR]</span>
                  <span>{currentRun.error}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
