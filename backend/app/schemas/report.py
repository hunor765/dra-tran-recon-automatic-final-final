from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime, date


class ReportGenerateRequest(BaseModel):
    period_type: str  # 'daily' | '3month' | '6month' | '12month' | 'custom'
    date_from: Optional[date] = None
    date_to: Optional[date] = None


class ReportJobResponse(BaseModel):
    id: str
    client_id: str
    client_name: Optional[str] = None
    period_type: str
    date_from: date
    date_to: date
    status: str
    source_type: str
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ReportResultResponse(BaseModel):
    id: str
    job_id: str
    client_id: str
    result_json: Any
    specialist_notes: Optional[str] = None
    row_count_backend: Optional[int] = None
    row_count_ga4: Optional[int] = None
    match_rate: Optional[float] = None
    created_at: datetime
    job: Optional[ReportJobResponse] = None

    model_config = {"from_attributes": True}


class UpdateNotesRequest(BaseModel):
    specialist_notes: str
