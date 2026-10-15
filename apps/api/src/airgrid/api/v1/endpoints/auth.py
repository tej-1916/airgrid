import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from airgrid.api.deps import (
    get_current_session,
    get_current_user,
    get_optional_current_user,
    get_session_token_from_request,
    require_admin,
    verify_csrf,
)
from airgrid.core.config import settings
from airgrid.core.database import get_db
from airgrid.core.security import generate_csrf_token
from airgrid.models.all_models import User, UserSession
from airgrid.schemas.auth import (
    CSRFResponse,
    CreateUserRequest,
    LoginRequest,
    LoginResponse,
    SessionStatusResponse,
    UpdateUserStatusRequest,
    UserResponse,
)
from airgrid.services.auth_service import (
    authenticate_user,
    create_user,
    create_user_session,
    get_valid_session,
    log_auth_audit_event,
    revoke_session,
    update_user_status,
)

router = APIRouter(tags=["Authentication & Users"])


@router.post("/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """
    Authenticate user credentials with Argon2id verification and sliding-window rate limiting.
    Issues a cryptographically secure HttpOnly session cookie and returns Anti-CSRF token.
    """
    client_ip = request.client.host if request.client else "127.0.0.1"
    user_agent = request.headers.get("user-agent")

    user = await authenticate_user(
        db=db,
        email=payload.email,
        password=payload.password,
        client_ip=client_ip,
    )

    session, raw_token = await create_user_session(
        db=db,
        user_id=user.id,
        ip_address=client_ip,
        user_agent=user_agent,
    )

    csrf_token = generate_csrf_token(str(session.id))

    is_https = (
        request.url.scheme == "https"
        or request.headers.get("x-forwarded-proto") == "https"
    )
    cookie_secure = settings.get_cookie_secure(request_is_https=is_https)

    # Set secure HttpOnly session cookie
    response.set_cookie(
        key=settings.AIRGRID_SESSION_COOKIE_NAME,
        value=raw_token,
        max_age=settings.AIRGRID_SESSION_MAX_AGE_SECONDS,
        httponly=True,
        secure=cookie_secure,
        samesite=settings.AIRGRID_COOKIE_SAMESITE,
        path="/",
    )

    # Set accessible CSRF cookie
    response.set_cookie(
        key=settings.AIRGRID_CSRF_COOKIE_NAME,
        value=csrf_token,
        max_age=settings.AIRGRID_SESSION_MAX_AGE_SECONDS,
        httponly=False,
        secure=cookie_secure,
        samesite=settings.AIRGRID_COOKIE_SAMESITE,
        path="/",
    )

    return LoginResponse(
        user=UserResponse.model_validate(user),
        csrf_token=csrf_token,
        message="Authentication successful",
    )


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    session: UserSession = Depends(get_current_session),
    _csrf: None = Depends(verify_csrf),
):
    """
    Explicitly terminates the current session:
    - Revokes session record in PostgreSQL
    - Clears HttpOnly session and CSRF cookies
    - Logs audit event
    """
    raw_token = get_session_token_from_request(request)
    if raw_token:
        await revoke_session(db, raw_token)

    is_https = (
        request.url.scheme == "https"
        or request.headers.get("x-forwarded-proto") == "https"
    )
    cookie_secure = settings.get_cookie_secure(request_is_https=is_https)

    response.delete_cookie(
        key=settings.AIRGRID_SESSION_COOKIE_NAME,
        path="/",
        secure=cookie_secure,
        httponly=True,
        samesite=settings.AIRGRID_COOKIE_SAMESITE,
    )
    response.delete_cookie(
        key=settings.AIRGRID_CSRF_COOKIE_NAME,
        path="/",
        secure=cookie_secure,
        samesite=settings.AIRGRID_COOKIE_SAMESITE,
    )

    client_ip = request.client.host if request.client else "127.0.0.1"
    await log_auth_audit_event(
        db,
        action="auth.logout",
        actor_id=session.user_id,
        ip_address=client_ip,
        payload={"session_id": str(session.id)},
    )

    return {"message": "Logged out successfully"}


@router.get("/me", response_model=SessionStatusResponse)
async def get_my_profile(
    current_user: User = Depends(get_current_user),
    session: UserSession = Depends(get_current_session),
):
    """
    Returns current authenticated user profile, session expiration, and refreshed CSRF token.
    """
    csrf_token = generate_csrf_token(str(session.id))
    return SessionStatusResponse(
        authenticated=True,
        user=UserResponse.model_validate(current_user),
        expires_at=session.expires_at,
        csrf_token=csrf_token,
    )


@router.get("/session", response_model=SessionStatusResponse)
async def check_session_status(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Non-blocking endpoint for frontend initial hydration:
    Returns authenticated state without throwing 401 exceptions.
    """
    raw_token = get_session_token_from_request(request)
    if not raw_token:
        return SessionStatusResponse(authenticated=False, user=None, expires_at=None, csrf_token=None)

    session = await get_valid_session(db, raw_token)
    if not session or not session.user or not session.user.is_active:
        return SessionStatusResponse(authenticated=False, user=None, expires_at=None, csrf_token=None)

    csrf_token = generate_csrf_token(str(session.id))
    return SessionStatusResponse(
        authenticated=True,
        user=UserResponse.model_validate(session.user),
        expires_at=session.expires_at,
        csrf_token=csrf_token,
    )


@router.get("/csrf", response_model=CSRFResponse)
async def get_csrf_token(
    session: UserSession = Depends(get_current_session),
):
    """
    Returns an active Anti-CSRF token bound to the current session.
    """
    csrf_token = generate_csrf_token(str(session.id))
    return CSRFResponse(csrf_token=csrf_token)


# ---------------------------------------------------------------------------
# Administrator-Controlled User Management
# ---------------------------------------------------------------------------

@router.get("/users", response_model=List[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    List all platform users. Requires Administrator role.
    """
    stmt = select(User).order_by(User.created_at.desc())
    result = await db.execute(stmt)
    users = result.scalars().all()
    return [UserResponse.model_validate(u) for u in users]


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_new_user(
    payload: CreateUserRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    _csrf: None = Depends(verify_csrf),
):
    """
    Administrator-controlled user creation.
    Requires Administrator role and valid Anti-CSRF token.
    """
    client_ip = request.client.host if request.client else "127.0.0.1"
    new_user = await create_user(
        db=db,
        email=payload.email,
        password=payload.password,
        full_name=payload.full_name,
        role=payload.role,
        actor_id=admin.id,
        ip_address=client_ip,
    )
    return UserResponse.model_validate(new_user)


@router.patch("/users/{user_id}/status", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    payload: UpdateUserStatusRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    _csrf: None = Depends(verify_csrf),
):
    """
    Update user active status or role.
    Requires Administrator role and valid Anti-CSRF token.
    Deactivating a user immediately revokes all of their active sessions.
    """
    client_ip = request.client.host if request.client else "127.0.0.1"
    updated = await update_user_status(
        db=db,
        user_id=user_id,
        is_active=payload.is_active,
        role=payload.role,
        actor_id=admin.id,
        ip_address=client_ip,
    )
    return UserResponse.model_validate(updated)
