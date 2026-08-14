"use client";

import { useState } from "react";
import Link from "next/link";
import { gql, useMutation, useQuery } from "@apollo/client";
import { useAccessToken, useUserData } from "@nhost/react";
import { useOrganization } from "@/hooks/use-organization";
import { AppShell } from "@/components/layout/app-shell";

const WORKFLOWS_LIST_QUERY = gql`
  query GetWorkflowsList($organizationId: uuid!) {
    workflows(
      where: { organization_id: { _eq: $organizationId } }
      order_by: { created_at: desc }
    ) {
      id name description status created_at
      workflow_steps(order_by: { position: asc }) { id name type }
      workflow_triggers { id type enabled }
      workflow_runs(order_by: { created_at: desc }, limit: 1) { id status started_at completed_at }
      run_stats { total_runs success_rate average_run_duration_seconds }
    }
  }
`;

const CREATE_WORKFLOW_MUTATION = gql`
  mutation CreateWorkflow($organizationId: uuid!, $name: String!, $description: String) {
    insert_workflows_one(
      object: { organization_id: $organizationId, name: $name, description: $description, status: "active" }
    ) { id name }
  }
`;



const STEP_ICONS: Record<string, string> = {
  llm_call: "🧠", http_request: "🌐", conditional_branch: "🔀",
  approval_gate: "🔒", notify: "🔔", db_write: "💾",
};

const STATUS_CONFIG = {
  completed: { dot: "dot-green", badge: "badge-green", label: "Completed" },
  running:   { dot: "dot-blue dot-pulse", badge: "badge-blue", label: "Running" },
  failed:    { dot: "dot-red", badge: "badge-red", label: "Failed" },
  paused:    { dot: "dot-amber", badge: "badge-amber", label: "Paused" },
  pending:   { dot: "dot-gray", badge: "badge-gray", label: "Pending" },
} as const;

type WorkflowStep = { id: string; name: string; type: string };
type WorkflowRun = { id: string; status: string; started_at?: string; completed_at?: string };
type RunStats = { total_runs?: number; success_rate?: number; average_run_duration_seconds?: number };
type Workflow = {
  id: string; name: string; description?: string; status: string; created_at?: string;
  workflow_steps?: WorkflowStep[];
  workflow_triggers?: Array<{ id: string; type: string; enabled: boolean }>;
  workflow_runs?: WorkflowRun[];
  run_stats?: RunStats[];
};

export default function WorkflowsPage() {
  const userData = useUserData();
  const accessToken = useAccessToken();
  const { currentOrgId, currentRole } = useOrganization();
  const isViewer = currentRole === "viewer";

  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const { data, loading, refetch } = useQuery(WORKFLOWS_LIST_QUERY, {
    variables: { organizationId: currentOrgId ?? "00000000-0000-0000-0000-000000000000" },
    skip: !currentOrgId,
  });
  const [createWorkflow] = useMutation(CREATE_WORKFLOW_MUTATION);

  async function handleRunNow(workflowId: string) {
    if (isViewer) return;
    setTriggeringId(workflowId);
    try {
      const res = await fetch("/api/trigger-workflow-run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ workflow_id: workflowId }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.message || "Run failed"); return; }
      await refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Run failed");
    } finally {
      setTriggeringId(null);
    }
  }

  async function handleDeleteWorkflow(workflowId: string, workflowName: string) {
    if (isViewer) return;
    if (!confirm(`Are you sure you want to delete workflow "${workflowName}"? This action cannot be undone.`)) return;

    setDeletingId(workflowId);
    try {
      const res = await fetch("/api/delete-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow_id: workflowId }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.message || "Delete failed");
      await refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete workflow");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !currentOrgId || !userData?.id) {
      setCreateError("Please fill all fields."); return;
    }
    setCreateError(null);
    try {
      const result = await createWorkflow({
        variables: { organizationId: currentOrgId, name: name.trim(), description: desc.trim() || null },
      });
      if (result.errors?.length) { setCreateError(result.errors[0].message); return; }
      setShowCreate(false); setName(""); setDesc("");
      refetch();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create");
    }
  }

  const workflows: Workflow[] = data?.workflows ?? [];

  return (
    <AppShell
      title="Workflows"
      description="Build, configure and run AI automation pipelines"
      actions={
        <div className="flex items-center gap-3">
          <button
            disabled={isViewer}
            onClick={() => setShowCreate(true)}
            style={{
              background: "var(--accent)", color: "white",
              border: "none", borderRadius: "10px",
              padding: "8px 16px", fontSize: "13.5px",
              fontWeight: 600, cursor: isViewer ? "not-allowed" : "pointer",
              opacity: isViewer ? 0.5 : 1,
              display: "flex", alignItems: "center", gap: "6px",
              transition: "background 0.15s, transform 0.1s",
            }}
            onMouseEnter={(e) => { if (!isViewer) (e.currentTarget.style.background = "var(--accent-hover)"); }}
            onMouseLeave={(e) => { (e.currentTarget.style.background = "var(--accent)"); }}
          >
            <span style={{ fontSize: "16px" }}>+</span> New Workflow
          </button>
        </div>
      }
    >
      {/* Create Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div
            className="w-full max-w-md animate-fade-in"
            style={{
              background: "var(--surface)", border: "1px solid var(--border-2)",
              borderRadius: "20px", padding: "28px",
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--foreground)" }}>
                  Create Workflow
                </h2>
                <p style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>
                  Define your automation pipeline
                </p>
              </div>
              <button
                onClick={() => setShowCreate(false)}
                style={{ color: "var(--muted)", background: "none", border: "none", fontSize: "20px", cursor: "pointer", lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {createError && (
              <div style={{ background: "var(--red-dim)", border: "1px solid #ef444430", borderRadius: "10px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px", color: "var(--red)" }}>
                {createError}
              </div>
            )}

            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Workflow Name *
                </label>
                <input
                  className="wf-input"
                  type="text" required autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Lead Qualification Pipeline"
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Description
                </label>
                <textarea
                  className="wf-input"
                  rows={3}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="What does this workflow automate?"
                />
              </div>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", paddingTop: "4px" }}>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  style={{ padding: "8px 18px", borderRadius: "10px", border: "1px solid var(--border-2)", background: "transparent", color: "var(--muted)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: "8px 20px", borderRadius: "10px", border: "none", background: "var(--accent)", color: "white", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                >
                  Create Workflow
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: "grid", gap: "12px" }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: "120px", borderRadius: "16px", background: "var(--surface)", border: "1px solid var(--border)", animation: "pulse 2s infinite" }} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && workflows.length === 0 && (
        <div style={{ textAlign: "center", padding: "80px 20px" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔗</div>
          <h3 style={{ fontSize: "18px", fontWeight: 600, color: "var(--foreground)", marginBottom: "8px" }}>
            No workflows yet
          </h3>
          <p style={{ fontSize: "14px", color: "var(--muted)", marginBottom: "24px" }}>
            Create your first automation pipeline to get started
          </p>
          {!isViewer && (
            <button
              onClick={() => setShowCreate(true)}
              style={{ padding: "10px 24px", borderRadius: "12px", background: "var(--accent)", color: "white", border: "none", fontWeight: 600, cursor: "pointer", fontSize: "14px" }}
            >
              + Create First Workflow
            </button>
          )}
        </div>
      )}

      {/* Workflow Grid */}
      {!loading && workflows.length > 0 && (
        <div style={{ display: "grid", gap: "16px" }}>
          {workflows.map((wf) => {
            const latestRun = wf.workflow_runs?.[0];
            const stats = (wf.run_stats as RunStats[] | RunStats | undefined);
            const statsObj: RunStats | undefined = Array.isArray(stats) ? stats[0] : stats;
            const runStatus = latestRun?.status as keyof typeof STATUS_CONFIG | undefined;
            const sc = runStatus ? STATUS_CONFIG[runStatus] ?? STATUS_CONFIG.pending : null;
            const isTriggering = triggeringId === wf.id;
            const isDeleting = deletingId === wf.id;

            return (
              <div
                key={wf.id}
                className="animate-fade-in"
                style={{
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: "16px", padding: "20px 24px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: "20px", flexWrap: "wrap",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-2)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 20px #00000040"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
              >
                {/* Left info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "6px" }}>
                    <Link href={`/workflows/${wf.id}`}>
                      <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--foreground)", cursor: "pointer" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLSpanElement).style.color = "var(--accent-hover)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLSpanElement).style.color = "var(--foreground)"; }}
                      >
                        {wf.name}
                      </span>
                    </Link>
                    <span className={`badge ${wf.status === "active" ? "badge-green" : "badge-gray"}`}>
                      {wf.status}
                    </span>
                    {sc && (
                      <span className={`badge ${sc.badge}`} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                        <span className={`dot ${sc.dot}`} /> {sc.label}
                      </span>
                    )}
                  </div>

                  {wf.description && (
                    <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "10px" }}>{wf.description}</p>
                  )}

                  {/* Step pills */}
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
                    {wf.workflow_steps?.map((st, i) => (
                      <div key={st.id} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                        <span style={{
                          background: "var(--bg-3)", border: "1px solid var(--border-2)",
                          borderRadius: "8px", padding: "3px 8px",
                          fontSize: "12px", color: "var(--muted)", fontWeight: 500,
                          display: "flex", alignItems: "center", gap: "4px",
                        }}>
                          {STEP_ICONS[st.type] ?? "⚙️"} {st.name}
                        </span>
                        {i < (wf.workflow_steps?.length ?? 0) - 1 && (
                          <span style={{ color: "var(--muted)", fontSize: "10px" }}>→</span>
                        )}
                      </div>
                    ))}
                    {(!wf.workflow_steps || wf.workflow_steps.length === 0) && (
                      <span style={{ fontSize: "12px", color: "var(--muted)" }}>No steps yet</span>
                    )}
                  </div>

                  {/* Stats row */}
                  {statsObj && (
                    <div style={{ display: "flex", gap: "16px", marginTop: "10px" }}>
                      {[
                        { label: "Runs", value: String(statsObj.total_runs ?? 0) },
                        { label: "Success", value: statsObj.success_rate ? `${Math.round(Number(statsObj.success_rate))}%` : "—" },
                        { label: "Avg", value: statsObj.average_run_duration_seconds ? `${Math.round(Number(statsObj.average_run_duration_seconds))}s` : "—" },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <span style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
                          <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--foreground)" }}>{value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end", flexShrink: 0 }}>
                  <button
                    disabled={isViewer || isTriggering}
                    onClick={() => handleRunNow(wf.id)}
                    style={{
                      padding: "8px 20px", borderRadius: "10px", border: "none",
                      background: isTriggering ? "var(--surface-2)" : "var(--accent)",
                      color: "white", fontWeight: 600, fontSize: "13px", cursor: isViewer || isTriggering ? "not-allowed" : "pointer",
                      opacity: isViewer ? 0.5 : 1, transition: "background 0.15s",
                      display: "flex", alignItems: "center", gap: "6px",
                    }}
                  >
                    {isTriggering ? (
                      <><span style={{ width: "12px", height: "12px", border: "2px solid #ffffff50", borderTopColor: "white", borderRadius: "50%", display: "inline-block" }} className="animate-spin" /> Running…</>
                    ) : "▶ Run Now"}
                  </button>

                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <Link href={`/workflows/${wf.id}`}>
                      <span style={{
                        padding: "6px 14px", borderRadius: "8px",
                        border: "1px solid var(--border-2)", fontSize: "12px", fontWeight: 600,
                        color: "var(--muted)", cursor: "pointer", display: "inline-block", transition: "color 0.15s",
                      }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLSpanElement).style.color = "var(--foreground)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLSpanElement).style.color = "var(--muted)"; }}
                      >
                        ⚙ Configure
                      </span>
                    </Link>
                    <Link href={`/workflows/${wf.id}/runs`}>
                      <span style={{
                        padding: "6px 14px", borderRadius: "8px",
                        border: "1px solid var(--border-2)", fontSize: "12px", fontWeight: 600,
                        color: "var(--muted)", cursor: "pointer", display: "inline-block", transition: "color 0.15s",
                      }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLSpanElement).style.color = "var(--foreground)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLSpanElement).style.color = "var(--muted)"; }}
                      >
                        📊 Runs
                      </span>
                    </Link>
                    <button
                      disabled={isViewer || isDeleting}
                      onClick={() => handleDeleteWorkflow(wf.id, wf.name)}
                      style={{
                        padding: "6px 12px", borderRadius: "8px",
                        border: "1px solid var(--red-dim)", background: "var(--red-dim)",
                        fontSize: "12px", fontWeight: 600, color: "var(--red)",
                        cursor: isViewer || isDeleting ? "not-allowed" : "pointer",
                        opacity: isViewer || isDeleting ? 0.5 : 1, transition: "all 0.15s",
                      }}
                      title="Delete entire workflow"
                    >
                      {isDeleting ? "Deleting…" : "🗑 Delete"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
