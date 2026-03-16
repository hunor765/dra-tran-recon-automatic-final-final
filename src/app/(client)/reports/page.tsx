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

export default function ClientReportsPage() {
  const [jobs, setJobs] = useState<ReportJobResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [periodType, setPeriodType] = useState("3month");

  useEffect(() => {
    api.get<ReportJobResponse[]>("/reports")
      .then(setJobs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function generateReport() {
    setGenerating(true);
    try {
      await api.post("/reports/generate", { period_type: periodType });
      const updated = await api.get<ReportJobResponse[]>("/reports");
      setJobs(updated);
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>My Reports</h1>
        <div className="flex gap-2">
          <select className="input" style={{ width: "auto" }} value={periodType} onChange={(e) => setPeriodType(e.target.value)}>
            <option value="daily">Daily</option>
            <option value="3month">3 Months</option>
            <option value="6month">6 Months</option>
            <option value="12month">12 Months</option>
          </select>
          <button onClick={generateReport} disabled={generating} className="btn-primary">
            {generating ? "Generating…" : "Generate Report"}
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Loading…</p>
        ) : jobs.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm mb-2" style={{ color: "var(--muted-foreground)" }}>No reports yet.</p>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Click "Generate Report" to create your first reconciliation report.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Period", "Date Range", "Status", "Created", ""].map((h) => (
                    <th key={h} className="text-left py-2 pr-4 font-medium" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const colors = STATUS_COLORS[job.status] || STATUS_COLORS.pending;
                  return (
                    <tr key={job.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="py-3 pr-4 font-medium" style={{ color: "var(--foreground)" }}>{job.period_type}</td>
                      <td className="py-3 pr-4" style={{ color: "var(--muted-foreground)" }}>
                        {job.date_from} → {job.date_to}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: colors.bg, color: colors.fg }}>
                          {job.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4" style={{ color: "var(--muted-foreground)" }}>
                        {new Date(job.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        {job.status === "completed" && (
                          <Link href={`/reports/${job.id}`} className="text-sm" style={{ color: "var(--revolt-red)" }}>
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
