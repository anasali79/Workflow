"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard",     icon: "⚡", label: "Dashboard"     },
  { href: "/workflows",     icon: "🔗", label: "Workflows"     },
  { href: "/organizations", icon: "🏢", label: "Organizations" },
  { href: "/settings",      icon: "⚙️", label: "Settings"      },
] as const;

type AppShellProps = {
  children: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  noPadding?: boolean;
};

export function AppShell({ children, title, description, actions, noPadding }: AppShellProps) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const savedTheme = (localStorage.getItem("theme") as "dark" | "light") || "dark";
    setTheme(savedTheme);
    document.documentElement.setAttribute("data-theme", savedTheme);
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg)" }}>
      {/* ── Sidebar ── */}
      <aside
        className="hidden md:flex flex-col w-60 shrink-0 sticky top-0 h-screen"
        style={{
          background: "var(--bg-2)",
          borderRight: "1px solid var(--border)",
        }}
      >
        {/* Logo */}
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold shadow-md"
              style={{ background: "var(--accent)", color: "white" }}
            >
              W
            </div>
            <div>
              <p className="text-[13px] font-bold" style={{ color: "var(--foreground)" }}>
                Workflow
              </p>
              <p className="text-[10px]" style={{ color: "var(--muted)" }}>
                Agent Platform
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href}>
                <span
                  className={`nav-item ${isActive ? "active" : ""}`}
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  <span className="text-base w-5 text-center">{item.icon}</span>
                  <span>{item.label}</span>
                  {isActive && (
                    <span
                      className="ml-auto w-1.5 h-1.5 rounded-full"
                      style={{ background: "var(--accent)" }}
                    />
                  )}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Theme Toggle & Footer */}
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <span className="text-[11px]" style={{ color: "var(--muted)" }}>
            Theme
          </span>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors"
            style={{
              background: "var(--bg-3)",
              border: "1px solid var(--border-2)",
              color: "var(--foreground)",
              cursor: "pointer",
            }}
            title="Toggle Light/Dark Mode"
          >
            <span>{theme === "dark" ? "🌙 Dark" : "☀️ Light"}</span>
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-screen">
        {/* Top header */}
        <header
          className="sticky top-0 z-10 px-6 py-4 flex items-center justify-between gap-4"
          style={{
            background: theme === "dark" ? "rgba(9,9,15,0.85)" : "rgba(248,250,252,0.85)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="min-w-0">
            <h1 className="text-[17px] font-semibold truncate" style={{ color: "var(--foreground)" }}>
              {title}
            </h1>
            {description && (
              <p className="text-[12px] mt-0.5 truncate" style={{ color: "var(--muted)" }}>
                {description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {/* Mobile theme toggle */}
            <button
              onClick={toggleTheme}
              className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg text-xs"
              style={{
                background: "var(--bg-3)",
                border: "1px solid var(--border-2)",
                color: "var(--foreground)",
              }}
            >
              {theme === "dark" ? "🌙" : "☀️"}
            </button>
            {actions}
          </div>
        </header>

        {/* Content */}
        <main className={`flex-1 ${noPadding ? "" : "p-6"}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
