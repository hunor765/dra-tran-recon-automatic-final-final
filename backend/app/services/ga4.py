"""
Google Analytics 4 Data API v1 client.
Uses a service account JSON key stored (encrypted) in the credentials table.
Fetches transaction-level data and normalizes to a DataFrame.
"""
from datetime import date
import json
import pandas as pd

try:
    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.analytics.data_v1beta.types import (
        RunReportRequest, DateRange, Dimension, Metric, OrderBy,
    )
    from google.oauth2 import service_account
    GA4_AVAILABLE = True
except ImportError:
    GA4_AVAILABLE = False


class GA4Client:
    def __init__(self, property_id: str, service_account_json: str):
        if not GA4_AVAILABLE:
            raise ImportError(
                "google-analytics-data package not installed. "
                "Run: pip install google-analytics-data google-auth"
            )
        credentials_info = json.loads(service_account_json)
        credentials = service_account.Credentials.from_service_account_info(
            credentials_info,
            scopes=["https://www.googleapis.com/auth/analytics.readonly"],
        )
        self.client = BetaAnalyticsDataClient(credentials=credentials)
        self.property_id = f"properties/{property_id}"

    def fetch_transactions(self, date_from: date, date_to: date) -> pd.DataFrame:
        """
        Query GA4 for transaction-level data with offset-based pagination.
        Returns a normalized DataFrame.
        """
        rows = []
        limit = 100_000
        offset = 0

        while True:
            request = RunReportRequest(
                property=self.property_id,
                date_ranges=[DateRange(
                    start_date=str(date_from),
                    end_date=str(date_to),
                )],
                dimensions=[
                    Dimension(name="transactionId"),
                    Dimension(name="sessionSourceMedium"),
                    Dimension(name="browser"),
                    Dimension(name="deviceCategory"),
                    Dimension(name="date"),
                ],
                metrics=[Metric(name="purchaseRevenue")],
                order_bys=[OrderBy(
                    dimension=OrderBy.DimensionOrderBy(dimension_name="transactionId")
                )],
                limit=limit,
                offset=offset,
            )
            response = self.client.run_report(request)

            for row in response.rows:
                dims = row.dimension_values
                metrics = row.metric_values
                rows.append({
                    "transaction_id": dims[0].value,
                    "source_medium": dims[1].value,
                    "browser": dims[2].value,
                    "device": dims[3].value,
                    "date": dims[4].value,
                    "revenue": float(metrics[0].value),
                })

            offset += limit
            if offset >= response.row_count:
                break

        return pd.DataFrame(rows) if rows else pd.DataFrame(
            columns=["transaction_id", "source_medium", "browser", "device", "date", "revenue"]
        )

    def test_connection(self) -> bool:
        """Returns True if the credentials and property ID are valid."""
        try:
            from google.analytics.data_v1beta.types import CheckCompatibilityRequest
            request = RunReportRequest(
                property=self.property_id,
                date_ranges=[DateRange(start_date="yesterday", end_date="yesterday")],
                metrics=[Metric(name="purchaseRevenue")],
                limit=1,
            )
            self.client.run_report(request)
            return True
        except Exception:
            return False

    @staticmethod
    def get_default_column_mapping() -> dict:
        return {
            "ga4_transaction_id": "transaction_id",
            "ga4_value": "revenue",
            "ga4_date": "date",
            "ga4_browser": "browser",
            "ga4_device": "device",
            "ga4_source_medium": "source_medium",
        }
