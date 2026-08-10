"use client";

import { useOrganization } from "@/hooks/use-organization";
import { AppShell } from "@/components/layout/app-shell";
import { UserMenu } from "@/components/auth/user-menu";
import { Card } from "@/components/ui/card";

export default function SettingsPage() {
  const { currentOrg, currentRole } = useOrganization();

  return (
    <AppShell
      title="Settings & Workspace Governance"
      description="Organization configuration, security constraints, and integration health."
      actions={<UserMenu />}
    >
      <div className="max-w-4xl space-y-6">
        {/* Workspace Overview */}
        <Card>
          <h3 className="text-sm font-semibold mb-3">Organization Profile</h3>
          <div className="grid gap-4 sm:grid-cols-2 text-sm">
            <div>
              <p className="text-xs text-muted uppercase font-medium">Organization Name</p>
              <p className="font-semibold text-base mt-1">{currentOrg?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted uppercase font-medium">Your Session Role</p>
              <span className="inline-block mt-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold capitalize text-accent">
                {currentRole ?? "—"}
              </span>
            </div>
          </div>
        </Card>

        {/* Integration Status Indicators */}
        <Card>
          <h3 className="text-sm font-semibold mb-3">Integration Status</h3>
          <ul className="divide-y divide-border/40 text-sm">
            <li className="py-2.5 flex items-center justify-between">
              <div>
                <p className="font-medium">Groq LLM Engine (LLM_API_KEY)</p>
                <p className="text-xs text-muted">Primary model: llama-3.3-70b-versatile</p>
              </div>
              <span className="rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-xs px-2.5 py-0.5 font-medium">
                Connected
              </span>
            </li>
            <li className="py-2.5 flex items-center justify-between">
              <div>
                <p className="font-medium">SSRF Guard HTTP Engine</p>
                <p className="text-xs text-muted">Blocks private IPs, metadata endpoints (169.254.169.254)</p>
              </div>
              <span className="rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-xs px-2.5 py-0.5 font-medium">
                Enforced
              </span>
            </li>
            <li className="py-2.5 flex items-center justify-between">
              <div>
                <p className="font-medium">Notification Provider (Slack Webhook)</p>
                <p className="text-xs text-muted">SLACK_WEBHOOK_URL endpoint configuration</p>
              </div>
              <span className="rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-xs px-2.5 py-0.5 font-medium">
                Active
              </span>
            </li>
          </ul>
        </Card>

        {/* Authorization Matrix Documentation Card */}
        <Card>
          <h3 className="text-sm font-semibold mb-2">Role Permissions Matrix</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left divide-y divide-border/40">
              <thead>
                <tr className="text-muted uppercase">
                  <th className="py-2">Operation</th>
                  <th className="py-2">Owner</th>
                  <th className="py-2">Editor</th>
                  <th className="py-2">Viewer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                <tr>
                  <td className="py-2 font-medium">View Workflows & Runs</td>
                  <td className="py-2 text-green-600 font-semibold">✓ Allowed</td>
                  <td className="py-2 text-green-600 font-semibold">✓ Allowed</td>
                  <td className="py-2 text-green-600 font-semibold">✓ Allowed</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium">Trigger Workflow Executions</td>
                  <td className="py-2 text-green-600 font-semibold">✓ Allowed</td>
                  <td className="py-2 text-green-600 font-semibold">✓ Allowed</td>
                  <td className="py-2 text-red-500 font-semibold">✗ Denied</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium">Approve Paused Steps</td>
                  <td className="py-2 text-green-600 font-semibold">✓ Allowed</td>
                  <td className="py-2 text-green-600 font-semibold">✓ Allowed</td>
                  <td className="py-2 text-red-500 font-semibold">✗ Denied</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium">Add DB Write / Notify Steps</td>
                  <td className="py-2 text-green-600 font-semibold">✓ Allowed</td>
                  <td className="py-2 text-red-500 font-semibold">✗ Denied</td>
                  <td className="py-2 text-red-500 font-semibold">✗ Denied</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium">Add Webhook Triggers</td>
                  <td className="py-2 text-green-600 font-semibold">✓ Allowed</td>
                  <td className="py-2 text-red-500 font-semibold">✗ Denied</td>
                  <td className="py-2 text-red-500 font-semibold">✗ Denied</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
