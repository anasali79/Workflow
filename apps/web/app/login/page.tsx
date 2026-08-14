import { Suspense } from "react";
import { LoginForm } from "@/features/auth/login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-xs text-[var(--muted)]">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
