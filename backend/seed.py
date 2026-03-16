#!/usr/bin/env python3
"""
Seed the database with an initial admin user.

Usage:
    python seed.py --email admin@example.com --password changeme --name "Admin"

Run from inside the backend/ directory after `alembic upgrade head`.
"""
import argparse
import asyncio
import hashlib
import sys
import uuid
from datetime import datetime, timezone

from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Must be importable from backend/ directory
from app.database import AsyncSessionLocal, engine, Base
from app.models.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    # Pre-hash with SHA-256 to avoid bcrypt's 72-byte limit
    return pwd_context.hash(hashlib.sha256(password.encode()).hexdigest())


async def seed(email: str, password: str, name: str) -> None:
    async with AsyncSessionLocal() as session:
        # Check if admin already exists
        result = await session.execute(select(User).where(User.email == email))
        existing = result.scalars().first()
        if existing:
            print(f"User {email} already exists (role={existing.role}). Skipping.")
            return

        user = User(
            id=str(uuid.uuid4()),
            email=email,
            password_hash=hash_password(password),
            name=name,
            role="admin",
            is_active=True,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        session.add(user)
        await session.commit()
        print(f"Created admin user: {email}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed initial admin user")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--name", default="Admin")
    args = parser.parse_args()

    asyncio.run(seed(args.email, args.password, args.name))


if __name__ == "__main__":
    main()
