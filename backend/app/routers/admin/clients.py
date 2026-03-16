import re
from fastapi import APIRouter, Depends, HTTPException, status
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.deps import require_admin
from app.models.client import Client
from app.models.user import User
from app.schemas.client import ClientCreate, ClientUpdate, ClientResponse

router = APIRouter(prefix="/clients", tags=["Admin - Clients"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:100]


@router.get("", response_model=list[ClientResponse])
async def list_clients(db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(select(Client).order_by(Client.name))
    return result.scalars().all()


@router.post("", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
async def create_client(data: ClientCreate, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    slug = slugify(data.name)
    # Ensure unique slug
    existing_slug = await db.execute(select(Client).where(Client.slug == slug))
    if existing_slug.scalar_one_or_none():
        slug = f"{slug}-{len(slug)}"

    user_id = None
    if data.client_email and data.client_password:
        existing_user = await db.execute(select(User).where(User.email == data.client_email))
        if existing_user.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Client email already registered")
        user = User(
            email=data.client_email,
            password_hash=pwd_context.hash(data.client_password),
            name=data.client_name or data.name,
            role="client",
        )
        db.add(user)
        await db.flush()
        user_id = user.id

    client = Client(
        user_id=user_id,
        name=data.name,
        slug=slug,
        platform=data.platform,
        timezone=data.timezone,
        vat_rate=data.vat_rate,
        ga4_includes_vat=data.ga4_includes_vat,
        backend_includes_vat=data.backend_includes_vat,
    )
    db.add(client)
    await db.commit()
    await db.refresh(client)
    return client


@router.get("/{client_id}", response_model=ClientResponse)
async def get_client(client_id: str, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


@router.put("/{client_id}", response_model=ClientResponse)
async def update_client(client_id: str, data: ClientUpdate, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(client, field, value)

    await db.commit()
    await db.refresh(client)
    return client


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(client_id: str, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    client.is_active = False
    await db.commit()
