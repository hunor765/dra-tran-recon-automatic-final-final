import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Credential(Base):
    __tablename__ = "credentials"
    __table_args__ = (UniqueConstraint("client_id", "platform"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(String(36), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    platform: Mapped[str] = mapped_column(String(50), nullable=False)  # 'woocommerce' | 'shopify' | 'ga4'

    # WooCommerce fields
    wc_site_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    wc_consumer_key_enc: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    wc_consumer_secret_enc: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)

    # Shopify fields
    shopify_store_domain: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    shopify_access_token_enc: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)

    # GA4 fields
    ga4_property_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    ga4_service_account_json_enc: Mapped[Optional[str]] = mapped_column(String(10000), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
