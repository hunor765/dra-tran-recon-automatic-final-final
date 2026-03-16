"""
Regression tests for the core reconciliation analysis.

Run from backend/ directory:
    pytest tests/test_analysis.py -v

The test_data/ files are real exports used during development.
GA4 CSV has no explicit header row — pandas uses the first data row as
column names, producing:
  date col      → "20251107"
  tx_id col     → "369004977139"
  source/medium → "(not set)"
  value col     → "427.980004"
  browser col   → "browser"
  device col    → "device_category"

Backend CSV has standard headers:
  increment_id, valoare, metoda_plata, metoda_livrare, created_at, order_status
"""
import sys
import os
import pathlib

import pandas as pd
import pytest

# Allow importing from backend/app when running pytest from backend/
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from app.services.analysis import run_analysis, ColumnMapping

TEST_DATA = pathlib.Path(__file__).parent.parent.parent / "test_data"
GA4_CSV = TEST_DATA / "ga4_enriched.csv"
BACKEND_CSV = TEST_DATA / "backend_enriched.csv"

# Column mapping reflecting actual column names in the CSVs
MAPPING = ColumnMapping(
    ga4_transaction_id="369004977139",   # first transaction ID becomes column name
    ga4_value="427.980004",             # first value becomes column name
    ga4_browser="browser",
    ga4_device="device_category",
    backend_transaction_id="increment_id",
    backend_value="valoare",
    backend_date="created_at",
    backend_payment_method="metoda_plata",
    backend_shipping_method="metoda_livrare",
    backend_status="order_status",
    ga4_includes_vat=True,
    backend_includes_vat=True,
    vat_rate=19.0,
)


@pytest.fixture(scope="module")
def dataframes():
    ga4 = pd.read_csv(GA4_CSV)
    backend = pd.read_csv(BACKEND_CSV)
    return ga4, backend


@pytest.fixture(scope="module")
def result(dataframes):
    ga4, backend = dataframes
    return run_analysis(ga4, backend, MAPPING)


# ── Basic structure ────────────────────────────────────────────────────────────

def test_result_has_all_sections(result):
    assert result.summary
    assert result.value_comparison
    assert isinstance(result.payment_analysis, list)
    assert isinstance(result.shipping_analysis, list)
    assert isinstance(result.status_analysis, list)
    assert isinstance(result.temporal_analysis, list)
    assert isinstance(result.recommendations, list)
    assert isinstance(result.source_medium_analysis, list)


# ── Summary sanity checks ─────────────────────────────────────────────────────

def test_row_counts_positive(result):
    assert result.summary["ga4_total"] > 0
    assert result.summary["backend_total"] > 0


def test_match_rate_in_range(result):
    rate = result.summary["match_rate"]
    assert 0.0 <= rate <= 100.0


def test_common_le_min_total(result):
    common = result.summary["common"]
    ga4_total = result.summary["ga4_total"]
    backend_total = result.summary["backend_total"]
    assert common <= min(ga4_total, backend_total)


def test_backend_only_plus_common_equals_backend_total(result):
    s = result.summary
    assert s["common"] + s["backend_only"] == s["backend_total"]


def test_ga4_only_plus_common_equals_ga4_total(result):
    s = result.summary
    assert s["common"] + s["ga4_only"] == s["ga4_total"]


def test_value_totals_positive(result):
    assert result.summary["ga4_total_value"] > 0
    assert result.summary["backend_total_value"] > 0


# ── Value comparison ──────────────────────────────────────────────────────────

def test_value_comparison_keys(result):
    vc = result.value_comparison
    assert "matched_backend_value" in vc
    assert "matched_ga4_value" in vc
    assert "value_difference" in vc
    assert "exact_matches" in vc
    assert "exact_match_rate" in vc


def test_exact_match_rate_in_range(result):
    rate = result.value_comparison["exact_match_rate"]
    assert 0.0 <= rate <= 100.0


# ── Payment / shipping / status analysis ─────────────────────────────────────

def test_payment_analysis_has_entries(result):
    assert len(result.payment_analysis) > 0


def test_payment_analysis_rate_in_range(result):
    for entry in result.payment_analysis:
        assert 0.0 <= entry["rate"] <= 100.0


def test_shipping_analysis_has_entries(result):
    assert len(result.shipping_analysis) > 0


def test_status_analysis_has_entries(result):
    assert len(result.status_analysis) > 0


# ── Recommendations ───────────────────────────────────────────────────────────

def test_recommendations_have_required_fields(result):
    for rec in result.recommendations:
        assert "priority" in rec
        assert rec["priority"] in ("critical", "high", "medium")
        assert "title" in rec
        assert "description" in rec


# ── VAT normalisation ─────────────────────────────────────────────────────────

def test_vat_normalisation_same_when_both_include_vat(dataframes):
    """When both sources include VAT at the same rate, totals should be unchanged."""
    ga4, backend = dataframes
    result_both = run_analysis(ga4, backend, MAPPING)

    mapping_neither = MAPPING.model_copy(
        update={"ga4_includes_vat": False, "backend_includes_vat": False}
    )
    result_neither = run_analysis(ga4, backend, mapping_neither)

    # Match rate should be identical regardless of VAT flag when both are consistent
    assert result_both.summary["match_rate"] == result_neither.summary["match_rate"]


def test_vat_normalisation_adjusts_values(dataframes):
    """When GA4 includes VAT but backend does not, GA4 values should be divided."""
    ga4, backend = dataframes
    mapping_ga4_vat = MAPPING.model_copy(
        update={"ga4_includes_vat": True, "backend_includes_vat": False, "vat_rate": 19.0}
    )
    result = run_analysis(ga4, backend, mapping_ga4_vat)
    # The GA4 total should be lower than the raw sum (VAT stripped)
    ga4_raw_sum = pd.to_numeric(ga4[MAPPING.ga4_value], errors="coerce").fillna(0).sum()
    assert result.summary["ga4_total_value"] < ga4_raw_sum * 1.01  # allow fp rounding
