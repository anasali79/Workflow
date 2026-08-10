"use client";

import { useState } from "react";
import { gql, useMutation } from "@apollo/client";
import { useUserData } from "@nhost/react";
import { useOrganization } from "@/hooks/use-organization";
import { AppShell } from "@/components/layout/app-shell";
import { UserMenu } from "@/components/auth/user-menu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const CREATE_ORG_AND_JOIN_MUTATION = gql`
  mutation CreateOrganizationAndJoin(
    $orgName: String!
    $userId: uuid!
  ) {
    insert_organizations_one(object: { name: $orgName, quota_limit: 100 }) {
      id
      name
    }
  }
`;

const ADD_MEMBER_MUTATION = gql`
  mutation AddOrgMember($orgId: uuid!, $userId: uuid!, $role: String!) {
    insert_org_members_one(
      object: { organization_id: $orgId, user_id: $userId, role: $role }
      on_conflict: { constraint: org_members_org_user_unique, update_columns: [role] }
    ) {
      id
      organization_id
      role
    }
  }
`;

export default function OrganizationsPage() {
  const userData = useUserData();
  const userId = userData?.id;
  const { memberships, currentOrgId, setCurrentOrgId, loading } = useOrganization();

  const [showCreate, setShowCreate] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const [createOrg] = useMutation(CREATE_ORG_AND_JOIN_MUTATION);
  const [addMember] = useMutation(ADD_MEMBER_MUTATION);

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!orgName.trim() || !userId) return;
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);

    try {
      // Step 1: Create organization
      const orgResult = await createOrg({
        variables: { orgName: orgName.trim(), userId },
      });

      if (orgResult.errors?.length) {
        setCreateError(orgResult.errors[0].message);
        return;
      }

      const newOrgId = orgResult.data?.insert_organizations_one?.id;
      if (!newOrgId) {
        setCreateError("Organization created but ID not returned. Please refresh.");
        return;
      }

      // Step 2: Add current user as owner
      const memberResult = await addMember({
        variables: { orgId: newOrgId, userId, role: "owner" },
      });

      if (memberResult.errors?.length) {
        setCreateError(`Org created but membership failed: ${memberResult.errors[0].message}`);
        return;
      }

      setCreateSuccess(`Organization "${orgName.trim()}" created! Refreshing…`);
      setOrgName("");
      setShowCreate(false);

      // Reload page so OrganizationProvider re-fetches memberships
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create organization.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppShell
      title="Organizations"
      description="Manage organization memberships and active workspace context."
      actions={
        <div className="flex items-center gap-3">
          <UserMenu />
          <Button onClick={() => { setShowCreate(true); setCreateError(null); }}>
            + New Organization
          </Button>
        </div>
      }
    >
      <div className="max-w-3xl space-y-4">

        {/* Success banner */}
        {createSuccess && (
          <div className="rounded-md border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-800">
            ✅ {createSuccess}
          </div>
        )}

        {/* Create Organization Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className="w-full max-w-md bg-background">
              <h3 className="text-lg font-semibold mb-3">Create New Organization</h3>
              {createError && (
                <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {createError}
                </p>
              )}
              <form onSubmit={handleCreateOrg} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-muted mb-1">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    required
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-muted">
                  You will be added as <strong>owner</strong> automatically.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setShowCreate(false); setCreateError(null); }}
                    disabled={creating}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating || !orgName.trim()}>
                    {creating ? "Creating…" : "Create Organization"}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {/* Membership List */}
        <Card>
          <h3 className="text-sm font-semibold mb-3">Your Organizations</h3>

          {loading ? (
            <p className="text-sm text-muted py-4">Loading organizations…</p>
          ) : memberships.length === 0 ? (
            <div className="py-6 text-center space-y-3">
              <p className="text-sm text-muted">No organization memberships found.</p>
              <p className="text-xs text-muted">
                Click <strong>&quot;+ New Organization&quot;</strong> above to create your first workspace.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {memberships.map((m) => {
                const isActive = m.organization_id === currentOrgId;
                return (
                  <li key={m.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-base">{m.organization.name}</span>
                        {isActive && (
                          <span className="rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-xs px-2 py-0.5 font-medium">
                            Active Context
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted mt-0.5">
                        Role: <span className="font-semibold capitalize text-foreground">{m.role}</span> | Quota:{" "}
                        {m.organization.quota_used} / {m.organization.quota_limit} runs
                      </p>
                    </div>

                    <Button
                      variant={isActive ? "outline" : "default"}
                      size="sm"
                      disabled={isActive}
                      onClick={() => setCurrentOrgId(m.organization_id)}
                    >
                      {isActive ? "Selected" : "Switch Context"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
