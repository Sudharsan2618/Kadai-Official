"""Encryption-at-rest for per-shop Meta access tokens (Fernet, symmetric).

Tokens are long-lived and let anyone message a seller's customers, so they
never touch the DB in plaintext. Key comes from WA_TOKEN_ENC_KEY (generate one
with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())").
Mock mode never calls this."""
from cryptography.fernet import Fernet, InvalidToken

from app.settings import settings


class TokenCryptoError(Exception):
    pass


def _fernet() -> Fernet:
    if not settings.wa.token_enc_key:
        raise TokenCryptoError(
            "WA_TOKEN_ENC_KEY is not set — required in cloud mode to store Meta tokens safely")
    try:
        return Fernet(settings.wa.token_enc_key.encode())
    except Exception:
        raise TokenCryptoError("WA_TOKEN_ENC_KEY is not a valid Fernet key")


def encrypt_token(plain: str) -> str:
    if not plain:
        return ""
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_token(enc: str) -> str:
    if not enc:
        return ""
    try:
        return _fernet().decrypt(enc.encode()).decode()
    except InvalidToken:
        raise TokenCryptoError("Stored token can't be decrypted — was WA_TOKEN_ENC_KEY rotated?")
