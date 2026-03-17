import secrets
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.deps import require_admin
from app.models.report_share import ReportShare
from app.models.report_result import ReportResult
from app.models.user import User

router = APIRouter(tags=["Shares"])


@router.post("/admin/jobs/{job_id}/share")
async def create_share(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    result = await db.execute(select(ReportResult).where(ReportResult.job_id == job_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report result not found")

    token = secrets.token_urlsafe(32)
    share = ReportShare(
        token=token,
        report_result_id=report.id,
        created_by=admin.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(share)
    await db.commit()
    return {"token": token, "expires_at": share.expires_at.isoformat()}


@router.get("/share/{token}")
async def get_shared_report(token: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ReportShare).where(ReportShare.token == token))
    share = result.scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=404, detail="Share link not found")
    if share.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Share link has expired")

    rr_result = await db.execute(select(ReportResult).where(ReportResult.id == share.report_result_id))
    report = rr_result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    return {
        "id": report.id,
        "job_id": report.job_id,
        "result_json": report.result_json,
        "match_rate": float(report.match_rate) if report.match_rate else None,
        "created_at": report.created_at.isoformat(),
    }
