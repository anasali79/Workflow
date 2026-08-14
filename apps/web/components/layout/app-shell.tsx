"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useOrganization } from "@/hooks/use-organization";
import { useSignOut, useUserData } from "@nhost/react";

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    href: "/workflows",
    label: "Builder",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    href: "/workflows/runs",
    label: "Runs",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: "/organizations",
    label: "Organizations",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },

  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
] as const;

type AppShellProps = {
  children: React.ReactNode;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  noPadding?: boolean;
};

export function AppShell({ children, title, description, actions, noPadding }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { memberships, currentOrg, setCurrentOrgId } = useOrganization();
  const user = useUserData();
  const { signOut } = useSignOut();
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = (localStorage.getItem("theme") as "dark" | "light") || "dark";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      // ignore
    }
    router.replace("/login");
  }

  return (
    <div className="min-h-screen flex bg-[var(--bg)] color-[var(--foreground)] transition-colors duration-200">
      {/* ── Left Sidebar (StitchFlow aesthetics) ── */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 sticky top-0 h-screen bg-[var(--bg-2)] border-r border-[var(--border)]">
        {/* Brand / Logo */}
        <div className="px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--foreground)] text-[var(--bg)] flex items-center justify-center shadow-md font-bold text-sm">
              S
            </div>
            <span className="text-lg font-bold tracking-tight text-[var(--foreground)]">StitchFlow</span>
          </div>
        </div>

        {/* Navigation Items (Green pill active) */}
        <nav className="flex-1 px-4 space-y-1 mt-2">
          {navItems.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link key={item.href} href={item.href}>
                <div className={`nav-item ${isActive ? "active" : ""}`}>
                  <span>{item.icon}</span>
                  <span className="font-semibold">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Theme Toggle & Bottom Organization Switcher Widget */}
        <div className="p-4 relative border-t border-[var(--border)] space-y-2">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-3)] hover:bg-[var(--surface-2)] border border-[var(--border-2)] text-xs font-semibold text-[var(--foreground)] transition-colors"
          >
            <span>{theme === "dark" ? "🌙 Dark Mode" : "☀️ Light Mode"}</span>
            <span className="text-[10px] text-[var(--muted)]">Toggle</span>
          </button>

          <button
            onClick={() => setShowOrgDropdown(!showOrgDropdown)}
            className="w-full flex items-center justify-between p-2.5 rounded-xl bg-[var(--bg-3)] hover:bg-[var(--surface-2)] border border-[var(--border-2)] transition-all"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[var(--border-2)] flex items-center justify-center text-xs font-bold text-[var(--muted)]">
                🏢
              </div>
              <div className="text-left truncate">
                <p className="text-xs font-bold text-[var(--foreground)] truncate">
                  {currentOrg?.name || "Acme Corp"}
                </p>
                <p className="text-[10px] text-[var(--muted)]">Free Tier</p>
              </div>
            </div>
            <svg className="w-4 h-4 text-[var(--muted)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
            </svg>
          </button>

          {/* Org Dropdown Popup */}
          {showOrgDropdown && (
            <div className="absolute bottom-20 left-4 right-4 bg-[var(--surface)] border border-[var(--border-2)] rounded-xl shadow-2xl overflow-hidden z-50">
              <div className="p-2 border-b border-[var(--border)] text-[11px] font-semibold text-[var(--muted)]">
                Switch Organization
              </div>
              <div className="max-h-48 overflow-y-auto">
                {memberships.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setCurrentOrgId(m.organization_id);
                      setShowOrgDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-[var(--bg-3)] ${m.organization_id === currentOrg?.id ? "text-[#00c885] font-bold" : "text-[var(--foreground)]"
                      }`}
                  >
                    <span className="truncate">{m.organization.name}</span>
                    <span className="text-[10px] text-[var(--muted)] capitalize">{m.role}</span>
                  </button>
                ))}
              </div>
              <Link
                href="/organizations"
                onClick={() => setShowOrgDropdown(false)}
                className="block p-2 text-center text-xs text-[#7c75f3] font-semibold hover:bg-[var(--bg-3)] border-t border-[var(--border)]"
              >
                + Manage All Orgs
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main View Area ── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-screen">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-20 px-8 py-4 flex items-center justify-between gap-6 bg-[var(--bg)]/90 backdrop-blur-md border-b border-[var(--border)]">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <svg
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search workflows..."
              className="w-full bg-[var(--bg-3)] border border-[var(--border-2)] rounded-xl pl-9 pr-4 py-2 text-xs text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[#7c75f3]"
            />
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-4">

            {/* Bell Notification */}
            <button className="relative p-2 rounded-lg bg-[var(--bg-3)] border border-[var(--border-2)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#00c885]" />
            </button>

            {/* User Profile Avatar */}
            <Link href="/settings" title={user?.email || "Settings"}>
              <div className="w-8 h-8 rounded-full bg-[#7c75f3] flex items-center justify-center text-xs font-bold text-white shadow-md cursor-pointer hover:opacity-90 transition-opacity">
                {user?.email?.[0]?.toUpperCase() || "U"}
              </div>
            </Link>

            {/* Logout Button */}
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-2)] bg-[var(--bg-3)] hover:bg-[#ff4d4d]/10 hover:border-[#ff4d4d]/40 hover:text-[#ff4d4d] text-xs font-semibold text-[var(--muted)] transition-all cursor-pointer shadow-sm"
              title="Sign Out"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Logout</span>
            </button>

            {actions}
          </div>
        </header>

        {/* Main Content Area */}
        <main className={`flex-1 ${noPadding ? "" : "p-8 space-y-6"}`}>
          {title && (
            <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
              <div>
                <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">{title}</h1>
                {description && <p className="text-xs text-[var(--muted)] mt-1">{description}</p>}
              </div>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
