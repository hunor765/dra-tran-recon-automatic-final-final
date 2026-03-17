"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { ReportJobResponse, ClientResponse } from "@/lib/types";

type DailyJob = { date: string; completed: number; failed: number; total: number };
type MatchRatePoint = { date: string; avg_match_rate: number };

export default function DashboardPage() {
  const [recentJobs, setRecentJobs] = useState<ReportJobResponse[]>([]);
  const [clients, setClients] = useState<ClientResponse[]>([]);
  const [jobsPerDay, setJobsPerDay] = useState<DailyJob[]>([]);
  const [matchRateTrend, setMatchRateTrend] = useState<MatchRatePoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<ReportJobResponse[]>("/admin/jobs?limit=10"),
      api.get<ClientResponse[]>("/admin/clients"),
      api.get<{ jobs_per_day: DailyJob[]; match_rate_trend: MatchRatePoint[] }>("/admin/jobs/dashboard-stats"),
    ])
      .then(([jobs, cls, stats]) => {
        setRecentJobs(jobs);
        setClients(cls);
        setJobsPerDay(stats.jobs_per_day);
        setMatchRateTrend(stats.match_rate_trend);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const activeClients = clients.filter((c) => c.is_active).length;
  const completedJobs = recentJobs.filter((j) => j.status === "completed").length;
  const failedJobs = recentJobs.filter((j) => j.status === "failed").length;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--foreground)" }}>Dashboard</h1>

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

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="card">
          <h2 className="font-semibold mb-4" style={{ color: "var(--foreground)" }}>Match Rate Trend (30d)</h2>
          {loading || matchRateTrend.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {loading ? "Loading…" : "No data yet"}
            </p>
          ) : (
            <LineChart data={matchRateTrend} valueKey="avg_match_rate" color="var(--revolt-red)" unit="%" />
          )}
        </div>
        <div className="card">
          <h2 className="font-semibold mb-4" style={{ color: "var(--foreground)" }}>Jobs Per Day (30d)</h2>
          {loading || jobsPerDay.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {loading ? "Loading…" : "No data yet"}
            </p>
          ) : (
            <BarChart data={jobsPerDay} />
          )}
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
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{
        background: status === "completed" ? "#dcfce7" : status === "failed" ? "#fee2e2" : status === "running" ? "#fef9c3" : "var(--muted)",
        color: status === "completed" ? "#166534" : status === "failed" ? "#991b1b" : status === "running" ? "#854d0e" : "var(--muted-foreground)",
      }}>
      {status}
    </span>
  );
}

// Minimal SVG line chart
function LineChart({ data, valueKey, color, unit }: {
  data: Record<string, string | number>[];
  valueKey: string;
  color: string;
  unit: string;
}) {
  const W = 300; const H = 80; const PAD = 8;
  const values = data.map((d) => Number(d[valueKey]));
  const min = Math.min(...values);
  const max = Math.max(...values) || 100;
  const range = max - min || 1;

  const pts = data.map((_, i) => {
    const x = PAD + (i / Math.max(data.length - 1, 1)) * (W - PAD * 2);
    const y = H - PAD - ((values[i] - min) / range) * (H - PAD * 2);
    return `${x},${y}`;
  });

  const last = values[values.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 80 }}>
        <polyline
          points={pts.join(" ")}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {pts.length > 0 && (
          <circle cx={pts[pts.length - 1].split(",")[0]} cy={pts[pts.length - 1].split(",")[1]} r="3" fill={color} />
        )}
      </svg>
      <div className="flex justify-between text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
        <span>{data[0].date}</span>
        <span className="font-medium" style={{ color }}>{last}{unit}</span>
        <span>{data[data.length - 1].date}</span>
      </div>
    </div>
  );
}

// Minimal SVG bar chart (completed vs failed)
function BarChart({ data }: { data: DailyJob[] }) {
  const W = 300; const H = 80; const PAD = 8;
  const maxTotal = Math.max(...data.map((d) => d.total), 1);
  const barW = Math.max(2, (W - PAD * 2) / data.length - 2);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 80 }}>
        {data.map((d, i) => {
          const x = PAD + i * ((W - PAD * 2) / data.length);
          const totalH = ((d.total / maxTotal) * (H - PAD * 2));
          const failedH = ((d.failed / maxTotal) * (H - PAD * 2));
          return (
            <g key={d.date}>
              <rect x={x} y={H - PAD - totalH} width={barW} height={totalH} fill="#dcfce7" />
              <rect x={x} y={H - PAD - failedH} width={barW} height={failedH} fill="#fee2e2" />
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
        <span>{data[0]?.date}</span>
        <span>
          <span style={{ color: "#166534" }}>■</span> completed &nbsp;
          <span style={{ color: "#991b1b" }}>■</span> failed
        </span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}
