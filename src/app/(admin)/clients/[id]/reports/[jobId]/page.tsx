"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { generatePdf } from "@/lib/generatePdf";
import ReportViewer from "@/components/reports/ReportViewer";
import type { ReportResultResponse } from "@/lib/types";

export default function AdminReportViewerPage() {
  const { id, jobId } = useParams<{ id: string; jobId: string }>();
  const [report, setReport] = useState<ReportResultResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    api.get<ReportResultResponse>(`/admin/jobs/${jobId}/result`)
      .then((r) => {
        setReport(r);
        setNotes(r.specialist_notes || "");
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [jobId]);

  async function saveNotes(v: string) {
    setNotes(v);
    setSaving(true);
    try {
      await api.put(`/admin/jobs/${jobId}/notes`, { specialist_notes: v });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function downloadPdf() {
    if (!report) return;
    await generatePdf(report.result_json as Parameters<typeof generatePdf>[0], notes);
  }

  async function createShareLink() {
    setSharing(true);
    try {
      const res = await api.post<{ token: string; expires_at: string }>(`/admin/jobs/${jobId}/share`, {});
      const url = `${window.location.origin}/share/${res.token}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url).catch(() => {});
    } catch (e) {
      console.error(e);
    } finally {
      setSharing(false);
    }
  }

  if (loading) return <p style={{ color: "var(--muted-foreground)" }}>Loading report…</p>;
  if (!report) return <p style={{ color: "var(--muted-foreground)" }}>Report not found.</p>;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Link href={`/clients/${id}`} className="text-sm" style={{ color: "var(--muted-foreground)" }}>← Client</Link>
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>
              {report.job?.period_type} Report
            </h1>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {report.job?.date_from} → {report.job?.date_to}
              {saving && <span className="ml-2">Saving…</span>}
            </p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Link
            href={`/clients/${id}/compare?a=${jobId}`}
            className="btn-secondary text-sm"
          >
            Compare
          </Link>
          <button onClick={createShareLink} disabled={sharing} className="btn-secondary text-sm">
            {sharing ? "Creating link…" : "Share"}
          </button>
        </div>
      </div>

      {shareUrl && (
        <div className="rounded-md p-3 mb-4 text-sm flex items-center gap-3" style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }}>
          <span className="flex-1 font-mono text-xs break-all">{shareUrl}</span>
          <button
            onClick={() => navigator.clipboard.writeText(shareUrl)}
            className="text-xs px-2 py-1 rounded"
            style={{ background: "#dcfce7", color: "#166534", border: "none", cursor: "pointer" }}
          >
            Copy
          </button>
          <span className="text-xs">Link copied! Valid 7 days.</span>
        </div>
      )}

      <ReportViewer
        result={report.result_json}
        notes={notes}
        onNotesChange={saveNotes}
        onDownloadPdf={downloadPdf}
        reportId={jobId}
      />
    </div>
  );
}
