import base64
import hashlib
import io
import secrets
from datetime import datetime, timezone, timedelta

import pyotp
import qrcode
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from jose import jwt, JWTError
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.client import Client
from app.models.refresh_token import RefreshToken
from app.schemas.auth import LoginRequest, TokenResponse, RefreshRequest, UserInfo
from app.services.encryption import encrypt, decrypt

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Pydantic schemas ─────────────────────────────────────────────────────────

class TotpVerifyRequest(BaseModel):
    temp_token: str
    totp_code: str


class TotpConfirmRequest(BaseModel):
    totp_code: str


# ── Helpers ──────────────────────────────────────────────────────────────────

def verify_password(plain: str, hashed: str) -> bool:
    # Pre-hash with SHA-256 to avoid bcrypt's 72-byte limit (matches seed.py)
    return pwd_context.verify(hashlib.sha256(plain.encode()).hexdigest(), hashed)


def create_access_token(user_id: str, role: str, client_id: str | None, totp_enabled: bool = False) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_access_expire_minutes)
    payload = {
        "sub": user_id,
        "role": role,
        "client_id": client_id,
        "totp_enabled": totp_enabled,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


async def create_refresh_token(user_id: str, db: AsyncSession) -> str:
    raw_token = secrets.token_urlsafe(64)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_expire_days)
    db_token = RefreshToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
    db.add(db_token)
    await db.commit()
    return raw_token


async def get_client_id_for_user(user: User, db: AsyncSession) -> str | None:
    if user.role != "client":
        return None
    result = await db.execute(select(Client).where(Client.user_id == user.id))
    client = result.scalar_one_or_none()
    return client.id if client else None


def _token_response(user: User, access_token: str, refresh_token: str, client_id: str | None) -> dict:
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {"id": user.id, "email": user.email, "name": user.name, "role": user.role, "client_id": client_id},
    }


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/login")
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Check lockout (same error message — prevents enumeration)
    if user.locked_until and user.locked_until > now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    # Verify password — track failures, lock after 5 consecutive failures
    if not verify_password(data.password, user.password_hash):
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= 5:
            user.locked_until = now + timedelta(minutes=15)
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Successful password — reset lockout counters
    user.failed_login_attempts = 0
    user.locked_until = None

    # Admin with TOTP configured → return temp token only (no session yet)
    if user.role == "admin" and user.totp_secret_enc:
        expire = now + timedelta(minutes=5)
        temp_token = jwt.encode(
            {"sub": user.id, "type": "totp_pending", "exp": expire},
            settings.jwt_secret,
            algorithm=settings.jwt_algorithm,
        )
        await db.commit()
        return JSONResponse({"totp_required": True, "temp_token": temp_token})

    # Client or bootstrap admin (TOTP not yet configured) → issue full session
    await db.commit()
    client_id = await get_client_id_for_user(user, db)
    access_token = create_access_token(user.id, user.role, client_id, totp_enabled=bool(user.totp_secret_enc))
    refresh_token = await create_refresh_token(user.id, db)
    return _token_response(user, access_token, refresh_token, client_id)


@router.post("/totp/verify")
async def totp_verify(data: TotpVerifyRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = jwt.decode(data.temp_token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("type") != "totp_pending":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.totp_secret_enc or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    secret = decrypt(user.totp_secret_enc)
    if not pyotp.TOTP(secret).verify(data.totp_code, valid_window=1):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid 2FA code")

    client_id = await get_client_id_for_user(user, db)
    access_token = create_access_token(user.id, user.role, client_id, totp_enabled=True)
    refresh_token = await create_refresh_token(user.id, db)
    return _token_response(user, access_token, refresh_token, client_id)


@router.post("/totp/setup")
async def totp_setup(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins only")

    secret = pyotp.random_base32()
    uri = pyotp.TOTP(secret).provisioning_uri(name=current_user.email, issuer_name="DRA Platform")

    qr_img = qrcode.make(uri)
    buf = io.BytesIO()
    qr_img.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode()

    current_user.totp_secret_enc = encrypt(secret)
    await db.commit()

    return {"qr_code_base64": qr_b64, "provisioning_uri": uri}


@router.post("/totp/setup/confirm")
async def totp_setup_confirm(data: TotpConfirmRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins only")
    if not current_user.totp_secret_enc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Call /totp/setup first")

    secret = decrypt(current_user.totp_secret_enc)
    if not pyotp.TOTP(secret).verify(data.totp_code, valid_window=1):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid code — scan the QR code again")

    return {"detail": "2FA enabled successfully"}


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

    db_token.revoked = True
    await db.commit()

    client_id = await get_client_id_for_user(user, db)
    new_access_token = create_access_token(user.id, user.role, client_id, totp_enabled=bool(user.totp_secret_enc))
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
