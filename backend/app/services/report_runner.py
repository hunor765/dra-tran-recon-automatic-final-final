"""
Orchestrates a full report run for a given job ID:
  1. Load client + credentials from DB
  2. Decrypt credentials
  3. Fetch data from platform API + GA4
  4. Run analysis
  5. Persist results to report_results table
  6. Update job status
"""
from datetime import datetime, timezone
import pandas as pd

from app.database import AsyncSessionLocal
from app.models.report_job import ReportJob
from app.models.report_result import ReportResult
from app.models.client import Client
from app.models.credential import Credential
from app.services.analysis import ColumnMapping, run_analysis
from app.services.encryption import decrypt
from sqlalchemy import select


async def run_report_job(job_id: str) -> None:
    async with AsyncSessionLocal() as db:
        # Load job
        job_result = await db.execute(select(ReportJob).where(ReportJob.id == job_id))
        job = job_result.scalar_one_or_none()
        if not job:
            return

        # Mark as running
        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        await db.commit()

        try:
            # Load client
            client_result = await db.execute(select(Client).where(Client.id == job.client_id))
            client = client_result.scalar_one_or_none()
            if not client:
                raise ValueError(f"Client {job.client_id} not found")

            # Load credentials
            creds_result = await db.execute(
                select(Credential).where(Credential.client_id == job.client_id)
            )
            creds = {c.platform: c for c in creds_result.scalars().all()}

            # Fetch backend data
            backend_df = await _fetch_backend(client, creds, job.date_from, job.date_to)

            # Fetch GA4 data
            ga4_df = await _fetch_ga4(creds, job.date_from, job.date_to)

            # Build column mapping from client defaults
            platform = client.platform or "manual"
            if platform == "woocommerce":
                from app.services.woocommerce import WooCommerceClient
                backend_cols = WooCommerceClient.get_default_column_mapping()
            elif platform == "shopify":
                from app.services.shopify import ShopifyClient
                backend_cols = ShopifyClient.get_default_column_mapping()
            else:
                raise ValueError(f"Platform '{platform}' does not support API-based reports. Use manual CSV upload.")

            from app.services.ga4 import GA4Client
            ga4_cols = GA4Client.get_default_column_mapping()

            mapping = ColumnMapping(
                **ga4_cols,
                **backend_cols,
                ga4_includes_vat=client.ga4_includes_vat,
                backend_includes_vat=client.backend_includes_vat,
                vat_rate=float(client.vat_rate),
            )

            # Run analysis
            result = run_analysis(ga4_df, backend_df, mapping)

            # Persist result
            report_result = ReportResult(
                job_id=job.id,
                client_id=job.client_id,
                result_json=result.model_dump(),
                row_count_backend=result.summary.get("backend_total"),
                row_count_ga4=result.summary.get("ga4_total"),
                match_rate=result.summary.get("match_rate"),
            )
            db.add(report_result)

            job.status = "completed"
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()

        except Exception as e:
            job.status = "failed"
            job.error_message = str(e)
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()
            raise


async def _fetch_backend(client: Client, creds: dict, date_from, date_to) -> pd.DataFrame:
    platform = client.platform

    if platform == "woocommerce":
        cred = creds.get("woocommerce")
        if not cred:
            raise ValueError("WooCommerce credentials not configured")
        from app.services.woocommerce import WooCommerceClient
        wc = WooCommerceClient(
            site_url=cred.wc_site_url,
            consumer_key=decrypt(cred.wc_consumer_key_enc),
            consumer_secret=decrypt(cred.wc_consumer_secret_enc),
        )
        return wc.fetch_orders(date_from, date_to)

    elif platform == "shopify":
        cred = creds.get("shopify")
        if not cred:
            raise ValueError("Shopify credentials not configured")
        from app.services.shopify import ShopifyClient
        sh = ShopifyClient(
            store_domain=cred.shopify_store_domain,
            access_token=decrypt(cred.shopify_access_token_enc),
        )
        return sh.fetch_orders(date_from, date_to)

    raise ValueError(f"Unsupported platform: {platform}")


async def _fetch_ga4(creds: dict, date_from, date_to) -> pd.DataFrame:
    cred = creds.get("ga4")
    if not cred:
        raise ValueError("GA4 credentials not configured")
    from app.services.ga4 import GA4Client
    ga4 = GA4Client(
        property_id=cred.ga4_property_id,
        service_account_json=decrypt(cred.ga4_service_account_json_enc),
    )
    return ga4.fetch_transactions(date_from, date_to)
