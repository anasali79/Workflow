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

  function fillDemo() {
    setEmail("owner-orga@example.com");
    setPassword("password123");
  }

  const loading = isLoading || isSubmitting;

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-white text-slate-900 relative overflow-hidden font-sans">
      {/* ── Background Subtle Concentric Ring Ripple Effect ── */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-60">
        <div className="w-[500px] h-[500px] rounded-full border border-indigo-100 animate-pulse" />
        <div className="absolute w-[750px] h-[750px] rounded-full border border-slate-100" />
        <div className="absolute w-[1000px] h-[1000px] rounded-full border border-slate-100/60" />
      </div>

      {/* ── Top Header Bar ── */}
      <header className="relative z-10 w-full px-8 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-indigo-200">
            S
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900">StitchFlow</span>
        </div>

        <Link
          href="/login"
          className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-md hover:bg-indigo-700 transition-colors"
        >
          👤
        </Link>
      </header>

      {/* ── Main Centered Card Area ── */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-[440px] bg-white border border-slate-200/80 rounded-3xl p-10 shadow-xl shadow-slate-200/60 space-y-6">
          {/* Top Circular Waving / Sparkle Icon */}
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl shadow-inner border border-indigo-100">
              👋
            </div>
          </div>

          {/* Heading */}
          <div className="text-center space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Welcome back
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Sign in to your StitchFlow account
            </p>
          </div>

          {/* One-Click Demo Quick Sign-in chip */}
          <button
            type="button"
            onClick={fillDemo}
            className="w-full flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200 hover:border-indigo-500/50 hover:bg-indigo-50/30 transition-all text-left cursor-pointer group"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0">
                ⚡
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                  One-Click Demo Login
                </p>
                <p className="text-[10.5px] text-slate-500 font-mono">
                  owner-orga@example.com
                </p>
              </div>
            </div>
            <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all">
              Auto Fill →
            </span>
          </button>

          {isError && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-600 text-xs font-medium flex items-center gap-2">
              <span>⚠</span>
              <span>{error?.message ?? "Invalid email or password. Please try again."}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={onSubmit} className="space-y-5">
            {/* Email Field */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Email
              </label>
              <input
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 transition-all"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                disabled={loading}
              />
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700">
                  Password
                </label>
                <button
                  type="button"
                  onClick={fillDemo}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-11 py-3 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 transition-all"
                  type={showPass ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs p-1 transition-colors"
                >
                  {showPass ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a10.04 10.04 0 012.122-.363c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Primary Sign In Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <span>→</span>
                </>
              )}
            </button>
          </form>

          {/* Footer Link */}
          <div className="pt-2 text-center">
            <p className="text-xs text-slate-500">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="text-indigo-600 font-bold hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </main>

      {/* Footer spacer */}
      <footer className="py-4 text-center text-[11px] text-slate-400">
        StitchFlow Agent Platform &copy; 2026
      </footer>
    </div>
  );
}
