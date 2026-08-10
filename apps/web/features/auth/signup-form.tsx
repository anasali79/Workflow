"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSignUpEmailPassword } from "@nhost/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function SignupForm() {
  const router = useRouter();
  const { signUpEmailPassword, isLoading, error, isSuccess, needsEmailVerification } =
    useSignUpEmailPassword();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    setInfo(null);

    if (!email || !password) {
      setLocalError("Email and password are required.");
      return;
    }

    if (password.length < 8) {
      setLocalError("Password must be at least 8 characters.");
      return;
    }

    const result = await signUpEmailPassword(email, password, {
      displayName: displayName || undefined,
    });

    if (result.needsEmailVerification) {
      setInfo("Account created. Check your email to verify before signing in.");
      return;
    }

    if (result.isSuccess) {
      router.replace("/dashboard");
      return;
    }

    setLocalError(result.error?.message ?? "Unable to create account.");
  }

  return (
    <Card className="w-full max-w-md">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Workflow Agent</p>
        <h1 className="mt-2 text-2xl font-semibold">Create account</h1>
        <p className="mt-1 text-sm text-muted">Join your organization workspace.</p>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Display name</span>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Email</span>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Password</span>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>

        {(localError || error?.message) && !isSuccess ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
            {localError ?? error?.message}
          </p>
        ) : null}

        {info || needsEmailVerification ? (
          <p className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-accent" role="status">
            {info ?? "Check your email to verify your account."}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Creating account…" : "Sign up"}
        </Button>
      </form>

      <p className="mt-5 text-sm text-muted">
        Already have an account?{" "}
        <Link className="font-medium text-accent hover:text-accent-hover" href="/login">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
