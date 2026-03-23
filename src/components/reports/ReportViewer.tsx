"use client";

import { useState } from "react";
import type { AnalysisResult, SectionNoteKey, SectionNotes } from "@/lib/types";

interface Props {
  result: AnalysisResult;
  notes?: string;
  onNotesChange?: (v: string) => void;
  sectionNotes?: SectionNotes;
  onSectionNoteChange?: (key: SectionNoteKey, value: string) => void;
  onDownloadPdf?: () => void;
  onReset?: () => void;
  reportId?: string;
}

const formatNumber = (n: number) => new Intl.NumberFormat("en-US").format(n);
const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const rateColor = (rate: number) =>
  rate < 50 ? "text-destructive font-medium" : rate < 80 ? "text-warning" : "text-success";
const rateBg = (rate: number) =>
  rate < 50 ? "bg-destructive" : rate < 80 ? "bg-warning" : "bg-success";
const priorityClass = (p: string) =>
  p === "critical"
    ? "bg-destructive/15 text-destructive border-destructive/30"
    : p === "high"
    ? "bg-warning/15 text-warning border-warning/30"
    : "bg-info/15 text-info border-info/30";

function SectionNoteBox({
  sectionKey,
  value,
  onChange,
}: {
  sectionKey: SectionNoteKey;
  value: string;
  onChange?: (key: SectionNoteKey, val: string) => void;
}) {
  if (!onChange) return null;
  return (
    <div className="mb-8 mt-2">
      <textarea
        value={value}
        onChange={(e) => {
          if (e.target.value.length <= 2000) onChange(sectionKey, e.target.value);
        }}
        maxLength={2000}
        rows={3}
        placeholder="Add interpretation for this section..."
        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm resize-y focus:outline-none focus:ring-2 focus:ring-revolt-red/30 focus:border-revolt-red transition-colors"
      />
      <p className="text-xs text-muted-foreground mt-1 text-right">
        {value.length.toLocaleString()} / 2,000
      </p>
    </div>
  );
}

export default function ReportViewer({ result, notes = "", onNotesChange, sectionNotes = {}, onSectionNoteChange, onDownloadPdf, onReset, reportId }: Props) {
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [localNotes, setLocalNotes] = useState(notes);
  const notesValue = onNotesChange ? notes : localNotes;
  const setNotes = (v: string) => {
    if (onNotesChange) onNotesChange(v);
    else setLocalNotes(v);
  };

  return (
    <>
      {/* Hero Banner */}
      <div className="bg-gradient-to-br from-revolt-red to-[#b52828] rounded-xl p-8 text-white mb-8 shadow-lg shadow-revolt-red/20">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <h2 className="text-3xl font-bold mb-2">Analysis Complete</h2>
            <p className="text-white/80">
              We found{" "}
              <span className="font-bold text-white">
                {formatCurrency(Math.abs(result.summary.backend_total_value - result.summary.ga4_total_value))}
              </span>{" "}
              in {result.summary.backend_total_value >= result.summary.ga4_total_value ? "untracked" : "over-reported"} revenue.
            </p>
          </div>
          <div className="flex gap-8">
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider text-white/70 mb-1">Match Rate</p>
              <p className="text-4xl font-bold">{result.summary.match_rate}%</p>
            </div>
            <div className="w-px bg-white/20 h-12 self-center hidden md:block" />
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider text-white/70 mb-1">Untracked Orders</p>
              <p className="text-4xl font-bold">{formatNumber(result.summary.backend_only)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-4 gap-4 mb-8">
        <div className="card text-center">
          <p className="text-sm text-muted-foreground mb-1">Total Backend Value</p>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(result.summary.backend_total_value)}</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-muted-foreground mb-1">Total GA4 Value</p>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(result.summary.ga4_total_value)}</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-muted-foreground mb-1">Value Discrepancy</p>
          <p className="text-2xl font-bold text-destructive">
            {result.summary.backend_total_value >= result.summary.ga4_total_value ? "-" : "+"}
            {formatCurrency(Math.abs(result.summary.backend_total_value - result.summary.ga4_total_value))}
          </p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-muted-foreground mb-1">Row Match Accuracy</p>
          <p className="text-2xl font-bold text-success">{result.value_comparison.exact_match_rate}%</p>
        </div>
      </div>
      <SectionNoteBox sectionKey="summary" value={sectionNotes?.summary || ""} onChange={onSectionNoteChange} />

      {/* Temporal Chart */}
      {result.temporal_analysis?.length > 0 && (
        <div className="card mb-8">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-foreground">Match Rate Evolution</h3>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-gray-200 rounded-sm" /> Total Orders
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-revolt-red rounded-sm" /> Match Rate %
              </div>
            </div>
          </div>

          <div className="h-64 w-full relative">
            <div className="absolute left-0 top-0 bottom-6 w-10 flex flex-col justify-between text-xs text-muted-foreground">
              <span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span>
            </div>
            <div className="ml-10 h-[calc(100%-1.5rem)] relative" onMouseLeave={() => setHoveredPoint(null)}>
              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {[0, 25, 50, 75, 100].map((tick) => (
                  <line key={tick} x1="0" y1={100 - tick} x2="100" y2={100 - tick} stroke="#e5e7eb" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
                ))}
                {(() => {
                  const data = result.temporal_analysis;
                  const maxVol = Math.max(...data.map((d) => d.backend_total)) || 1;
                  const barW = data.length > 1 ? 80 / data.length : 8;
                  return data.map((d, i) => {
                    const x = data.length > 1 ? (i / (data.length - 1)) * 100 : 50;
                    const h = (d.backend_total / maxVol) * 40;
                    return <rect key={`bar-${i}`} x={x - barW / 2} y={100 - h} width={barW} height={h} fill="#f3f4f6" rx="0.5" />;
                  });
                })()}
                {result.temporal_analysis.length > 1 && (
                  <polyline
                    points={result.temporal_analysis.map((d, i) => `${(i / (result.temporal_analysis.length - 1)) * 100},${100 - d.match_rate}`).join(" ")}
                    fill="none" stroke="#dd3333" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
                  />
                )}
                {(() => {
                  const data = result.temporal_analysis;
                  const colW = data.length > 1 ? 100 / data.length : 100;
                  return data.map((_, i) => {
                    const x = data.length > 1 ? (i / (data.length - 1)) * 100 : 50;
                    return <rect key={`hover-${i}`} x={x - colW / 2} y="0" width={colW} height="100" fill="transparent" onMouseEnter={() => setHoveredPoint(i)} />;
                  });
                })()}
                {hoveredPoint !== null && (() => {
                  const data = result.temporal_analysis;
                  const x = data.length > 1 ? (hoveredPoint / (data.length - 1)) * 100 : 50;
                  return <line x1={x} y1="0" x2={x} y2="100" stroke="#dd3333" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />;
                })()}
              </svg>

              {hoveredPoint !== null && (() => {
                const data = result.temporal_analysis;
                const d = data[hoveredPoint];
                const xPct = data.length > 1 ? (hoveredPoint / (data.length - 1)) * 100 : 50;
                const yPct = 100 - d.match_rate;
                return (
                  <>
                    <div className="absolute w-3 h-3 bg-revolt-red rounded-full border-2 border-white shadow-md pointer-events-none"
                      style={{ left: `${xPct}%`, top: `${yPct}%`, transform: "translate(-50%, -50%)" }} />
                    <div className="absolute z-20 pointer-events-none bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg"
                      style={{ left: `${xPct}%`, top: `${yPct}%`, transform: `translate(${xPct > 80 ? "-100%" : xPct < 20 ? "0%" : "-50%"}, calc(-100% - 12px))` }}>
                      <p className="font-semibold mb-1">{d.date}</p>
                      <p>Match Rate: <span className="text-red-300 font-medium">{d.match_rate}%</span></p>
                      <p>Matched: {d.matched} / {d.backend_total}</p>
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="ml-10 flex justify-between mt-1 text-xs text-muted-foreground">
              {(() => {
                const data = result.temporal_analysis;
                const maxLabels = 6;
                if (data.length <= maxLabels) return data.map((d, i) => <span key={i}>{d.date}</span>);
                const step = Math.ceil(data.length / (maxLabels - 1));
                const indices = new Set<number>();
                for (let i = 0; i < data.length; i += step) indices.add(i);
                indices.add(data.length - 1);
                return Array.from(indices).sort((a, b) => a - b).map((i) => <span key={i}>{data[i].date}</span>);
              })()}
            </div>
          </div>
        </div>
      )}
      <SectionNoteBox sectionKey="temporal" value={sectionNotes?.temporal || ""} onChange={onSectionNoteChange} />

      {/* Recommendations */}
      {result.recommendations.length > 0 && (
        <div className="mb-8">
          <h3 className="font-semibold text-foreground mb-4">Recommendations</h3>
          <div className="space-y-4">
            {result.recommendations.map((rec, i) => (
              <div key={i} className={`card border ${priorityClass(rec.priority)}`}>
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
      <SectionNoteBox sectionKey="recommendations" value={sectionNotes?.recommendations || ""} onChange={onSectionNoteChange} />

      {/* Status Analysis */}
      {result.status_analysis?.length > 0 && (
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
                {result.status_analysis.map((s, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="py-3 px-2 text-foreground">{s.status}</td>
                    <td className="py-3 px-2 text-right text-foreground">{formatNumber(s.total)}</td>
                    <td className="py-3 px-2 text-right text-foreground">{formatNumber(s.in_ga4)}</td>
                    <td className="py-3 px-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className={rateColor(s.rate)}>{s.rate}%</span>
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${rateBg(s.rate)}`} style={{ width: `${s.rate}%` }} />
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
      <SectionNoteBox sectionKey="status" value={sectionNotes?.status || ""} onChange={onSectionNoteChange} />

      {/* Shipping Analysis */}
      {result.shipping_analysis?.length > 0 && (
        <div className="card mb-8">
          <h3 className="font-semibold text-foreground mb-4">Tracking by Shipping Method</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-2 text-muted-foreground font-medium">Method</th>
                  <th className="text-right py-3 px-2 text-muted-foreground font-medium">Total</th>
                  <th className="text-right py-3 px-2 text-muted-foreground font-medium">In GA4</th>
                  <th className="text-right py-3 px-2 text-muted-foreground font-medium">Rate</th>
                </tr>
              </thead>
              <tbody>
                {result.shipping_analysis.map((s, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="py-3 px-2 text-foreground">{s.method}</td>
                    <td className="py-3 px-2 text-right text-foreground">{formatNumber(s.total)}</td>
                    <td className="py-3 px-2 text-right text-foreground">{formatNumber(s.in_ga4)}</td>
                    <td className="py-3 px-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className={rateColor(s.rate)}>{s.rate}%</span>
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${rateBg(s.rate)}`} style={{ width: `${s.rate}%` }} />
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
      <SectionNoteBox sectionKey="shipping" value={sectionNotes?.shipping || ""} onChange={onSectionNoteChange} />

      {/* Payment + Tech row */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {result.payment_analysis?.length > 0 && (
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
                  {result.payment_analysis.map((pm, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="py-2 px-2 text-foreground">{pm.method}</td>
                      <td className="py-2 px-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className={rateColor(pm.rate)}>{pm.rate}%</span>
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${rateBg(pm.rate)}`} style={{ width: `${pm.rate}%` }} />
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

        {(result.tech_analysis?.browser?.length > 0 || result.tech_analysis?.device?.length > 0) && (
          <div className="card">
            <h3 className="font-semibold text-foreground mb-4">Tech Breakdown (Matched)</h3>
            {result.tech_analysis.device.length > 0 && (
              <div className="mb-6">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Device Category</h4>
                <div className="space-y-2">
                  {result.tech_analysis.device.map((d, i) => (
                    <div key={i} className="flex justify-between items-center text-sm">
                      <span className="text-foreground">{d.name}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-info rounded-full" style={{ width: `${d.percentage}%` }} />
                        </div>
                        <span className="text-muted-foreground w-12 text-right">{d.percentage}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {result.tech_analysis.browser.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Top Browsers</h4>
                <div className="space-y-2">
                  {result.tech_analysis.browser.slice(0, 5).map((b, i) => (
                    <div key={i} className="flex justify-between items-center text-sm">
                      <span className="text-foreground">{b.name}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-info rounded-full" style={{ width: `${b.percentage}%` }} />
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
      <SectionNoteBox sectionKey="payment_tech" value={sectionNotes?.payment_tech || ""} onChange={onSectionNoteChange} />

      {/* Source/Medium */}
      {result.source_medium_analysis?.length > 0 && (
        <div className="card mb-8">
          <h3 className="font-semibold text-foreground mb-4">Session Source / Medium (Matched Transactions)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-2 text-muted-foreground font-medium">Source / Medium</th>
                  <th className="text-right py-3 px-2 text-muted-foreground font-medium">Transactions</th>
                  <th className="text-right py-3 px-2 text-muted-foreground font-medium">Matched</th>
                  <th className="text-right py-3 px-2 text-muted-foreground font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {result.source_medium_analysis.map((sm, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="py-3 px-2 text-foreground font-medium">{sm.source_medium}</td>
                    <td className="py-3 px-2 text-right text-foreground">{formatNumber(sm.total)}</td>
                    <td className="py-3 px-2 text-right text-foreground">{formatNumber(sm.matched)}</td>
                    <td className="py-3 px-2 text-right text-foreground">{formatCurrency(sm.value_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <SectionNoteBox sectionKey="source_medium" value={sectionNotes?.source_medium || ""} onChange={onSectionNoteChange} />

      {/* Specialist Notes */}
      <div className="card mb-8">
        <h3 className="font-semibold text-foreground mb-2">Specialist Interpretation</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Add your overall analysis and recommendations. This will be included in the PDF report.
        </p>
        <textarea
          value={notesValue}
          onChange={(e) => { if (e.target.value.length <= 5000) setNotes(e.target.value); }}
          maxLength={5000}
          rows={8}
          placeholder="Enter your interpretation of the data, key findings, and any action items..."
          className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground text-sm resize-y focus:outline-none focus:ring-2 focus:ring-revolt-red/30 focus:border-revolt-red transition-colors"
        />
        <p className="text-xs text-muted-foreground mt-2 text-right">
          {notesValue.length.toLocaleString()} / 5,000 characters
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex justify-center gap-4">
        {onReset && (
          <button onClick={onReset} className="btn-secondary px-8 py-3">
            Start New Analysis
          </button>
        )}
        {onDownloadPdf && (
          <button onClick={onDownloadPdf} className="btn-primary px-8 py-3 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download PDF Report
          </button>
        )}
        {reportId && (
          <div className="flex gap-2">
            <a href={`/api/reports/${reportId}/export/csv`} download className="btn-secondary px-6 py-3 text-sm">
              Export CSV
            </a>
            <a href={`/api/reports/${reportId}/export/xlsx`} download className="btn-secondary px-6 py-3 text-sm">
              Export XLSX
            </a>
          </div>
        )}
      </div>
    </>
  );
}
