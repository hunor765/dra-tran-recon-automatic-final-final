from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from datetime import date, timedelta

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
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    query = select(ReportJob).order_by(ReportJob.created_at.desc())
    if client_id:
        query = query.where(ReportJob.client_id == client_id)
    if status:
        query = query.where(ReportJob.status == status)
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
