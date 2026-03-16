"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { generatePdf } from "@/lib/generatePdf";
import ReportViewer from "@/components/reports/ReportViewer";
import type { AnalysisResult } from "@/lib/types";

interface UploadResponse {
  success: boolean;
  filename: string;
  rows: number;
  columns: string[];
  sample: Record<string, unknown>[];
  session_id: string;
}

type Step = "upload" | "mapping" | "results";

export default function ManualAnalysisPage() {
  const [step, setStep] = useState<Step>("upload");
  const [ga4File, setGa4File] = useState<File | null>(null);
  const [backendFile, setBackendFile] = useState<File | null>(null);
  const [ga4Columns, setGa4Columns] = useState<string[]>([]);
  const [backendColumns, setBackendColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [specialistNotes, setSpecialistNotes] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [dragActiveGa4, setDragActiveGa4] = useState(false);
  const [dragActiveBackend, setDragActiveBackend] = useState(false);

  const [mapping, setMapping] = useState({
    ga4_transaction_id: "", ga4_value: "", ga4_date: "",
    backend_transaction_id: "", backend_value: "", backend_date: "",
    backend_payment_method: "", backend_shipping_method: "", backend_status: "",
    ga4_browser: "", ga4_device: "", ga4_source_medium: "",
    ga4_includes_vat: true, backend_includes_vat: true, vat_rate: 19,
  });

  const uploadFile = async (file: File, endpoint: string): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    if (sessionId) formData.append("session_id", sessionId);
    return api.upload<UploadResponse>(endpoint, formData);
  };

  const handleDrop = async (e: React.DragEvent, type: "ga4" | "backend") => {
    e.preventDefault();
    e.stopPropagation();
    type === "ga4" ? setDragActiveGa4(false) : setDragActiveBackend(false);
    if (e.dataTransfer.files?.[0]) {
      const file = e.dataTransfer.files[0];
      type === "ga4" ? setGa4File(file) : setBackendFile(file);
      try {
        setLoading(true);
        const result = await uploadFile(file, type === "ga4" ? "/upload/ga4" : "/upload/backend");
        type === "ga4" ? setGa4Columns(result.columns) : setBackendColumns(result.columns);
        if (result.session_id) setSessionId(result.session_id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: "ga4" | "backend") => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      type === "ga4" ? setGa4File(file) : setBackendFile(file);
      try {
        setLoading(true);
        const result = await uploadFile(file, type === "ga4" ? "/upload/ga4" : "/upload/backend");
        type === "ga4" ? setGa4Columns(result.columns) : setBackendColumns(result.columns);
        if (result.session_id) setSessionId(result.session_id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setLoading(false);
      }
    }
  };

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<AnalysisResult>("/analyze", { ...mapping, session_id: sessionId });
      setResults(data);
      setStep("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const resetAnalysis = () => {
    setStep("upload");
    setResults(null);
    setGa4File(null);
    setBackendFile(null);
    setGa4Columns([]);
    setBackendColumns([]);
    setSpecialistNotes("");
    setSessionId("");
    setMapping({
      ga4_transaction_id: "", ga4_value: "", ga4_date: "",
      backend_transaction_id: "", backend_value: "", backend_date: "",
      backend_payment_method: "", backend_shipping_method: "", backend_status: "",
      ga4_browser: "", ga4_device: "", ga4_source_medium: "",
      ga4_includes_vat: true, backend_includes_vat: true, vat_rate: 19,
    });
  };

  const canProceed = ga4File && backendFile && ga4Columns.length > 0 && backendColumns.length > 0;
  const canAnalyze = mapping.ga4_transaction_id && mapping.ga4_value && mapping.backend_transaction_id && mapping.backend_value;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>Manual Analysis</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>Upload CSV/Excel files to run a one-off reconciliation</p>
        </div>
        {/* Step indicators */}
        <div className="flex items-center gap-2 text-sm">
          {(["upload", "mapping", "results"] as Step[]).map((s, idx) => (
            <span key={s} className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${step === s ? "bg-revolt-red text-white" : "bg-muted text-muted-foreground"}`}>
                {idx + 1}
              </span>
              <span className={step === s ? "text-foreground" : "text-muted-foreground"}>
                {s === "upload" ? "Upload" : s === "mapping" ? "Map Columns" : "Results"}
              </span>
              {idx < 2 && <span className="w-6 h-px bg-border" />}
            </span>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-md p-3 mb-6 flex items-center justify-between text-sm" style={{ background: "#fef2f2", color: "#991b1b" }}>
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Step 1: Upload */}
      {step === "upload" && (
        <>
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-2">Know exactly how much revenue your GA4 is missing</h2>
            <p className="text-muted-foreground">Upload your GA4 export and ecommerce backend data to identify tracking gaps.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* GA4 Upload */}
            <div
              className={`drop-zone ${dragActiveGa4 ? "active" : ""}`}
              onDragEnter={(e) => { e.preventDefault(); setDragActiveGa4(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragActiveGa4(false); }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, "ga4")}
              onClick={() => document.getElementById("ga4-input")?.click()}
            >
              <input id="ga4-input" type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => handleFileChange(e, "ga4")} />
              <div className="text-center">
                <div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <p className="font-medium text-foreground mb-1">{ga4File ? ga4File.name : "GA4 Export"}</p>
                {ga4Columns.length > 0 ? (
                  <p className="text-sm text-success">{ga4Columns.length} columns detected</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Drop file or click to browse</p>
                )}
              </div>
            </div>

            {/* Backend Upload */}
            <div
              className={`drop-zone ${dragActiveBackend ? "active" : ""}`}
              onDragEnter={(e) => { e.preventDefault(); setDragActiveBackend(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragActiveBackend(false); }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, "backend")}
              onClick={() => document.getElementById("backend-input")?.click()}
            >
              <input id="backend-input" type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => handleFileChange(e, "backend")} />
              <div className="text-center">
                <div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                </div>
                <p className="font-medium text-foreground mb-1">{backendFile ? backendFile.name : "Backend Export"}</p>
                {backendColumns.length > 0 ? (
                  <p className="text-sm text-success">{backendColumns.length} columns detected</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Drop file or click to browse</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <button onClick={() => setStep("mapping")} disabled={!canProceed || loading} className="btn-primary px-12 py-3">
              {loading ? "Uploading…" : "Continue to Column Mapping"}
            </button>
          </div>
        </>
      )}

      {/* Step 2: Mapping */}
      {step === "mapping" && (
        <>
          <div className="grid md:grid-cols-2 gap-8 mb-8">
            {/* GA4 Columns */}
            <div className="card">
              <h3 className="font-semibold text-foreground mb-4">GA4 Columns</h3>
              <div className="space-y-3">
                {[
                  { key: "ga4_transaction_id", label: "Transaction ID *" },
                  { key: "ga4_value", label: "Transaction Value *" },
                  { key: "ga4_date", label: "Date" },
                  { key: "ga4_browser", label: "Browser" },
                  { key: "ga4_device", label: "Device Category" },
                  { key: "ga4_source_medium", label: "Source / Medium" },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
                    <select
                      className="input"
                      value={(mapping as Record<string, string | boolean | number>)[key] as string}
                      onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                    >
                      <option value="">— Not mapped —</option>
                      {ga4Columns.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Backend Columns */}
            <div className="card">
              <h3 className="font-semibold text-foreground mb-4">Backend Columns</h3>
              <div className="space-y-3">
                {[
                  { key: "backend_transaction_id", label: "Transaction ID *" },
                  { key: "backend_value", label: "Transaction Value *" },
                  { key: "backend_date", label: "Date" },
                  { key: "backend_payment_method", label: "Payment Method" },
                  { key: "backend_shipping_method", label: "Shipping Method" },
                  { key: "backend_status", label: "Order Status" },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
                    <select
                      className="input"
                      value={(mapping as Record<string, string | boolean | number>)[key] as string}
                      onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                    >
                      <option value="">— Not mapped —</option>
                      {backendColumns.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* VAT Settings */}
          <div className="card mb-8">
            <h3 className="font-semibold text-foreground mb-4">VAT Settings</h3>
            <div className="flex flex-wrap gap-6 items-center">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={mapping.ga4_includes_vat} onChange={(e) => setMapping((m) => ({ ...m, ga4_includes_vat: e.target.checked }))} />
                GA4 values include VAT
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={mapping.backend_includes_vat} onChange={(e) => setMapping((m) => ({ ...m, backend_includes_vat: e.target.checked }))} />
                Backend values include VAT
              </label>
              <div className="flex items-center gap-2">
                <label className="text-sm">VAT Rate:</label>
                <input
                  type="number"
                  min={0} max={100} step={0.1}
                  className="input w-20"
                  value={mapping.vat_rate}
                  onChange={(e) => setMapping((m) => ({ ...m, vat_rate: Number(e.target.value) }))}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-4">
            <button onClick={() => setStep("upload")} className="btn-secondary px-8 py-3">Back</button>
            <button onClick={runAnalysis} disabled={!canAnalyze || loading} className="btn-primary px-12 py-3">
              {loading ? "Analyzing…" : "Run Analysis"}
            </button>
          </div>
        </>
      )}

      {/* Step 3: Results */}
      {step === "results" && results && (
        <ReportViewer
          result={results}
          notes={specialistNotes}
          onNotesChange={setSpecialistNotes}
          onDownloadPdf={async () => {
            setLoading(true);
            try {
              await generatePdf(results as any, specialistNotes);
            } catch (err) {
              setError(err instanceof Error ? err.message : "PDF generation failed");
            } finally {
              setLoading(false);
            }
          }}
          onReset={resetAnalysis}
        />
      )}
    </div>
  );
}
