"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthenticationStatus, useSignInEmailPassword } from "@nhost/react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/dashboard";
  const { isAuthenticated, isLoading: authLoading } = useAuthenticationStatus();
  const { signInEmailPassword, isLoading, isError, error } = useSignInEmailPassword();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    if (isAuthenticated && !authLoading) router.replace(nextPath);
  }, [isAuthenticated, authLoading, nextPath, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email || !password) return;
    setIsSubmitting(true);
    try {
      const result = await signInEmailPassword(email, password);
      if (!result.isError) router.replace(nextPath);
    } finally {
      setIsSubmitting(false);
    }
  }

  const loading = isLoading || isSubmitting;

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg)",
      backgroundImage: "radial-gradient(ellipse 80% 60% at 50% -10%, #7c3aed15, transparent)",
      padding: "24px",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: "400px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <div style={{
            width: "52px", height: "52px", borderRadius: "16px",
            background: "linear-gradient(135deg, var(--accent), #6d28d9)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "24px", margin: "0 auto 16px",
            boxShadow: "0 0 0 1px #7c3aed40, 0 8px 32px #7c3aed30",
          }}>
            ⚡
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
            Workflow Platform
          </h1>
          <p style={{ fontSize: "14px", color: "var(--muted)", marginTop: "6px" }}>
            Sign in to your workspace
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border-2)",
          borderRadius: "20px", padding: "32px",
          boxShadow: "0 24px 64px #00000060",
        }}>
          {isError && (
            <div style={{
              background: "var(--red-dim)", border: "1px solid #ef444430",
              borderRadius: "10px", padding: "12px 14px", marginBottom: "20px",
              fontSize: "13.5px", color: "var(--red)",
              display: "flex", alignItems: "center", gap: "8px",
            }}>
              <span>⚠</span>
              {error?.message ?? "Invalid credentials. Please try again."}
            </div>
          )}

          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {/* Email */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "7px", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Email
              </label>
              <input
                className="wf-input"
                type="email" autoComplete="email" required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={loading}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "7px", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  className="wf-input"
                  type={showPass ? "text" : "password"}
                  autoComplete="current-password" required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                  style={{ paddingRight: "44px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "14px", padding: "4px" }}
                >
                  {showPass ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            {/* Demo credentials hint */}
            <div style={{ background: "var(--accent-glow)", border: "1px solid #7c3aed25", borderRadius: "10px", padding: "10px 13px", fontSize: "12px", color: "var(--muted)" }}>
              <span style={{ color: "var(--accent-hover)", fontWeight: 600 }}>Demo:</span> owner-orga@example.com / password123
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", padding: "12px",
                background: loading ? "var(--surface-2)" : "linear-gradient(135deg, var(--accent), #6d28d9)",
                color: "white", border: "none", borderRadius: "12px",
                fontSize: "14.5px", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
                transition: "opacity 0.15s, transform 0.1s",
                boxShadow: loading ? "none" : "0 4px 16px var(--accent-glow)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              }}
            >
              {loading ? (
                <>
                  <span style={{ width: "14px", height: "14px", border: "2px solid #ffffff40", borderTopColor: "white", borderRadius: "50%", display: "inline-block", animation: "spin 1s linear infinite" }} />
                  Signing in…
                </>
              ) : "Sign in →"}
            </button>
          </form>

          <p style={{ marginTop: "20px", textAlign: "center", fontSize: "13px", color: "var(--muted)" }}>
            Need an account?{" "}
            <Link href="/signup" style={{ color: "var(--accent-hover)", fontWeight: 600 }}>
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
