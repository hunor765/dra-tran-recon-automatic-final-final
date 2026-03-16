import io
import uuid
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
import pandas as pd

from app.deps import get_client_user
from app.models.user import User

router = APIRouter(prefix="/upload", tags=["Client - Upload"])

# In-memory session storage (same as original)
uploaded_files: dict = {}
MAX_FILE_SIZE = 150 * 1024 * 1024  # 150 MB


def _read_file(contents: bytes, filename: str) -> pd.DataFrame:
    if filename.endswith(".csv"):
        return pd.read_csv(io.BytesIO(contents))
    elif filename.endswith((".xlsx", ".xls")):
        return pd.read_excel(io.BytesIO(contents))
    raise HTTPException(status_code=400, detail="Unsupported file format. Use CSV or Excel.")


@router.post("/ga4")
async def upload_ga4(
    file: UploadFile = File(...),
    _: User = Depends(get_client_user),
):
    try:
        contents = await file.read()
        if len(contents) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="File too large. Maximum size is 150 MB.")

        df = _read_file(contents, file.filename or "")
        session_id = str(uuid.uuid4())
        uploaded_files[session_id] = {"ga4": df}

        return {
            "success": True,
            "filename": file.filename,
            "rows": len(df),
            "columns": list(df.columns),
            "sample": df.head(3).fillna("").to_dict(orient="records"),
            "session_id": session_id,
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to parse file. Please check the format.")


@router.post("/backend")
async def upload_backend(
    file: UploadFile = File(...),
    session_id: str = Form(""),
    _: User = Depends(get_client_user),
):
    try:
        contents = await file.read()
        if len(contents) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="File too large. Maximum size is 150 MB.")

        df = _read_file(contents, file.filename or "")

        if session_id and session_id in uploaded_files:
            uploaded_files[session_id]["backend"] = df
        else:
            if not session_id:
                session_id = str(uuid.uuid4())
            uploaded_files[session_id] = {"backend": df}

        return {
            "success": True,
            "filename": file.filename,
            "rows": len(df),
            "columns": list(df.columns),
            "sample": df.head(3).fillna("").to_dict(orient="records"),
            "session_id": session_id,
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to parse file. Please check the format.")


@router.get("/columns")
def get_columns(session_id: str = "", _: User = Depends(get_client_user)):
    session = uploaded_files.get(session_id, {}) if session_id else {}
    result = {}
    if "ga4" in session:
        result["ga4"] = list(session["ga4"].columns)
    if "backend" in session:
        result["backend"] = list(session["backend"].columns)
    return result
