import threading
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple
from fastapi import HTTPException, status
from sqlalchemy import select, update, func, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from airgrid.core.config import settings
from airgrid.core.logging import logger
from airgrid.core.security import (
    hash_password,
    verify_password,
    generate_session_token,
    hash_session_token,
)
from airgrid.models.all_models import User, UserSession, AuditLog
from airgrid.schemas.auth import UserRole


class LoginRateLimiter:
    """
    Thread-safe in-memory sliding window rate limiter for login attempts.
    Tracks failure timestamps by client IP and email to mitigate brute-force and credential stuffing.
    """

    def __init__(self, max_attempts: int = 5, window_seconds: int = 300):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._failures: Dict[str, List[float]] = {}
        self._lock = threading.Lock()

    def _cleanup(self, now: float):
        cutoff = now - self.window_seconds
        for key in list(self._failures.keys()):
            valid = [ts for ts in self._failures[key] if ts > cutoff]
            if valid:
                self._failures[key] = valid
            else:
                del self._failures[key]

    def is_rate_limited(self, key: str) -> Tuple[bool, int]:
        now = time.time()
        with self._lock:
            self._cleanup(now)
            attempts = self._failures.get(key, [])
            if len(attempts) >= self.max_attempts:
                oldest_in_window = min(attempts)
                retry_after = max(1, int(self.window_seconds - (now - oldest_in_window)))
                return True, retry_after
            return False, 0

    def record_failure(self, key: str) -> None:
        now = time.time()
        with self._lock:
            self._cleanup(now)
            if key not in self._failures:
                self._failures[key] = []
            self._failures[key].append(now)

    def reset(self, key: str) -> None:
        with self._lock:
            if key in self._failures:
                del self._failures[key]


# Global instance of rate limiter
login_rate_limiter = LoginRateLimiter(
    max_attempts=settings.AIRGRID_RATE_LIMIT_LOGIN_ATTEMPTS,
    window_seconds=settings.AIRGRID_RATE_LIMIT_WINDOW_SECONDS,
)


async def is_login_rate_limited(
    db: AsyncSession,
    email: str,
    client_ip: Optional[str] = None,
) -> Tuple[bool, int]:
    """
    Hybrid distributed rate limiter:
    1. Fast in-memory check for micro-burst defense.
    2. Persistent PostgreSQL AuditLog query ensuring rate limits survive server restarts
       and synchronize across multi-worker Uvicorn processes and distributed containers.
    """
    normalized_email = email.lower().strip()
    rate_limit_keys = [f"ip:{client_ip or 'unknown'}", f"email:{normalized_email}"]

    # 1. Fast in-memory check
    for key in rate_limit_keys:
        is_limited, retry_after = login_rate_limiter.is_rate_limited(key)
        if is_limited:
            return True, retry_after

    # 2. Database persistent check
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=settings.AIRGRID_RATE_LIMIT_WINDOW_SECONDS)
        conditions = [AuditLog.resource_id == normalized_email]
        if client_ip and client_ip not in ("unknown", "127.0.0.1"):
            conditions.append(AuditLog.ip_address == client_ip)

        stmt = (
            select(AuditLog.created_at)
            .where(
                AuditLog.action == "auth.login.failure",
                AuditLog.created_at >= cutoff,
                or_(*conditions),
            )
            .order_by(AuditLog.created_at.asc())
        )
        result = await db.execute(stmt)
        failure_timestamps = result.scalars().all()

        if len(failure_timestamps) >= settings.AIRGRID_RATE_LIMIT_LOGIN_ATTEMPTS:
            oldest = failure_timestamps[0]
            if oldest.tzinfo is None:
                oldest = oldest.replace(tzinfo=timezone.utc)
            elapsed = (datetime.now(timezone.utc) - oldest).total_seconds()
            retry_after = max(1, int(settings.AIRGRID_RATE_LIMIT_WINDOW_SECONDS - elapsed))

            # Synchronize in-memory cache so subsequent checks fast-reject
            for key in rate_limit_keys:
                if not login_rate_limiter.is_rate_limited(key)[0]:
                    for _ in range(settings.AIRGRID_RATE_LIMIT_LOGIN_ATTEMPTS):
                        login_rate_limiter.record_failure(key)

            return True, retry_after
    except Exception as e:
        logger.warning("Database rate limit query failed; falling back to in-memory: %s", e)

    return False, 0


async def log_auth_audit_event(
    db: AsyncSession,
    action: str,
    actor_id: Optional[uuid.UUID] = None,
    ip_address: Optional[str] = None,
    payload: Optional[dict] = None,
) -> None:
    """
    Records an authentication or user management event in the database AuditLog
    and writes to application logs. NEVER log passwords, session tokens, or raw secrets.
    """
    safe_payload = payload.copy() if payload else {}
    # Double-check redaction
    for sensitive_key in ("password", "token", "raw_token", "secret", "cookie"):
        if sensitive_key in safe_payload:
            safe_payload[sensitive_key] = "[REDACTED]"

    audit_entry = AuditLog(
        actor_id=actor_id,
        action=action,
        resource_type="auth",
        resource_id=str(actor_id) if actor_id else safe_payload.get("email"),
        payload=safe_payload,
        ip_address=ip_address,
    )
    db.add(audit_entry)
    try:
        await db.commit()
    except Exception as e:
        logger.error("Failed to commit audit log: %s", e)
        await db.rollback()

    logger.info(
        "AUTH_AUDIT action=%s actor=%s ip=%s payload=%s",
        action,
        actor_id,
        ip_address,
        safe_payload,
    )


async def create_user_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Tuple[UserSession, str]:
    """
    Generates a high-entropy session token, hashes it with SHA-256 for PostgreSQL storage,
    and returns (session_model, raw_session_token).
    """
    raw_token = generate_session_token()
    token_hash = hash_session_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.AIRGRID_SESSION_MAX_AGE_SECONDS)

    session = UserSession(
        user_id=user_id,
        session_token_hash=token_hash,
        ip_address=ip_address,
        user_agent=user_agent[:512] if user_agent else None,
        is_revoked=False,
        expires_at=expires_at,
        last_active_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return session, raw_token


async def get_valid_session(db: AsyncSession, raw_token: Optional[str]) -> Optional[UserSession]:
    """
    Retrieves and validates a session from its raw token:
    - Verifies token hash exists and is not revoked.
    - Verifies session has not exceeded absolute expiration.
    - Verifies session has not exceeded idle timeout.
    - Verifies associated user exists and is active.
    - Touches last_active_at.
    """
    if not raw_token:
        return None

    token_hash = hash_session_token(raw_token)
    stmt = (
        select(UserSession)
        .options(selectinload(UserSession.user))
        .where(
            UserSession.session_token_hash == token_hash,
            UserSession.is_revoked == False,
        )
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        return None

    now = datetime.now(timezone.utc)

    # 1. Check absolute expiration
    if session.expires_at < now:
        session.is_revoked = True
        await db.commit()
        return None

    # 2. Check idle timeout
    idle_limit = timedelta(seconds=settings.AIRGRID_SESSION_IDLE_TIMEOUT_SECONDS)
    # Ensure timezone aware
    last_active = session.last_active_at
    if last_active.tzinfo is None:
        last_active = last_active.replace(tzinfo=timezone.utc)
    if now - last_active > idle_limit:
        session.is_revoked = True
        await db.commit()
        return None

    # 3. Check user status
    if not session.user or not session.user.is_active:
        return None

    # Update last_active_at
    session.last_active_at = now
    await db.commit()

    return session


async def revoke_session(db: AsyncSession, raw_token: str) -> bool:
    """Revokes a single active session by its raw token."""
    if not raw_token:
        return False
    token_hash = hash_session_token(raw_token)
    stmt = (
        update(UserSession)
        .where(UserSession.session_token_hash == token_hash)
        .values(is_revoked=True)
    )
    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount > 0


async def revoke_all_user_sessions(db: AsyncSession, user_id: uuid.UUID) -> int:
    """Revokes all active sessions for a given user."""
    stmt = (
        update(UserSession)
        .where(UserSession.user_id == user_id, UserSession.is_revoked == False)
        .values(is_revoked=True)
    )
    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount


async def authenticate_user(
    db: AsyncSession,
    email: str,
    password: str,
    client_ip: Optional[str] = None,
) -> User:
    """
    Authenticates user with rate limiting and safe error messages.
    Throws 429 on rate limit, 401 on bad credentials.
    """
    normalized_email = email.lower().strip()
    rate_limit_keys = [f"ip:{client_ip or 'unknown'}", f"email:{normalized_email}"]

    is_limited, retry_after = await is_login_rate_limited(db, normalized_email, client_ip)
    if is_limited:
        await log_auth_audit_event(
            db,
            action="auth.rate_limited",
            ip_address=client_ip,
            payload={"email": normalized_email, "retry_after": retry_after},
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts. Please try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )

    # Query user
    stmt = select(User).where(User.email == normalized_email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    # Generic error message to prevent account enumeration
    invalid_credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password",
    )

    if not user:
        for key in rate_limit_keys:
            login_rate_limiter.record_failure(key)
        await log_auth_audit_event(
            db,
            action="auth.login.failure",
            ip_address=client_ip,
            payload={"email": normalized_email, "reason": "user_not_found"},
        )
        raise invalid_credentials_exc

    if not verify_password(password, user.hashed_password):
        for key in rate_limit_keys:
            login_rate_limiter.record_failure(key)
        await log_auth_audit_event(
            db,
            action="auth.login.failure",
            actor_id=user.id,
            ip_address=client_ip,
            payload={"email": normalized_email, "reason": "invalid_password"},
        )
        raise invalid_credentials_exc

    if not user.is_active:
        # Don't record failure if password was correct, but safely reject
        await log_auth_audit_event(
            db,
            action="auth.login.failure",
            actor_id=user.id,
            ip_address=client_ip,
            payload={"email": normalized_email, "reason": "account_inactive"},
        )
        raise invalid_credentials_exc

    # Successful authentication: reset rate limiter
    for key in rate_limit_keys:
        login_rate_limiter.reset(key)

    await log_auth_audit_event(
        db,
        action="auth.login.success",
        actor_id=user.id,
        ip_address=client_ip,
        payload={"email": normalized_email, "role": user.role},
    )

    return user


async def create_user(
    db: AsyncSession,
    email: str,
    password: str,
    full_name: str,
    role: str = "viewer",
    actor_id: Optional[uuid.UUID] = None,
    ip_address: Optional[str] = None,
) -> User:
    """
    Creates a new user with Argon2id hashed password and canonical role.
    """
    normalized_email = email.lower().strip()
    canonical_role = UserRole.normalize(role).value

    # Check uniqueness
    existing_stmt = select(User).where(User.email == normalized_email)
    existing_result = await db.execute(existing_stmt)
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email address already exists.",
        )

    if len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters in length.",
        )

    hashed_pw = hash_password(password)
    user = User(
        email=normalized_email,
        hashed_password=hashed_pw,
        full_name=full_name.strip(),
        role=canonical_role,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    await log_auth_audit_event(
        db,
        action="auth.user.created",
        actor_id=actor_id,
        ip_address=ip_address,
        payload={"created_user_id": str(user.id), "email": user.email, "role": user.role},
    )

    return user


async def update_user_status(
    db: AsyncSession,
    user_id: uuid.UUID,
    is_active: Optional[bool] = None,
    role: Optional[str] = None,
    actor_id: Optional[uuid.UUID] = None,
    ip_address: Optional[str] = None,
) -> User:
    """
    Updates user active status or role. Revokes all active sessions if user is deactivated.
    """
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if is_active is not None:
        user.is_active = is_active
        if not is_active:
            # Revoke all sessions for deactivated user
            await revoke_all_user_sessions(db, user_id)

    if role is not None:
        user.role = UserRole.normalize(role).value

    await db.commit()
    await db.refresh(user)

    await log_auth_audit_event(
        db,
        action="auth.user.updated",
        actor_id=actor_id,
        ip_address=ip_address,
        payload={"target_user_id": str(user.id), "is_active": user.is_active, "role": user.role},
    )

    return user
