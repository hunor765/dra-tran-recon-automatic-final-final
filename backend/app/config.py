from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://dra:password@localhost:5432/dra_saas"

    # JWT
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_expire_minutes: int = 60        # 1 hour
    jwt_refresh_expire_days: int = 7

    # Encryption key for API credentials (Fernet key)
    # Generate with: from cryptography.fernet import Fernet; Fernet.generate_key().decode()
    encryption_key: str = "change-me-generate-real-fernet-key"

    # CORS
    allowed_origins: list[str] = ["http://localhost:3000"]

    # App
    app_env: str = "development"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
