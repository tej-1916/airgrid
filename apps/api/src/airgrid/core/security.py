import hashlib
import hmac
import secrets
import time
from typing import Any, Dict, Optional
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError, VerificationError
from airgrid.core.config import settings

# OWASP Recommended Argon2id Parameters: memory=64MB, iterations=3, parallelism=4
_password_hasher = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
    hash_len=32,
    salt_len=16,
)


def hash_password(password: str) -> str:
    """
    Hashes a raw password using Argon2id with secure memory and time parameters.
    """
    return _password_hasher.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    """
    Verifies a raw password against an Argon2id hash.
    Safely returns False on mismatch, invalid hash format, or empty input.
    """
    if not password or not hashed_password:
        return False
    try:
        return _password_hasher.verify(hashed_password, password)
    except (VerifyMismatchError, InvalidHashError, VerificationError):
        return False
    except Exception:
        return False


def generate_session_token() -> str:
    """
    Generates a cryptographically secure URL-safe session token (32 bytes / 256 bits entropy).
    """
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    """
    Computes a SHA-256 hash of the session token for database lookup.
    Never store raw session tokens in the database.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_csrf_token(session_id: str, secret: Optional[str] = None) -> str:
    """
    Generates a cryptographically signed Anti-CSRF token bound to a session identifier.
    Format: "{entropy}.{hmac_sha256}"
    """
    signing_secret = (secret or settings.AIRGRID_SECRET_KEY).encode("utf-8")
    token_entropy = secrets.token_hex(16)
    message = f"{session_id}:{token_entropy}".encode("utf-8")
    sig = hmac.new(signing_secret, message, hashlib.sha256).hexdigest()
    return f"{token_entropy}.{sig}"


def verify_csrf_token(token: str, session_id: str, secret: Optional[str] = None) -> bool:
    """
    Verifies that a CSRF token matches the signature bound to the session identifier.
    """
    if not token or not session_id or "." not in token:
        return False
    signing_secret = (secret or settings.AIRGRID_SECRET_KEY).encode("utf-8")
    parts = token.split(".", 1)
    if len(parts) != 2:
        return False
    token_entropy, sig = parts
    expected_message = f"{session_id}:{token_entropy}".encode("utf-8")
    expected_sig = hmac.new(signing_secret, expected_message, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected_sig, sig)


def compute_webhook_signature(payload_bytes: bytes, timestamp: int, secret: Optional[str] = None) -> str:
    """
    Computes an HMAC-SHA256 signature for outgoing webhook delivery.
    Format: hmac_sha256("{timestamp}.{body}")
    """
    signing_secret = (secret or settings.AIRGRID_WEBHOOK_SECRET).encode("utf-8")
    message = f"{timestamp}.".encode("utf-8") + payload_bytes
    signature = hmac.new(signing_secret, message, hashlib.sha256).hexdigest()
    return f"sha256={signature}"


def verify_webhook_signature(
    payload_bytes: bytes,
    header_signature: str,
    header_timestamp: int,
    secret: Optional[str] = None,
    tolerance_seconds: int = 300,
) -> bool:
    """
    Verifies incoming webhook signature and checks for replay protection window.
    """
    current_time = int(time.time())
    if abs(current_time - header_timestamp) > tolerance_seconds:
        return False

    expected_sig = compute_webhook_signature(payload_bytes, header_timestamp, secret)
    return hmac.compare_digest(expected_sig, header_signature)


def hash_sensitive_identifier(val: str, salt: str = "airgrid_salt_daily") -> str:
    """
    Hashes sensitive identifiers (e.g. client MAC or IP) for privacy-preserving analytics.
    """
    return hashlib.sha256(f"{salt}:{val}".encode("utf-8")).hexdigest()
