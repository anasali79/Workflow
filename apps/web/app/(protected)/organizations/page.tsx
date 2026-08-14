"use client";

import { useState } from "react";
import { gql, useMutation } from "@apollo/client";
import { useUserData } from "@nhost/react";
import { useOrganization, OrgMemberInfo, MemberRecord } from "@/hooks/use-organization";
import { AppShell } from "@/components/layout/app-shell";
import { UserMenu } from "@/components/auth/user-menu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * GraphQL Mutations for Organization & Member Management
 */
const CREATE_ORG_MUTATION = gql`
  mutation CreateOrganization($orgName: String!) {
    insert_organizations_one(object: { name: $orgName, quota_limit: 100 }) {
      id
      name
    }
  }
`;

const DELETE_ORG_MUTATION = gql`
  mutation DeleteOrganization($orgId: uuid!) {
    delete_organizations_by_pk(id: $orgId) {
      id
    }
  }
`;

const ADD_MEMBER_MUTATION = gql`
  mutation AddOrgMember($orgId: uuid!, $userId: uuid!, $role: String!) {
    insert_org_members_one(
      object: { organization_id: $orgId, user_id: $userId, role: $role }
    ) {
      id
      organization_id
      user_id
      role
    }
  }
`;

const UPDATE_MEMBER_ROLE_MUTATION = gql`
  mutation UpdateMemberRole($memberId: uuid!, $role: String!) {
    update_org_members_by_pk(
      pk_columns: { id: $memberId }
      _set: { role: $role }
    ) {
      id
      role
    }
  }
`;

const DELETE_MEMBER_MUTATION = gql`
  mutation DeleteOrgMember($memberId: uuid!) {
    delete_org_members_by_pk(id: $memberId) {
      id
    }
  }
`;

export default function OrganizationsPage() {
  const userData = useUserData();
  const userId = userData?.id ?? null;

  const { memberships, currentOrgId, setCurrentOrgId, loading } = useOrganization();

  // Expanded organization for member management (defaults to active org or first org)
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);

  // Create Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creating, setCreating] = useState(false);

  // Per-org Add Member Form inputs: { [orgId]: { userId: string, role: string } }
  const [addMemberForm, setAddMemberForm] = useState<{
    [orgId: string]: { userId: string; role: "owner" | "editor" | "viewer" };
  }>({});
  const [addingMemberOrgId, setAddingMemberOrgId] = useState<string | null>(null);
  const [seedingDemo, setSeedingDemo] = useState(false);

  // Feedback notifications
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Mutations
  const [createOrg] = useMutation(CREATE_ORG_MUTATION);
  const [deleteOrg] = useMutation(DELETE_ORG_MUTATION);
  const [addMember] = useMutation(ADD_MEMBER_MUTATION);
  const [updateMemberRole] = useMutation(UPDATE_MEMBER_ROLE_MUTATION);
  const [deleteMember] = useMutation(DELETE_MEMBER_MUTATION);

  // Create Organization
  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);

    const name = newOrgName.trim();
    if (!name) {
      setActionError("Organization name is required.");
      return;
    }
    if (!userId) {
      setActionError("You must be logged in to create an organization.");
      return;
    }

    setCreating(true);
    try {
      const orgRes = await createOrg({ variables: { orgName: name } });
      const newOrgId = orgRes.data?.insert_organizations_one?.id;
      if (!newOrgId) throw new Error("Failed to retrieve new organization ID.");

      await addMember({
        variables: { orgId: newOrgId, userId, role: "owner" },
      });

      setActionSuccess(`Organization "${name}" created successfully!`);
      setNewOrgName("");
      setShowCreateModal(false);
      setTimeout(() => window.location.reload(), 600);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to create organization.");
    } finally {
      setCreating(false);
    }
  }

  // Create Seed Demo Orgs (Org A & Org B)
  async function handleSeedDemoOrgs() {
    if (!userId) {
      setActionError("You must be logged in to setup demo organizations.");
      return;
    }

    setSeedingDemo(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      // 1. Create Org A (Acme Corp)
      const resA = await createOrg({ variables: { orgName: "Acme Corp (Org A)" } });
      const orgAId = resA.data?.insert_organizations_one?.id;
      if (orgAId) {
        await addMember({ variables: { orgId: orgAId, userId, role: "owner" } });
        // Add sample demo editor & viewer
        await addMember({
          variables: { orgId: orgAId, userId: "22222222-2222-2222-2222-222222222222", role: "editor" },
        }).catch(() => {});
        await addMember({
          variables: { orgId: orgAId, userId: "33333333-3333-3333-3333-333333333333", role: "viewer" },
        }).catch(() => {});
      }

      // 2. Create Org B (Beta Inc)
      const resB = await createOrg({ variables: { orgName: "Beta Inc (Org B)" } });
      const orgBId = resB.data?.insert_organizations_one?.id;
      if (orgBId) {
        await addMember({ variables: { orgId: orgBId, userId, role: "owner" } });
      }

      setActionSuccess("Demo organizations (Acme Corp & Beta Inc) created with team members!");
      setTimeout(() => window.location.reload(), 600);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to seed demo organizations.");
    } finally {
      setSeedingDemo(false);
    }
  }

  // Delete Organization
  async function handleDeleteOrg(orgId: string, orgName: string) {
    if (!confirm(`Are you sure you want to delete organization "${orgName}"? This action cannot be undone.`)) {
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    try {
      await deleteOrg({ variables: { orgId } });
      setActionSuccess(`Organization "${orgName}" deleted.`);
      setTimeout(() => window.location.reload(), 600);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to delete organization.");
    }
  }

  // Add Member to an Org
  async function handleAddMember(e: React.FormEvent, orgId: string) {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);

    const form = addMemberForm[orgId] ?? { userId: "", role: "editor" };
    const targetUserId = form.userId.trim();

    if (!targetUserId) {
      setActionError("User ID (UUID) is required.");
      return;
    }

    setAddingMemberOrgId(orgId);
    try {
      await addMember({
        variables: {
          orgId,
          userId: targetUserId,
          role: form.role,
        },
      });
      setActionSuccess(`Member added successfully as ${form.role}.`);
      setAddMemberForm((prev) => ({
        ...prev,
        [orgId]: { userId: "", role: "editor" },
      }));
      setTimeout(() => window.location.reload(), 600);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to add member.");
    } finally {
      setAddingMemberOrgId(null);
    }
  }

  // Update Member Role
  async function handleRoleChange(memberId: string, role: string) {
    setActionError(null);
    setActionSuccess(null);
    try {
      await updateMemberRole({ variables: { memberId, role } });
      setActionSuccess("Member role updated.");
      setTimeout(() => window.location.reload(), 600);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to update member role.");
    }
  }

  // Remove Member
  async function handleRemoveMember(memberId: string) {
    if (!confirm("Are you sure you want to remove this member from the organization?")) return;
    setActionError(null);
    setActionSuccess(null);
    try {
      await deleteMember({ variables: { memberId } });
      setActionSuccess("Member removed.");
      setTimeout(() => window.location.reload(), 600);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to remove member.");
    }
  }

  return (
    <AppShell
      title="Organizations & Team Member Management"
      description="Create workspaces, switch active context, manage members, update roles, and manage permissions."
      actions={
        <div className="flex items-center gap-3">
          <UserMenu />
          <Button
            onClick={() => {
              setShowCreateModal(true);
              setActionError(null);
              setActionSuccess(null);
            }}
          >
            + New Organization
          </Button>
        </div>
      }
    >
      <div className="max-w-4xl space-y-6">
        {/* Banner feedback */}
        {actionSuccess && (
          <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm text-green-700 dark:text-green-400">
            ✅ {actionSuccess}
          </div>
        )}
        {actionError && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-700 dark:text-red-400">
            ⚠️ {actionError}
          </div>
        )}

        {/* Create Organization Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <Card className="w-full max-w-md bg-background border border-border p-6 shadow-xl">
              <h3 className="mb-3 text-lg font-semibold">Create New Organization</h3>
              <form onSubmit={handleCreateOrg} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    placeholder="e.g. Acme AI Corp"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    autoFocus
                    disabled={creating}
                  />
                </div>
                <p className="text-xs text-muted">
                  You will be added as <strong className="text-foreground">owner</strong> automatically.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateModal(false)}
                    disabled={creating}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating || !newOrgName.trim() || !userId}>
                    {creating ? "Creating..." : "Create Organization"}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}



        {/* Organizations List */}
        {loading ? (
          <Card className="p-6">
            <p className="py-4 text-sm text-muted">Loading organizations...</p>
          </Card>
        ) : memberships.length === 0 ? (
          <Card className="p-8 text-center space-y-4">
            <p className="text-base font-semibold text-foreground">No organization memberships found.</p>
            <p className="text-xs text-muted">Create your first organization or load sample demo organizations to start testing roles and permissions.</p>
            <div className="flex justify-center gap-3 pt-2">
              <Button onClick={() => setShowCreateModal(true)}>+ Create Organization</Button>
              <Button variant="outline" onClick={handleSeedDemoOrgs} disabled={seedingDemo}>
                ⚡ Setup Demo Orgs (Acme Corp & Beta Inc)
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
            {memberships.map((m: OrgMemberInfo) => {
              const isActive = m.organization_id === currentOrgId;
              const isOwner = m.role === "owner";
              const isExpanded = expandedOrgId === m.organization_id || (expandedOrgId === null && isActive);
              const membersList: MemberRecord[] = m.organization?.org_members ?? [];

              const currentForm = addMemberForm[m.organization_id] ?? { userId: "", role: "editor" };

              return (
                <Card key={m.id} className={`p-6 space-y-6 ${isActive ? "border-2 border-primary/80 shadow-md" : ""}`}>
                  {/* Organization Header */}
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-foreground">
                          {m.organization.name}
                        </h3>
                        {isActive && (
                          <span className="rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400 border border-green-500/20">
                            Active Workspace
                          </span>
                        )}
                        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold capitalize text-secondary-foreground">
                          Your Role: {m.role}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        Quota Usage: <strong>{m.organization.quota_used}</strong> / {m.organization.quota_limit} runs used
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant={isActive ? "outline" : "default"}
                        size="sm"
                        disabled={isActive}
                        onClick={() => setCurrentOrgId(m.organization_id)}
                      >
                        {isActive ? "Active Workspace" : "Switch Context"}
                      </Button>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setExpandedOrgId(isExpanded ? "" : m.organization_id)}
                      >
                        {isExpanded ? "Hide Team" : "⚙️ Manage Team & Members"}
                      </Button>

                      {isOwner && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-500/10"
                          onClick={() => handleDeleteOrg(m.organization_id, m.organization.name)}
                        >
                          Delete Org
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Team Members Section (Shown when expanded or default active) */}
                  {isExpanded && (
                    <div className="space-y-4 pt-2 border-t border-border/40">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-foreground">
                          Team Members ({membersList.length})
                        </h4>
                        {!isOwner && (
                          <span className="text-xs text-muted">
                            (Read-only — only owners can add/remove members or change roles)
                          </span>
                        )}
                      </div>

                      {/* Member List Table */}
                      {membersList.length === 0 ? (
                        <p className="py-2 text-xs text-muted">No member records available.</p>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-border">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-secondary/40 border-b border-border text-muted font-semibold uppercase">
                                <th className="py-2.5 px-3">User ID</th>
                                <th className="py-2.5 px-3">Role</th>
                                <th className="py-2.5 px-3">Joined</th>
                                {isOwner && <th className="py-2.5 px-3 text-right">Actions</th>}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                              {membersList.map((mem) => {
                                const isSelf = mem.user_id === userId;

                                return (
                                  <tr key={mem.id} className="hover:bg-secondary/10">
                                    <td className="py-2.5 px-3 font-mono text-foreground">
                                      {mem.user_id}
                                      {isSelf && (
                                        <span className="ml-2 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                          You
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      {isOwner ? (
                                        <select
                                          value={mem.role}
                                          onChange={(e) => handleRoleChange(mem.id, e.target.value)}
                                          className="rounded border border-border bg-background px-2 py-1 text-xs font-semibold capitalize"
                                        >
                                          <option value="owner">Owner</option>
                                          <option value="editor">Editor</option>
                                          <option value="viewer">Viewer</option>
                                        </select>
                                      ) : (
                                        <span className="capitalize font-semibold">{mem.role}</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-muted">
                                      {new Date(mem.created_at).toLocaleDateString()}
                                    </td>
                                    {isOwner && (
                                      <td className="py-2.5 px-3 text-right">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="text-red-500 hover:text-red-700 hover:bg-red-500/10 text-xs py-1 h-auto"
                                          onClick={() => handleRemoveMember(mem.id)}
                                        >
                                          Remove Member
                                        </Button>
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Add Member Form (For Owners) */}
                      {isOwner && (
                        <form
                          onSubmit={(e) => handleAddMember(e, m.organization_id)}
                          className="rounded-lg bg-secondary/30 p-3.5 space-y-2.5 border border-border/80"
                        >
                          <h5 className="text-xs font-bold text-foreground uppercase tracking-wide">
                            + Add Team Member to {m.organization.name}
                          </h5>
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
                            <div className="sm:col-span-2">
                              <label className="block text-[11px] font-medium text-muted mb-1">
                                User ID (UUID)
                              </label>
                              <input
                                type="text"
                                required
                                value={currentForm.userId}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setAddMemberForm((prev) => ({
                                    ...prev,
                                    [m.organization_id]: { ...currentForm, userId: val },
                                  }));
                                }}
                                placeholder="e.g. 11111111-1111-1111-1111-111111111111"
                                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono"
                                disabled={addingMemberOrgId === m.organization_id}
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-medium text-muted mb-1">
                                Role
                              </label>
                              <select
                                value={currentForm.role}
                                onChange={(e) => {
                                  const r = e.target.value as "owner" | "editor" | "viewer";
                                  setAddMemberForm((prev) => ({
                                    ...prev,
                                    [m.organization_id]: { ...currentForm, role: r },
                                  }));
                                }}
                                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-semibold capitalize"
                                disabled={addingMemberOrgId === m.organization_id}
                              >
                                <option value="owner">Owner</option>
                                <option value="editor">Editor</option>
                                <option value="viewer">Viewer</option>
                              </select>
                            </div>

                            <div>
                              <Button
                                type="submit"
                                size="sm"
                                className="w-full text-xs"
                                disabled={
                                  addingMemberOrgId === m.organization_id ||
                                  !currentForm.userId.trim()
                                }
                              >
                                {addingMemberOrgId === m.organization_id ? "Adding..." : "+ Add Member"}
                              </Button>
                            </div>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
