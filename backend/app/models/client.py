import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, Numeric, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), unique=True, nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    platform: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # 'woocommerce' | 'shopify' | 'manual'
    timezone: Mapped[str] = mapped_column(String(100), nullable=False, default="UTC")
    vat_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=19.0)
    ga4_includes_vat: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    backend_includes_vat: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
