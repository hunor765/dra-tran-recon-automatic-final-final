"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Login failed");
        return;
      }

      const role = data.user?.role;
      router.push(role === "admin" ? "/dashboard" : "/reports");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card w-full max-w-sm mx-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div
          className="w-9 h-9 rounded-sm flex items-center justify-center text-white font-bold text-sm"
          style={{ background: "var(--revolt-red)" }}
        >
          DR
        </div>
        <div>
          <p className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>
            Data Revolt Agency
          </p>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Transaction Reconciliation Platform
          </p>
        </div>
      </div>

      <h1 className="text-xl font-bold mb-1" style={{ color: "var(--foreground)" }}>
        Sign in
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--muted-foreground)" }}>
        Enter your credentials to access your account
      </p>

      {error && (
        <div
          className="rounded-md p-3 mb-4 text-sm"
          style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--foreground)" }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
            style={{
              border: "1px solid var(--border)",
              background: "var(--background)",
              color: "var(--foreground)",
            }}
            placeholder="you@company.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--foreground)" }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
            style={{
              border: "1px solid var(--border)",
              background: "var(--background)",
              color: "var(--foreground)",
            }}
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full mt-2"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="text-xs text-center mt-6" style={{ color: "var(--muted-foreground)" }}>
        © {new Date().getFullYear()} Data Revolt Agency
      </p>
    </div>
  );
}
