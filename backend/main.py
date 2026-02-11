from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel
from typing import Optional
import pandas as pd
import io
import tempfile
import os
from datetime import datetime
from pathlib import Path
import json

# PDF generation - optional
PDF_AVAILABLE = False
try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.units import inch
    PDF_AVAILABLE = True
except ImportError:
    pass

app = FastAPI(
    title="DRA Transaction Reconciliation API",
    description="API for analyzing transaction discrepancies between ecommerce backend and GA4",
    version="1.0.0"
)

# CORS for frontend - allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


class ColumnMapping(BaseModel):
    ga4_transaction_id: str
    ga4_value: str
    ga4_date: Optional[str] = None
    ga4_browser: Optional[str] = None
    ga4_device: Optional[str] = None
    backend_transaction_id: str
    backend_value: str
    backend_date: Optional[str] = None
    backend_payment_method: Optional[str] = None
    backend_shipping_method: Optional[str] = None
    backend_status: Optional[str] = None
    specialist_notes: Optional[str] = None


class AnalysisResult(BaseModel):
    summary: dict
    payment_analysis: list
    shipping_analysis: list
    status_analysis: list
    tech_analysis: dict
    temporal_analysis: list
    value_comparison: dict
    recommendations: list


# Store uploaded files temporarily
uploaded_files = {}


@app.get("/")
def root():
    return {"status": "ok", "message": "DRA Transaction Reconciliation API"}


@app.post("/upload/ga4")
async def upload_ga4(file: UploadFile = File(...)):
    """Upload GA4 export file"""
    try:
        contents = await file.read()
        
        # Determine file type and read
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        elif file.filename.endswith(('.xlsx', '.xls')):
            df = pd.read_excel(io.BytesIO(contents))
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Use CSV or Excel.")
        
        # Store for later
        uploaded_files['ga4'] = df
        
        # Convert sample to JSON-safe format (replace NaN with None)
        sample = df.head(3).fillna("").to_dict(orient='records')
        
        return {
            "success": True,
            "filename": file.filename,
            "rows": len(df),
            "columns": list(df.columns),
            "sample": sample
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/upload/backend")
async def upload_backend(file: UploadFile = File(...)):
    """Upload ecommerce backend export file"""
    try:
        contents = await file.read()
        
        # Determine file type and read
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        elif file.filename.endswith(('.xlsx', '.xls')):
            df = pd.read_excel(io.BytesIO(contents))
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Use CSV or Excel.")
        
        # Store for later
        uploaded_files['backend'] = df
        
        # Convert sample to JSON-safe format (replace NaN with None)
        sample = df.head(3).fillna("").to_dict(orient='records')
        
        return {
            "success": True,
            "filename": file.filename,
            "rows": len(df),
            "columns": list(df.columns),
            "sample": sample
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/analyze", response_model=AnalysisResult)
async def analyze(mapping: ColumnMapping):
    """Run reconciliation analysis with provided column mapping"""
    
    if 'ga4' not in uploaded_files or 'backend' not in uploaded_files:
        raise HTTPException(status_code=400, detail="Please upload both GA4 and backend files first")
    
    ga4 = uploaded_files['ga4'].copy()
    backend = uploaded_files['backend'].copy()
    
    try:
        # Clean and prepare data
        ga4['clean_id'] = ga4[mapping.ga4_transaction_id].astype(str).str.strip()
        backend['clean_id'] = backend[mapping.backend_transaction_id].astype(str).str.replace('-1', '').str.strip()
        
        # Convert values to numeric
        ga4['value'] = pd.to_numeric(ga4[mapping.ga4_value], errors='coerce').fillna(0)
        backend['value'] = pd.to_numeric(backend[mapping.backend_value], errors='coerce').fillna(0)
        
        # Get ID sets
        ga4_ids = set(ga4['clean_id'].tolist())
        backend_ids = set(backend['clean_id'].tolist())
        
        common = ga4_ids & backend_ids
        backend_only = backend_ids - ga4_ids
        ga4_only = ga4_ids - backend_ids
        
        # Summary
        summary = {
            "ga4_total": len(ga4),
            "backend_total": len(backend),
            "common": len(common),
            "backend_only": len(backend_only),
            "ga4_only": len(ga4_only),
            "match_rate": round(len(common) / len(backend_ids) * 100, 2) if len(backend_ids) > 0 else 0,
            "ga4_total_value": round(ga4['value'].sum(), 2),
            "backend_total_value": round(backend['value'].sum(), 2),
        }
        
        # Value comparison for matched transactions
        matched_backend = backend[backend['clean_id'].isin(common)]
        matched_ga4 = ga4[ga4['clean_id'].isin(common)]
        
        ga4_agg = matched_ga4.groupby('clean_id')['value'].sum().reset_index()
        merged = matched_backend.merge(ga4_agg, on='clean_id', how='inner', suffixes=('_backend', '_ga4'))
        merged['diff'] = merged['value_backend'] - merged['value_ga4']
        
        exact_matches = len(merged[abs(merged['diff']) < 1])
        
        value_comparison = {
            "matched_backend_value": round(merged['value_backend'].sum(), 2),
            "matched_ga4_value": round(merged['value_ga4'].sum(), 2),
            "value_difference": round(merged['diff'].sum(), 2),
            "exact_matches": exact_matches,
            "exact_match_rate": round(exact_matches / len(merged) * 100, 2) if len(merged) > 0 else 0,
        }
        
        # Payment method analysis
        payment_analysis = []
        if mapping.backend_payment_method and mapping.backend_payment_method in backend.columns:
            for pm in backend[mapping.backend_payment_method].unique():
                pm_df = backend[backend[mapping.backend_payment_method] == pm]
                total = len(pm_df)
                in_ga4 = len(pm_df[pm_df['clean_id'].isin(ga4_ids)])
                rate = round(in_ga4 / total * 100, 1) if total > 0 else 0
                value_total = round(pm_df['value'].sum(), 2)
                value_in_ga4 = round(pm_df[pm_df['clean_id'].isin(ga4_ids)]['value'].sum(), 2)
                
                payment_analysis.append({
                    "method": str(pm),
                    "total": total,
                    "in_ga4": in_ga4,
                    "missing": total - in_ga4,
                    "rate": rate,
                    "value_total": value_total,
                    "value_missing": round(value_total - value_in_ga4, 2)
                })
            
            # Sort by rate ascending (worst first)
            payment_analysis.sort(key=lambda x: x['rate'])
        
        # Shipping method analysis
        shipping_analysis = []
        if mapping.backend_shipping_method and mapping.backend_shipping_method in backend.columns:
            for sm in backend[mapping.backend_shipping_method].unique():
                if pd.isna(sm):
                    continue
                sm_df = backend[backend[mapping.backend_shipping_method] == sm]
                total = len(sm_df)
                in_ga4 = len(sm_df[sm_df['clean_id'].isin(ga4_ids)])
                rate = round(in_ga4 / total * 100, 1) if total > 0 else 0
                
                shipping_analysis.append({
                    "method": str(sm),
                    "total": total,
                    "in_ga4": in_ga4,
                    "rate": rate
                })
            
            shipping_analysis.sort(key=lambda x: x['rate'])

        # Status analysis
        status_analysis = []
        if mapping.backend_status and mapping.backend_status in backend.columns:
            for status in backend[mapping.backend_status].unique():
                if pd.isna(status):
                    continue
                status_df = backend[backend[mapping.backend_status] == status]
                total = len(status_df)
                in_ga4 = len(status_df[status_df['clean_id'].isin(ga4_ids)])
                rate = round(in_ga4 / total * 100, 1) if total > 0 else 0
                
                status_analysis.append({
                    "status": str(status),
                    "total": total,
                    "in_ga4": in_ga4,
                    "rate": rate
                })
            status_analysis.sort(key=lambda x: x['rate'])

        # Tech analysis (Browser/Device)
        tech_analysis = {"browser": [], "device": []}
        
        # Only analyze tech for matched transactions
        matched_ga4_subset = ga4[ga4['clean_id'].isin(common)]
        
        if mapping.ga4_browser and mapping.ga4_browser in ga4.columns:
            browser_counts = matched_ga4_subset[mapping.ga4_browser].value_counts().head(10)
            total_matched = len(matched_ga4_subset)
            for browser, count in browser_counts.items():
                tech_analysis["browser"].append({
                    "name": str(browser),
                    "count": int(count),
                    "percentage": round(count / total_matched * 100, 1)
                })
                
        if mapping.ga4_device and mapping.ga4_device in ga4.columns:
            device_counts = matched_ga4_subset[mapping.ga4_device].value_counts()
            total_matched = len(matched_ga4_subset)
            for device, count in device_counts.items():
                tech_analysis["device"].append({
                    "name": str(device),
                    "count": int(count),
                    "percentage": round(count / total_matched * 100, 1)
                })
        
        # Temporal Analysis (Daily Match Rate Evolution)
        temporal_analysis = []
        
        if mapping.backend_date and mapping.backend_date in backend.columns:
            try:
                # Parse dates
                backend['date_parsed'] = pd.to_datetime(backend[mapping.backend_date], errors='coerce')
                backend['date_only'] = backend['date_parsed'].dt.date
                
                # Group by date
                daily_backend = backend.groupby('date_only')['clean_id'].apply(set).to_dict()
                
                # Calculate daily match rates
                for date, backend_ids_on_date in sorted(daily_backend.items()):
                    if pd.isna(date):
                        continue
                    
                    total_backend = len(backend_ids_on_date)
                    matched = len(backend_ids_on_date & ga4_ids)
                    match_rate = round(matched / total_backend * 100, 2) if total_backend > 0 else 0
                    
                    temporal_analysis.append({
                        "date": str(date),
                        "backend_total": total_backend,
                        "matched": matched,
                        "match_rate": match_rate
                    })
                
            except Exception as e:
                print(f"Temporal analysis failed: {e}")
                # Continue without temporal data
        
        # Generate recommendations
        recommendations = []
        
        # Check for payment methods with 0% tracking
        zero_tracking = [p for p in payment_analysis if p['rate'] == 0 and p['total'] > 10]
        if zero_tracking:
            methods = ", ".join([p['method'] for p in zero_tracking])
            recommendations.append({
                "priority": "critical",
                "title": "Payment methods with 0% tracking",
                "description": f"The following payment methods have no GA4 tracking: {methods}. Implement server-side tracking immediately.",
                "impact": sum([p['value_missing'] for p in zero_tracking])
            })
        
        # Check for payment methods with low tracking (<50%)
        low_tracking = [p for p in payment_analysis if 0 < p['rate'] < 50 and p['total'] > 10]
        if low_tracking:
            methods = ", ".join([p['method'] for p in low_tracking])
            recommendations.append({
                "priority": "high",
                "title": "Payment methods with low tracking rate",
                "description": f"These payment methods have tracking below 50%: {methods}. Review redirect flows and cross-domain tracking.",
                "impact": sum([p['value_missing'] for p in low_tracking])
            })
        
        # General recommendation
        if summary['match_rate'] < 80:
            recommendations.append({
                "priority": "medium",
                "title": "Consider server-side tracking",
                "description": f"Only {summary['match_rate']}% of transactions are tracked. Implement GA4 Measurement Protocol for reliable tracking.",
                "impact": summary['backend_total_value'] - summary['ga4_total_value']
            })

        return AnalysisResult(
            summary=summary,
            payment_analysis=payment_analysis,
            shipping_analysis=shipping_analysis,
            status_analysis=status_analysis,
            tech_analysis=tech_analysis,
            temporal_analysis=temporal_analysis,
            value_comparison=value_comparison,
            recommendations=recommendations
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/columns")
def get_columns():
    """Get columns from uploaded files for mapping UI"""
    result = {}
    
    if 'ga4' in uploaded_files:
        result['ga4'] = list(uploaded_files['ga4'].columns)
    
    if 'backend' in uploaded_files:
        result['backend'] = list(uploaded_files['backend'].columns)
    
    return result


# Store last analysis result for PDF generation
last_analysis_result = {}


@app.post("/report/pdf")
async def generate_pdf_report(mapping: ColumnMapping):
    """Generate PDF report from last analysis"""
    
    if not PDF_AVAILABLE:
        raise HTTPException(
            status_code=501,
            detail="PDF generation not available. Install reportlab: pip install reportlab"
        )
    
    # Run analysis first
    result = await analyze(mapping)
    
    # Create PDF using ReportLab
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=30, bottomMargin=30)
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'Title',
        parent=styles['Heading1'],
        fontSize=20,
        spaceAfter=20,
        textColor=colors.HexColor('#dd3333')
    )
    
    heading_style = ParagraphStyle(
        'Heading',
        parent=styles['Heading2'],
        fontSize=14,
        spaceBefore=20,
        spaceAfter=10,
        textColor=colors.HexColor('#121212')
    )
    
    normal_style = styles['Normal']
    
    elements = []
    
    # Title
    elements.append(Paragraph("DRA Transaction Reconciliation Report", title_style))
    elements.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", normal_style))
    elements.append(Spacer(1, 20))
    
    # Summary
    elements.append(Paragraph("Executive Summary", heading_style))
    
    summary_data = [
        ["Metric", "Value"],
        ["Match Rate", f"{result.summary['match_rate']}%"],
        ["Transactions Matched", f"{result.summary['common']:,}"],
        ["Missing from GA4", f"{result.summary['backend_only']:,}"],
        ["Backend Total", f"{result.summary['backend_total']:,}"],
        ["GA4 Total", f"{result.summary['ga4_total']:,}"],
        ["Value Accuracy", f"{result.value_comparison['exact_match_rate']}%"],
    ]
    
    summary_table = Table(summary_data, colWidths=[3*inch, 2*inch])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#dd3333')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f5f5f5')),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e5e5e5')),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 20))
    
    # Payment Analysis
    if result.payment_analysis:
        elements.append(Paragraph("Payment Method Analysis", heading_style))
        
        payment_data = [["Method", "Total", "In GA4", "Rate", "Value Lost"]]
        for pm in result.payment_analysis:
            payment_data.append([
                pm['method'],
                f"{pm['total']:,}",
                f"{pm['in_ga4']:,}",
                f"{pm['rate']}%",
                f"{pm['value_missing']:,.2f}"
            ])
        
        payment_table = Table(payment_data, colWidths=[2*inch, 1*inch, 1*inch, 0.8*inch, 1.2*inch])
        payment_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#dd3333')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e5e5e5')),
        ]))
        elements.append(payment_table)
        elements.append(Spacer(1, 20))

    # Status Analysis
    if result.status_analysis:
        elements.append(Paragraph("Order Status Analysis", heading_style))
        
        status_data = [["Status", "Total", "In GA4", "Rate"]]
        for status in result.status_analysis:
            status_data.append([
                status['status'],
                f"{status['total']:,}",
                f"{status['in_ga4']:,}",
                f"{status['rate']}%"
            ])
        
        status_table = Table(status_data, colWidths=[2.5*inch, 1*inch, 1*inch, 1*inch])
        status_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#dd3333')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e5e5e5')),
        ]))
        elements.append(status_table)
        elements.append(Spacer(1, 20))

    # Tech Analysis
    if result.tech_analysis["browser"] or result.tech_analysis["device"]:
        elements.append(Paragraph("Tech Analysis (Matched Orders)", heading_style))
        
        if result.tech_analysis["browser"]:
            elements.append(Paragraph("Top Browsers", styles['Heading3']))
            browser_data = [["Browser", "Count", "Percentage"]]
            for b in result.tech_analysis["browser"]:
                browser_data.append([b['name'], str(b['count']), f"{b['percentage']}%"])
            
            browser_table = Table(browser_data, colWidths=[3*inch, 1*inch, 1.5*inch])
            browser_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f5f5f5')),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e5e5e5')),
            ]))
            elements.append(browser_table)
            elements.append(Spacer(1, 10))

        if result.tech_analysis["device"]:
            elements.append(Paragraph("Device Category", styles['Heading3']))
            device_data = [["Device", "Count", "Percentage"]]
            for d in result.tech_analysis["device"]:
                device_data.append([d['name'], str(d['count']), f"{d['percentage']}%"])
            
            device_table = Table(device_data, colWidths=[3*inch, 1*inch, 1.5*inch])
            device_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f5f5f5')),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e5e5e5')),
            ]))
            elements.append(device_table)
            elements.append(Spacer(1, 20))
    
    # Recommendations
    if result.recommendations:
        elements.append(Paragraph("Recommendations", heading_style))
        for rec in result.recommendations:
            elements.append(Paragraph(
                f"<b>[{rec['priority'].upper()}]</b> {rec['title']}", 
                normal_style
            ))
            elements.append(Paragraph(rec['description'], normal_style))
            elements.append(Paragraph(f"Impact: {rec['impact']:,.2f}", normal_style))
            elements.append(Spacer(1, 10))
    
    # Specialist Interpretation
    if mapping.specialist_notes and mapping.specialist_notes.strip():
        elements.append(Paragraph("Specialist Interpretation", heading_style))
        # Split by newlines and render each line as a paragraph
        for line in mapping.specialist_notes.strip().split('\n'):
            if line.strip():
                elements.append(Paragraph(line.strip(), normal_style))
            else:
                elements.append(Spacer(1, 6))
        elements.append(Spacer(1, 20))
    
    # Footer
    elements.append(Spacer(1, 30))
    elements.append(Paragraph("© 2026 Data Revolt Agency. All rights reserved.", normal_style))
    
    doc.build(elements)
    
    pdf_content = buffer.getvalue()
    buffer.close()
    
    return Response(
        content=pdf_content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": "attachment; filename=dra-transaction-reconciliation-report.pdf"
        }
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
