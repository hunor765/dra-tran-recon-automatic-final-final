from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.deps import require_admin
from app.models.audit_log import AuditLog

router = APIRouter(prefix="/audit", tags=["Admin - Audit"])


@router.get("")
async def list_audit_logs(
    action: str | None = None,
    actor_id: str | None = None,
    limit: int = Query(default=100, le=500),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    query = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)
    if action:
        query = query.where(AuditLog.action == action)
    if actor_id:
        query = query.where(AuditLog.actor_id == actor_id)
    result = await db.execute(query)
    logs = result.scalars().all()
    return [
        {
            "id": l.id,
            "actor_id": l.actor_id,
            "actor_email": l.actor_email,
            "action": l.action,
            "target_type": l.target_type,
            "target_id": l.target_id,
            "detail": l.detail,
            "created_at": l.created_at.isoformat(),
        }
        for l in logs
    ]
