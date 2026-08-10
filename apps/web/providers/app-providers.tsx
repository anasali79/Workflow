"use client";

import { NhostAppProvider } from "@/providers/nhost-provider";
import { ApolloAppProvider } from "@/providers/apollo-provider";
import { OrganizationProvider } from "@/hooks/use-organization";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <NhostAppProvider>
      <ApolloAppProvider>
        <OrganizationProvider>{children}</OrganizationProvider>
      </ApolloAppProvider>
    </NhostAppProvider>
  );
}
