"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { ReportJobResponse, ClientResponse } from "@/lib/types";

export default function DashboardPage() {
  const [recentJobs, setRecentJobs] = useState<ReportJobResponse[]>([]);
  const [clients, setClients] = useState<ClientResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<ReportJobResponse[]>("/admin/jobs?limit=10"),
      api.get<ClientResponse[]>("/admin/clients"),
    ])
      .then(([jobs, cls]) => {
        setRecentJobs(jobs);
        setClients(cls);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const activeClients = clients.filter((c) => c.is_active).length;
  const completedJobs = recentJobs.filter((j) => j.status === "completed").length;
  const failedJobs = recentJobs.filter((j) => j.status === "failed").length;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--foreground)" }}>
        Dashboard
      </h1>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card">
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Active Clients</p>
          <p className="text-3xl font-bold mt-1" style={{ color: "var(--foreground)" }}>
            {loading ? "—" : activeClients}
          </p>
        </div>
        <div className="card">
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Completed Jobs (recent)</p>
          <p className="text-3xl font-bold mt-1" style={{ color: "var(--success)" }}>
            {loading ? "—" : completedJobs}
          </p>
        </div>
        <div className="card">
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Failed Jobs (recent)</p>
          <p className="text-3xl font-bold mt-1" style={{ color: "var(--destructive)" }}>
            {loading ? "—" : failedJobs}
          </p>
        </div>
      </div>

      {/* Recent jobs */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold" style={{ color: "var(--foreground)" }}>Recent Jobs</h2>
          <Link href="/jobs" className="text-sm" style={{ color: "var(--revolt-red)" }}>
            View all →
          </Link>
        </div>
        {loading ? (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Loading…</p>
        ) : recentJobs.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No jobs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="text-left py-2 pr-4 font-medium" style={{ color: "var(--muted-foreground)" }}>Client</th>
                  <th className="text-left py-2 pr-4 font-medium" style={{ color: "var(--muted-foreground)" }}>Period</th>
                  <th className="text-left py-2 pr-4 font-medium" style={{ color: "var(--muted-foreground)" }}>Status</th>
                  <th className="text-left py-2 pr-4 font-medium" style={{ color: "var(--muted-foreground)" }}>Created</th>
                  <th className="text-left py-2 font-medium" style={{ color: "var(--muted-foreground)" }}></th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map((job) => (
                  <tr key={job.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="py-2 pr-4" style={{ color: "var(--foreground)" }}>{job.client_name || job.client_id.slice(0, 8)}</td>
                    <td className="py-2 pr-4" style={{ color: "var(--foreground)" }}>{job.period_type}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="py-2 pr-4" style={{ color: "var(--muted-foreground)" }}>
                      {new Date(job.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2">
                      {job.status === "completed" && (
                        <Link href={`/clients/${job.client_id}/reports/${job.id}`} className="text-sm" style={{ color: "var(--primary)" }}>
                          View →
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "badge-success",
    failed: "badge-error",
    running: "badge-warning",
    pending: "",
  };
  return (
    <span className={`badge-${status === "completed" ? "success" : status === "failed" ? "error" : "warning"} text-xs px-2 py-0.5 rounded-full`}
      style={status === "pending" ? { color: "var(--muted-foreground)", background: "var(--muted)" } : undefined}>
      {status}
    </span>
  );
}
