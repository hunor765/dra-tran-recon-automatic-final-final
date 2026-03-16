import hashlib
import secrets
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.client import Client
from app.models.refresh_token import RefreshToken
from app.schemas.auth import LoginRequest, TokenResponse, RefreshRequest, UserInfo

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain: str, hashed: str) -> bool:
    # Pre-hash with SHA-256 to avoid bcrypt's 72-byte limit (matches seed.py)
    return pwd_context.verify(hashlib.sha256(plain.encode()).hexdigest(), hashed)


def create_access_token(user_id: str, role: str, client_id: str | None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_access_expire_minutes)
    payload = {
        "sub": user_id,
        "role": role,
        "client_id": client_id,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


async def create_refresh_token(user_id: str, db: AsyncSession) -> str:
    raw_token = secrets.token_urlsafe(64)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_expire_days)

    db_token = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(db_token)
    await db.commit()
    return raw_token


async def get_client_id_for_user(user: User, db: AsyncSession) -> str | None:
    if user.role != "client":
        return None
    result = await db.execute(select(Client).where(Client.user_id == user.id))
    client = result.scalar_one_or_none()
    return client.id if client else None


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    client_id = await get_client_id_for_user(user, db)
    access_token = create_access_token(user.id, user.role, client_id)
    refresh_token = await create_refresh_token(user.id, db)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserInfo(id=user.id, email=user.email, name=user.name, role=user.role, client_id=client_id),
    )


@router.post("/refresh")
async def refresh(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    token_hash = hashlib.sha256(data.refresh_token.encode()).hexdigest()
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked == False,
        )
    )
    db_token = result.scalar_one_or_none()
    if not db_token or db_token.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    user_result = await db.execute(select(User).where(User.id == db_token.user_id))
    user = user_result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Rotate: revoke old, issue new
    db_token.revoked = True
    await db.commit()

    client_id = await get_client_id_for_user(user, db)
    new_access_token = create_access_token(user.id, user.role, client_id)
    new_refresh_token = await create_refresh_token(user.id, db)

    return {"access_token": new_access_token, "refresh_token": new_refresh_token}


@router.post("/logout")
async def logout(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    token_hash = hashlib.sha256(data.refresh_token.encode()).hexdigest()
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    db_token = result.scalar_one_or_none()
    if db_token:
        db_token.revoked = True
        await db.commit()
    return {"detail": "Logged out"}


@router.get("/me", response_model=UserInfo)
async def me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    client_id = await get_client_id_for_user(user, db)
    return UserInfo(id=user.id, email=user.email, name=user.name, role=user.role, client_id=client_id)
