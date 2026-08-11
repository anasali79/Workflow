
"use client";

import { useState } from "react";
import { gql, useMutation } from "@apollo/client";
import { useUserData } from "@nhost/react";
import { useOrganization } from "@/hooks/use-organization";
import { AppShell } from "@/components/layout/app-shell";
import { UserMenu } from "@/components/auth/user-menu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Step 1:
 * Create the organization.
 *
 * IMPORTANT:
 * userId is NOT required here.
 * The current user is added as owner in Step 2.
 */
const CREATE_ORG_MUTATION = gql`
  mutation CreateOrganization($orgName: String!) {
    insert_organizations_one(
      object: {
        name: $orgName
        quota_limit: 100
      }
    ) {
      id
      name
    }
  }
`;

/**
 * Step 2:
 * Add the logged-in user to the newly created organization.
 */
const ADD_MEMBER_MUTATION = gql`
  mutation AddOrgMember(
    $orgId: uuid!
    $userId: uuid!
    $role: String!
  ) {
    insert_org_members_one(
      object: {
        organization_id: $orgId
        user_id: $userId
        role: $role
      }
      on_conflict: {
        constraint: org_members_org_user_unique
        update_columns: [role]
      }
    ) {
      id
      organization_id
      user_id
      role
    }
  }
`;

export default function OrganizationsPage() {
  /**
   * Current authenticated Nhost user.
   */
  const userData = useUserData();
  const userId = userData?.id ?? null;

  const {
    memberships,
    currentOrgId,
    setCurrentOrgId,
    loading,
  } = useOrganization();

  const [showCreate, setShowCreate] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const [createOrg] = useMutation(CREATE_ORG_MUTATION);
  const [addMember] = useMutation(ADD_MEMBER_MUTATION);

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();

    setCreateError(null);
    setCreateSuccess(null);

    const trimmedName = orgName.trim();

    /**
     * Validate organization name.
     */
    if (!trimmedName) {
      setCreateError("Organization name is required.");
      return;
    }

    /**
     * Validate authentication.
     *
     * userId is only needed for creating the org_members row.
     */
    if (!userId) {
      setCreateError(
        "You must be logged in to create an organization.",
      );
      return;
    }

    setCreating(true);

    try {
      /**
       * -------------------------------------------------------
       * STEP 1: Create organization
       * -------------------------------------------------------
       */
      const orgResult = await createOrg({
        variables: {
          orgName: trimmedName,
        },
      });

      if (orgResult.errors?.length) {
        throw new Error(orgResult.errors[0].message);
      }

      const newOrg =
        orgResult.data?.insert_organizations_one;

      const newOrgId = newOrg?.id;

      if (!newOrgId) {
        throw new Error(
          "Organization was created but its ID was not returned.",
        );
      }

      /**
       * -------------------------------------------------------
       * STEP 2: Add current user as OWNER
       * -------------------------------------------------------
       */
      const memberResult = await addMember({
        variables: {
          orgId: newOrgId,
          userId,
          role: "owner",
        },
      });

      if (memberResult.errors?.length) {
        throw new Error(
          `Organization created, but adding you as owner failed: ${memberResult.errors[0].message}`,
        );
      }

      const membership =
        memberResult.data?.insert_org_members_one;

      if (!membership?.id) {
        throw new Error(
          "Organization was created, but owner membership was not created.",
        );
      }

      /**
       * Success.
       */
      setCreateSuccess(
        `Organization "${trimmedName}" created successfully!`,
      );

      setOrgName("");
      setShowCreate(false);

      /**
       * Reload so OrganizationProvider fetches
       * the newly-created membership.
       */
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err) {
      setCreateError(
        err instanceof Error
          ? err.message
          : "Failed to create organization.",
      );
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

          <Button
            onClick={() => {
              setShowCreate(true);
              setCreateError(null);
              setCreateSuccess(null);
            }}
          >
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
              <h3 className="mb-3 text-lg font-semibold">
                Create New Organization
              </h3>

              {createError && (
                <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {createError}
                </p>
              )}

              <form
                onSubmit={handleCreateOrg}
                className="space-y-4"
              >
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
                    Organization Name
                  </label>

                  <input
                    type="text"
                    required
                    value={orgName}
                    onChange={(e) =>
                      setOrgName(e.target.value)
                    }
                    placeholder="e.g. Acme Corp"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    autoFocus
                    disabled={creating}
                  />
                </div>

                <p className="text-xs text-muted">
                  You will be added as{" "}
                  <strong>owner</strong> automatically.
                </p>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCreate(false);
                      setCreateError(null);
                    }}
                    disabled={creating}
                  >
                    Cancel
                  </Button>

                  <Button
                    type="submit"
                    disabled={
                      creating ||
                      !orgName.trim() ||
                      !userId
                    }
                  >
                    {creating
                      ? "Creating..."
                      : "Create Organization"}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {/* Membership List */}
        <Card>
          <h3 className="mb-3 text-sm font-semibold">
            Your Organizations
          </h3>

          {loading ? (
            <p className="py-4 text-sm text-muted">
              Loading organizations...
            </p>
          ) : memberships.length === 0 ? (
            <div className="space-y-3 py-6 text-center">
              <p className="text-sm text-muted">
                No organization memberships found.
              </p>

              <p className="text-xs text-muted">
                Click{" "}
                <strong>
                  &quot;+ New Organization&quot;
                </strong>{" "}
                above to create your first workspace.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {memberships.map((m) => {
                const isActive =
                  m.organization_id === currentOrgId;

                return (
                  <li
                    key={m.id}
                    className="flex items-center justify-between py-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-semibold">
                          {m.organization.name}
                        </span>

                        {isActive && (
                          <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
                            Active Context
                          </span>
                        )}
                      </div>

                      <p className="mt-0.5 text-xs text-muted">
                        Role:{" "}
                        <span className="font-semibold capitalize text-foreground">
                          {m.role}
                        </span>{" "}
                        | Quota:{" "}
                        {m.organization.quota_used} /{" "}
                        {m.organization.quota_limit} runs
                      </p>
                    </div>

                    <Button
                      variant={
                        isActive ? "outline" : "default"
                      }
                      size="sm"
                      disabled={isActive}
                      onClick={() =>
                        setCurrentOrgId(
                          m.organization_id,
                        )
                      }
                    >
                      {isActive
                        ? "Selected"
                        : "Switch Context"}
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
