"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";

interface Notification {
  id: string;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
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
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
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

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const unread = notifs.filter((n) => !n.is_read).length;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <header className="flex items-center justify-between px-6 py-3 border-b" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded flex items-center justify-center text-white text-xs font-bold" style={{ background: "var(--revolt-red)" }}>
            DR
          </div>
          <Link href="/reports" className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>
            DRA Reports
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/reports" className="text-sm" style={{ color: "var(--muted-foreground)" }}>My Reports</Link>

          {/* Notification bell */}
          <div className="relative" ref={bellRef}>
            <button onClick={() => setBellOpen((o) => !o)} className="relative p-1"
              style={{ color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 text-xs rounded-full flex items-center justify-center text-white"
                  style={{ background: "var(--revolt-red)", fontSize: "9px" }}>
                  {unread}
                </span>
              )}
            </button>

            {bellOpen && (
              <div className="absolute right-0 top-8 w-72 rounded-lg shadow-lg z-50 border overflow-hidden"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="px-4 py-3 border-b text-sm font-semibold" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                  Notifications
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {notifs.length === 0 ? (
                    <p className="text-sm text-center py-5" style={{ color: "var(--muted-foreground)" }}>No notifications</p>
                  ) : notifs.map((n) => (
                    <button key={n.id} onClick={() => markRead(n.id, n.link)}
                      className="w-full text-left px-4 py-3"
                      style={{ background: n.is_read ? "transparent" : "var(--muted)", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
                      <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{n.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{n.body}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button onClick={handleLogout} className="text-sm" style={{ color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer" }}>
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        {children}
      </main>
    </div>
  );
}
