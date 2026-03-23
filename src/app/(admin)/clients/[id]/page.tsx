"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import ClientScorecard from "@/components/reports/ClientScorecard";
import type { ClientResponse, ReportJobResponse } from "@/lib/types";

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<ClientResponse | null>(null);
  const [jobs, setJobs] = useState<ReportJobResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [impersonateLoading, setImpersonateLoading] = useState(false);
  const [periodType, setPeriodType] = useState("3month");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<ClientResponse>(`/admin/clients/${id}`),
      api.get<ReportJobResponse[]>(`/admin/jobs?client_id=${id}`),
    ])
      .then(([c, j]) => { setClient(c); setJobs(j); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function triggerReport() {
    setTriggerLoading(true);
    setError(null);
    try {
      const body: Record<string, string> = { period_type: periodType };
      if (periodType === "custom") {
        body.date_from = dateFrom;
        body.date_to = dateTo;
      }
      await api.post(`/admin/jobs/${id}/trigger`, body);
      const updated = await api.get<ReportJobResponse[]>(`/admin/jobs?client_id=${id}`);
      setJobs(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to trigger report");
    } finally {
      setTriggerLoading(false);
    }
  }

  async function toggleActive() {
    if (!client) return;
    setToggleLoading(true);
    setError(null);
    try {
      const updated = await api.put<ClientResponse>(`/admin/clients/${id}`, { is_active: !client.is_active });
      setClient(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update client");
    } finally {
      setToggleLoading(false);
    }
  }

  async function impersonateClient() {
    setImpersonateLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || "Impersonation failed");
      }
      router.push("/reports");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Impersonation failed");
    } finally {
      setImpersonateLoading(false);
    }
  }

  if (loading) return <p style={{ color: "var(--muted-foreground)" }}>Loading…</p>;
  if (!client) return <p style={{ color: "var(--muted-foreground)" }}>Client not found.</p>;

  const canTrigger = periodType !== "custom" || (dateFrom && dateTo);

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/clients" className="text-sm" style={{ color: "var(--muted-foreground)" }}>← Clients</Link>
        <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>{client.name}</h1>
        <span className="text-sm px-2 py-0.5 rounded-full" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
          {client.platform || "manual"}
        </span>
        {!client.is_active && (
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#fee2e2", color: "#991b1b" }}>Inactive</span>
        )}
      </div>

      {error && (
        <div className="rounded-md p-3 mb-4 text-sm" style={{ background: "#fef2f2", color: "#991b1b" }}>{error}</div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Client Info */}
        <div className="card">
          <h2 className="font-semibold mb-3" style={{ color: "var(--foreground)" }}>Details</h2>
          <dl className="flex flex-col gap-2 text-sm">
            {[
              ["VAT Rate", `${client.vat_rate}%`],
              ["GA4 includes VAT", client.ga4_includes_vat ? "Yes" : "No"],
              ["Backend includes VAT", client.backend_includes_vat ? "Yes" : "No"],
              ["Timezone", client.timezone],
              ["Status", client.is_active ? "Active" : "Inactive"],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex justify-between">
                <dt style={{ color: "var(--muted-foreground)" }}>{label}</dt>
                <dd style={{ color: "var(--foreground)" }}>{String(val)}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex gap-2 flex-wrap">
            <Link href={`/clients/${id}/credentials`} className="btn-secondary text-sm">
              Manage Credentials
            </Link>
            <button
              onClick={toggleActive}
              disabled={toggleLoading}
              className="btn-secondary text-sm"
              style={{ color: client.is_active ? "#991b1b" : "#166534" }}
            >
              {toggleLoading ? "…" : client.is_active ? "Disable" : "Enable"}
            </button>
            {client.user_id && (
              <button
                onClick={impersonateClient}
                disabled={impersonateLoading}
                className="btn-secondary text-sm"
                title="Opens client portal view (replaces your admin session temporarily)"
              >
                {impersonateLoading ? "…" : "View as Client"}
              </button>
            )}
          </div>
        </div>

        {/* Trigger Report */}
        <div className="card">
          <h2 className="font-semibold mb-3" style={{ color: "var(--foreground)" }}>Trigger Report</h2>
          <div className="flex gap-2 mb-2">
            <select
              className="input flex-1"
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value)}
            >
              <option value="daily">Daily (yesterday)</option>
              <option value="3month">3 Months</option>
              <option value="6month">6 Months</option>
              <option value="12month">12 Months</option>
              <option value="custom">Custom range…</option>
            </select>
            <button onClick={triggerReport} disabled={triggerLoading || !canTrigger} className="btn-primary">
              {triggerLoading ? "…" : "Run"}
            </button>
          </div>
          {periodType === "custom" && (
            <div className="flex gap-2 mt-2">
              <div className="flex-1">
                <label className="block text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>From</label>
                <input type="date" className="input w-full" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="flex-1">
                <label className="block text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>To</label>
                <input type="date" className="input w-full" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
          )}
          <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
            Requires platform credentials to be configured.
          </p>
        </div>
      </div>

      {/* 3-Month Scorecard */}
      <div className="mt-6">
        <ClientScorecard clientId={id} />
      </div>

      {/* Jobs */}
      <div className="card mt-6">
        <h2 className="font-semibold mb-4" style={{ color: "var(--foreground)" }}>Report History</h2>
        {jobs.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No reports generated yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Period", "Range", "Status", "Created", ""].map((h) => (
                  <th key={h} className="text-left py-2 pr-4 font-medium" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="py-2 pr-4" style={{ color: "var(--foreground)" }}>{job.period_type}</td>
                  <td className="py-2 pr-4" style={{ color: "var(--muted-foreground)" }}>{job.date_from} → {job.date_to}</td>
                  <td className="py-2 pr-4">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{
                      background: job.status === "completed" ? "#dcfce7" : job.status === "failed" ? "#fee2e2" : "var(--muted)",
                      color: job.status === "completed" ? "#166534" : job.status === "failed" ? "#991b1b" : "var(--muted-foreground)",
                    }}>
                      {job.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4" style={{ color: "var(--muted-foreground)" }}>
                    {new Date(job.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-2">
                    {job.status === "completed" && (
                      <Link href={`/clients/${id}/reports/${job.id}`} className="text-sm" style={{ color: "var(--primary)" }}>
                        View →
                      </Link>
                    )}
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
