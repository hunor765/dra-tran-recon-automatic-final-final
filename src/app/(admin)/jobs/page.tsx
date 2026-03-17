"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { ReportJobResponse } from "@/lib/types";

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  completed: { bg: "#dcfce7", fg: "#166534" },
  failed: { bg: "#fee2e2", fg: "#991b1b" },
  running: { bg: "#fef9c3", fg: "#854d0e" },
  pending: { bg: "var(--muted)", fg: "var(--muted-foreground)" },
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<ReportJobResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [bulkPeriod, setBulkPeriod] = useState("3month");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [statusFilter]);

  async function load() {
    setLoading(true);
    const qs = statusFilter ? `?status=${statusFilter}` : "";
    api.get<ReportJobResponse[]>(`/admin/jobs${qs}`)
      .then(setJobs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  async function triggerAll() {
    if (!confirm(`Trigger ${bulkPeriod} reports for ALL active clients with credentials?`)) return;
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const res = await api.post<{ jobs_created: number }>("/admin/jobs/trigger-all", { period_type: bulkPeriod });
      setBulkResult(`${res.jobs_created} jobs created`);
      await load();
    } catch (e: unknown) {
      setBulkResult(e instanceof Error ? e.message : "Failed");
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>All Jobs</h1>
        <div className="flex items-center gap-2">
          <select
            className="input"
            style={{ width: "auto" }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Bulk trigger */}
      <div className="card mb-6 flex items-center gap-3">
        <p className="text-sm font-medium flex-1" style={{ color: "var(--foreground)" }}>Run all active clients:</p>
        <select className="input" style={{ width: "auto" }} value={bulkPeriod} onChange={(e) => setBulkPeriod(e.target.value)}>
          <option value="daily">Daily</option>
          <option value="3month">3 Months</option>
          <option value="6month">6 Months</option>
          <option value="12month">12 Months</option>
        </select>
        <button onClick={triggerAll} disabled={bulkLoading} className="btn-primary">
          {bulkLoading ? "Triggering…" : "Run All Clients"}
        </button>
        {bulkResult && (
          <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>{bulkResult}</span>
        )}
      </div>

      <div className="card">
        {loading ? (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Loading…</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No jobs found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Client", "Period", "Date Range", "Source", "Status", "Created", "Error", ""].map((h) => (
                    <th key={h} className="text-left py-2 pr-4 font-medium" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const colors = STATUS_COLORS[job.status] || STATUS_COLORS.pending;
                  return (
                    <tr key={job.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="py-2 pr-4">
                        <Link href={`/clients/${job.client_id}`} style={{ color: "var(--revolt-red)" }}>
                          {job.client_name || job.client_id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="py-2 pr-4" style={{ color: "var(--foreground)" }}>{job.period_type}</td>
                      <td className="py-2 pr-4" style={{ color: "var(--muted-foreground)" }}>
                        {job.date_from} → {job.date_to}
                      </td>
                      <td className="py-2 pr-4" style={{ color: "var(--muted-foreground)" }}>{job.source_type}</td>
                      <td className="py-2 pr-4">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: colors.bg, color: colors.fg }}>
                          {job.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4" style={{ color: "var(--muted-foreground)" }}>
                        {new Date(job.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-2 max-w-xs truncate" style={{ color: "#991b1b" }}>
                        {job.error_message || ""}
                      </td>
                      <td className="py-2">
                        {job.status === "completed" && (
                          <Link href={`/clients/${job.client_id}/reports/${job.id}`} className="text-sm" style={{ color: "var(--primary)" }}>
                            View →
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
