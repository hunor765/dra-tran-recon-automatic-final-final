import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, DateTime, ForeignKey, Text, Integer, Numeric
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ReportResult(Base):
    __tablename__ = "report_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id: Mapped[str] = mapped_column(String(36), ForeignKey("report_jobs.id", ondelete="CASCADE"), unique=True, nullable=False)
    client_id: Mapped[str] = mapped_column(String(36), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    result_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    specialist_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    row_count_backend: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    row_count_ga4: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    match_rate: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
