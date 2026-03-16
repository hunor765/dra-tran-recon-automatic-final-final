import io
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import date, timedelta

from app.database import get_db
from app.deps import get_client_user
from app.models.report_job import ReportJob
from app.models.report_result import ReportResult
from app.models.client import Client
from app.models.user import User
from app.schemas.report import ReportResultResponse, ReportJobResponse, ReportGenerateRequest, UpdateNotesRequest

router = APIRouter(prefix="/reports", tags=["Client - Reports"])


async def _get_client_id(user: User, db: AsyncSession) -> str:
    """Returns the client_id for the current user. Admins must pass client_id explicitly elsewhere."""
    if user.role == "client":
        result = await db.execute(select(Client).where(Client.user_id == user.id))
        client = result.scalar_one_or_none()
        if not client:
            raise HTTPException(status_code=404, detail="No client associated with this account")
        return client.id
    # Admin viewing their own reports — shouldn't normally happen, but handled gracefully
    raise HTTPException(status_code=400, detail="Admin must use /admin/jobs endpoint")


@router.get("", response_model=list[ReportJobResponse])
async def list_reports(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_client_user),
):
    client_id = await _get_client_id(user, db)
    result = await db.execute(
        select(ReportJob)
        .where(ReportJob.client_id == client_id)
        .order_by(ReportJob.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{report_id}", response_model=ReportResultResponse)
async def get_report(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_client_user),
):
    client_id = await _get_client_id(user, db)
    result = await db.execute(
        select(ReportResult)
        .where(ReportResult.id == report_id, ReportResult.client_id == client_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # Attach job details
    job_result = await db.execute(select(ReportJob).where(ReportJob.id == report.job_id))
    job = job_result.scalar_one_or_none()
    resp = ReportResultResponse.model_validate(report)
    if job:
        resp.job = ReportJobResponse.model_validate(job)
    return resp


@router.put("/{report_id}/notes")
async def update_notes(
    report_id: str,
    data: UpdateNotesRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_client_user),
):
    client_id = await _get_client_id(user, db)
    result = await db.execute(
        select(ReportResult)
        .where(ReportResult.id == report_id, ReportResult.client_id == client_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.specialist_notes = data.specialist_notes
    await db.commit()
    return {"detail": "Notes saved"}


@router.post("/generate")
async def generate_report(
    data: ReportGenerateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_client_user),
):
    client_id = await _get_client_id(user, db)
    today = date.today()

    if data.period_type == "daily":
        d = today - timedelta(days=1)
        date_from, date_to = d, d
    elif data.period_type == "3month":
        date_from, date_to = today - timedelta(days=90), today
    elif data.period_type == "6month":
        date_from, date_to = today - timedelta(days=180), today
    elif data.period_type == "12month":
        date_from, date_to = today - timedelta(days=365), today
    elif data.period_type == "custom" and data.date_from and data.date_to:
        date_from, date_to = data.date_from, data.date_to
    else:
        raise HTTPException(status_code=400, detail="Invalid period_type")

    job = ReportJob(
        client_id=client_id,
        triggered_by=user.id,
        period_type=data.period_type,
        date_from=date_from,
        date_to=date_to,
        status="pending",
        source_type="api",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    from app.services.report_runner import run_report_job
    background_tasks.add_task(run_report_job, job.id)

    return {"job_id": job.id, "status": "pending"}


@router.get("/{report_id}/export/csv")
async def export_csv(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_client_user),
):
    client_id = await _get_client_id(user, db)
    result = await db.execute(
        select(ReportResult).where(ReportResult.id == report_id, ReportResult.client_id == client_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    import pandas as pd
    data = report.result_json

    # Export payment analysis as primary sheet
    rows = data.get("payment_analysis", [])
    df = pd.DataFrame(rows)
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    buf.seek(0)

    return StreamingResponse(
        io.BytesIO(buf.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="report-{report_id[:8]}.csv"'},
    )


@router.get("/{report_id}/export/xlsx")
async def export_xlsx(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_client_user),
):
    client_id = await _get_client_id(user, db)
    result = await db.execute(
        select(ReportResult).where(ReportResult.id == report_id, ReportResult.client_id == client_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    import pandas as pd
    data = report.result_json
    buf = io.BytesIO()

    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        sections = [
            ("Summary", [data.get("summary", {})]),
            ("Payment Analysis", data.get("payment_analysis", [])),
            ("Shipping Analysis", data.get("shipping_analysis", [])),
            ("Status Analysis", data.get("status_analysis", [])),
            ("Source Medium", data.get("source_medium_analysis", [])),
            ("Temporal", data.get("temporal_analysis", [])),
        ]
        for sheet_name, rows in sections:
            if rows:
                pd.DataFrame(rows if isinstance(rows, list) else [rows]).to_excel(
                    writer, sheet_name=sheet_name, index=False
                )

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="report-{report_id[:8]}.xlsx"'},
    )
