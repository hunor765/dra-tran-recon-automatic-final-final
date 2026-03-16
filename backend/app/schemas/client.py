from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional


class ClientCreate(BaseModel):
    name: str
    platform: Optional[str] = "manual"  # 'woocommerce' | 'shopify' | 'manual'
    timezone: str = "UTC"
    vat_rate: float = 19.0
    ga4_includes_vat: bool = True
    backend_includes_vat: bool = True
    # Client portal login
    client_email: Optional[EmailStr] = None
    client_password: Optional[str] = None
    client_name: Optional[str] = None


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    platform: Optional[str] = None
    timezone: Optional[str] = None
    vat_rate: Optional[float] = None
    ga4_includes_vat: Optional[bool] = None
    backend_includes_vat: Optional[bool] = None
    is_active: Optional[bool] = None


class ClientResponse(BaseModel):
    id: str
    user_id: Optional[str]
    name: str
    slug: str
    platform: Optional[str]
    timezone: str
    vat_rate: float
    ga4_includes_vat: bool
    backend_includes_vat: bool
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
