"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { generatePdf } from "@/lib/generatePdf";
import ReportViewer from "@/components/reports/ReportViewer";
import type { ReportResultResponse } from "@/lib/types";

export default function ClientReportPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<ReportResultResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    api.get<ReportResultResponse>(`/reports/${id}`)
      .then((r) => {
        setReport(r);
        setNotes(r.specialist_notes || "");
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  async function saveNotes(v: string) {
    setNotes(v);
    setSaving(true);
    try {
      await api.put(`/reports/${id}/notes`, { specialist_notes: v });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function downloadPdf() {
    if (!report) return;
    await generatePdf(report.result_json as any, notes);
  }

  if (loading) return <p style={{ color: "var(--muted-foreground)" }}>Loading report…</p>;
  if (!report) return <p style={{ color: "var(--muted-foreground)" }}>Report not found.</p>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/reports" className="text-sm" style={{ color: "var(--muted-foreground)" }}>← Reports</Link>
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

      <ReportViewer
        result={report.result_json}
        notes={notes}
        onNotesChange={saveNotes}
        onDownloadPdf={downloadPdf}
        reportId={id}
      />
    </div>
  );
}
