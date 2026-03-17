"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { AnalysisResult } from "@/lib/types";
import dynamic from "next/dynamic";

const ReportViewer = dynamic(() => import("@/components/reports/ReportViewer"), { ssr: false });

interface SharedReport {
  result_json: AnalysisResult;
  match_rate: number | null;
  created_at: string;
}

export default function SharedReportPage() {
  const { token } = useParams<{ token: string }>();
  const [report, setReport] = useState<SharedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    import("@/lib/api").then(({ api }) => {
      api.get<SharedReport>(`/share/${token}`)
        .then(setReport)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Link not found or expired"))
        .finally(() => setLoading(false));
    });
  }, [token]);

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <header className="flex items-center gap-3 px-6 py-4 border-b" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="w-7 h-7 rounded flex items-center justify-center text-white text-xs font-bold" style={{ background: "var(--revolt-red)" }}>
          DR
        </div>
        <span className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>DRA Platform</span>
        <span className="text-xs px-2 py-0.5 rounded-full ml-2" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
          Shared Report (read-only)
        </span>
      </header>
      <main className="max-w-5xl mx-auto p-6">
        {loading && <p style={{ color: "var(--muted-foreground)" }}>Loading report…</p>}
        {error && (
          <div className="card text-center py-12">
            <p className="text-lg font-semibold mb-2" style={{ color: "var(--foreground)" }}>Link unavailable</p>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>{error}</p>
          </div>
        )}
        {report && <ReportViewer result={report.result_json} />}
      </main>
    </div>
  );
}
