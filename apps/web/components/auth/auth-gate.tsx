"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthenticationStatus } from "@nhost/react";
import { isNhostConfigured } from "@/lib/nhost";

/**
 * Client-side auth gate. Middleware is a soft check; this verifies Nhost session.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useAuthenticationStatus();
  const nhostConfigured = isNhostConfigured;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !isLoading && !isAuthenticated && nhostConfigured) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, mounted, nhostConfigured, router]);

  if (!mounted || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted">
        Restoring session…
      </div>
    );
  }

  if (!isAuthenticated && nhostConfigured) {
    return null;
  }

  return <>{children}</>;
}
