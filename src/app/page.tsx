"use client";

import { useState } from "react";

const API_URL = "/api.php";

interface UploadResponse {
  success: boolean;
  filename: string;
  rows: number;
  columns: string[];
  sample: Record<string, unknown>[];
}

interface AnalysisResult {
  summary: {
    ga4_total: number;
    backend_total: number;
    common: number;
    backend_only: number;
    ga4_only: number;
    match_rate: number;
    ga4_total_value: number;
    backend_total_value: number;
  };
  payment_analysis: Array<{
    method: string;
    total: number;
    in_ga4: number;
    missing: number;
    rate: number;
    value_total: number;
    value_missing: number;
  }>;
  shipping_analysis: Array<{
    method: string;
    total: number;
    in_ga4: number;
    rate: number;
  }>;
  status_analysis: Array<{
    status: string;
    total: number;
    in_ga4: number;
    rate: number;
  }>;
  tech_analysis: {
    browser: Array<{ name: string; count: number; percentage: number }>;
    device: Array<{ name: string; count: number; percentage: number }>;
  };
  temporal_analysis: Array<{
    date: string;
    backend_total: number;
    matched: number;
    match_rate: number;
  }>;
  value_comparison: {
    matched_backend_value: number;
    matched_ga4_value: number;
    value_difference: number;
    exact_matches: number;
    exact_match_rate: number;
  };
  recommendations: Array<{
    priority: string;
    title: string;
    description: string;
    impact: number;
  }>;
}

type Step = "upload" | "mapping" | "results";

export default function Home() {
  const [step, setStep] = useState<Step>("upload");
  const [ga4File, setGa4File] = useState<File | null>(null);
  const [backendFile, setBackendFile] = useState<File | null>(null);
  const [ga4Columns, setGa4Columns] = useState<string[]>([]);
  const [backendColumns, setBackendColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [specialistNotes, setSpecialistNotes] = useState("");
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  // Column mapping state
  const [mapping, setMapping] = useState({
    ga4_transaction_id: "",
    ga4_value: "",
    ga4_date: "",
    backend_transaction_id: "",
    backend_value: "",
    backend_date: "",
    backend_payment_method: "",
    backend_shipping_method: "",
    backend_status: "",
    ga4_browser: "",
    ga4_device: "",
  });

  const [dragActiveGa4, setDragActiveGa4] = useState(false);
  const [dragActiveBackend, setDragActiveBackend] = useState(false);

  const handleDrag = (e: React.DragEvent, setActive: (active: boolean) => void, active: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setActive(active);
  };

  const uploadFile = async (file: File, endpoint: string): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Upload failed");
    }
    return response.json();
  };

  const handleDrop = async (e: React.DragEvent, type: "ga4" | "backend") => {
    e.preventDefault();
    e.stopPropagation();
    type === "ga4" ? setDragActiveGa4(false) : setDragActiveBackend(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      type === "ga4" ? setGa4File(file) : setBackendFile(file);

      try {
        const result = await uploadFile(file, type === "ga4" ? "/upload/ga4" : "/upload/backend");
        type === "ga4" ? setGa4Columns(result.columns) : setBackendColumns(result.columns);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: "ga4" | "backend") => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      type === "ga4" ? setGa4File(file) : setBackendFile(file);

      try {
        setLoading(true);
        const result = await uploadFile(file, type === "ga4" ? "/upload/ga4" : "/upload/backend");
        type === "ga4" ? setGa4Columns(result.columns) : setBackendColumns(result.columns);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setLoading(false);
      }
    }
  };

  const canProceedToMapping = ga4File && backendFile && ga4Columns.length > 0 && backendColumns.length > 0;

  const canAnalyze = mapping.ga4_transaction_id && mapping.ga4_value &&
    mapping.backend_transaction_id && mapping.backend_value;

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mapping),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Analysis failed");
      }

      const data = await response.json();
      setResults(data);
      setStep("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("en-US").format(num);
  };

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical": return "bg-destructive/15 text-destructive border-destructive/30";
      case "high": return "bg-warning/15 text-warning border-warning/30";
      default: return "bg-info/15 text-info border-info/30";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border sticky top-0 bg-background z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-revolt-red flex items-center justify-center">
              <span className="text-white font-bold text-sm">DRA</span>
            </div>
            <div>
              <h1 className="font-semibold text-foreground">Transaction Reconciliation</h1>
              <p className="text-xs text-muted-foreground">Manual Analysis</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${step === "upload" ? "bg-revolt-red text-white" : "bg-muted text-muted-foreground"}`}>1</span>
              <span className={step === "upload" ? "text-foreground" : "text-muted-foreground"}>Upload</span>
            </div>
            <div className="w-8 h-px bg-border" />
            <div className="flex items-center gap-2 text-sm">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${step === "mapping" ? "bg-revolt-red text-white" : "bg-muted text-muted-foreground"}`}>2</span>
              <span className={step === "mapping" ? "text-foreground" : "text-muted-foreground"}>Map Columns</span>
            </div>
            <div className="w-8 h-px bg-border" />
            <div className="flex items-center gap-2 text-sm">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${step === "results" ? "bg-revolt-red text-white" : "bg-muted text-muted-foreground"}`}>3</span>
              <span className={step === "results" ? "text-foreground" : "text-muted-foreground"}>Results</span>
            </div>
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="bg-destructive/15 border-b border-destructive/30 px-6 py-3">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <p className="text-destructive text-sm">{error}</p>
            <button onClick={() => setError(null)} className="text-destructive hover:underline text-sm">Dismiss</button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Step 1: Upload */}
        {step === "upload" && (
          <>
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-foreground mb-4">
                Know exactly how much revenue your GA4 is missing
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Upload your GA4 export and ecommerce backend data to identify tracking gaps.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {/* GA4 Upload */}
              <div className="card">
                <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  GA4 Export
                  {ga4File && <span className="badge-success ml-auto">Uploaded</span>}
                </h3>

                <div
                  className={`drop-zone ${dragActiveGa4 ? "active" : ""} ${ga4File ? "border-success" : ""}`}
                  onDragEnter={(e) => handleDrag(e, setDragActiveGa4, true)}
                  onDragLeave={(e) => handleDrag(e, setDragActiveGa4, false)}
                  onDragOver={(e) => handleDrag(e, setDragActiveGa4, true)}
                  onDrop={(e) => handleDrop(e, "ga4")}
                  onClick={() => document.getElementById("ga4-input")?.click()}
                >
                  <input
                    id="ga4-input"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => handleFileChange(e, "ga4")}
                  />

                  {ga4File ? (
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-12 h-12 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="font-medium text-foreground">{ga4File.name}</p>
                      <p className="text-sm text-muted-foreground">{ga4Columns.length} columns detected</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-12 h-12 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="font-medium text-foreground">Drop GA4 export here</p>
                      <p className="text-sm text-muted-foreground">CSV or Excel</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Backend Upload */}
              <div className="card">
                <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-revolt-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                  </svg>
                  Backend Export
                  {backendFile && <span className="badge-success ml-auto">Uploaded</span>}
                </h3>

                <div
                  className={`drop-zone ${dragActiveBackend ? "active" : ""} ${backendFile ? "border-success" : ""}`}
                  onDragEnter={(e) => handleDrag(e, setDragActiveBackend, true)}
                  onDragLeave={(e) => handleDrag(e, setDragActiveBackend, false)}
                  onDragOver={(e) => handleDrag(e, setDragActiveBackend, true)}
                  onDrop={(e) => handleDrop(e, "backend")}
                  onClick={() => document.getElementById("backend-input")?.click()}
                >
                  <input
                    id="backend-input"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => handleFileChange(e, "backend")}
                  />

                  {backendFile ? (
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-12 h-12 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="font-medium text-foreground">{backendFile.name}</p>
                      <p className="text-sm text-muted-foreground">{backendColumns.length} columns detected</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-12 h-12 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="font-medium text-foreground">Drop backend export here</p>
                      <p className="text-sm text-muted-foreground">CSV or Excel</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="text-center">
              <button
                disabled={!canProceedToMapping || loading}
                onClick={() => setStep("mapping")}
                className={`btn-primary text-lg px-8 py-3 ${!canProceedToMapping ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {loading ? "Uploading..." : canProceedToMapping ? "Continue to Column Mapping" : "Upload both files to continue"}
              </button>
            </div>
          </>
        )}

        {/* Step 2: Column Mapping */}
        {step === "mapping" && (
          <>
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-foreground mb-4">Map Your Columns</h2>
              <p className="text-muted-foreground">Select which columns contain the transaction data.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-8">
              {/* GA4 Mapping */}
              <div className="card">
                <h3 className="font-semibold text-foreground mb-6">GA4 Export Columns</h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Transaction ID *</label>
                    <select
                      value={mapping.ga4_transaction_id}
                      onChange={(e) => setMapping({ ...mapping, ga4_transaction_id: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground"
                    >
                      <option value="">Select column...</option>
                      {ga4Columns.map((col) => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Revenue/Value *</label>
                    <select
                      value={mapping.ga4_value}
                      onChange={(e) => setMapping({ ...mapping, ga4_value: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground"
                    >
                      <option value="">Select column...</option>
                      {ga4Columns.map((col) => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Date (Optional)</label>
                    <select
                      value={mapping.ga4_date || ""}
                      onChange={(e) => setMapping({ ...mapping, ga4_date: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground"
                    >
                      <option value="">Select column...</option>
                      {ga4Columns.map((col) => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Browser (Optional)</label>
                    <select
                      value={mapping.ga4_browser || ""}
                      onChange={(e) => setMapping({ ...mapping, ga4_browser: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground"
                    >
                      <option value="">Select column...</option>
                      {ga4Columns.map((col) => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Device Category (Optional)</label>
                    <select
                      value={mapping.ga4_device || ""}
                      onChange={(e) => setMapping({ ...mapping, ga4_device: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground"
                    >
                      <option value="">Select column...</option>
                      {ga4Columns.map((col) => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Backend Mapping */}
              <div className="card">
                <h3 className="font-semibold text-foreground mb-6">Backend Export Columns</h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Transaction ID *</label>
                    <select
                      value={mapping.backend_transaction_id}
                      onChange={(e) => setMapping({ ...mapping, backend_transaction_id: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground"
                    >
                      <option value="">Select column...</option>
                      {backendColumns.map((col) => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Order Value *</label>
                    <select
                      value={mapping.backend_value}
                      onChange={(e) => setMapping({ ...mapping, backend_value: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground"
                    >
                      <option value="">Select column...</option>
                      {backendColumns.map((col) => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Order Date (Optional - for trend chart)</label>
                    <select
                      value={mapping.backend_date || ""}
                      onChange={(e) => setMapping({ ...mapping, backend_date: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground"
                    >
                      <option value="">Select column...</option>
                      {backendColumns.map((col) => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Payment Method (optional)</label>
                    <select
                      value={mapping.backend_payment_method}
                      onChange={(e) => setMapping({ ...mapping, backend_payment_method: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground"
                    >
                      <option value="">Select column...</option>
                      {backendColumns.map((col) => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Shipping Method (Optional)</label>
                    <select
                      value={mapping.backend_shipping_method}
                      onChange={(e) => setMapping({ ...mapping, backend_shipping_method: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground"
                    >
                      <option value="">Select column...</option>
                      {backendColumns.map((col) => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Order Status (Optional)</label>
                    <select
                      value={mapping.backend_status || ""}
                      onChange={(e) => setMapping({ ...mapping, backend_status: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground"
                    >
                      <option value="">Select column...</option>
                      {backendColumns.map((col) => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center gap-4">
              <button onClick={() => setStep("upload")} className="btn-secondary px-8 py-3">
                Back
              </button>
              <button
                disabled={!canAnalyze || loading}
                onClick={runAnalysis}
                className={`btn-primary text-lg px-8 py-3 ${!canAnalyze ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {loading ? "Analyzing..." : "Run Analysis"}
              </button>
            </div>
          </>
        )}

        {/* Step 3: Results */}
        {step === "results" && results && (
          <>
            {/* Hero Gradient Banner */}
            <div className="bg-gradient-to-br from-revolt-red to-[#b52828] rounded-xl p-8 text-white mb-8 shadow-lg shadow-revolt-red/20">
              <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                <div>
                  <h2 className="text-3xl font-bold mb-2">Analysis Complete</h2>
                  <p className="text-white/80">
                    We found <span className="font-bold text-white">{formatCurrency(results.summary.backend_total_value - results.summary.ga4_total_value)}</span> in untracked revenue.
                  </p>
                </div>
                <div className="flex gap-8">
                  <div className="text-center">
                    <p className="text-xs uppercase tracking-wider text-white/70 mb-1">Match Rate</p>
                    <p className="text-4xl font-bold">{results.summary.match_rate}%</p>
                  </div>
                  <div className="w-px bg-white/20 h-12 self-center hidden md:block" />
                  <div className="text-center">
                    <p className="text-xs uppercase tracking-wider text-white/70 mb-1">Untracked Orders</p>
                    <p className="text-4xl font-bold">{formatNumber(results.summary.backend_only)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            {/* Summary Cards */}
            <div className="grid md:grid-cols-4 gap-4 mb-8">
              <div className="card text-center">
                <p className="text-sm text-muted-foreground mb-1">Total Backend Value</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(results.summary.backend_total_value)}</p>
              </div>
              <div className="card text-center">
                <p className="text-sm text-muted-foreground mb-1">Total GA4 Value</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(results.summary.ga4_total_value)}</p>
              </div>
              <div className="card text-center">
                <p className="text-sm text-muted-foreground mb-1">Value Discrepancy</p>
                <p className="text-2xl font-bold text-destructive">-{formatCurrency(results.summary.backend_total_value - results.summary.ga4_total_value)}</p>
              </div>
              <div className="card text-center">
                <p className="text-sm text-muted-foreground mb-1">Row Match Accuracy</p>
                <p className="text-2xl font-bold text-success">{results.value_comparison.exact_match_rate}%</p>
              </div>
            </div>

            {/* Trend Chart (Temporal Analysis) */}
            {results.temporal_analysis && results.temporal_analysis.length > 0 && (
              <div className="card mb-8">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-semibold text-foreground">Match Rate Evolution</h3>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-gray-200 rounded-sm"></div> Total Orders
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-revolt-red rounded-sm"></div> Match Rate %
                    </div>
                  </div>
                </div>

                <div className="h-64 w-full relative">
                  {/* Y-axis labels */}
                  <div className="absolute left-0 top-0 bottom-6 w-10 flex flex-col justify-between text-xs text-muted-foreground">
                    <span>100%</span>
                    <span>75%</span>
                    <span>50%</span>
                    <span>25%</span>
                    <span>0%</span>
                  </div>

                  {/* Chart area */}
                  <div className="ml-10 h-[calc(100%-1.5rem)] relative" onMouseLeave={() => setHoveredPoint(null)}>
                    <svg
                      className="w-full h-full"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >
                      {/* Grid lines */}
                      {[0, 25, 50, 75, 100].map((tick) => (
                        <line
                          key={tick}
                          x1="0"
                          y1={100 - tick}
                          x2="100"
                          y2={100 - tick}
                          stroke="#e5e7eb"
                          strokeWidth="0.3"
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}

                      {/* Bars for Total Volume */}
                      {(() => {
                        const data = results.temporal_analysis;
                        const maxVol = Math.max(...data.map(d => d.backend_total)) || 1;
                        const barW = data.length > 1 ? 80 / data.length : 8;
                        return data.map((d, i) => {
                          const x = data.length > 1 ? (i / (data.length - 1)) * 100 : 50;
                          const h = (d.backend_total / maxVol) * 40;
                          return (
                            <rect
                              key={`bar-${i}`}
                              x={x - barW / 2}
                              y={100 - h}
                              width={barW}
                              height={h}
                              fill="#f3f4f6"
                              rx="0.5"
                            />
                          );
                        });
                      })()}

                      {/* Match Rate Line */}
                      {results.temporal_analysis.length > 1 && (
                        <polyline
                          points={results.temporal_analysis.map((d, i) => {
                            const x = (i / (results.temporal_analysis.length - 1)) * 100;
                            const y = 100 - d.match_rate;
                            return `${x},${y}`;
                          }).join(' ')}
                          fill="none"
                          stroke="#dd3333"
                          strokeWidth="2"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}

                      {/* Invisible hover columns for each data point */}
                      {(() => {
                        const data = results.temporal_analysis;
                        const colW = data.length > 1 ? 100 / data.length : 100;
                        return data.map((d, i) => {
                          const x = data.length > 1 ? (i / (data.length - 1)) * 100 : 50;
                          return (
                            <rect
                              key={`hover-${i}`}
                              x={x - colW / 2}
                              y="0"
                              width={colW}
                              height="100"
                              fill="transparent"
                              onMouseEnter={() => setHoveredPoint(i)}
                            />
                          );
                        });
                      })()}

                      {/* Vertical guide line for hovered point */}
                      {hoveredPoint !== null && (() => {
                        const data = results.temporal_analysis;
                        const x = data.length > 1 ? (hoveredPoint / (data.length - 1)) * 100 : 50;
                        return (
                          <line
                            x1={x}
                            y1="0"
                            x2={x}
                            y2="100"
                            stroke="#dd3333"
                            strokeWidth="1"
                            strokeDasharray="3 3"
                            vectorEffect="non-scaling-stroke"
                            style={{ pointerEvents: 'none' }}
                          />
                        );
                      })()}
                    </svg>

                    {/* HTML tooltip overlay (not distorted by SVG viewBox) */}
                    {hoveredPoint !== null && (() => {
                      const data = results.temporal_analysis;
                      const d = data[hoveredPoint];
                      const xPct = data.length > 1 ? (hoveredPoint / (data.length - 1)) * 100 : 50;
                      const yPct = 100 - d.match_rate;
                      return (
                        <>
                          {/* Dot */}
                          <div
                            className="absolute w-3 h-3 bg-revolt-red rounded-full border-2 border-white shadow-md pointer-events-none"
                            style={{
                              left: `${xPct}%`,
                              top: `${yPct}%`,
                              transform: 'translate(-50%, -50%)',
                            }}
                          />
                          {/* Tooltip */}
                          <div
                            className="absolute z-20 pointer-events-none bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg"
                            style={{
                              left: `${xPct}%`,
                              top: `${yPct}%`,
                              transform: `translate(${xPct > 80 ? '-100%' : xPct < 20 ? '0%' : '-50%'}, calc(-100% - 12px))`,
                            }}
                          >
                            <p className="font-semibold mb-1">{d.date}</p>
                            <p>Match Rate: <span className="text-red-300 font-medium">{d.match_rate}%</span></p>
                            <p>Matched: {d.matched} / {d.backend_total}</p>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* X Axis Labels */}
                  <div className="ml-10 flex justify-between mt-1 text-xs text-muted-foreground">
                    {(() => {
                      const data = results.temporal_analysis;
                      const maxLabels = 6;
                      if (data.length <= maxLabels) {
                        return data.map((d, i) => <span key={i}>{d.date}</span>);
                      }
                      const step = Math.ceil(data.length / (maxLabels - 1));
                      const indices = new Set<number>();
                      for (let i = 0; i < data.length; i += step) indices.add(i);
                      indices.add(data.length - 1);
                      return Array.from(indices).sort((a, b) => a - b).map(i => (
                        <span key={i}>{data[i].date}</span>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            )}

            {results.recommendations.length > 0 && (
              <div className="mb-8">
                <h3 className="font-semibold text-foreground mb-4">Recommendations</h3>
                <div className="space-y-4">
                  {results.recommendations.map((rec, i) => (
                    <div key={i} className={`card border ${getPriorityColor(rec.priority)}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <span className={`text-xs font-medium uppercase ${rec.priority === "critical" ? "text-destructive" : rec.priority === "high" ? "text-warning" : "text-info"}`}>
                            {rec.priority}
                          </span>
                          <h4 className="font-semibold text-foreground mt-1">{rec.title}</h4>
                          <p className="text-sm text-muted-foreground mt-1">{rec.description}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Impact</p>
                          <p className="font-semibold text-foreground">{formatCurrency(rec.impact)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Status Analysis */}
            {results.status_analysis && results.status_analysis.length > 0 && (
              <div className="card mb-8">
                <h3 className="font-semibold text-foreground mb-4">Tracking by Order Status</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-2 text-muted-foreground font-medium">Status</th>
                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">Total</th>
                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">In GA4</th>
                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.status_analysis.map((s, i) => (
                        <tr key={i} className="border-b border-border">
                          <td className="py-3 px-2 text-foreground">{s.status}</td>
                          <td className="py-3 px-2 text-right text-foreground">{formatNumber(s.total)}</td>
                          <td className="py-3 px-2 text-right text-foreground">{formatNumber(s.in_ga4)}</td>
                          <td className="py-3 px-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className={s.rate < 50 ? "text-destructive font-medium" : s.rate < 80 ? "text-warning" : "text-success"}>
                                {s.rate}%
                              </span>
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${s.rate < 50 ? "bg-destructive" : s.rate < 80 ? "bg-warning" : "bg-success"}`}
                                  style={{ width: `${s.rate}%` }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tech Analysis Row */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {/* Payment Method Analysis */}
              {results.payment_analysis.length > 0 && (
                <div className="card">
                  <h3 className="font-semibold text-foreground mb-4">Payment Methods</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-2 text-muted-foreground font-medium">Method</th>
                          <th className="text-right py-2 px-2 text-muted-foreground font-medium">Rate</th>
                          <th className="text-right py-2 px-2 text-muted-foreground font-medium">Lost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.payment_analysis.map((pm, i) => (
                          <tr key={i} className="border-b border-border">
                            <td className="py-2 px-2 text-foreground">{pm.method}</td>
                            <td className="py-2 px-2 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className={pm.rate < 50 ? "text-destructive font-medium" : pm.rate < 80 ? "text-warning" : "text-success"}>
                                  {pm.rate}%
                                </span>
                                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${pm.rate < 50 ? "bg-destructive" : pm.rate < 80 ? "bg-warning" : "bg-success"}`}
                                    style={{ width: `${pm.rate}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="py-2 px-2 text-right text-foreground">{formatCurrency(pm.value_missing)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tech Stats (Browser/Device) */}
              {(results.tech_analysis?.browser?.length > 0 || results.tech_analysis?.device?.length > 0) && (
                <div className="card">
                  <h3 className="font-semibold text-foreground mb-4">Tech Breakdown (Matched)</h3>

                  {results.tech_analysis.device.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Device Category</h4>
                      <div className="space-y-2">
                        {results.tech_analysis.device.map((d: any, i: number) => (
                          <div key={i} className="flex justify-between items-center text-sm">
                            <span className="text-foreground">{d.name}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-info rounded-full"
                                  style={{ width: `${d.percentage}%` }}
                                />
                              </div>
                              <span className="text-muted-foreground w-12 text-right">{d.percentage}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {results.tech_analysis.browser.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Top Browsers</h4>
                      <div className="space-y-2">
                        {results.tech_analysis.browser.slice(0, 5).map((b: any, i: number) => (
                          <div key={i} className="flex justify-between items-center text-sm">
                            <span className="text-foreground">{b.name}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-info rounded-full"
                                  style={{ width: `${b.percentage}%` }}
                                />
                              </div>
                              <span className="text-muted-foreground w-12 text-right">{b.percentage}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Specialist Interpretation */}
            <div className="card mb-8">
              <h3 className="font-semibold text-foreground mb-2">Specialist Interpretation</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add your analysis and recommendations. This will be included in the PDF report.
              </p>
              <textarea
                value={specialistNotes}
                onChange={(e) => {
                  if (e.target.value.length <= 5000) setSpecialistNotes(e.target.value);
                }}
                maxLength={5000}
                rows={8}
                placeholder="Enter your interpretation of the data, key findings, and any action items..."
                className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground text-sm resize-y focus:outline-none focus:ring-2 focus:ring-revolt-red/30 focus:border-revolt-red transition-colors"
              />
              <p className="text-xs text-muted-foreground mt-2 text-right">
                {specialistNotes.length.toLocaleString()} / 5,000 characters
              </p>
            </div>

            <div className="flex justify-center gap-4">
              <button onClick={() => {
                setStep("upload");
                setResults(null);
                setGa4File(null);
                setBackendFile(null);
                setGa4Columns([]);
                setBackendColumns([]);
                setSpecialistNotes("");
              }} className="btn-secondary px-8 py-3">
                Start New Analysis
              </button>
              <button
                onClick={async () => {
                  setLoading(true);
                  try {
                    const response = await fetch(`${API_URL}/report/pdf`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ ...mapping, specialist_notes: specialistNotes }),
                    });
                    if (!response.ok) throw new Error("Failed to generate PDF");
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "dra-transaction-reconciliation-report.pdf";
                    a.click();
                    window.URL.revokeObjectURL(url);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "PDF generation failed");
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
                className="btn-primary px-8 py-3 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {loading ? "Generating..." : "Download PDF Report"}
              </button>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 text-center text-sm text-muted-foreground">
          © 2026 Data Revolt Agency. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
