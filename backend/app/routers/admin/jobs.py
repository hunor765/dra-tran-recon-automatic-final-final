from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload
from datetime import date, timedelta, datetime, timezone
from pydantic import BaseModel
from typing import Any

from app.database import get_db
from app.deps import require_admin
from app.models.report_job import ReportJob
from app.models.report_result import ReportResult
from app.models.client import Client
from app.schemas.report import ReportJobResponse, ReportResultResponse, ReportGenerateRequest, UpdateNotesRequest

router = APIRouter(prefix="/jobs", tags=["Admin - Jobs"])


@router.get("", response_model=list[ReportJobResponse])
async def list_all_jobs(
    client_id: str | None = None,
    status: str | None = None,
    limit: int | None = None,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    query = select(ReportJob).order_by(ReportJob.created_at.desc())
    if client_id:
        query = query.where(ReportJob.client_id == client_id)
    if status:
        query = query.where(ReportJob.status == status)
    if limit:
        query = query.limit(limit)
    result = await db.execute(query)
    jobs = result.scalars().all()

    # Enrich with client name
    out = []
    for job in jobs:
        client_result = await db.execute(select(Client).where(Client.id == job.client_id))
        client = client_result.scalar_one_or_none()
        job_resp = ReportJobResponse.model_validate(job)
        job_resp.client_name = client.name if client else None
        out.append(job_resp)
    return out


@router.post("/{client_id}/trigger")
async def trigger_report(
    client_id: str,
    data: ReportGenerateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_admin),
):
    client_result = await db.execute(select(Client).where(Client.id == client_id))
    client = client_result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    date_from, date_to = _compute_date_range(data)

    job = ReportJob(
        client_id=client_id,
        triggered_by=admin.id,
        period_type=data.period_type,
        date_from=date_from,
        date_to=date_to,
        status="pending",
        source_type="api",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Run in background
    from app.services.report_runner import run_report_job
    background_tasks.add_task(run_report_job, job.id)

    return {"job_id": job.id, "status": "pending"}


@router.post("/trigger-all")
async def trigger_all_clients(
    data: ReportGenerateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_admin),
):
    """Trigger a report job for every active client that has credentials configured."""
    from app.models.credential import Credential
    from app.services.report_runner import run_report_job

    clients_result = await db.execute(select(Client).where(Client.is_active == True))
    clients = clients_result.scalars().all()

    date_from, date_to = _compute_date_range(data)
    created = []

    for client in clients:
        # Only trigger if at least one credential exists
        cred_result = await db.execute(
            select(Credential).where(Credential.client_id == client.id).limit(1)
        )
        if not cred_result.scalar_one_or_none():
            continue

        job = ReportJob(
            client_id=client.id,
            triggered_by=admin.id,
            period_type=data.period_type,
            date_from=date_from,
            date_to=date_to,
            status="pending",
            source_type="api",
        )
        db.add(job)
        await db.flush()
        created.append(job.id)
        background_tasks.add_task(run_report_job, job.id)

    await db.commit()
    return {"jobs_created": len(created), "job_ids": created}


@router.get("/dashboard-stats")
async def dashboard_stats(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    """Return time-series data for dashboard charts (last 30 days)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    # Jobs per day (last 30 days)
    jobs_result = await db.execute(
        select(ReportJob).where(ReportJob.created_at >= cutoff).order_by(ReportJob.created_at)
    )
    jobs = jobs_result.scalars().all()

    # Aggregate by date
    from collections import defaultdict
    daily_jobs: dict[str, dict] = defaultdict(lambda: {"completed": 0, "failed": 0, "total": 0})
    for job in jobs:
        d = job.created_at.strftime("%Y-%m-%d")
        daily_jobs[d]["total"] += 1
        if job.status == "completed":
            daily_jobs[d]["completed"] += 1
        elif job.status == "failed":
            daily_jobs[d]["failed"] += 1

    # Match rate trend (completed jobs with results)
    results_q = await db.execute(
        select(ReportResult)
        .where(ReportResult.created_at >= cutoff, ReportResult.match_rate.is_not(None))
        .order_by(ReportResult.created_at)
    )
    results = results_q.scalars().all()

    daily_rates: dict[str, list] = defaultdict(list)
    for r in results:
        d = r.created_at.strftime("%Y-%m-%d")
        daily_rates[d].append(float(r.match_rate))

    match_rate_trend = [
        {"date": d, "avg_match_rate": round(sum(rates) / len(rates), 1)}
        for d, rates in sorted(daily_rates.items())
    ]

    jobs_per_day = [
        {"date": d, **counts}
        for d, counts in sorted(daily_jobs.items())
    ]

    return {"jobs_per_day": jobs_per_day, "match_rate_trend": match_rate_trend}


@router.get("/{job_id}/result", response_model=ReportResultResponse)
async def get_job_result(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    result = await db.execute(select(ReportResult).where(ReportResult.job_id == job_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report result not found")

    job_result = await db.execute(select(ReportJob).where(ReportJob.id == report.job_id))
    job = job_result.scalar_one_or_none()
    resp = ReportResultResponse.model_validate(report)
    if job:
        resp.job = ReportJobResponse.model_validate(job)
    return resp


@router.put("/{job_id}/notes")
async def update_job_notes(
    job_id: str,
    data: UpdateNotesRequest,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    result = await db.execute(select(ReportResult).where(ReportResult.job_id == job_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report result not found")
    report.specialist_notes = data.specialist_notes
    await db.commit()
    return {"detail": "Notes saved"}


@router.get("/compare")
async def compare_reports(
    a: str,
    b: str,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    """Return delta between two report results for the same client."""
    result_a = await db.execute(select(ReportResult).where(ReportResult.job_id == a))
    rr_a = result_a.scalar_one_or_none()
    result_b = await db.execute(select(ReportResult).where(ReportResult.job_id == b))
    rr_b = result_b.scalar_one_or_none()

    if not rr_a or not rr_b:
        raise HTTPException(status_code=404, detail="One or both report results not found")

    def _summary(rr: ReportResult) -> dict:
        s = rr.result_json.get("summary", {})
        return {
            "job_id": rr.job_id,
            "match_rate": float(rr.match_rate or 0),
            "ga4_total": s.get("ga4_total", 0),
            "backend_total": s.get("backend_total", 0),
            "ga4_total_value": s.get("ga4_total_value", 0),
            "backend_total_value": s.get("backend_total_value", 0),
            "recommendations_count": len(rr.result_json.get("recommendations", [])),
        }

    sa = _summary(rr_a)
    sb = _summary(rr_b)

    delta = {
        "match_rate": round(sb["match_rate"] - sa["match_rate"], 2),
        "ga4_total": sb["ga4_total"] - sa["ga4_total"],
        "backend_total": sb["backend_total"] - sa["backend_total"],
        "ga4_total_value": round(sb["ga4_total_value"] - sa["ga4_total_value"], 2),
        "backend_total_value": round(sb["backend_total_value"] - sa["backend_total_value"], 2),
        "recommendations_count": sb["recommendations_count"] - sa["recommendations_count"],
    }

    return {"report_a": sa, "report_b": sb, "delta": delta}


def _compute_date_range(data: ReportGenerateRequest) -> tuple[date, date]:
    today = date.today()
    if data.period_type == "daily":
        d = today - timedelta(days=1)
        return d, d
    elif data.period_type == "3month":
        return today - timedelta(days=90), today
    elif data.period_type == "6month":
        return today - timedelta(days=180), today
    elif data.period_type == "12month":
        return today - timedelta(days=365), today
    elif data.period_type == "custom" and data.date_from and data.date_to:
        return data.date_from, data.date_to
    else:
        raise HTTPException(status_code=400, detail="Invalid period_type or missing date_from/date_to for custom")
