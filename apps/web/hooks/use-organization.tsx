"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { gql, useQuery } from "@apollo/client";
import { useUserData } from "@nhost/react";

export interface OrgMemberInfo {
  id: string;
  organization_id: string;
  role: "owner" | "editor" | "viewer";
  organization: {
    id: string;
    name: string;
    quota_limit: number;
    quota_used: number;
  };
}

const USER_ORGS_QUERY = gql`
  query GetUserOrganizations($userId: uuid!) {
    org_members(where: { user_id: { _eq: $userId } }) {
      id
      organization_id
      role
      organization {
        id
        name
        quota_limit
        quota_used
      }
    }
  }
`;

interface OrganizationContextType {
  memberships: OrgMemberInfo[];
  currentOrg: OrgMemberInfo["organization"] | null;
  currentRole: "owner" | "editor" | "viewer" | null;
  currentOrgId: string | null;
  setCurrentOrgId: (id: string) => void;
  loading: boolean;
}

const OrganizationContext = createContext<OrganizationContextType>({
  memberships: [],
  currentOrg: null,
  currentRole: null,
  currentOrgId: null,
  setCurrentOrgId: () => {},
  loading: true,
});

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const userData = useUserData();
  const userId = userData?.id;

  const [currentOrgId, setCurrentOrgIdState] = useState<string | null>(null);

  const { data, loading } = useQuery(USER_ORGS_QUERY, {
    variables: { userId: userId ?? "00000000-0000-0000-0000-000000000000" },
    skip: !userId,
  });

  const memberships: OrgMemberInfo[] = data?.org_members ?? [];

  useEffect(() => {
    if (memberships.length > 0) {
      const savedId = typeof window !== "undefined" ? localStorage.getItem("selected_org_id") : null;
      const matched = memberships.find((m) => m.organization_id === savedId);
      if (matched) {
        setCurrentOrgIdState(matched.organization_id);
      } else {
        setCurrentOrgIdState(memberships[0].organization_id);
      }
    }
  }, [memberships]);

  function setCurrentOrgId(id: string) {
    setCurrentOrgIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem("selected_org_id", id);
    }
  }

  const activeMembership = memberships.find((m) => m.organization_id === currentOrgId) ?? memberships[0] ?? null;

  const isLoading = userId ? loading : false;

  return (
    <OrganizationContext.Provider
      value={{
        memberships,
        currentOrg: activeMembership?.organization ?? null,
        currentRole: activeMembership?.role ?? null,
        currentOrgId: activeMembership?.organization_id ?? null,
        setCurrentOrgId,
        loading: isLoading,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  return useContext(OrganizationContext);
}
