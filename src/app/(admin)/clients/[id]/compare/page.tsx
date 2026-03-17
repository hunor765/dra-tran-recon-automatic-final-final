"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { ReportJobResponse } from "@/lib/types";

interface CompareResult {
  report_a: ReportSummary;
  report_b: ReportSummary;
  delta: Delta;
}

interface ReportSummary {
  job_id: string;
  match_rate: number;
  ga4_total: number;
  backend_total: number;
  ga4_total_value: number;
  backend_total_value: number;
  recommendations_count: number;
}

interface Delta {
  match_rate: number;
  ga4_total: number;
  backend_total: number;
  ga4_total_value: number;
  backend_total_value: number;
  recommendations_count: number;
}

export default function ComparePage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState<ReportJobResponse[]>([]);
  const [jobA, setJobA] = useState(searchParams.get("a") || "");
  const [jobB, setJobB] = useState("");
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<ReportJobResponse[]>(`/admin/jobs?client_id=${id}`)
      .then((j) => setJobs(j.filter((jj) => jj.status === "completed")))
      .catch(console.error);
  }, [id]);

  async function compare() {
    if (!jobA || !jobB) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await api.get<CompareResult>(`/admin/jobs/compare?a=${jobA}&b=${jobB}`);
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Comparison failed");
    } finally {
      setLoading(false);
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const deltaColor = (n: number) => n > 0 ? "#166534" : n < 0 ? "#991b1b" : "var(--muted-foreground)";
  const deltaSign = (n: number) => n > 0 ? "+" : "";

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/clients/${id}`} className="text-sm" style={{ color: "var(--muted-foreground)" }}>← Client</Link>
        <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>Compare Reports</h1>
      </div>

      <div className="card mb-6">
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--foreground)" }}>Report A (baseline)</label>
            <select className="input w-full" value={jobA} onChange={(e) => setJobA(e.target.value)}>
              <option value="">Select report…</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.period_type} — {j.date_from} → {j.date_to}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--foreground)" }}>Report B (compare to)</label>
            <select className="input w-full" value={jobB} onChange={(e) => setJobB(e.target.value)}>
              <option value="">Select report…</option>
              {jobs.filter((j) => j.id !== jobA).map((j) => (
                <option key={j.id} value={j.id}>{j.period_type} — {j.date_from} → {j.date_to}</option>
              ))}
            </select>
          </div>
          <button
            onClick={compare}
            disabled={loading || !jobA || !jobB}
            className="btn-primary"
          >
            {loading ? "Comparing…" : "Compare"}
          </button>
        </div>
        {error && <p className="text-sm mt-3" style={{ color: "#991b1b" }}>{error}</p>}
      </div>

      {result && (
        <div className="grid grid-cols-3 gap-4">
          {/* Report A */}
          <div className="card">
            <h3 className="font-semibold mb-3 text-sm" style={{ color: "var(--muted-foreground)" }}>
              Report A
              <Link href={`/clients/${id}/reports/${result.report_a.job_id}`} className="ml-2 text-xs" style={{ color: "var(--primary)" }}>View →</Link>
            </h3>
            <MetricList summary={result.report_a} fmt={fmt} />
          </div>

          {/* Delta */}
          <div className="card border-2" style={{ borderColor: "var(--revolt-red)" }}>
            <h3 className="font-semibold mb-3 text-sm" style={{ color: "var(--revolt-red)" }}>Change (B − A)</h3>
            <div className="flex flex-col gap-2 text-sm">
              {[
                ["Match Rate", `${deltaSign(result.delta.match_rate)}${result.delta.match_rate}pp`],
                ["GA4 Transactions", `${deltaSign(result.delta.ga4_total)}${result.delta.ga4_total}`],
                ["Backend Transactions", `${deltaSign(result.delta.backend_total)}${result.delta.backend_total}`],
                ["GA4 Value", `${deltaSign(result.delta.ga4_total_value)}${fmt(result.delta.ga4_total_value)}`],
                ["Backend Value", `${deltaSign(result.delta.backend_total_value)}${fmt(result.delta.backend_total_value)}`],
                ["Recommendations", `${deltaSign(result.delta.recommendations_count)}${result.delta.recommendations_count}`],
              ].map(([label, val]) => (
                <div key={String(label)} className="flex justify-between">
                  <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
                  <span className="font-medium" style={{ color: deltaColor(parseFloat(String(val))) }}>{String(val)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Report B */}
          <div className="card">
            <h3 className="font-semibold mb-3 text-sm" style={{ color: "var(--muted-foreground)" }}>
              Report B
              <Link href={`/clients/${id}/reports/${result.report_b.job_id}`} className="ml-2 text-xs" style={{ color: "var(--primary)" }}>View →</Link>
            </h3>
            <MetricList summary={result.report_b} fmt={fmt} />
          </div>
        </div>
      )}
    </div>
  );
}

function MetricList({ summary, fmt }: { summary: ReportSummary; fmt: (n: number) => string }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      {[
        ["Match Rate", `${summary.match_rate}%`],
        ["GA4 Transactions", summary.ga4_total],
        ["Backend Transactions", summary.backend_total],
        ["GA4 Value", fmt(summary.ga4_total_value)],
        ["Backend Value", fmt(summary.backend_total_value)],
        ["Recommendations", summary.recommendations_count],
      ].map(([label, val]) => (
        <div key={String(label)} className="flex justify-between">
          <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
          <span style={{ color: "var(--foreground)" }}>{String(val)}</span>
        </div>
      ))}
    </div>
  );
}
