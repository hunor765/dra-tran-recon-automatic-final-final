"""
Shopify Admin API client.
Fetches orders using cursor-based pagination and normalizes to a DataFrame.
"""
from datetime import date
import pandas as pd

try:
    import shopify
    SHOPIFY_AVAILABLE = True
except ImportError:
    SHOPIFY_AVAILABLE = False


class ShopifyClient:
    def __init__(self, store_domain: str, access_token: str):
        if not SHOPIFY_AVAILABLE:
            raise ImportError("ShopifyAPI package not installed. Run: pip install ShopifyAPI")
        shop_url = f"https://{store_domain}"
        session = shopify.Session(shop_url, "2024-01", access_token)
        shopify.ShopifyResource.activate_session(session)
        self.store_domain = store_domain

    def fetch_orders(self, date_from: date, date_to: date) -> pd.DataFrame:
        """
        Fetch all orders in date range using cursor-based pagination.
        """
        orders = []
        page = shopify.Order.find(
            created_at_min=f"{date_from}T00:00:00-00:00",
            created_at_max=f"{date_to}T23:59:59-00:00",
            status="any",
            limit=250,
        )
        orders.extend(page)

        while page.has_next_page():
            page = page.next_page()
            orders.extend(page)

        rows = []
        for o in orders:
            shipping_lines = getattr(o, "shipping_lines", []) or []
            rows.append({
                "transaction_id": str(o.id),
                "order_total": float(o.total_price or 0),
                "order_date": str(o.created_at)[:10],
                "payment_method": getattr(o, "payment_gateway", "") or "",
                "shipping_method": shipping_lines[0].title if shipping_lines else "",
                "status": getattr(o, "financial_status", "") or "",
            })

        return pd.DataFrame(rows) if rows else pd.DataFrame(
            columns=["transaction_id", "order_total", "order_date", "payment_method", "shipping_method", "status"]
        )

    def test_connection(self) -> bool:
        """Returns True if the API credentials are valid."""
        try:
            shop = shopify.Shop.current()
            return shop is not None
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
