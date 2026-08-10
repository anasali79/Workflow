"use client";

import { useRouter } from "next/navigation";
import { useSignOut, useUserData } from "@nhost/react";
import { Button } from "@/components/ui/button";

export function UserMenu() {
  const router = useRouter();
  const user = useUserData();
  const { signOut } = useSignOut();

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
      <div className="hidden text-right sm:block">
        <p className="text-sm font-medium">{user?.displayName || user?.email || "Organization Owner"}</p>
        <p className="text-xs text-muted">{user?.email || ""}</p>
      </div>
      <Button variant="secondary" onClick={handleSignOut}>
        Sign out
      </Button>
    </div>
  );
}
