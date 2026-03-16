"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* Minimal header */}
      <header
        className="flex items-center justify-between px-6 py-3 border-b"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded flex items-center justify-center text-white text-xs font-bold"
            style={{ background: "var(--revolt-red)" }}
          >
            DR
          </div>
          <Link href="/reports" className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>
            DRA Reports
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/reports" className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            My Reports
          </Link>
          <button
            onClick={handleLogout}
            className="text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
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
