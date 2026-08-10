"use client";

import Link from "next/link";
import { gql, useQuery } from "@apollo/client";
import { useOrganization } from "@/hooks/use-organization";
import { AppShell } from "@/components/layout/app-shell";
import { UserMenu } from "@/components/auth/user-menu";

const DASHBOARD_SUMMARY_QUERY = gql`
  query GetDashboardSummary($organizationId: uuid!) {
    org_usage_summary(where: { organization_id: { _eq: $organizationId } }) {
      quota_limit
      quota_used
      quota_remaining
      runs_this_period
    }
    workflows_aggregate(where: { organization_id: { _eq: $organizationId } }) {
      aggregate { count }
    }
    workflow_runs(
      where: { workflow: { organization_id: { _eq: $organizationId } } }
      order_by: { created_at: desc }
      limit: 6
    ) {
      id status trigger_type started_at completed_at
      workflow { id name }
    }
  }
`;

const STATUS_BADGE: Record<string, string> = {
  completed: "badge-green",
  running:   "badge-blue",
  failed:    "badge-red",
  paused:    "badge-amber",
  pending:   "badge-gray",
};

export default function DashboardPage() {
  const { currentOrg, currentRole, currentOrgId, loading: orgLoading } = useOrganization();

  const { data, loading: dataLoading } = useQuery(DASHBOARD_SUMMARY_QUERY, {
    variables: { organizationId: currentOrgId ?? "00000000-0000-0000-0000-000000000000" },
    skip: !currentOrgId,
  });

  const usage = data?.org_usage_summary?.[0];
  const quotaUsed = usage?.quota_used ?? currentOrg?.quota_used ?? 0;
  const quotaLimit = usage?.quota_limit ?? currentOrg?.quota_limit ?? 100;
  const quotaPercentage = Math.min(Math.round((quotaUsed / quotaLimit) * 100), 100);

  const workflowCount = data?.workflows_aggregate?.aggregate?.count ?? 0;
  const recentRuns = data?.workflow_runs ?? [];
  const activeRuns = recentRuns.filter((r: { status: string }) => r.status === "running" || r.status === "paused").length;

  return (
    <AppShell
      title="Dashboard"
      description="Organization overview, quota usage, and live pipeline execution"
      actions={<UserMenu />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Top Metric Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
          {[
            { label: "Organization", value: orgLoading ? "…" : currentOrg?.name ?? "—", icon: "🏢", sub: "Active workspace" },
            { label: "Your Role", value: currentRole ? currentRole.toUpperCase() : "—", icon: "👤", sub: `Scoped permissions` },
            { label: "Total Workflows", value: dataLoading ? "…" : String(workflowCount), icon: "🔗", sub: "Configured pipelines" },
            { label: "Active / Paused Runs", value: dataLoading ? "…" : String(activeRuns), icon: "⚡", sub: "Currently executing" },
          ].map((card, i) => (
            <div
              key={i}
              className="animate-fade-in"
              style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: "16px", padding: "20px",
                display: "flex", flexDirection: "column", gap: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {card.label}
                </span>
                <span style={{ fontSize: "18px", marginLeft: "auto" }}>{card.icon}</span>
              </div>
              <p style={{ fontSize: "22px", fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
                {card.value}
              </p>
              <span style={{ fontSize: "11px", color: "var(--muted)" }}>{card.sub}</span>
            </div>
          ))}
        </div>

        {/* Quota & Executions Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "20px" }}>

          {/* Quota Meter */}
          <div
            style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "16px", padding: "24px",
              display: "flex", flexDirection: "column", gap: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
                  Organization Quota
                </h3>
                <p style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>
                  Monthly API & execution allowance
                </p>
              </div>
              <span className="badge badge-purple">Monthly</span>
            </div>

            {/* Progress bar */}
            <div>
              <div style={{
                height: "10px", borderRadius: "999px", background: "var(--bg-3)",
                overflow: "hidden", border: "1px solid var(--border-2)",
              }}>
                <div
                  style={{
                    height: "100%", borderRadius: "999px",
                    width: `${quotaPercentage}%`,
                    background: quotaPercentage > 85 ? "var(--red)" : quotaPercentage > 70 ? "var(--amber)" : "linear-gradient(90deg, var(--accent), var(--accent-hover))",
                    transition: "width 0.5s ease",
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "10px", fontSize: "13px" }}>
                <span style={{ fontWeight: 600, color: "var(--foreground)" }}>
                  {quotaUsed} / {quotaLimit} runs ({quotaPercentage}%)
                </span>
                <span style={{ color: "var(--muted)" }}>
                  {usage?.quota_remaining ?? quotaLimit - quotaUsed} remaining
                </span>
              </div>
            </div>

            <div style={{
              background: "var(--bg-3)", border: "1px solid var(--border-2)",
              borderRadius: "12px", padding: "12px 14px", fontSize: "12px", color: "var(--muted)",
            }}>
              💡 Quota automatically updates via Postgres trigger on every workflow step execution.
            </div>
          </div>

          {/* Recent Executions */}
          <div
            style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "16px", padding: "24px",
              display: "flex", flexDirection: "column", gap: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
                Recent Executions
              </h3>
              <Link href="/workflows">
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--accent-hover)", cursor: "pointer" }}>
                  View all →
                </span>
              </Link>
            </div>

            {recentRuns.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: "var(--muted)", fontSize: "13px" }}>
                No runs recorded yet. Execute a workflow to see activity.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {recentRuns.map((run: { id: string; status: string; trigger_type: string; workflow: { id: string; name: string } }) => (
                  <div
                    key={run.id}
                    style={{
                      background: "var(--bg-3)", border: "1px solid var(--border-2)",
                      borderRadius: "12px", padding: "12px 14px",
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Link href={`/workflows/${run.workflow.id}/runs`}>
                        <span style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--foreground)", cursor: "pointer" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLSpanElement).style.color = "var(--accent-hover)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLSpanElement).style.color = "var(--foreground)"; }}
                        >
                          {run.workflow.name}
                        </span>
                      </Link>
                      <p style={{ fontSize: "11px", color: "var(--muted)", margin: "2px 0 0", textTransform: "capitalize" }}>
                        Trigger: {run.trigger_type}
                      </p>
                    </div>
                    <span className={`badge ${STATUS_BADGE[run.status] ?? "badge-gray"}`}>
                      {run.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
    </AppShell>
  );
}
