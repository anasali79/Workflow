"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSignOut, useUserData } from "@nhost/react";
import { useOrganization } from "@/hooks/use-organization";
import { Button } from "@/components/ui/button";

export function UserMenu() {
  const router = useRouter();
  const user = useUserData();
  const { signOut } = useSignOut();
  const { currentOrg, currentRole } = useOrganization();

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      // ignore
    }
    router.replace("/login");
  }

  return (
    <div className="flex items-center gap-3">
      {/* Organization Badge & Quick Switcher */}
      {currentOrg ? (
        <Link href="/organizations">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/60 transition-colors cursor-pointer text-xs">
            <span className="text-base">🏢</span>
            <div>
              <p className="font-bold text-foreground leading-tight">{currentOrg.name}</p>
              <p className="text-[10px] text-muted capitalize">Role: {currentRole || "member"}</p>
            </div>
            <span className="ml-1 text-[10px] font-semibold text-primary underline">Manage</span>
          </div>
        </Link>
      ) : (
        <Link href="/organizations">
          <Button variant="outline" size="sm" className="text-xs">
            🏢 Manage Organizations
          </Button>
        </Link>
      )}

      {/* User Info */}
      <div className="hidden text-right sm:block border-l border-border pl-3">
        <p className="text-xs font-semibold text-foreground">{user?.displayName || user?.email || "User"}</p>
        <p className="text-[10px] text-muted">{user?.email || ""}</p>
      </div>

      <Button variant="secondary" size="sm" onClick={handleSignOut} className="text-xs">
        Sign out
      </Button>
    </div>
  );
}
