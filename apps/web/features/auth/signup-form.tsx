"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSignUpEmailPassword } from "@nhost/react";

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
      setInfo("Account created! Check your email to verify before signing in.");
      return;
    }

    if (result.isSuccess) {
      router.replace("/dashboard");
      return;
    }

    setLocalError(result.error?.message ?? "Unable to create account.");
  }

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-white text-slate-900 relative overflow-hidden font-sans">
      {/* Background Ripple */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-60">
        <div className="w-[500px] h-[500px] rounded-full border border-indigo-100 animate-pulse" />
        <div className="absolute w-[750px] h-[750px] rounded-full border border-slate-100" />
        <div className="absolute w-[1000px] h-[1000px] rounded-full border border-slate-100/60" />
      </div>

      {/* Top Header */}
      <header className="relative z-10 w-full px-8 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-indigo-200">
            S
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900">StitchFlow</span>
        </div>

        <Link
          href="/signup"
          className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-md hover:bg-indigo-700 transition-colors"
        >
          ✨
        </Link>
      </header>

      {/* Main Card */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-[440px] bg-white border border-slate-200/80 rounded-3xl p-10 shadow-xl shadow-slate-200/60 space-y-6">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl shadow-inner border border-indigo-100">
              🚀
            </div>
          </div>

          <div className="text-center space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Create your account
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Join StitchFlow AI Agent Platform
            </p>
          </div>

          {(localError || error?.message) && !isSuccess && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-600 text-xs font-medium flex items-center gap-2">
              <span>⚠</span>
              <span>{localError ?? error?.message}</span>
            </div>
          )}

          {(info || needsEmailVerification) && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 text-xs font-medium flex items-center gap-2">
              <span>✓</span>
              <span>{info ?? "Check your email to verify your account."}</span>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Full Name
              </label>
              <input
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 transition-all"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alex Morgan"
              />
            </div>

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
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Password
              </label>
              <input
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 transition-all"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Creating Account…</span>
                </>
              ) : (
                <>
                  <span>Create Account</span>
                  <span>→</span>
                </>
              )}
            </button>
          </form>

          <div className="pt-2 text-center">
            <p className="text-xs text-slate-500">
              Already have an account?{" "}
              <Link href="/login" className="text-indigo-600 font-bold hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </main>

      <footer className="py-4 text-center text-[11px] text-slate-400">
        StitchFlow Agent Platform &copy; 2026
      </footer>
    </div>
  );
}
