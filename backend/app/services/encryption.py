from cryptography.fernet import Fernet
from app.config import settings


def _get_fernet() -> Fernet:
    return Fernet(settings.encryption_key.encode())


def encrypt(plaintext: str) -> str:
    """Encrypt a plaintext string, returns a Fernet token string."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    """Decrypt a Fernet token string back to plaintext."""
    return _get_fernet().decrypt(ciphertext.encode()).decode()
