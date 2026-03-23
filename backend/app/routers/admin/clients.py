import re
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.deps import require_admin
from app.models.client import Client
from app.models.user import User
from app.models.report_result import ReportResult
from app.models.report_job import ReportJob
from app.schemas.client import ClientCreate, ClientUpdate, ClientResponse
from app.services.audit import log_action

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
async def create_client(data: ClientCreate, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    slug = slugify(data.name)
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
    await db.flush()
    await log_action(db, admin, "client.created", "client", client.id, data.name)
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
async def update_client(client_id: str, data: ClientUpdate, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    changes = data.model_dump(exclude_none=True)
    for field, value in changes.items():
        setattr(client, field, value)

    if "is_active" in changes:
        action = "client.enabled" if changes["is_active"] else "client.disabled"
        await log_action(db, admin, action, "client", client_id, client.name)

    await db.commit()
    await db.refresh(client)
    return client


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(client_id: str, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    client.is_active = False
    await log_action(db, admin, "client.disabled", "client", client_id, client.name)
    await db.commit()


@router.post("/{client_id}/impersonate")
async def impersonate_client(
    client_id: str,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_admin),
):
    """Generate a short-lived JWT for the client's user. Admin can view the client portal."""
    from datetime import datetime, timezone, timedelta
    from jose import jwt
    from app.config import settings

    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    if not client.user_id:
        raise HTTPException(status_code=400, detail="This client has no portal user account")

    user_result = await db.execute(select(User).where(User.id == client.user_id))
    client_user = user_result.scalar_one_or_none()
    if not client_user or not client_user.is_active:
        raise HTTPException(status_code=400, detail="Client user account not found or inactive")

    expire = datetime.now(timezone.utc) + timedelta(minutes=5)
    token = jwt.encode(
        {
            "sub": client_user.id,
            "role": "client",
            "client_id": client_id,
            "totp_enabled": False,
            "impersonated_by": admin.id,
            "exp": expire,
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    await log_action(db, admin, "client.impersonated", "client", client_id, client.name)
    await db.commit()
    return {"access_token": token, "client_name": client.name}


# ── C6: Multi-user client accounts ───────────────────────────────────────────

@router.get("/{client_id}/members")
async def list_members(client_id: str, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    from app.models.client_member import ClientMember
    result = await db.execute(
        select(ClientMember, User)
        .join(User, User.id == ClientMember.user_id)
        .where(ClientMember.client_id == client_id)
    )
    rows = result.all()
    return [
        {"id": m.id, "user_id": m.user_id, "email": u.email, "name": u.name, "created_at": m.created_at.isoformat()}
        for m, u in rows
    ]


@router.post("/{client_id}/members")
async def add_member(
    client_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_admin),
):
    """Add a user to a client by email or user_id."""
    from app.models.client_member import ClientMember
    from pydantic import EmailStr

    email = data.get("email")
    user_id = data.get("user_id")

    if email:
        user_result = await db.execute(select(User).where(User.email == email))
        user = user_result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail=f"No user found with email {email}")
        user_id = user.id

    if not user_id:
        raise HTTPException(status_code=400, detail="Provide email or user_id")

    existing = await db.execute(
        select(ClientMember).where(ClientMember.client_id == client_id, ClientMember.user_id == user_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User is already a member")

    member = ClientMember(client_id=client_id, user_id=user_id)
    db.add(member)
    await log_action(db, admin, "client.member_added", "client", client_id, user_id)
    await db.commit()
    return {"detail": "Member added"}


@router.delete("/{client_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    client_id: str,
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_admin),
):
    from app.models.client_member import ClientMember
    result = await db.execute(
        select(ClientMember).where(ClientMember.client_id == client_id, ClientMember.user_id == user_id)
    )
    member = result.scalar_one_or_none()
    if member:
        await db.delete(member)
        await log_action(db, admin, "client.member_removed", "client", client_id, user_id)
        await db.commit()


# ── Scorecard: 3-month rolling KPIs ──────────────────────────────────────────

@router.get("/{client_id}/scorecard")
async def get_client_scorecard(
    client_id: str,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    cutoff = datetime.now(timezone.utc) - timedelta(days=90)

    results_q = await db.execute(
        select(ReportResult)
        .where(ReportResult.client_id == client_id, ReportResult.created_at >= cutoff)
        .order_by(ReportResult.created_at.asc())
    )
    results = results_q.scalars().all()

    jobs_q = await db.execute(
        select(ReportJob)
        .where(ReportJob.client_id == client_id, ReportJob.created_at >= cutoff)
    )
    all_jobs = jobs_q.scalars().all()
    jobs_completed = sum(1 for j in all_jobs if j.status == "completed")
    jobs_failed = sum(1 for j in all_jobs if j.status == "failed")

    if not results:
        return {
            "has_data": False,
            "avg_match_rate": None,
            "avg_exact_match_rate": None,
            "total_backend_value": 0,
            "total_ga4_value": 0,
            "total_discrepancy": 0,
            "jobs_completed": jobs_completed,
            "jobs_failed": jobs_failed,
            "match_rate_trend": [],
            "trend_direction": "stable",
        }

    match_rates = [float(r.match_rate) for r in results if r.match_rate is not None]
    avg_match_rate = round(sum(match_rates) / len(match_rates), 1) if match_rates else None

    exact_match_rates = []
    total_backend_value = 0.0
    total_ga4_value = 0.0

    for r in results:
        rj = r.result_json or {}
        summary = rj.get("summary", {})
        total_backend_value += summary.get("backend_total_value", 0)
        total_ga4_value += summary.get("ga4_total_value", 0)
        vc = rj.get("value_comparison", {})
        emr = vc.get("exact_match_rate")
        if emr is not None:
            exact_match_rates.append(emr)

    avg_exact_match_rate = round(sum(exact_match_rates) / len(exact_match_rates), 1) if exact_match_rates else None
    total_discrepancy = round(abs(total_backend_value - total_ga4_value), 2)

    match_rate_trend = [
        {"date": r.created_at.strftime("%Y-%m-%d"), "match_rate": float(r.match_rate) if r.match_rate else None}
        for r in results if r.match_rate is not None
    ]

    trend_direction = "stable"
    if len(match_rates) >= 4:
        mid = len(match_rates) // 2
        first_half_avg = sum(match_rates[:mid]) / mid
        second_half_avg = sum(match_rates[mid:]) / (len(match_rates) - mid)
        delta = second_half_avg - first_half_avg
        if delta > 2:
            trend_direction = "up"
        elif delta < -2:
            trend_direction = "down"

    return {
        "has_data": True,
        "avg_match_rate": avg_match_rate,
        "avg_exact_match_rate": avg_exact_match_rate,
        "total_backend_value": round(total_backend_value, 2),
        "total_ga4_value": round(total_ga4_value, 2),
        "total_discrepancy": total_discrepancy,
        "jobs_completed": jobs_completed,
        "jobs_failed": jobs_failed,
        "match_rate_trend": match_rate_trend,
        "trend_direction": trend_direction,
    }
