import uuid
from typing import Callable, List, Optional
from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from airgrid.core.config import settings
from airgrid.core.database import get_db
from airgrid.core.security import verify_csrf_token
from airgrid.models.all_models import User, UserSession
from airgrid.schemas.auth import UserRole
from airgrid.services.auth_service import get_valid_session


def get_session_token_from_request(request: Request) -> Optional[str]:
    """
    Extracts the session token from HttpOnly cookie or Authorization Bearer header.
    """
    token = request.cookies.get(settings.AIRGRID_SESSION_COOKIE_NAME)
    if token:
        return token

    # Fallback to Authorization: Bearer <token>
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[7:].strip()

    return None


async def get_current_session(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> UserSession:
    """
    FastAPI dependency that extracts and validates the active server-side session.
    Raises HTTP 401 if missing, expired, or invalid.
    """
    raw_token = get_session_token_from_request(request)
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Session cookie missing.",
            headers={"WWW-Authenticate": "Cookie"},
        )

    session = await get_valid_session(db, raw_token)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired or is invalid. Please log in again.",
            headers={"WWW-Authenticate": "Cookie"},
        )

    return session


async def get_current_user(
    session: UserSession = Depends(get_current_session),
) -> User:
    """
    FastAPI dependency that returns the authenticated User from the valid session.
    """
    if not session.user or not session.user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive or disabled.",
        )
    return session.user


async def get_optional_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """
    Non-blocking dependency that returns the User if a valid session exists, or None.
    """
    raw_token = get_session_token_from_request(request)
    if not raw_token:
        return None
    session = await get_valid_session(db, raw_token)
    if session and session.user and session.user.is_active:
        return session.user
    return None


def require_roles(*allowed_roles: str) -> Callable:
    """
    Dependency factory enforcing Server-Side Role-Based Authorization.
    Allowed canonical roles: administrator, network_engineer, viewer.
    """
    normalized_allowed = [UserRole.normalize(r).value for r in allowed_roles]

    async def role_checker(user: User = Depends(get_current_user)) -> User:
        user_role = UserRole.normalize(user.role).value
        if user_role not in normalized_allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: requires one of [{', '.join(normalized_allowed)}]. Current role: {user_role}",
            )
        return user

    return role_checker


# Shortcuts for common role checks
require_admin = require_roles("administrator")
require_engineer_or_admin = require_roles("administrator", "network_engineer")
require_authenticated = get_current_user


async def verify_csrf(
    request: Request,
    session: UserSession = Depends(get_current_session),
) -> None:
    """
    Enforces Anti-CSRF protection for state-changing HTTP methods on cookie-authenticated requests.
    Validates the X-CSRF-Token header against the HMAC signature bound to the session.
    """
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return

    csrf_token = request.headers.get("X-CSRF-Token")
    if not csrf_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF validation failed: Missing X-CSRF-Token header.",
        )

    if not verify_csrf_token(csrf_token, str(session.id)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF validation failed: Invalid or expired token signature.",
        )


async def check_campus_access(
    campus_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_authenticated),
) -> None:
    """Enforces that the current authenticated user has access to the specified campus."""
    from airgrid.services import campus_service
    await campus_service.require_campus_access(db, current_user, campus_id)

