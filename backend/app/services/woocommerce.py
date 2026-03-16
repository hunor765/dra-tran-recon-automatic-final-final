"""
WooCommerce REST API v3 client.
Fetches orders and normalizes them to a DataFrame compatible with run_analysis().
"""
from datetime import date
import pandas as pd

try:
    from woocommerce import API as WooAPI
    WOOCOMMERCE_AVAILABLE = True
except ImportError:
    WOOCOMMERCE_AVAILABLE = False


class WooCommerceClient:
    def __init__(self, site_url: str, consumer_key: str, consumer_secret: str):
        if not WOOCOMMERCE_AVAILABLE:
            raise ImportError("woocommerce package not installed. Run: pip install woocommerce")
        self.wcapi = WooAPI(
            url=site_url,
            consumer_key=consumer_key,
            consumer_secret=consumer_secret,
            version="wc/v3",
            timeout=30,
        )

    def fetch_orders(self, date_from: date, date_to: date) -> pd.DataFrame:
        """
        Paginate through all WooCommerce orders in the given date range.
        Returns a normalized DataFrame.
        """
        orders = []
        page = 1

        while True:
            response = self.wcapi.get("orders", params={
                "after": f"{date_from}T00:00:00",
                "before": f"{date_to}T23:59:59",
                "per_page": 100,
                "page": page,
                "status": "any",
            })
            batch = response.json()
            if not isinstance(batch, list) or not batch:
                break
            orders.extend(batch)
            page += 1
            # Check total pages header
            total_pages = int(response.headers.get("X-WP-TotalPages", 1))
            if page > total_pages:
                break

        rows = []
        for o in orders:
            shipping_lines = o.get("shipping_lines") or []
            rows.append({
                "transaction_id": str(o["id"]),
                "order_total": float(o.get("total", 0) or 0),
                "order_date": str(o.get("date_created", ""))[:10],
                "payment_method": o.get("payment_method_title", ""),
                "shipping_method": shipping_lines[0].get("method_title", "") if shipping_lines else "",
                "status": o.get("status", ""),
            })

        return pd.DataFrame(rows) if rows else pd.DataFrame(
            columns=["transaction_id", "order_total", "order_date", "payment_method", "shipping_method", "status"]
        )

    def test_connection(self) -> bool:
        """Returns True if the API credentials are valid."""
        try:
            response = self.wcapi.get("system_status")
            return response.status_code == 200
        except Exception:
            return False

    @staticmethod
    def get_default_column_mapping() -> dict:
        return {
            "backend_transaction_id": "transaction_id",
            "backend_value": "order_total",
            "backend_date": "order_date",
            "backend_payment_method": "payment_method",
            "backend_shipping_method": "shipping_method",
            "backend_status": "status",
        }
