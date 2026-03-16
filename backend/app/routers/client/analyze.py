from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_client_user
from app.models.user import User
from app.services.analysis import ColumnMapping, AnalysisResult, run_analysis
from app.routers.client.upload import uploaded_files

router = APIRouter(prefix="/analyze", tags=["Client - Analyze"])


@router.post("", response_model=AnalysisResult)
async def analyze(
    mapping: ColumnMapping,
    _: User = Depends(get_client_user),
):
    session = uploaded_files.get(mapping.session_id, {}) if mapping.session_id else {}
    if "ga4" not in session or "backend" not in session:
        raise HTTPException(status_code=400, detail="Please upload both GA4 and backend files first")

    try:
        return run_analysis(session["ga4"], session["backend"], mapping)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Analysis error: {e}")
        raise HTTPException(status_code=500, detail="Analysis failed. Please check your data and column mappings.")
