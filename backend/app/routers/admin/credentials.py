from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.deps import require_admin
from app.models.credential import Credential
from app.models.client import Client
from app.schemas.credential import (
    WooCommerceCredential, ShopifyCredential, GA4Credential, CredentialResponse
)
from app.services.encryption import encrypt, decrypt

router = APIRouter(prefix="/clients", tags=["Admin - Credentials"])


async def _get_client_or_404(client_id: str, db: AsyncSession) -> Client:
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


@router.get("/{client_id}/credentials", response_model=list[CredentialResponse])
async def list_credentials(client_id: str, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    await _get_client_or_404(client_id, db)
    result = await db.execute(select(Credential).where(Credential.client_id == client_id))
    creds = result.scalars().all()
    # Build masked responses
    out = []
    for c in creds:
        masked_key = None
        if c.wc_consumer_key_enc:
            try:
                key = decrypt(c.wc_consumer_key_enc)
                masked_key = key[:6] + "..." + key[-4:]
            except Exception:
                masked_key = "***"
        out.append(CredentialResponse(
            id=c.id,
            client_id=c.client_id,
            platform=c.platform,
            wc_site_url=c.wc_site_url,
            wc_consumer_key_masked=masked_key,
            shopify_store_domain=c.shopify_store_domain,
            ga4_property_id=c.ga4_property_id,
            created_at=c.created_at,
        ))
    return out


@router.put("/{client_id}/credentials/woocommerce", status_code=status.HTTP_200_OK)
async def upsert_woocommerce(
    client_id: str, data: WooCommerceCredential,
    db: AsyncSession = Depends(get_db), _=Depends(require_admin)
):
    await _get_client_or_404(client_id, db)
    result = await db.execute(
        select(Credential).where(Credential.client_id == client_id, Credential.platform == "woocommerce")
    )
    cred = result.scalar_one_or_none()
    if cred:
        cred.wc_site_url = data.wc_site_url
        cred.wc_consumer_key_enc = encrypt(data.wc_consumer_key)
        cred.wc_consumer_secret_enc = encrypt(data.wc_consumer_secret)
    else:
        cred = Credential(
            client_id=client_id,
            platform="woocommerce",
            wc_site_url=data.wc_site_url,
            wc_consumer_key_enc=encrypt(data.wc_consumer_key),
            wc_consumer_secret_enc=encrypt(data.wc_consumer_secret),
        )
        db.add(cred)
    await db.commit()
    return {"detail": "WooCommerce credentials saved"}


@router.put("/{client_id}/credentials/shopify", status_code=status.HTTP_200_OK)
async def upsert_shopify(
    client_id: str, data: ShopifyCredential,
    db: AsyncSession = Depends(get_db), _=Depends(require_admin)
):
    await _get_client_or_404(client_id, db)
    result = await db.execute(
        select(Credential).where(Credential.client_id == client_id, Credential.platform == "shopify")
    )
    cred = result.scalar_one_or_none()
    if cred:
        cred.shopify_store_domain = data.shopify_store_domain
        cred.shopify_access_token_enc = encrypt(data.shopify_access_token)
    else:
        cred = Credential(
            client_id=client_id,
            platform="shopify",
            shopify_store_domain=data.shopify_store_domain,
            shopify_access_token_enc=encrypt(data.shopify_access_token),
        )
        db.add(cred)
    await db.commit()
    return {"detail": "Shopify credentials saved"}


@router.put("/{client_id}/credentials/ga4", status_code=status.HTTP_200_OK)
async def upsert_ga4(
    client_id: str, data: GA4Credential,
    db: AsyncSession = Depends(get_db), _=Depends(require_admin)
):
    await _get_client_or_404(client_id, db)
    result = await db.execute(
        select(Credential).where(Credential.client_id == client_id, Credential.platform == "ga4")
    )
    cred = result.scalar_one_or_none()
    if cred:
        cred.ga4_property_id = data.ga4_property_id
        cred.ga4_service_account_json_enc = encrypt(data.ga4_service_account_json)
    else:
        cred = Credential(
            client_id=client_id,
            platform="ga4",
            ga4_property_id=data.ga4_property_id,
            ga4_service_account_json_enc=encrypt(data.ga4_service_account_json),
        )
        db.add(cred)
    await db.commit()
    return {"detail": "GA4 credentials saved"}


@router.delete("/{client_id}/credentials/{platform}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credential(
    client_id: str, platform: str,
    db: AsyncSession = Depends(get_db), _=Depends(require_admin)
):
    result = await db.execute(
        select(Credential).where(Credential.client_id == client_id, Credential.platform == platform)
    )
    cred = result.scalar_one_or_none()
    if cred:
        await db.delete(cred)
        await db.commit()
