"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clients", label: "Clients" },
  { href: "/jobs", label: "Jobs" },
  { href: "/manual", label: "Manual Analysis" },
];

const settingsItems = [
  { href: "/settings/users", label: "Users" },
  { href: "/settings/totp", label: "2FA Setup" },
  { href: "/settings/audit", label: "Audit Log" },
];

interface Notification {
  id: string;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadNotifs();
    const interval = setInterval(loadNotifs, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function loadNotifs() {
    api.get<Notification[]>("/admin/notifications").then(setNotifs).catch(() => {});
  }

  async function markRead(id: string, link: string | null) {
    await api.put(`/admin/notifications/${id}/read`, {}).catch(() => {});
    setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    if (link) { setBellOpen(false); router.push(link); }
  }

  async function markAllRead() {
    await api.put("/admin/notifications/read-all", {}).catch(() => {});
    setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const unread = notifs.filter((n) => !n.is_read).length;

  return (
    <div className="min-h-screen flex" style={{ background: "var(--background)" }}>
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col border-r" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2 p-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="w-7 h-7 rounded flex items-center justify-center text-white text-xs font-bold" style={{ background: "var(--revolt-red)" }}>
            DR
          </div>
          <span className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>DRA Platform</span>
        </div>

        <nav className="flex-1 p-3 flex flex-col gap-1">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href} className="px-3 py-2 rounded-md text-sm font-medium transition-colors"
                style={{ color: active ? "white" : "var(--foreground)", background: active ? "var(--revolt-red)" : "transparent" }}>
                {item.label}
              </Link>
            );
          })}

          <div className="mt-4 mb-1 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
            Settings
          </div>
          {settingsItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href} className="px-3 py-2 rounded-md text-sm font-medium transition-colors"
                style={{ color: active ? "white" : "var(--foreground)", background: active ? "var(--revolt-red)" : "transparent" }}>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t" style={{ borderColor: "var(--border)" }}>
          <button onClick={handleLogout} className="w-full px-3 py-2 rounded-md text-sm font-medium text-left"
            style={{ color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer" }}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto flex flex-col">
        {/* Top bar */}
        <div className="flex justify-end items-center px-8 py-2 border-b" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="relative" ref={bellRef}>
            <button onClick={() => setBellOpen((o) => !o)} className="relative p-2 rounded-md"
              style={{ color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 text-xs rounded-full flex items-center justify-center text-white font-bold"
                  style={{ background: "var(--revolt-red)", fontSize: "10px" }}>
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>

            {bellOpen && (
              <div className="absolute right-0 top-10 w-80 rounded-lg shadow-lg z-50 border overflow-hidden"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                  <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Notifications</span>
                  {unread > 0 && (
                    <button onClick={markAllRead} className="text-xs" style={{ color: "var(--revolt-red)", background: "none", border: "none", cursor: "pointer" }}>
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifs.length === 0 ? (
                    <p className="text-sm text-center py-6" style={{ color: "var(--muted-foreground)" }}>No notifications</p>
                  ) : notifs.map((n) => (
                    <button key={n.id} onClick={() => markRead(n.id, n.link)}
                      className="w-full text-left px-4 py-3 transition-colors"
                      style={{ background: n.is_read ? "transparent" : "var(--muted)", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
                      <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{n.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{n.body}</p>
                      <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>{new Date(n.created_at).toLocaleString()}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="max-w-6xl mx-auto p-8 w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
