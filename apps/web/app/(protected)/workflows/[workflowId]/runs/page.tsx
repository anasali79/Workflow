"use client";

import { use, useState } from "react";
import Link from "next/link";
import { gql, useQuery, useSubscription } from "@apollo/client";
import { useAccessToken } from "@nhost/react";
import { useOrganization } from "@/hooks/use-organization";
import { AppShell } from "@/components/layout/app-shell";
import { UserMenu } from "@/components/auth/user-menu";

const WORKFLOW_RUNS_QUERY = gql`
  query GetWorkflowRuns($workflowId: uuid!) {
    workflows_by_pk(id: $workflowId) { id name organization_id }
    workflow_runs(
      where: { workflow_id: { _eq: $workflowId } }
      order_by: { created_at: desc }
      limit: 20
    ) {
      id status trigger_type triggered_by started_at completed_at error created_at
    }
  }
`;

const STEP_RUNS_SUBSCRIPTION = gql`
  subscription OnStepRunsChanged($workflowRunId: uuid!) {
    step_runs(
      where: { workflow_run_id: { _eq: $workflowRunId } }
      order_by: { workflow_step: { position: asc } }
    ) {
      id status input output error attempt_count approved_by approved_at started_at completed_at
      workflow_step { id position name type }
    }
  }
`;

const RUN_STATUS_SUBSCRIPTION = gql`
  subscription OnRunStatusChanged($workflowRunId: uuid!) {
    workflow_runs_by_pk(id: $workflowRunId) {
      id status error started_at completed_at
    }
  }
`;

const STEP_ICONS: Record<string, string> = {
  llm_call: "🧠", http_request: "🌐", conditional_branch: "🔀",
  approval_gate: "🔒", notify: "🔔", db_write: "💾",
};

const STEP_STATUS_STYLE: Record<string, { bg: string; color: string; border: string; dotClass: string; label: string }> = {
  pending:   { bg: "#ffffff06",          color: "var(--muted)",   border: "var(--border)",      dotClass: "dot dot-gray",              label: "Pending" },
  running:   { bg: "#3b82f612",          color: "var(--blue)",    border: "#3b82f630",          dotClass: "dot dot-blue dot-pulse",    label: "Running" },
  completed: { bg: "var(--green-dim)",   color: "var(--green)",   border: "#10b98130",          dotClass: "dot dot-green",             label: "Done" },
  failed:    { bg: "var(--red-dim)",     color: "var(--red)",     border: "#ef444430",          dotClass: "dot dot-red",               label: "Failed" },
  skipped:   { bg: "#ffffff06",          color: "var(--muted)",   border: "var(--border)",      dotClass: "dot dot-gray",              label: "Skipped" },
  paused:    { bg: "var(--amber-dim)",   color: "var(--amber)",   border: "#f59e0b30",          dotClass: "dot dot-amber dot-pulse",   label: "⏸ Awaiting Approval" },
};

const RUN_STATUS_STYLE: Record<string, { badge: string; label: string }> = {
  completed: { badge: "badge-green",  label: "Completed" },
  running:   { badge: "badge-blue",   label: "Running" },
  failed:    { badge: "badge-red",    label: "Failed" },
  paused:    { badge: "badge-amber",  label: "Paused" },
  pending:   { badge: "badge-gray",   label: "Pending" },
};

interface RunRecord {
  id: string; status: string; trigger_type: string;
  triggered_by?: string; created_at: string;
}
interface StepRunRecord {
  id: string; status: string; attempt_count: number;
  output?: Record<string, unknown>; error?: string;
  approved_by?: string; approved_at?: string;
  started_at?: string; completed_at?: string;
  workflow_step?: { id: string; position: number; name: string; type: string };
}

type Props = { params: Promise<{ workflowId: string }> };

export default function WorkflowRunsPage({ params }: Props) {
  const { workflowId } = use(params);
  const { currentRole } = useOrganization();
  const accessToken = useAccessToken();
  const isViewer = currentRole === "viewer";

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const { data: runsData, loading: runsLoading } = useQuery(WORKFLOW_RUNS_QUERY, { variables: { workflowId } });
  const runs: RunRecord[] = runsData?.workflow_runs ?? [];
  const activeRunId = selectedRunId || runs[0]?.id || null;

  const { data: subStepData } = useSubscription(STEP_RUNS_SUBSCRIPTION, {
    variables: { workflowRunId: activeRunId ?? "00000000-0000-0000-0000-000000000000" },
    skip: !activeRunId,
  });
  const { data: subRunData } = useSubscription(RUN_STATUS_SUBSCRIPTION, {
    variables: { workflowRunId: activeRunId ?? "00000000-0000-0000-0000-000000000000" },
    skip: !activeRunId,
  });

  const stepRuns: StepRunRecord[] = subStepData?.step_runs ?? [];
  const currentRun = subRunData?.workflow_runs_by_pk || runs.find((r) => r.id === activeRunId);

  async function handleApprove(stepRunId: string) {
    if (isViewer) return;
    setApproving(true);
    try {
      const res = await fetch("/api/approve-step", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ step_run_id: stepRunId, comment: "Approved via dashboard" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Approval failed");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setApproving(false);
    }
  }

  function formatTime(dt?: string | null) {
    if (!dt) return "—";
    const d = new Date(dt);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function formatDuration(start?: string | null, end?: string | null) {
    if (!start || !end) return null;
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  const runStatusConfig = currentRun?.status
    ? (RUN_STATUS_STYLE[currentRun.status] ?? RUN_STATUS_STYLE.pending)
    : null;

  return (
    <AppShell
      title={runsData?.workflows_by_pk?.name ? `${runsData.workflows_by_pk.name} — Live Runs` : "Workflow Runs"}
      description="Real-time step execution & approval management"
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <UserMenu />
          <Link href={`/workflows/${workflowId}`}>
            <span style={{
              padding: "8px 16px", borderRadius: "10px", border: "1px solid var(--border-2)",
              fontSize: "13px", fontWeight: 600, color: "var(--muted)", cursor: "pointer",
              display: "inline-block",
            }}>
              ← Builder
            </span>
          </Link>
        </div>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "20px", height: "calc(100vh - 120px)" }}>

        {/* ── Run List Sidebar ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", padding: "4px 0" }}>
            Run History
          </p>

          {runsLoading && (
            <div style={{ color: "var(--muted)", fontSize: "13px", padding: "16px 0" }}>Loading…</div>
          )}

          {!runsLoading && runs.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 16px" }}>
              <p style={{ fontSize: "32px", marginBottom: "8px" }}>📭</p>
              <p style={{ fontSize: "13px", color: "var(--muted)" }}>No runs yet</p>
            </div>
          )}

          {runs.map((run) => {
            const sc = RUN_STATUS_STYLE[run.status] ?? RUN_STATUS_STYLE.pending;
            const isActive = run.id === activeRunId;
            return (
              <button
                key={run.id}
                onClick={() => setSelectedRunId(run.id)}
                style={{
                  textAlign: "left", background: isActive ? "var(--accent-glow)" : "var(--surface)",
                  border: isActive ? "1px solid #7c3aed50" : "1px solid var(--border)",
                  borderRadius: "12px", padding: "12px 14px", cursor: "pointer",
                  transition: "all 0.15s", width: "100%",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span className={`badge ${sc.badge}`}>{sc.label}</span>
                  <span style={{ fontSize: "10px", color: "var(--muted)" }}>
                    {formatTime(run.created_at)}
                  </span>
                </div>
                <div style={{ fontSize: "11px", color: "var(--muted)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ textTransform: "capitalize" }}>{run.trigger_type}</span>
                  <span style={{ color: "var(--border-2)" }}>•</span>
                  <span style={{ fontFamily: "monospace", fontSize: "10px" }}>{run.id.slice(0, 8)}…</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Live Execution Panel ── */}
        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px" }}>
          {!activeRunId ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px" }}>
              <span style={{ fontSize: "48px" }}>⚡</span>
              <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--foreground)" }}>No run selected</p>
              <p style={{ fontSize: "13px", color: "var(--muted)" }}>Select a run from the left, or trigger a new one</p>
            </div>
          ) : (
            <>
              {/* Run header */}
              <div style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: "16px", padding: "18px 20px",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                    <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--foreground)" }}>
                      Run {activeRunId.slice(0, 8)}…
                    </p>
                    {runStatusConfig && (
                      <span className={`badge ${runStatusConfig.badge}`}>{runStatusConfig.label}</span>
                    )}
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--muted)" }}>
                    Started: {formatTime(currentRun?.started_at)}
                    {currentRun?.completed_at && (
                      <> · Duration: {formatDuration(currentRun.started_at, currentRun.completed_at)}</>
                    )}
                  </p>
                </div>
                {currentRun?.error && (
                  <div style={{ background: "var(--red-dim)", border: "1px solid #ef444430", borderRadius: "10px", padding: "8px 12px", fontSize: "12px", color: "var(--red)", maxWidth: "280px" }}>
                    ⚠ {currentRun.error}
                  </div>
                )}
              </div>

              {/* Step pipeline */}
              {stepRuns.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px", color: "var(--muted)", fontSize: "13px" }}>
                  Loading step runs…
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                  {stepRuns.map((sr, idx) => {
                    const st = STEP_STATUS_STYLE[sr.status] ?? STEP_STATUS_STYLE.pending;
                    const stepMeta = sr.workflow_step;
                    const isExpanded = expandedStep === sr.id;
                    const isPaused = sr.status === "paused";
                    const duration = formatDuration(sr.started_at, sr.completed_at);

                    return (
                      <div key={sr.id}>
                        {/* Step node */}
                        <div
                          onClick={() => setExpandedStep(isExpanded ? null : sr.id)}
                          style={{
                            background: st.bg, border: `1px solid ${st.border}`,
                            borderRadius: "14px", padding: "16px 18px", cursor: "pointer",
                            transition: "all 0.15s",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            {/* Position */}
                            <div style={{
                              width: "32px", height: "32px", borderRadius: "10px", flexShrink: 0,
                              background: isPaused ? "var(--amber-dim)" : `${st.bg}`,
                              border: `1.5px solid ${st.border}`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: "16px",
                            }}>
                              {STEP_ICONS[stepMeta?.type ?? ""] ?? "⚙️"}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--foreground)" }}>
                                  {stepMeta?.name ?? `Step ${idx + 1}`}
                                </span>
                                <span style={{ fontSize: "11px", color: "var(--muted)", fontFamily: "monospace", background: "#ffffff08", borderRadius: "5px", padding: "1px 6px" }}>
                                  {stepMeta?.type}
                                </span>
                              </div>
                              <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "3px" }}>
                                <span className={`dot ${st.dotClass}`} />
                                <span style={{ fontSize: "12px", color: st.color, fontWeight: 600 }}>{st.label}</span>
                                {duration && <span style={{ fontSize: "11px", color: "var(--muted)" }}>· {duration}</span>}
                                {sr.attempt_count > 1 && (
                                  <span style={{ fontSize: "11px", color: "var(--amber)" }}>· {sr.attempt_count} attempts</span>
                                )}
                              </div>
                            </div>

                            {/* Approve button */}
                            {isPaused && !isViewer && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleApprove(sr.id); }}
                                disabled={approving}
                                style={{
                                  padding: "8px 18px", borderRadius: "10px", border: "none",
                                  background: "var(--amber)", color: "white",
                                  fontSize: "13px", fontWeight: 700, cursor: approving ? "not-allowed" : "pointer",
                                  transition: "opacity 0.15s", opacity: approving ? 0.6 : 1,
                                  flexShrink: 0,
                                }}
                              >
                                {approving ? "Approving…" : "✓ Approve"}
                              </button>
                            )}

                            {/* Expand chevron */}
                            <span style={{ color: "var(--muted)", fontSize: "12px", flexShrink: 0 }}>
                              {isExpanded ? "▲" : "▼"}
                            </span>
                          </div>

                          {/* Error inline */}
                          {sr.error && (
                            <div style={{ marginTop: "10px", background: "var(--red-dim)", border: "1px solid #ef444430", borderRadius: "8px", padding: "8px 12px", fontSize: "12px", color: "var(--red)" }}>
                              ⚠ {sr.error}
                            </div>
                          )}

                          {/* Expanded output */}
                          {isExpanded && sr.output && (
                            <div style={{ marginTop: "12px", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                              <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>Output</p>

                              {/* Smart display per step type */}
                              {sr.workflow_step?.type === "llm_call" && (sr.output as Record<string, unknown>).text ? (
                                <div style={{ background: "#ffffff06", borderRadius: "10px", padding: "12px 14px", fontSize: "13px", color: "var(--foreground)", lineHeight: 1.6 }}>
                                  {String((sr.output as Record<string, unknown>).text)}
                                </div>
                              ) : sr.workflow_step?.type === "approval_gate" ? (
                                <div style={{ fontSize: "13px", color: "var(--muted)" }}>
                                  {(sr.output as Record<string, unknown>).awaitingApproval ? (
                                    <span style={{ color: "var(--amber)" }}>⏸ Waiting for approval</span>
                                  ) : (
                                    <span style={{ color: "var(--green)" }}>✓ Approved{sr.approved_by ? ` by ${sr.approved_by.slice(0, 8)}…` : ""}</span>
                                  )}
                                </div>
                              ) : (
                                <pre style={{ fontSize: "11.5px", color: "var(--muted)", background: "#ffffff06", borderRadius: "10px", padding: "12px 14px", overflow: "auto", maxHeight: "200px", fontFamily: "monospace", lineHeight: 1.5 }}>
                                  {JSON.stringify(sr.output, null, 2)}
                                </pre>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Connector */}
                        {idx < stepRuns.length - 1 && (
                          <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
                            <div className="pipeline-connector" style={{ height: "20px" }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
