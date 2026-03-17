"""Lightweight audit logging helper — write from any router."""
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.user import User


async def log_action(
    db: AsyncSession,
    actor: User,
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    detail: Optional[str] = None,
) -> None:
    entry = AuditLog(
        actor_id=actor.id,
        actor_email=actor.email,
        action=action,
        target_type=target_type,
        target_id=target_id,
        detail=detail,
        created_at=datetime.now(timezone.utc),
    )
    db.add(entry)
    # Caller is responsible for committing
