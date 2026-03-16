"""
Core reconciliation analysis logic.
Extracted from backend/main.py — zero logic changes.
Accepts DataFrames directly so it can be fed from CSV uploads or API data sources.
"""
from typing import Optional
import pandas as pd
from pydantic import BaseModel


class ColumnMapping(BaseModel):
    ga4_transaction_id: str
    ga4_value: str
    ga4_date: Optional[str] = None
    ga4_browser: Optional[str] = None
    ga4_device: Optional[str] = None
    ga4_source_medium: Optional[str] = None
    backend_transaction_id: str
    backend_value: str
    backend_date: Optional[str] = None
    backend_payment_method: Optional[str] = None
    backend_shipping_method: Optional[str] = None
    backend_status: Optional[str] = None
    ga4_includes_vat: bool = True
    backend_includes_vat: bool = True
    vat_rate: float = 19.0
    specialist_notes: Optional[str] = None
    session_id: Optional[str] = None


class AnalysisResult(BaseModel):
    summary: dict
    payment_analysis: list
    shipping_analysis: list
    status_analysis: list
    tech_analysis: dict
    temporal_analysis: list
    value_comparison: dict
    recommendations: list
    source_medium_analysis: list = []


def run_analysis(ga4: pd.DataFrame, backend: pd.DataFrame, mapping: ColumnMapping) -> AnalysisResult:
    """
    Run the full reconciliation analysis on two DataFrames.
    Returns an AnalysisResult with all segments populated.
    """
    ga4 = ga4.copy()
    backend = backend.copy()

    # Clean and prepare data
    ga4['clean_id'] = ga4[mapping.ga4_transaction_id].astype(str).str.strip()
    backend['clean_id'] = backend[mapping.backend_transaction_id].astype(str).str.strip()

    # Convert values to numeric
    ga4['value'] = pd.to_numeric(ga4[mapping.ga4_value], errors='coerce').fillna(0)
    backend['value'] = pd.to_numeric(backend[mapping.backend_value], errors='coerce').fillna(0)

    # VAT normalization: normalize both to net (without VAT) values for comparison
    vat_multiplier = 1 + (mapping.vat_rate / 100)
    if mapping.ga4_includes_vat and not mapping.backend_includes_vat:
        ga4['value'] = ga4['value'] / vat_multiplier
    elif not mapping.ga4_includes_vat and mapping.backend_includes_vat:
        backend['value'] = backend['value'] / vat_multiplier

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

    backend_agg = matched_backend.groupby('clean_id')['value'].sum().reset_index()
    ga4_agg = matched_ga4.groupby('clean_id')['value'].sum().reset_index()
    merged = backend_agg.merge(ga4_agg, on='clean_id', how='inner', suffixes=('_backend', '_ga4'))
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
                "value_missing": round(value_total - value_in_ga4, 2),
            })

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
                "rate": rate,
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
                "rate": rate,
            })

        status_analysis.sort(key=lambda x: x['rate'])

    # Tech analysis (matched transactions only)
    tech_analysis = {"browser": [], "device": []}
    matched_ga4_subset = ga4[ga4['clean_id'].isin(common)]

    if mapping.ga4_browser and mapping.ga4_browser in ga4.columns:
        browser_counts = matched_ga4_subset[mapping.ga4_browser].value_counts().head(10)
        total_matched = len(matched_ga4_subset)
        for browser, count in browser_counts.items():
            tech_analysis["browser"].append({
                "name": str(browser),
                "count": int(count),
                "percentage": round(count / total_matched * 100, 1) if total_matched > 0 else 0,
            })

    if mapping.ga4_device and mapping.ga4_device in ga4.columns:
        device_counts = matched_ga4_subset[mapping.ga4_device].value_counts()
        total_matched = len(matched_ga4_subset)
        for device, count in device_counts.items():
            tech_analysis["device"].append({
                "name": str(device),
                "count": int(count),
                "percentage": round(count / total_matched * 100, 1) if total_matched > 0 else 0,
            })

    # Source/Medium analysis
    source_medium_analysis = []
    if mapping.ga4_source_medium and mapping.ga4_source_medium in ga4.columns:
        for sm in matched_ga4_subset[mapping.ga4_source_medium].value_counts().head(15).index:
            if pd.isna(sm):
                continue
            sm_ga4 = ga4[ga4[mapping.ga4_source_medium] == sm]
            total_ga4 = len(sm_ga4)
            matched_count = len(sm_ga4[sm_ga4['clean_id'].isin(common)])
            value_total = round(sm_ga4['value'].sum(), 2)
            value_matched = round(sm_ga4[sm_ga4['clean_id'].isin(common)]['value'].sum(), 2)

            source_medium_analysis.append({
                "source_medium": str(sm),
                "total": total_ga4,
                "matched": matched_count,
                "value_total": value_total,
                "value_matched": value_matched,
            })

        source_medium_analysis.sort(key=lambda x: x['total'], reverse=True)

    # Temporal analysis (daily match rate evolution)
    temporal_analysis = []
    if mapping.backend_date and mapping.backend_date in backend.columns:
        try:
            backend['date_parsed'] = pd.to_datetime(backend[mapping.backend_date], errors='coerce')
            backend['date_only'] = backend['date_parsed'].dt.date
            daily_backend = backend.groupby('date_only')['clean_id'].apply(list).to_dict()

            for date_key, backend_ids_on_date in sorted(daily_backend.items()):
                if pd.isna(date_key):
                    continue
                unique_ids_on_date = set(backend_ids_on_date)
                total_backend = len(unique_ids_on_date)
                matched = len(unique_ids_on_date & ga4_ids)
                match_rate_daily = round(matched / total_backend * 100, 2) if total_backend > 0 else 0

                temporal_analysis.append({
                    "date": str(date_key),
                    "backend_total": total_backend,
                    "matched": matched,
                    "match_rate": match_rate_daily,
                })
        except Exception as e:
            print(f"Temporal analysis failed: {e}")

    # Recommendations
    recommendations = []

    zero_tracking = [p for p in payment_analysis if p['rate'] == 0 and p['total'] > 10]
    if zero_tracking:
        methods = ", ".join([p['method'] for p in zero_tracking])
        recommendations.append({
            "priority": "critical",
            "title": "Payment methods with 0% tracking",
            "description": f"The following payment methods have no GA4 tracking: {methods}. Implement server-side tracking immediately.",
            "impact": sum([p['value_missing'] for p in zero_tracking]),
        })

    low_tracking = [p for p in payment_analysis if 0 < p['rate'] < 50 and p['total'] > 10]
    if low_tracking:
        methods = ", ".join([p['method'] for p in low_tracking])
        recommendations.append({
            "priority": "high",
            "title": "Payment methods with low tracking rate",
            "description": f"These payment methods have tracking below 50%: {methods}. Review redirect flows and cross-domain tracking.",
            "impact": sum([p['value_missing'] for p in low_tracking]),
        })

    if summary['match_rate'] < 80:
        recommendations.append({
            "priority": "medium",
            "title": "Consider server-side tracking",
            "description": f"Only {summary['match_rate']}% of transactions are tracked. Implement GA4 Measurement Protocol for reliable tracking.",
            "impact": summary['backend_total_value'] - summary['ga4_total_value'],
        })

    return AnalysisResult(
        summary=summary,
        payment_analysis=payment_analysis,
        shipping_analysis=shipping_analysis,
        status_analysis=status_analysis,
        tech_analysis=tech_analysis,
        temporal_analysis=temporal_analysis,
        value_comparison=value_comparison,
        recommendations=recommendations,
        source_medium_analysis=source_medium_analysis,
    )
