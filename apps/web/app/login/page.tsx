import { Suspense } from "react";
import { LoginForm } from "@/features/auth/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Suspense fallback={<div className="text-sm text-muted">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
