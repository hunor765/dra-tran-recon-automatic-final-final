"""
Orchestrates a full report run for a given job ID:
  1. Load client + credentials from DB
  2. Decrypt credentials
  3. Fetch data from platform API + GA4
  4. Run analysis
  5. Persist results to report_results table
  6. Update job status
  7. Anomaly alert: if match rate drops >15pp below rolling 10-report average,
     create a notification for all admin users (C3)
"""
from datetime import datetime, timezone
import json
import numpy as np
import pandas as pd

from app.database import AsyncSessionLocal
from app.models.report_job import ReportJob
from app.models.report_result import ReportResult
from app.models.client import Client
from app.models.credential import Credential
from app.services.analysis import ColumnMapping, run_analysis
from app.services.encryption import decrypt
from sqlalchemy import select


class _NumpyEncoder(json.JSONEncoder):
    """Convert numpy types to native Python types for JSON serialization."""
    def default(self, obj):
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, np.bool_):
            return bool(obj)
        return super().default(obj)


def _sanitize_for_json(obj):
    """Recursively convert numpy types to native Python types."""
    return json.loads(json.dumps(obj, cls=_NumpyEncoder))


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

            # Persist result — sanitize numpy types for JSONB serialization
            result_dict = _sanitize_for_json(result.model_dump())
            report_result = ReportResult(
                job_id=job.id,
                client_id=job.client_id,
                result_json=result_dict,
                row_count_backend=result.summary.get("backend_total"),
                row_count_ga4=result.summary.get("ga4_total"),
                match_rate=result.summary.get("match_rate"),
            )
            db.add(report_result)

            job.status = "completed"
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()

            # C3: Anomaly alert — check if match rate dropped significantly
            await _check_anomaly(db, client, job.id, float(result.summary.get("match_rate", 0)))

        except Exception as e:
            await db.rollback()
            # Re-fetch job after rollback to update status
            job_result2 = await db.execute(select(ReportJob).where(ReportJob.id == job_id))
            job = job_result2.scalar_one_or_none()
            if job:
                job.status = "failed"
                job.error_message = str(e)[:500]
                job.completed_at = datetime.now(timezone.utc)
                await db.commit()
            try:
                await _notify_admins_failure(db, client_id=job.client_id if job else "", job_id=job_id, error=str(e))
            except Exception:
                pass  # Don't let notification failure mask the original error
            raise


async def _check_anomaly(db, client: Client, job_id: str, current_rate: float) -> None:
    """If match rate is >15pp below rolling average of last 10 reports, notify admins."""
    hist_result = await db.execute(
        select(ReportResult)
        .where(ReportResult.client_id == client.id, ReportResult.match_rate.is_not(None))
        .order_by(ReportResult.created_at.desc())
        .limit(11)
    )
    history = [r for r in hist_result.scalars().all() if r.job_id != job_id][:10]

    if len(history) < 3:
        return  # Not enough history to establish a baseline

    avg = sum(float(r.match_rate) for r in history) / len(history)
    if current_rate < avg - 15:
        msg = (
            f"Match rate for {client.name} dropped to {current_rate:.1f}% "
            f"(rolling avg: {avg:.1f}%, delta: {current_rate - avg:.1f}pp)"
        )
        await _notify_admins(db, title=f"Anomaly alert: {client.name}", body=msg, link=f"/clients/{client.id}")


async def _notify_admins_failure(db, client_id: str, job_id: str, error: str) -> None:
    client_result = await db.execute(select(Client).where(Client.id == client_id))
    client = client_result.scalar_one_or_none()
    name = client.name if client else client_id
    await _notify_admins(
        db,
        title=f"Job failed: {name}",
        body=error[:500],
        link="/jobs",
    )


async def _notify_admins(db, title: str, body: str, link: str | None = None) -> None:
    from app.models.user import User
    from app.models.notification import Notification

    admins_result = await db.execute(
        select(User).where(User.role == "admin", User.is_active == True)
    )
    for admin in admins_result.scalars().all():
        db.add(Notification(
            user_id=admin.id,
            title=title,
            body=body,
            link=link,
        ))
    await db.commit()


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
