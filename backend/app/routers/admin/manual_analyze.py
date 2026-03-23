from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone, date
from typing import Optional
import json
import numpy as np

from app.database import get_db
from app.deps import require_admin
from app.models.client import Client
from app.models.report_job import ReportJob
from app.models.report_result import ReportResult
from app.services.analysis import ColumnMapping, run_analysis
from app.routers.client.upload import uploaded_files

router = APIRouter(prefix="/manual-analyze", tags=["Admin - Manual Analyze"])


class _NumpyEncoder(json.JSONEncoder):
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
    return json.loads(json.dumps(obj, cls=_NumpyEncoder))


@router.post("")
async def manual_analyze(
    mapping: ColumnMapping,
    client_id: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_admin),
):
    session = uploaded_files.get(mapping.session_id, {}) if mapping.session_id else {}
    if "ga4" not in session or "backend" not in session:
        raise HTTPException(status_code=400, detail="Please upload both GA4 and backend files first")

    try:
        result = run_analysis(session["ga4"], session["backend"], mapping)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

    result_dict = _sanitize_for_json(result.model_dump())
    response: dict = {"result": result_dict}

    if client_id:
        client_result = await db.execute(select(Client).where(Client.id == client_id))
        client = client_result.scalar_one_or_none()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")

        today = date.today()
        job = ReportJob(
            client_id=client_id,
            triggered_by=admin.id,
            period_type="custom",
            date_from=today,
            date_to=today,
            status="completed",
            source_type="csv",
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
        )
        db.add(job)
        await db.flush()

        report_result = ReportResult(
            job_id=job.id,
            client_id=client_id,
            result_json=result_dict,
            row_count_backend=result.summary.get("backend_total"),
            row_count_ga4=result.summary.get("ga4_total"),
            match_rate=result.summary.get("match_rate"),
        )
        db.add(report_result)
        await db.commit()

        response["job_id"] = job.id
        response["persisted"] = True

    return response
