"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clients", label: "Clients" },
  { href: "/jobs", label: "Jobs" },
  { href: "/manual", label: "Manual Analysis" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--background)" }}>
      {/* Sidebar */}
      <aside
        className="w-56 flex-shrink-0 flex flex-col border-r"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 p-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div
            className="w-7 h-7 rounded flex items-center justify-center text-white text-xs font-bold"
            style={{ background: "var(--revolt-red)" }}
          >
            DR
          </div>
          <span className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>
            DRA Platform
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 flex flex-col gap-1">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-2 rounded-md text-sm font-medium transition-colors"
                style={{
                  color: active ? "white" : "var(--foreground)",
                  background: active ? "var(--revolt-red)" : "transparent",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 rounded-md text-sm font-medium text-left transition-colors"
            style={{ color: "var(--muted-foreground)" }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
