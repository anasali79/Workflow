"use client";

import { useState } from "react";
import { gql, useMutation, useQuery } from "@apollo/client";
import { useOrganization } from "@/hooks/use-organization";
import { AppShell } from "@/components/layout/app-shell";

const SETTINGS_ORG_QUERY = gql`
  query GetOrgSettings($orgId: uuid!) {
    organizations_by_pk(id: $orgId) {
      id
      name
      quota_limit
      quota_used
      created_at
    }
    org_members(where: { organization_id: { _eq: $orgId } }, order_by: { created_at: asc }) {
      id
      user_id
      role
      created_at
    }
  }
`;

const UPDATE_ORG_NAME_MUTATION = gql`
  mutation UpdateOrgName($orgId: uuid!, $name: String!) {
    update_organizations_by_pk(pk_columns: { id: $orgId }, _set: { name: $name }) {
      id
      name
    }
  }
`;

const ADD_MEMBER_MUTATION = gql`
  mutation AddOrgMember($orgId: uuid!, $userId: uuid!, $role: String!) {
    insert_org_members_one(object: { organization_id: $orgId, user_id: $userId, role: $role }) {
      id
      role
    }
  }
`;

const UPDATE_MEMBER_ROLE_MUTATION = gql`
  mutation UpdateMemberRole($memberId: uuid!, $role: String!) {
    update_org_members_by_pk(pk_columns: { id: $memberId }, _set: { role: $role }) {
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

export default function SettingsPage() {
  const { currentOrg, currentOrgId, currentRole } = useOrganization();
  const [activeTab, setActiveTab] = useState<"general" | "members" | "billing" | "developer">("general");

  const [editingName, setEditingName] = useState(false);
  const [orgName, setOrgName] = useState(currentOrg?.name || "Acme Corp");

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteUserId, setInviteUserId] = useState("");
  const [inviteRole, setInviteRole] = useState<"owner" | "editor" | "viewer">("editor");
  const [inviting, setInviting] = useState(false);

  const isOwner = currentRole === "owner";

  const { data, refetch } = useQuery(SETTINGS_ORG_QUERY, {
    variables: { orgId: currentOrgId ?? "00000000-0000-0000-0000-000000000000" },
    skip: !currentOrgId,
  });

  const [updateOrgName] = useMutation(UPDATE_ORG_NAME_MUTATION);
  const [addMember] = useMutation(ADD_MEMBER_MUTATION);
  const [updateMemberRole] = useMutation(UPDATE_MEMBER_ROLE_MUTATION);
  const [deleteMember] = useMutation(DELETE_MEMBER_MUTATION);

  const org = data?.organizations_by_pk ?? currentOrg;
  const members = data?.org_members ?? [];

  async function handleSaveOrgName() {
    if (!currentOrgId || !orgName.trim()) return;
    try {
      await updateOrgName({ variables: { orgId: currentOrgId, name: orgName.trim() } });
      setEditingName(false);
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update organization name");
    }
  }

  async function handleInviteMember(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrgId || !inviteUserId.trim()) return;

    setInviting(true);
    try {
      await addMember({
        variables: { orgId: currentOrgId, userId: inviteUserId.trim(), role: inviteRole },
      });
      setInviteUserId("");
      setShowInviteModal(false);
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(memberId: string, role: string) {
    try {
      await updateMemberRole({ variables: { memberId, role } });
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update role");
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!confirm("Remove this member from the organization?")) return;
    try {
      await deleteMember({ variables: { memberId } });
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove member");
    }
  }

  return (
    <AppShell
      title="Organization Settings"
      description="Manage organization details, team members, billing, and developer configuration."
      actions={
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00c885]/15 text-[#00c885] border border-[#00c885]/30 text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00c885]" /> {currentRole?.toUpperCase() || "MEMBER"} ACCESS
          </span>
          {isOwner && (
            <button
              onClick={handleSaveOrgName}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#7c75f3] hover:bg-[#6b63eb] text-white font-semibold text-xs shadow-lg transition-colors cursor-pointer"
            >
              Save Changes
            </button>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Sub-Navigation */}
        <div className="space-y-6">
          <div className="p-2 rounded-2xl bg-[var(--surface)] border border-[var(--border)] space-y-1">
            <button
              onClick={() => setActiveTab("general")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-colors text-left ${
                activeTab === "general" ? "bg-[#00c885] text-[#0b0e17] font-bold" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              🏢 General
            </button>
            <button
              onClick={() => setActiveTab("members")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-colors text-left ${
                activeTab === "members" ? "bg-[#00c885] text-[#0b0e17] font-bold" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              👥 Members ({members.length})
            </button>
            <button
              onClick={() => setActiveTab("billing")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-colors text-left ${
                activeTab === "billing" ? "bg-[#00c885] text-[#0b0e17] font-bold" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              ☁️ Quotas & Billing
            </button>
            <button
              onClick={() => setActiveTab("developer")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-colors text-left ${
                activeTab === "developer" ? "bg-[#00c885] text-[#0b0e17] font-bold" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              ⚙️ Developer
            </button>
          </div>

          {/* Pro Plan Widget */}
          <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] space-y-3">
            <div className="flex items-center gap-2 text-[#ffb020]">
              <span>🛡️</span>
              <span className="text-xs font-bold text-[var(--foreground)]">Active Plan: Pro</span>
            </div>
            <p className="text-[11px] text-[var(--muted)]">
              Quota limit: {org?.quota_limit ?? 100} calls per period.
            </p>
            <button className="text-xs text-[#7c75f3] font-semibold hover:underline">
              View Plan Details
            </button>
          </div>
        </div>

        {/* Main Content Pane */}
        <div className="lg:col-span-3 space-y-8">
          {/* Modal for Invite Member */}
          {showInviteModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border-2)] rounded-2xl p-6 shadow-2xl space-y-4">
                <h3 className="text-lg font-bold text-[var(--foreground)]">Invite Team Member</h3>
                <form onSubmit={handleInviteMember} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-[var(--muted)] mb-1">
                      User ID (UUID)
                    </label>
                    <input
                      type="text"
                      required
                      value={inviteUserId}
                      onChange={(e) => setInviteUserId(e.target.value)}
                      placeholder="e.g. 11111111-1111-1111-1111-111111111111"
                      className="w-full bg-[var(--bg-3)] border border-[var(--border-2)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--foreground)] focus:outline-none focus:border-[#7c75f3]"
                      disabled={inviting}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-[var(--muted)] mb-1">
                      Role
                    </label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as "owner" | "editor" | "viewer")}
                      className="w-full bg-[var(--bg-3)] border border-[var(--border-2)] rounded-xl px-3 py-2 text-xs font-semibold capitalize text-[var(--foreground)] focus:outline-none"
                      disabled={inviting}
                    >
                      <option value="owner">Owner</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowInviteModal(false)}
                      className="px-4 py-2 rounded-xl border border-[var(--border-2)] text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                      disabled={inviting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-[#7c75f3] hover:bg-[#6b63eb] text-white text-xs font-bold shadow"
                      disabled={inviting || !inviteUserId.trim()}
                    >
                      {inviting ? "Adding..." : "Add Member"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TAB 1: General Settings */}
          {(activeTab === "general" || activeTab === "billing") && (
            <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] space-y-6">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
                <div className="flex items-center gap-2">
                  <span>🏢</span>
                  <h3 className="text-base font-bold text-[var(--foreground)]">Organization Profile</h3>
                </div>
                {isOwner && !editingName && (
                  <button
                    onClick={() => setEditingName(true)}
                    className="text-xs text-[#7c75f3] font-semibold hover:underline"
                  >
                    Edit Profile
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--muted)] uppercase mb-1">
                      Organization Name
                    </label>
                    <input
                      type="text"
                      disabled={!editingName}
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      className="w-full bg-[var(--bg-3)] border border-[var(--border-2)] rounded-xl px-4 py-2.5 text-xs text-[var(--foreground)] focus:outline-none focus:border-[#7c75f3]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--muted)] uppercase mb-1">
                      Workspace ID
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        readOnly
                        value={`org_${org?.id?.slice(0, 12) || "9x8c7v6b5n4m"}`}
                        className="w-full bg-[var(--bg-3)] border border-[var(--border-2)] rounded-xl px-4 py-2.5 text-xs text-[var(--muted)] font-mono focus:outline-none"
                      />
                      <button
                        onClick={() => navigator.clipboard.writeText(org?.id || "")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)] text-xs"
                      >
                        📋
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center p-6 rounded-xl border border-dashed border-[var(--border-2)] bg-[var(--bg-3)] text-center">
                  <div className="w-16 h-16 rounded-2xl bg-[#00c885]/20 text-[#00c885] flex items-center justify-center font-bold text-xl mb-2">
                    {org?.name?.[0]?.toUpperCase() || "A"}
                  </div>
                  <p className="text-[11px] text-[var(--muted)]">Organization Logo</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Team Members Table */}
          {(activeTab === "members" || activeTab === "general") && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[#7c75f3]">👥</span>
                  <h3 className="text-base font-bold text-[var(--foreground)]">Team Members ({members.length})</h3>
                </div>
                {isOwner && (
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-3)] border border-[var(--border-2)] hover:border-[#7c75f3] text-[var(--foreground)] text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <span>👤+</span> Invite Member
                  </button>
                )}
              </div>

              <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--bg-3)] border-b border-[var(--border)] text-[var(--muted)] uppercase text-[10px] tracking-wider font-bold">
                      <th className="py-3 px-5">User ID</th>
                      <th className="py-3 px-5">Role</th>
                      <th className="py-3 px-5">Joined</th>
                      {isOwner && <th className="py-3 px-5 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {members.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-[var(--muted)]">
                          No members found.
                        </td>
                      </tr>
                    ) : (
                      members.map((mem: { id: string; user_id: string; role: string; created_at: string }) => (
                        <tr key={mem.id} className="hover:bg-[var(--bg-3)]/50">
                          <td className="py-3.5 px-5 font-mono text-[var(--foreground)]">
                            {mem.user_id}
                          </td>
                          <td className="py-3.5 px-5">
                            {isOwner ? (
                              <select
                                value={mem.role}
                                onChange={(e) => handleRoleChange(mem.id, e.target.value)}
                                className="bg-[var(--bg-3)] border border-[var(--border-2)] rounded-lg px-2.5 py-1 text-xs text-[var(--foreground)] font-semibold capitalize"
                              >
                                <option value="owner">Owner</option>
                                <option value="editor">Editor</option>
                                <option value="viewer">Viewer</option>
                              </select>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full bg-[var(--bg-3)] text-[var(--foreground)] text-[11px] font-semibold capitalize">
                                {mem.role}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-5 text-[var(--muted)]">
                            {new Date(mem.created_at).toLocaleDateString()}
                          </td>
                          {isOwner && (
                            <td className="py-3.5 px-5 text-right">
                              <button
                                onClick={() => handleRemoveMember(mem.id)}
                                className="text-red-400 hover:text-red-300 text-xs font-semibold px-2 py-1 rounded hover:bg-red-500/10"
                              >
                                Remove
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: Developer Integration Status */}
          {(activeTab === "developer" || activeTab === "general") && (
            <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] space-y-4">
              <div className="flex items-center gap-2 border-b border-[var(--border)] pb-4">
                <span>⚙️</span>
                <h3 className="text-base font-bold text-[var(--foreground)]">Developer & Webhook Integration</h3>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-[var(--bg-3)] border border-[var(--border-2)] flex items-center justify-between">
                  <div>
                    <p className="font-bold text-[var(--foreground)]">Inbound Webhook Endpoint</p>
                    <p className="font-mono text-[11px] text-[var(--muted)] mt-0.5">
                      POST http://localhost:1337/v1/functions/webhook-trigger
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-[#00c885]/15 text-[#00c885] font-bold text-[10px]">
                    Active
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[var(--bg-3)] border border-[var(--border-2)] flex items-center justify-between">
                  <div>
                    <p className="font-bold text-[var(--foreground)]">Hasura Action Handler Endpoint</p>
                    <p className="font-mono text-[11px] text-[var(--muted)] mt-0.5">
                      POST http://localhost:1337/v1/functions/trigger-workflow-run
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-[#00c885]/15 text-[#00c885] font-bold text-[10px]">
                    Connected
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
