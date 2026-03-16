from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class WooCommerceCredential(BaseModel):
    wc_site_url: str
    wc_consumer_key: str
    wc_consumer_secret: str


class ShopifyCredential(BaseModel):
    shopify_store_domain: str
    shopify_access_token: str


class GA4Credential(BaseModel):
    ga4_property_id: str
    ga4_service_account_json: str  # Full JSON string


class CredentialResponse(BaseModel):
    id: str
    client_id: str
    platform: str
    # WooCommerce (masked)
    wc_site_url: Optional[str] = None
    wc_consumer_key_masked: Optional[str] = None
    # Shopify (masked)
    shopify_store_domain: Optional[str] = None
    # GA4
    ga4_property_id: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
