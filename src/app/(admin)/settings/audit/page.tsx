"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface AuditEntry {
  id: string;
  actor_email: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: string | null;
  created_at: string;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");

  useEffect(() => {
    const qs = actionFilter ? `?action=${encodeURIComponent(actionFilter)}` : "";
    setLoading(true);
    api.get<AuditEntry[]>(`/admin/audit${qs}`)
      .then(setLogs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [actionFilter]);

  const uniqueActions = [...new Set(logs.map((l) => l.action))].sort();

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>Audit Log</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>All significant admin actions</p>
        </div>
        <select
          className="input"
          style={{ width: "auto" }}
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        >
          <option value="">All actions</option>
          {uniqueActions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      <div className="card">
        {loading ? (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Loading…</p>
        ) : logs.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No audit entries yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Time", "Actor", "Action", "Target", "Detail"].map((h) => (
                  <th key={h} className="text-left py-2 pr-4 font-medium" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="py-2 pr-4 whitespace-nowrap" style={{ color: "var(--muted-foreground)" }}>
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4" style={{ color: "var(--foreground)" }}>{log.actor_email}</td>
                  <td className="py-2 pr-4">
                    <span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ background: "var(--muted)", color: "var(--foreground)" }}>
                      {log.action}
                    </span>
                  </td>
                  <td className="py-2 pr-4" style={{ color: "var(--muted-foreground)" }}>
                    {log.target_type && `${log.target_type}${log.target_id ? ` #${log.target_id.slice(0, 8)}` : ""}`}
                  </td>
                  <td className="py-2 max-w-xs truncate" style={{ color: "var(--muted-foreground)" }}>
                    {log.detail || ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
