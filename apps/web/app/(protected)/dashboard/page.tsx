"use client";

import { useState } from "react";
import Link from "next/link";
import { gql, useMutation, useQuery } from "@apollo/client";
import { useOrganization } from "@/hooks/use-organization";
import { AppShell } from "@/components/layout/app-shell";

const DASHBOARD_QUERY = gql`
  query GetDashboardData($organizationId: uuid!) {
    org_usage_summary(where: { organization_id: { _eq: $organizationId } }) {
      quota_limit
      quota_used
      quota_remaining
    }
    workflows(
      where: { organization_id: { _eq: $organizationId } }
      order_by: { updated_at: desc }
      limit: 10
    ) {
      id
      name
      description
      status
      updated_at
      run_stats {
        total_runs
        last_run_status
        last_run_time
      }
    }
    workflow_runs(
      where: { workflow: { organization_id: { _eq: $organizationId } } }
      order_by: { created_at: desc }
      limit: 6
    ) {
      id
      status
      started_at
      completed_at
      error
      created_at
      workflow {
        id
        name
      }
    }
  }
`;

const CREATE_WORKFLOW_MUTATION = gql`
  mutation CreateWorkflow($orgId: uuid!, $name: String!, $description: String) {
    insert_workflows_one(
      object: {
        organization_id: $orgId
        name: $name
        description: $description
        status: "active"
      }
    ) {
      id
      name
      status
    }
  }
`;

export default function DashboardPage() {
  const { currentOrg, currentOrgId, currentRole } = useOrganization();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [wfName, setWfName] = useState("");
  const [wfDesc, setWfDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const { data, refetch } = useQuery(DASHBOARD_QUERY, {
    variables: { organizationId: currentOrgId ?? "00000000-0000-0000-0000-000000000000" },
    skip: !currentOrgId,
  });

  const [createWorkflow] = useMutation(CREATE_WORKFLOW_MUTATION);

  const usage = data?.org_usage_summary?.[0];
  const quotaUsed = usage?.quota_used ?? currentOrg?.quota_used ?? 0;
  const quotaLimit = usage?.quota_limit ?? currentOrg?.quota_limit ?? 100;
  const quotaPercentage = Math.min(Math.round((quotaUsed / quotaLimit) * 100), 100);

  const realWorkflows = data?.workflows ?? [];
  const recentRuns = data?.workflow_runs ?? [];

  async function handleCreateWorkflow(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrgId || !wfName.trim()) return;

    setCreating(true);
    try {
      await createWorkflow({
        variables: {
          orgId: currentOrgId,
          name: wfName.trim(),
          description: wfDesc.trim(),
        },
      });
      setWfName("");
      setWfDesc("");
      setShowCreateModal(false);
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create workflow");
    } finally {
      setCreating(false);
    }
  }

  function formatAgo(dateStr?: string) {
    if (!dateStr) return "recently";
    const sec = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 1000);
    if (sec < 60) return "Just now";
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
  }

  return (
    <AppShell
      title="Dashboard"
      description="Overview of your automated operations and organization metrics."
      actions={
        currentRole !== "viewer" ? (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#7c75f3] hover:bg-[#6b63eb] text-white font-semibold text-xs shadow-lg transition-colors cursor-pointer"
          >
            <span className="text-base">+</span> Create New Workflow
          </button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Create Workflow Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border-2)] rounded-2xl p-6 shadow-2xl space-y-4">
              <h3 className="text-lg font-bold text-[var(--foreground)]">Create New Workflow</h3>
              <form onSubmit={handleCreateWorkflow} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-[var(--muted)] mb-1">
                    Workflow Name
                  </label>
                  <input
                    type="text"
                    required
                    value={wfName}
                    onChange={(e) => setWfName(e.target.value)}
                    placeholder="e.g. Lead Enrichment Pipeline"
                    className="w-full bg-[var(--bg-3)] border border-[var(--border-2)] rounded-xl px-3 py-2 text-xs text-[var(--foreground)] focus:outline-none focus:border-[#7c75f3]"
                    autoFocus
                    disabled={creating}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-[var(--muted)] mb-1">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={wfDesc}
                    onChange={(e) => setWfDesc(e.target.value)}
                    placeholder="Describe what this workflow automates..."
                    className="w-full bg-[var(--bg-3)] border border-[var(--border-2)] rounded-xl px-3 py-2 text-xs text-[var(--foreground)] focus:outline-none focus:border-[#7c75f3]"
                    disabled={creating}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 rounded-xl border border-[var(--border-2)] text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                    disabled={creating}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-[#7c75f3] hover:bg-[#6b63eb] text-white text-xs font-bold shadow"
                    disabled={creating || !wfName.trim()}
                  >
                    {creating ? "Creating..." : "Create Workflow"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Left Column: Active Workflows Grid */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-[var(--foreground)] tracking-tight">
              Active Workflows ({realWorkflows.length})
            </h2>
            <Link href="/workflows" className="text-xs text-[#7c75f3] font-semibold hover:underline">
              View All Workflows →
            </Link>
          </div>

          {realWorkflows.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-center space-y-3">
              <p className="text-sm text-[var(--muted)]">No workflows found in this organization.</p>
              {currentRole !== "viewer" && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 rounded-xl bg-[#7c75f3] text-white text-xs font-bold"
                >
                  + Create Your First Workflow
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {realWorkflows.map((wf: { id: string; name: string; description: string; status: string; updated_at: string; run_stats?: { total_runs?: number } }) => {
                const isActive = wf.status === "active";
                const isPaused = wf.status === "paused";

                return (
                  <div
                    key={wf.id}
                    className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-2)] transition-all flex flex-col justify-between space-y-4 shadow-sm"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="w-9 h-9 rounded-xl bg-[var(--bg-3)] border border-[var(--border-2)] flex items-center justify-center text-base">
                          {isActive ? "⚡" : isPaused ? "⏸" : "✏️"}
                        </div>
                        {isActive && (
                          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#00c885]/15 text-[#00c885] border border-[#00c885]/30 text-[11px] font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#00c885]" /> Active
                          </span>
                        )}
                        {isPaused && (
                          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#ffb020]/15 text-[#ffb020] border border-[#ffb020]/30 text-[11px] font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#ffb020]" /> Paused
                          </span>
                        )}
                        {!isActive && !isPaused && (
                          <span className="px-2.5 py-0.5 rounded-full bg-[var(--bg-3)] text-[var(--muted)] border border-[var(--border-2)] text-[11px] font-semibold">
                            Draft
                          </span>
                        )}
                      </div>

                      <div>
                        <Link href={`/workflows/${wf.id}`}>
                          <h3 className="text-base font-bold text-[var(--foreground)] hover:text-[#00c885] transition-colors cursor-pointer">
                            {wf.name}
                          </h3>
                        </Link>
                        <p className="text-xs text-[var(--muted)] mt-1.5 line-clamp-2 leading-relaxed">
                          {wf.description || "No description provided."}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 text-xs text-[var(--muted)] border-t border-[var(--border)]">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 font-mono">
                          {wf.run_stats?.total_runs ?? 0} runs
                        </span>
                        <span>• {formatAgo(wf.updated_at)}</span>
                      </div>
                      <Link href={`/workflows/${wf.id}`}>
                        <span className="text-[#7c75f3] font-semibold hover:underline">Open →</span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Quota & Activity Widgets */}
        <div className="space-y-6">
          {/* Widget 1: Monthly Quota */}
          <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[var(--foreground)] font-bold text-sm">
                <span className="text-[#00c885]">⚡</span>
                <span>Monthly Quota</span>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-[#00c885]/15 text-[#00c885] text-[10px] font-bold">
                {currentOrg?.name || "Workspace"}
              </span>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-black text-[var(--foreground)]">{quotaUsed}</span>
                <span className="text-xs text-[var(--muted)]">/ {quotaLimit} calls</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2.5 bg-[var(--bg-3)] rounded-full overflow-hidden mt-3 border border-[var(--border-2)]">
                <div
                  className="h-full bg-[#00c885] rounded-full transition-all duration-500"
                  style={{ width: `${quotaPercentage}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] font-bold mt-2">
                <span className="text-[#ffb020]">{quotaPercentage}% Capacity</span>
                <Link href="/settings" className="text-[#7c75f3] hover:underline">
                  UPGRADE PLAN
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[var(--border)] text-xs">
              <div>
                <p className="text-[var(--muted)]">Remaining</p>
                <p className="font-bold text-[var(--foreground)] mt-1">{quotaLimit - quotaUsed} calls</p>
              </div>
              <div>
                <p className="text-[var(--muted)]">Reset Period</p>
                <p className="font-bold text-[var(--foreground)] mt-1">Monthly</p>
              </div>
            </div>
          </div>

          {/* Widget 2: Recent Activity Timeline */}
          <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--foreground)]">Recent Execution Activity</h3>
              <Link href="/workflows/runs" className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
                View All
              </Link>
            </div>

            {recentRuns.length === 0 ? (
              <p className="py-4 text-xs text-[var(--muted)] text-center">No execution history recorded yet.</p>
            ) : (
              <div className="space-y-4 relative">
                {recentRuns.map((run: { id: string; status: string; created_at: string; workflow: { id: string; name: string }; error?: string }) => {
                  const isDone = run.status === "completed";
                  const isFail = run.status === "failed";
                  const isPause = run.status === "paused";

                  return (
                    <div key={run.id} className="flex items-start gap-3">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5 ${
                          isDone
                            ? "bg-[#00c885]/20 text-[#00c885]"
                            : isFail
                            ? "bg-[#ff4d4d]/20 text-[#ff4d4d]"
                            : isPause
                            ? "bg-[#ffb020]/20 text-[#ffb020]"
                            : "bg-[var(--bg-3)] text-[var(--muted)]"
                        }`}
                      >
                        {isDone ? "✓" : isFail ? "✕" : isPause ? "⏸" : "⚙️"}
                      </div>
                      <div className="text-xs space-y-0.5 min-w-0 flex-1">
                        <p className="font-bold text-[var(--foreground)] truncate">
                          {run.workflow?.name || "Workflow"} {isDone ? "completed successfully." : isFail ? "failed during run." : isPause ? "paused for approval." : "is executing."}
                        </p>
                        <p className="text-[10px] text-[var(--muted)]">
                          {formatAgo(run.created_at)} •{" "}
                          <Link href={`/workflows/${run.workflow?.id}/runs`} className="text-[#7c75f3] hover:underline">
                            View Run Log
                          </Link>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
