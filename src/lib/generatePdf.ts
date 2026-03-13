import type jsPDFType from 'jspdf';

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
  source_medium_analysis: Array<{
    source_medium: string;
    total: number;
    matched: number;
    value_total: number;
    value_matched: number;
  }>;
}

// Colors
const C = {
  red: [221, 51, 51] as const,
  fg: [18, 18, 18] as const,
  white: [255, 255, 255] as const,
  muted: [245, 245, 245] as const,
  mutedFg: [115, 115, 115] as const,
  border: [229, 229, 229] as const,
  success: [34, 197, 94] as const,
  warning: [234, 179, 8] as const,
  info: [59, 130, 246] as const,
  gridLine: [229, 231, 235] as const,
  barFill: [243, 244, 246] as const,
};

const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);
const fmtCur = (n: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

type RGB = readonly [number, number, number];

function rateColor(rate: number): RGB {
  if (rate < 50) return C.red;
  if (rate < 80) return C.warning;
  return C.success;
}

// Layout constants
const PAGE_W = 210;
const PAGE_H = 297;
const M = 15; // margin
const W = PAGE_W - M * 2; // content width = 180mm
const CARD_R = 3; // card border radius

// Helper class wrapping jsPDF with Y-tracking and auto page breaks
class PdfBuilder {
  pdf: jsPDFType;
  y: number = M;
  pageNum: number = 1;

  constructor(pdf: jsPDFType) {
    this.pdf = pdf;
  }

  get remaining(): number {
    return PAGE_H - M - this.y;
  }

  ensureSpace(needed: number): void {
    if (this.y + needed > PAGE_H - M) {
      this.pdf.addPage();
      this.y = M;
      this.pageNum++;
    }
  }

  newPage(): void {
    this.pdf.addPage();
    this.y = M;
    this.pageNum++;
  }

  // Drawing helpers
  setColor(rgb: RGB): void {
    this.pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
  }

  fillRect(x: number, y: number, w: number, h: number, color: RGB, radius?: number): void {
    this.pdf.setFillColor(color[0], color[1], color[2]);
    if (radius) {
      this.roundedRect(x, y, w, h, radius, 'F');
    } else {
      this.pdf.rect(x, y, w, h, 'F');
    }
  }

  strokeRect(x: number, y: number, w: number, h: number, color: RGB, radius?: number): void {
    this.pdf.setDrawColor(color[0], color[1], color[2]);
    this.pdf.setLineWidth(0.3);
    if (radius) {
      this.roundedRect(x, y, w, h, radius, 'S');
    } else {
      this.pdf.rect(x, y, w, h, 'S');
    }
  }

  filledStrokedRect(x: number, y: number, w: number, h: number, fill: RGB, stroke: RGB, radius?: number): void {
    this.pdf.setFillColor(fill[0], fill[1], fill[2]);
    this.pdf.setDrawColor(stroke[0], stroke[1], stroke[2]);
    this.pdf.setLineWidth(0.3);
    if (radius) {
      this.roundedRect(x, y, w, h, radius, 'FD');
    } else {
      this.pdf.rect(x, y, w, h, 'FD');
    }
  }

  roundedRect(x: number, y: number, w: number, h: number, r: number, style: string): void {
    // jsPDF doesn't have native rounded rect, so approximate with lines + arcs
    // Use the roundedRect if available (jsPDF 2.5+)
    if (typeof (this.pdf as any).roundedRect === 'function') {
      (this.pdf as any).roundedRect(x, y, w, h, r, r, style);
    } else {
      this.pdf.rect(x, y, w, h, style);
    }
  }

  line(x1: number, y1: number, x2: number, y2: number, color: RGB, width: number = 0.3): void {
    this.pdf.setDrawColor(color[0], color[1], color[2]);
    this.pdf.setLineWidth(width);
    this.pdf.line(x1, y1, x2, y2);
  }

  text(str: string, x: number, y: number, opts?: { fontSize?: number; bold?: boolean; color?: RGB; align?: 'left' | 'center' | 'right'; maxWidth?: number }): void {
    const { fontSize = 10, bold = false, color = C.fg, align = 'left', maxWidth } = opts || {};
    this.pdf.setFontSize(fontSize);
    this.pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    this.setColor(color);
    const options: any = { align };
    if (maxWidth) options.maxWidth = maxWidth;
    this.pdf.text(str, x, y, options);
  }

  textWidth(str: string, fontSize: number, bold: boolean = false): number {
    this.pdf.setFontSize(fontSize);
    this.pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    return this.pdf.getTextWidth(str);
  }

  // Wrapped text that returns how many lines it took
  wrappedText(str: string, x: number, y: number, maxW: number, opts?: { fontSize?: number; bold?: boolean; color?: RGB; lineHeight?: number }): number {
    const { fontSize = 9, bold = false, color = C.fg, lineHeight = 4 } = opts || {};
    this.pdf.setFontSize(fontSize);
    this.pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    this.setColor(color);
    const lines = this.pdf.splitTextToSize(str, maxW);
    for (let i = 0; i < lines.length; i++) {
      this.pdf.text(lines[i], x, y + i * lineHeight);
    }
    return lines.length;
  }

  progressBar(x: number, y: number, w: number, h: number, pct: number, color: RGB): void {
    // Background
    this.fillRect(x, y, w, h, C.muted, h / 2);
    // Fill
    if (pct > 0) {
      const fillW = Math.max(h, (pct / 100) * w); // min width = height for round cap
      this.fillRect(x, y, fillW, h, color, h / 2);
    }
  }
}

// ============ Section Renderers ============

function measureSection(builder: PdfBuilder, renderFn: (b: PdfBuilder) => void): number {
  // Dry-run: save Y, render, measure delta, restore
  const startY = builder.y;
  // We can't truly dry-run jsPDF, so sections must pre-calculate their height
  return 0; // unused — each section calculates its own height
}

function renderHeader(b: PdfBuilder): void {
  const h = 20;
  b.ensureSpace(h);
  const startY = b.y;

  // DRA logo box
  b.fillRect(M, startY, 12, 12, C.red, 2);
  b.text('DRA', M + 6, startY + 7.5, { fontSize: 6, bold: true, color: C.white, align: 'center' });

  // Title
  b.text('Transaction Reconciliation Report', M + 16, startY + 5, { fontSize: 14, bold: true });
  b.text('Data Revolt Agency', M + 16, startY + 10, { fontSize: 8, color: C.mutedFg });

  // Date
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  b.text(dateStr, M + W, startY + 5, { fontSize: 8, color: C.mutedFg, align: 'right' });
  b.text(timeStr, M + W, startY + 9, { fontSize: 8, color: C.mutedFg, align: 'right' });

  // Red underline
  b.line(M, startY + 14, M + W, startY + 14, C.red, 0.8);

  b.y = startY + h;
}

function renderHeroBanner(b: PdfBuilder, results: AnalysisResult): void {
  const h = 32;
  b.ensureSpace(h);
  const startY = b.y;

  // Red background
  b.fillRect(M, startY, W, h - 4, C.red, CARD_R);

  // Left text
  b.text('Analysis Complete', M + 8, startY + 10, { fontSize: 16, bold: true, color: C.white });
  const diff = Math.abs(results.summary.backend_total_value - results.summary.ga4_total_value);
  const label = results.summary.backend_total_value >= results.summary.ga4_total_value ? 'untracked' : 'over-reported';
  b.text(`We found ${fmtCur(diff)} in ${label} revenue.`, M + 8, startY + 17, { fontSize: 9, color: C.white });

  // Right stats
  const rightX = M + W - 8;
  // Match Rate
  b.text('MATCH RATE', rightX - 50, startY + 7, { fontSize: 6, color: C.white, align: 'center' });
  b.text(`${results.summary.match_rate}%`, rightX - 50, startY + 18, { fontSize: 20, bold: true, color: C.white, align: 'center' });

  // Divider
  b.line(rightX - 26, startY + 5, rightX - 26, startY + 23, C.white, 0.2);

  // Untracked Orders
  b.text('UNTRACKED ORDERS', rightX, startY + 7, { fontSize: 6, color: C.white, align: 'right' });
  b.text(fmt(results.summary.backend_only), rightX, startY + 18, { fontSize: 20, bold: true, color: C.white, align: 'right' });

  b.y = startY + h;
}

function renderSummaryCards(b: PdfBuilder, results: AnalysisResult): void {
  const cardH = 18;
  const gap = 3;
  const cardW = (W - gap * 3) / 4;
  b.ensureSpace(cardH + 6);
  const startY = b.y;

  const discrepancy = results.summary.backend_total_value - results.summary.ga4_total_value;
  const sign = discrepancy >= 0 ? '-' : '+';

  const cards = [
    { label: 'Total Backend Value', value: fmtCur(results.summary.backend_total_value), color: C.fg },
    { label: 'Total GA4 Value', value: fmtCur(results.summary.ga4_total_value), color: C.fg },
    { label: 'Value Discrepancy', value: `${sign}${fmtCur(Math.abs(discrepancy))}`, color: C.red },
    { label: 'Row Match Accuracy', value: `${results.value_comparison.exact_match_rate}%`, color: C.success },
  ];

  cards.forEach((card, i) => {
    const x = M + i * (cardW + gap);
    b.filledStrokedRect(x, startY, cardW, cardH, C.white, C.border, CARD_R);
    b.text(card.label, x + cardW / 2, startY + 6, { fontSize: 7, color: C.mutedFg, align: 'center' });
    b.text(card.value, x + cardW / 2, startY + 13, { fontSize: 12, bold: true, color: card.color, align: 'center' });
  });

  // Subtitle for Row Match Accuracy
  const lastCardX = M + 3 * (cardW + gap);
  b.text('Matched values within 1 tolerance', lastCardX + cardW / 2, startY + cardH - 2, { fontSize: 5, color: C.mutedFg, align: 'center' });

  b.y = startY + cardH + 6;
}

function renderChart(b: PdfBuilder, data: AnalysisResult['temporal_analysis']): void {
  if (!data || data.length === 0) return;

  const chartH = 60;
  const totalH = chartH + 24; // chart + labels + padding
  b.ensureSpace(totalH);
  const startY = b.y;

  // Card outline
  b.filledStrokedRect(M, startY, W, totalH - 2, C.white, C.border, CARD_R);

  // Title + Legend
  b.text('Match Rate Evolution', M + 6, startY + 8, { fontSize: 10, bold: true });

  // Legend
  const legX = M + W - 6;
  b.fillRect(legX - 72, startY + 5, 4, 4, C.barFill);
  b.text('Total Orders', legX - 66, startY + 8, { fontSize: 6, color: C.mutedFg });
  b.fillRect(legX - 30, startY + 5, 4, 4, C.red);
  b.text('Match Rate %', legX - 24, startY + 8, { fontSize: 6, color: C.mutedFg });

  // Chart area
  const chartX = M + 16;
  const chartW = W - 22;
  const chartTop = startY + 14;
  const len = data.length;
  const maxVol = Math.max(...data.map(d => d.backend_total), 1);

  // Y-axis labels and grid
  const yLabels = ['100%', '75%', '50%', '25%', '0%'];
  for (let i = 0; i < 5; i++) {
    const yPos = chartTop + (i / 4) * chartH;
    b.line(chartX, yPos, chartX + chartW, yPos, C.gridLine, 0.15);
    b.text(yLabels[i], chartX - 2, yPos + 1, { fontSize: 6, color: C.mutedFg, align: 'right' });
  }

  // Volume bars
  const barW = Math.min(chartW * 0.8 / Math.max(len, 1), 3);
  for (let i = 0; i < len; i++) {
    const x = len === 1 ? chartX + chartW / 2 : chartX + (i / (len - 1)) * chartW;
    const barH = (data[i].backend_total / maxVol) * chartH * 0.35;
    b.fillRect(x - barW / 2, chartTop + chartH - barH, barW, barH, C.barFill);
  }

  // Match rate line
  const points: [number, number][] = data.map((d, i) => {
    const x = len === 1 ? chartX + chartW / 2 : chartX + (i / (len - 1)) * chartW;
    const rate = Math.min(Math.max(d.match_rate, 0), 100);
    const y = chartTop + chartH - (rate / 100) * chartH;
    return [x, y];
  });

  // Draw line segments
  b.pdf.setDrawColor(C.red[0], C.red[1], C.red[2]);
  b.pdf.setLineWidth(0.5);
  for (let i = 1; i < points.length; i++) {
    b.pdf.line(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
  }

  // Draw dots
  for (const [x, y] of points) {
    b.fillRect(x - 0.8, y - 0.8, 1.6, 1.6, C.white); // white border
    b.pdf.setFillColor(C.red[0], C.red[1], C.red[2]);
    b.pdf.circle(x, y, 0.6, 'F');
  }

  // X-axis labels
  const labelY = chartTop + chartH + 5;
  const step = Math.max(1, Math.floor(len / 6));
  const indices = new Set<number>([0]);
  for (let i = step; i < len - 1; i += step) indices.add(i);
  if (len > 1) indices.add(len - 1);

  for (const i of indices) {
    const x = len === 1 ? chartX + chartW / 2 : chartX + (i / (len - 1)) * chartW;
    b.text(data[i].date, x, labelY, { fontSize: 6, color: C.mutedFg, align: 'center' });
  }

  b.y = startY + totalH;
}

function renderRecommendations(b: PdfBuilder, recs: AnalysisResult['recommendations']): void {
  if (!recs || recs.length === 0) return;

  b.ensureSpace(12);
  b.text('Recommendations', M, b.y + 4, { fontSize: 11, bold: true });
  b.y += 10;

  for (const rec of recs) {
    const descLines = b.pdf.setFontSize(8).splitTextToSize(rec.description, W - 50);
    const itemH = Math.max(16, 10 + descLines.length * 3.5);
    b.ensureSpace(itemH + 2);

    const startY = b.y;
    let bgColor: RGB, borderColor: RGB, textColor: RGB;
    if (rec.priority === 'critical') {
      bgColor = [253, 235, 235]; borderColor = [221, 51, 51]; textColor = C.red;
    } else if (rec.priority === 'high') {
      bgColor = [254, 249, 230]; borderColor = [234, 179, 8]; textColor = C.warning;
    } else {
      bgColor = [235, 243, 254]; borderColor = [59, 130, 246]; textColor = C.info;
    }

    b.filledStrokedRect(M, startY, W, itemH, bgColor as any, borderColor as any, CARD_R);
    b.text(rec.priority.toUpperCase(), M + 5, startY + 5, { fontSize: 6, bold: true, color: textColor });
    b.text(rec.title, M + 5, startY + 10, { fontSize: 9, bold: true });
    b.wrappedText(rec.description, M + 5, startY + 15, W - 50, { fontSize: 8, color: C.mutedFg });

    // Impact
    b.text('Impact', M + W - 5, startY + 5, { fontSize: 6, color: C.mutedFg, align: 'right' });
    b.text(fmtCur(rec.impact), M + W - 5, startY + 11, { fontSize: 10, bold: true, align: 'right' });

    b.y = startY + itemH + 3;
  }
}

interface TableCol {
  label: string;
  width: number;
  align: 'left' | 'right';
  key: string;
}

function renderTable(
  b: PdfBuilder,
  title: string,
  columns: TableCol[],
  rows: Record<string, any>[],
  opts?: { showRate?: boolean; rateKey?: string; showProgressBar?: boolean }
): void {
  if (rows.length === 0) return;

  const rowH = 7;
  const headerH = 8;
  const titleH = 10;
  const totalH = titleH + headerH + rows.length * rowH + 8;
  b.ensureSpace(Math.min(totalH, 60)); // ensure at least title + header + a few rows fit

  const startY = b.y;

  // Card background
  const cardH = titleH + headerH + rows.length * rowH + 6;
  b.filledStrokedRect(M, startY, W, cardH, C.white, C.border, CARD_R);

  // Title
  b.text(title, M + 6, startY + 7, { fontSize: 10, bold: true });

  // Header row
  const headerY = startY + titleH;
  let colX = M + 6;
  for (const col of columns) {
    b.text(col.label, col.align === 'right' ? colX + col.width - 2 : colX, headerY + 5, {
      fontSize: 7, color: C.mutedFg, bold: true, align: col.align,
    });
    colX += col.width;
  }
  b.line(M + 4, headerY + headerH - 1, M + W - 4, headerY + headerH - 1, C.border, 0.2);

  // Data rows
  const rateKey = opts?.rateKey || 'rate';
  for (let i = 0; i < rows.length; i++) {
    const rowY = headerY + headerH + i * rowH;

    // Check page break mid-table
    if (rowY + rowH > PAGE_H - M) {
      b.newPage();
      // We won't re-draw the card outline on the new page for simplicity
      // Just continue drawing rows
    }

    const actualY = rowY > PAGE_H - M ? b.y + (i > 0 ? 0 : 0) : rowY;

    colX = M + 6;
    for (const col of columns) {
      const val = rows[i][col.key];
      const displayVal = val !== undefined && val !== null ? String(val) : '';

      if (col.key === rateKey && opts?.showProgressBar) {
        // Color-coded rate percentage
        const rate = Number(val) || 0;
        const color = rateColor(rate);
        b.text(`${rate}%`, colX + col.width - 2, actualY + 4.5, { fontSize: 8, color, bold: rate < 50, align: 'right' });
      } else {
        b.text(displayVal, col.align === 'right' ? colX + col.width - 2 : colX, actualY + 4.5, {
          fontSize: 8, align: col.align,
        });
      }
      colX += col.width;
    }

    // Row separator
    if (i < rows.length - 1) {
      b.line(M + 4, actualY + rowH - 0.5, M + W - 4, actualY + rowH - 0.5, C.border, 0.1);
    }
  }

  b.y = startY + cardH + 4;
}

function renderStatusTable(b: PdfBuilder, data: AnalysisResult['status_analysis']): void {
  if (!data || data.length === 0) return;
  const cols: TableCol[] = [
    { label: 'Status', width: 60, align: 'left', key: 'status' },
    { label: 'Total', width: 40, align: 'right', key: 'total' },
    { label: 'In GA4', width: 40, align: 'right', key: 'in_ga4' },
    { label: 'Rate', width: 30, align: 'right', key: 'rate' },
  ];
  const rows = data.map(s => ({
    status: s.status,
    total: fmt(s.total),
    in_ga4: fmt(s.in_ga4),
    rate: s.rate,
  }));
  renderTable(b, 'Tracking by Order Status', cols, rows, { showProgressBar: true, rateKey: 'rate' });
}

function renderShippingTable(b: PdfBuilder, data: AnalysisResult['shipping_analysis']): void {
  if (!data || data.length === 0) return;
  const cols: TableCol[] = [
    { label: 'Method', width: 60, align: 'left', key: 'method' },
    { label: 'Total', width: 40, align: 'right', key: 'total' },
    { label: 'In GA4', width: 40, align: 'right', key: 'in_ga4' },
    { label: 'Rate', width: 30, align: 'right', key: 'rate' },
  ];
  const rows = data.map(s => ({
    method: s.method,
    total: fmt(s.total),
    in_ga4: fmt(s.in_ga4),
    rate: s.rate,
  }));
  renderTable(b, 'Tracking by Shipping Method', cols, rows, { showProgressBar: true, rateKey: 'rate' });
}

function renderPaymentTable(b: PdfBuilder, data: AnalysisResult['payment_analysis']): void {
  if (!data || data.length === 0) return;
  const cols: TableCol[] = [
    { label: 'Method', width: 45, align: 'left', key: 'method' },
    { label: 'Total', width: 30, align: 'right', key: 'total' },
    { label: 'In GA4', width: 30, align: 'right', key: 'in_ga4' },
    { label: 'Rate', width: 30, align: 'right', key: 'rate' },
    { label: 'Value Lost', width: 35, align: 'right', key: 'value_missing' },
  ];
  const rows = data.map(pm => ({
    method: pm.method,
    total: fmt(pm.total),
    in_ga4: fmt(pm.in_ga4),
    rate: pm.rate,
    value_missing: fmtCur(pm.value_missing),
  }));
  renderTable(b, 'Payment Methods', cols, rows, { showProgressBar: true, rateKey: 'rate' });
}

function renderTechBreakdown(b: PdfBuilder, tech: AnalysisResult['tech_analysis']): void {
  const hasDevice = tech.device && tech.device.length > 0;
  const hasBrowser = tech.browser && tech.browser.length > 0;
  if (!hasDevice && !hasBrowser) return;

  const deviceRows = hasDevice ? tech.device.length : 0;
  const browserRows = hasBrowser ? Math.min(tech.browser.length, 5) : 0;
  const maxRows = Math.max(deviceRows, browserRows);
  const cardH = 14 + maxRows * 7 + 6;

  b.ensureSpace(cardH);
  const startY = b.y;

  b.filledStrokedRect(M, startY, W, cardH, C.white, C.border, CARD_R);
  b.text('Tech Breakdown (Matched)', M + 6, startY + 8, { fontSize: 10, bold: true });

  const halfW = (W - 16) / 2;

  // Device Category (left)
  if (hasDevice) {
    const colX = M + 6;
    b.text('DEVICE CATEGORY', colX, startY + 16, { fontSize: 6, bold: true, color: C.mutedFg });
    tech.device.forEach((d, i) => {
      const rowY = startY + 22 + i * 7;
      b.text(d.name, colX, rowY + 3, { fontSize: 8 });
      b.text(`${d.percentage}%`, colX + halfW - 4, rowY + 3, { fontSize: 7, color: C.info, align: 'right' });
    });
  }

  // Top Browsers (right)
  if (hasBrowser) {
    const colX = M + 6 + halfW + 4;
    b.text('TOP BROWSERS', colX, startY + 16, { fontSize: 6, bold: true, color: C.mutedFg });
    tech.browser.slice(0, 5).forEach((br, i) => {
      const rowY = startY + 22 + i * 7;
      b.text(br.name, colX, rowY + 3, { fontSize: 8 });
      b.text(`${br.percentage}%`, colX + halfW - 4, rowY + 3, { fontSize: 7, color: C.info, align: 'right' });
    });
  }

  b.y = startY + cardH + 4;
}

function renderSourceMedium(b: PdfBuilder, data: AnalysisResult['source_medium_analysis']): void {
  if (!data || data.length === 0) return;
  const cols: TableCol[] = [
    { label: 'Source / Medium', width: 60, align: 'left', key: 'source_medium' },
    { label: 'Transactions', width: 30, align: 'right', key: 'total' },
    { label: 'Matched', width: 30, align: 'right', key: 'matched' },
    { label: 'Value', width: 40, align: 'right', key: 'value_total' },
  ];
  const rows = data.map(sm => ({
    source_medium: sm.source_medium,
    total: fmt(sm.total),
    matched: fmt(sm.matched),
    value_total: fmtCur(sm.value_total),
  }));
  renderTable(b, 'Session Source / Medium (Matched)', cols, rows);
}

function renderSpecialistNotes(b: PdfBuilder, notes: string): void {
  if (!notes || !notes.trim()) return;

  b.pdf.setFontSize(8);
  const lines = b.pdf.splitTextToSize(notes.trim(), W - 16);
  const textH = lines.length * 3.5;
  const cardH = 14 + textH + 6;

  b.ensureSpace(Math.min(cardH, 40));
  const startY = b.y;

  b.filledStrokedRect(M, startY, W, cardH, C.white, C.border, CARD_R);
  b.text('Specialist Interpretation', M + 6, startY + 8, { fontSize: 10, bold: true });

  b.wrappedText(notes.trim(), M + 6, startY + 15, W - 16, { fontSize: 8, color: C.fg, lineHeight: 3.5 });

  b.y = startY + cardH + 4;
}

function renderFooter(b: PdfBuilder): void {
  b.ensureSpace(12);
  b.line(M, b.y + 2, M + W, b.y + 2, C.border, 0.3);
  b.text('\u00A9 2026 Data Revolt Agency. All rights reserved.', M + W / 2, b.y + 8, {
    fontSize: 7, color: C.mutedFg, align: 'center',
  });
  b.y += 12;
}

// ============ Main Export ============

export async function generatePdf(
  results: AnalysisResult,
  specialistNotes: string
): Promise<void> {
  const { jsPDF } = await import('jspdf');

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const b = new PdfBuilder(pdf);

  renderHeader(b);
  renderHeroBanner(b, results);
  renderSummaryCards(b, results);
  renderChart(b, results.temporal_analysis);
  renderRecommendations(b, results.recommendations);
  renderStatusTable(b, results.status_analysis);
  renderShippingTable(b, results.shipping_analysis);
  renderPaymentTable(b, results.payment_analysis);
  renderTechBreakdown(b, results.tech_analysis);
  renderSourceMedium(b, results.source_medium_analysis);
  renderSpecialistNotes(b, specialistNotes);
  renderFooter(b);

  pdf.save('dra-transaction-reconciliation-report.pdf');
}
