"use client";

import { useState } from "react";
import Link from "next/link";
import { gql, useMutation, useQuery } from "@apollo/client";
import { useAccessToken } from "@nhost/react";
import { useOrganization } from "@/hooks/use-organization";
import { AppShell } from "@/components/layout/app-shell";

const ALL_RUNS_QUERY = gql`
  query GetAllRuns($organizationId: uuid!) {
    workflows(
      where: { organization_id: { _eq: $organizationId } }
      order_by: { updated_at: desc }
    ) {
      id
      name
      status
    }
    workflow_runs(
      where: { workflow: { organization_id: { _eq: $organizationId } } }
      order_by: { created_at: desc }
      limit: 50
    ) {
      id
      status
      trigger_type
      triggered_by
      started_at
      completed_at
      error
      created_at
      workflow {
        id
        name
        status
      }
    }
  }
`;

const TRIGGER_RUN_MUTATION = gql`
  mutation TriggerRun($workflowId: uuid!) {
    insert_workflow_runs_one(
      object: {
        workflow_id: $workflowId
        status: "pending"
        trigger_type: "manual"
      }
    ) {
      id
      status
    }
  }
`;

function statusColor(s: string) {
  if (s === "completed") return "#00c885";
  if (s === "failed")    return "#ff4d4d";
  if (s === "running")   return "#ffb020";
  if (s === "paused")    return "#7c75f3";
  if (s === "pending")   return "#3b82f6";
  return "#8c9bb4";
}
function statusIcon(s: string) {
  if (s === "completed") return "✓";
  if (s === "failed")    return "✕";
  if (s === "running")   return "⚙";
  if (s === "paused")    return "⏸";
  if (s === "pending")   return "◌";
  return "○";
}
function formatAgo(d?: string) {
  if (!d) return "—";
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function formatDuration(a?: string, b?: string) {
  if (!a) return "—";
  const end = b ? new Date(b) : new Date();
  const ms = end.getTime() - new Date(a).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function AllRunsPage() {
  const { currentOrgId, currentRole } = useOrganization();
  const accessToken = useAccessToken();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterWorkflow, setFilterWorkflow] = useState<string>("all");
  const [triggering, setTriggering] = useState<string | null>(null);

  const { data, refetch } = useQuery(ALL_RUNS_QUERY, {
    variables: { organizationId: currentOrgId ?? "00000000-0000-0000-0000-000000000000" },
    skip: !currentOrgId,
    pollInterval: 5000, // auto-refresh every 5s
  });

  const [triggerRun] = useMutation(TRIGGER_RUN_MUTATION);

  const allRuns = data?.workflow_runs ?? [];
  const workflows = data?.workflows ?? [];

  const filtered = allRuns.filter((r: { status: string; workflow: { id: string } }) => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (filterWorkflow !== "all" && r.workflow?.id !== filterWorkflow) return false;
    return true;
  });

  // Stats
  const total     = allRuns.length;
  const completed = allRuns.filter((r: { status: string }) => r.status === "completed").length;
  const failed    = allRuns.filter((r: { status: string }) => r.status === "failed").length;
  const running   = allRuns.filter((r: { status: string }) => r.status === "running" || r.status === "pending").length;

  async function handleTriggerRun(workflowId: string) {
    if (currentRole === "viewer") return;
    setTriggering(workflowId);
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
      if (!res.ok) {
        // fallback: insert a demo run directly
        await triggerRun({ variables: { workflowId } });
      } else {
        console.log("Run triggered:", resData);
      }
      await refetch();
    } catch {
      // fallback to direct mutation
      try {
        await triggerRun({ variables: { workflowId } });
        await refetch();
      } catch (err2) {
        alert(err2 instanceof Error ? err2.message : "Failed to trigger run");
      }
    } finally {
      setTriggering(null);
    }
  }

  return (
    <AppShell
      title="Execution Runs"
      description="View and monitor all workflow execution history across this organization."
      actions={
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[var(--muted)]">
            Auto-refresh: 5s
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#00c885] animate-pulse" />
        </div>
      }
    >
      <div className="space-y-6">

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Runs", value: total, color: "#7c75f3", icon: "🔁" },
            { label: "Completed", value: completed, color: "#00c885", icon: "✓" },
            { label: "Failed", value: failed, color: "#ff4d4d", icon: "✕" },
            { label: "In Progress", value: running, color: "#ffb020", icon: "⚙" },
          ].map(({ label, value, color, icon }) => (
            <div
              key={label}
              className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex items-center gap-4"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shrink-0"
                style={{ background: `${color}15`, color }}
              >
                {icon}
              </div>
              <div>
                <p className="text-2xl font-black text-[var(--foreground)]">{value}</p>
                <p className="text-[11px] text-[var(--muted)] font-medium">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Quick-trigger row */}
        {currentRole !== "viewer" && workflows.length > 0 && (
          <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] space-y-3">
            <p className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Quick Trigger</p>
            <div className="flex flex-wrap gap-2">
              {workflows.map((wf: { id: string; name: string; status: string }) => (
                <button
                  key={wf.id}
                  onClick={() => handleTriggerRun(wf.id)}
                  disabled={triggering === wf.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                  style={{
                    background: triggering === wf.id ? "#7c75f315" : "var(--bg-3)",
                    borderColor: triggering === wf.id ? "#7c75f3" : "var(--border-2)",
                    color: triggering === wf.id ? "#7c75f3" : "var(--foreground)",
                  }}
                >
                  {triggering === wf.id ? "⚙ Starting..." : `▶ ${wf.name}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold uppercase text-[var(--muted)]">Status:</label>
            {["all", "completed", "failed", "running", "pending", "paused"].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors capitalize"
                style={{
                  background: filterStatus === s
                    ? s === "all" ? "#7c75f315" : `${statusColor(s)}15`
                    : "var(--bg-3)",
                  borderColor: filterStatus === s
                    ? s === "all" ? "#7c75f3" : statusColor(s)
                    : "var(--border-2)",
                  color: filterStatus === s
                    ? s === "all" ? "#7c75f3" : statusColor(s)
                    : "var(--muted)",
                }}
              >
                {s === "all" ? "All" : `${statusIcon(s)} ${s}`}
              </button>
            ))}
          </div>

          {workflows.length > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <label className="text-[11px] font-bold uppercase text-[var(--muted)]">Workflow:</label>
              <select
                value={filterWorkflow}
                onChange={(e) => setFilterWorkflow(e.target.value)}
                className="bg-[var(--bg-3)] border border-[var(--border-2)] rounded-lg px-2.5 py-1 text-xs text-[var(--foreground)] focus:outline-none"
              >
                <option value="all">All Workflows</option>
                {workflows.map((wf: { id: string; name: string }) => (
                  <option key={wf.id} value={wf.id}>{wf.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Runs Table */}
        {filtered.length === 0 ? (
          <div className="p-12 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-center space-y-4">
            <div className="text-4xl">🔁</div>
            <div>
              <p className="text-sm font-bold text-[var(--foreground)]">No runs found</p>
              <p className="text-xs text-[var(--muted)] mt-1">
                {allRuns.length === 0
                  ? "Trigger a workflow run to see execution history here."
                  : "No runs match the current filters."}
              </p>
            </div>
            {currentRole !== "viewer" && workflows.length > 0 && (
              <button
                onClick={() => handleTriggerRun(workflows[0].id)}
                disabled={!!triggering}
                className="px-4 py-2 rounded-xl bg-[#7c75f3] hover:bg-[#6b63eb] text-white text-xs font-bold"
              >
                ▶ Trigger First Run
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[var(--bg-3)] border-b border-[var(--border)] text-[var(--muted)] uppercase text-[10px] tracking-wider font-bold">
                  <th className="py-3 px-5">Status</th>
                  <th className="py-3 px-5">Workflow</th>
                  <th className="py-3 px-5">Trigger</th>
                  <th className="py-3 px-5">Started</th>
                  <th className="py-3 px-5">Duration</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.map((run: {
                  id: string;
                  status: string;
                  trigger_type?: string;
                  started_at?: string;
                  completed_at?: string;
                  error?: string;
                  created_at: string;
                  workflow: { id: string; name: string };
                }) => (
                  <tr key={run.id} className="hover:bg-[var(--bg-3)]/50 transition-colors group">
                    {/* Status */}
                    <td className="py-3.5 px-5">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
                        style={{
                          background: `${statusColor(run.status)}15`,
                          color: statusColor(run.status),
                        }}
                      >
                        <span className="text-base leading-none">{statusIcon(run.status)}</span>
                        {run.status}
                      </span>
                    </td>

                    {/* Workflow */}
                    <td className="py-3.5 px-5">
                      <Link
                        href={`/workflows/${run.workflow?.id}`}
                        className="font-semibold text-[var(--foreground)] hover:text-[#7c75f3] transition-colors"
                      >
                        {run.workflow?.name || "Unknown"}
                      </Link>
                      <p className="text-[10px] text-[var(--muted)] font-mono mt-0.5">
                        {run.id.slice(0, 16)}...
                      </p>
                    </td>

                    {/* Trigger Type */}
                    <td className="py-3.5 px-5">
                      <span className="capitalize text-[var(--muted)]">
                        {run.trigger_type === "manual" ? "🖱 manual"
                          : run.trigger_type === "webhook" ? "🔗 webhook"
                          : run.trigger_type === "scheduled" ? "🕐 scheduled"
                          : run.trigger_type || "—"}
                      </span>
                    </td>

                    {/* Started */}
                    <td className="py-3.5 px-5 text-[var(--muted)]">
                      {formatAgo(run.started_at ?? run.created_at)}
                    </td>

                    {/* Duration */}
                    <td className="py-3.5 px-5 text-[var(--muted)] font-mono">
                      {run.status === "running"
                        ? <span className="text-[#ffb020] font-semibold animate-pulse">Live...</span>
                        : formatDuration(run.started_at, run.completed_at)}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-5 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        {run.error && (
                          <span
                            className="text-[10px] px-2 py-0.5 rounded bg-[#ff4d4d]/10 text-[#ff4d4d] border border-[#ff4d4d]/25"
                            title={run.error}
                          >
                            Error
                          </span>
                        )}
                        <Link
                          href={`/workflows/${run.workflow?.id}/runs`}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-[#7c75f3] font-semibold hover:underline text-[11px]"
                        >
                          View Detail →
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-3)] flex items-center justify-between text-[10px] text-[var(--muted)]">
              <span>Showing {filtered.length} of {allRuns.length} runs</span>
              <span>Auto-refreshes every 5 seconds</span>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
