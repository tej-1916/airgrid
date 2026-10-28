import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from airgrid.core.database import AsyncSessionLocal
from airgrid.core.security import hash_password, generate_csrf_token
from airgrid.models.all_models import User, UserSession
from airgrid.services.auth_service import login_rate_limiter


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Reset rate limiter before each test to prevent test interference."""
    login_rate_limiter._failures.clear()
    yield
    login_rate_limiter._failures.clear()


@pytest.fixture
async def test_admin_user():
    """Creates a temporary administrator user in the database."""
    unique_email = f"admin-{uuid.uuid4().hex[:8]}@airgrid.test"
    password = "AdminSecurePassword2026!"
    hashed = hash_password(password)

    async with AsyncSessionLocal() as session:
        user = User(
            email=unique_email,
            hashed_password=hashed,
            full_name="Test Administrator",
            role="administrator",
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

    yield {"user": user, "email": unique_email, "password": password}

    async with AsyncSessionLocal() as session:
        stmt = select(User).where(User.id == user.id)
        res = await session.execute(stmt)
        u = res.scalar_one_or_none()
        if u:
            await session.delete(u)
            await session.commit()


@pytest.fixture
async def test_viewer_user():
    """Creates a temporary viewer user in the database."""
    unique_email = f"viewer-{uuid.uuid4().hex[:8]}@airgrid.test"
    password = "ViewerSecurePassword2026!"
    hashed = hash_password(password)

    async with AsyncSessionLocal() as session:
        user = User(
            email=unique_email,
            hashed_password=hashed,
            full_name="Test Viewer",
            role="viewer",
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

    yield {"user": user, "email": unique_email, "password": password}

    async with AsyncSessionLocal() as session:
        stmt = select(User).where(User.id == user.id)
        res = await session.execute(stmt)
        u = res.scalar_one_or_none()
        if u:
            await session.delete(u)
            await session.commit()


@pytest.mark.asyncio
async def test_login_success_and_cookie_generation(client: AsyncClient, test_admin_user):
    email = test_admin_user["email"]
    password = test_admin_user["password"]

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Authentication successful"
    assert data["user"]["email"] == email
    assert data["user"]["role"] == "administrator"
    assert "csrf_token" in data
    assert len(data["csrf_token"]) > 20

    # Verify HttpOnly session cookie
    assert "airgrid_session" in response.cookies
    # Raw session token must NOT equal the database hash
    raw_token = response.cookies["airgrid_session"]
    assert len(raw_token) > 30


@pytest.mark.asyncio
async def test_login_invalid_credentials_safe_message(client: AsyncClient, test_admin_user):
    # Wrong password
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": test_admin_user["email"], "password": "WrongPassword123!"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"

    # Nonexistent user (must return identical generic error)
    response2 = await client.post(
        "/api/v1/auth/login",
        # Unique per run: failures persist in the audit log and feed the DB-backed limiter.
        json={"email": f"nonexistent-{uuid.uuid4().hex[:8]}@airgrid.test", "password": "AnyPassword123!"},
    )
    assert response2.status_code == 401
    assert response2.json()["detail"] == "Invalid email or password"


@pytest.mark.asyncio
async def test_login_rate_limiting(client: AsyncClient):
    fake_email = f"bruteforce-{uuid.uuid4().hex[:8]}@airgrid.test"

    for i in range(5):
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": fake_email, "password": f"wrong-pass-{i}"},
        )
        assert resp.status_code == 401

    # 6th attempt must trigger HTTP 429
    resp_limited = await client.post(
        "/api/v1/auth/login",
        json={"email": fake_email, "password": "wrong-pass-6"},
    )
    assert resp_limited.status_code == 429
    assert "Too many failed login attempts" in resp_limited.json()["detail"]
    assert "Retry-After" in resp_limited.headers


@pytest.mark.asyncio
async def test_session_hydration_and_me_endpoint(client: AsyncClient, test_admin_user):
    # Unauthenticated /session check returns authenticated=False without error
    resp_pre = await client.get("/api/v1/auth/session")
    assert resp_pre.status_code == 200
    assert resp_pre.json()["authenticated"] is False
    assert resp_pre.json()["user"] is None

    # Unauthenticated /me raises 401
    resp_unauth = await client.get("/api/v1/auth/me")
    assert resp_unauth.status_code == 401

    # Authenticate
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": test_admin_user["email"], "password": test_admin_user["password"]},
    )
    assert login_resp.status_code == 200
    session_cookie = login_resp.cookies["airgrid_session"]

    # Call /me with cookie
    client.cookies = {"airgrid_session": session_cookie}
    resp_me = await client.get("/api/v1/auth/me")
    assert resp_me.status_code == 200
    me_data = resp_me.json()
    assert me_data["authenticated"] is True
    assert me_data["user"]["email"] == test_admin_user["email"]
    assert me_data["user"]["role"] == "administrator"
    assert "csrf_token" in me_data


@pytest.mark.asyncio
async def test_csrf_protection_on_mutating_requests(client: AsyncClient, test_admin_user):
    # Log in as admin
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": test_admin_user["email"], "password": test_admin_user["password"]},
    )
    session_cookie = login_resp.cookies["airgrid_session"]
    client.cookies = {"airgrid_session": session_cookie}
    csrf_token = login_resp.json()["csrf_token"]

    new_user_payload = {
        "email": f"new-engineer-{uuid.uuid4().hex[:6]}@airgrid.test",
        "password": "EngineerSecure2026!",
        "full_name": "New Network Engineer",
        "role": "network_engineer",
    }

    # Attempt user creation without X-CSRF-Token header -> must fail with 403
    resp_no_csrf = await client.post(
        "/api/v1/auth/users",
        json=new_user_payload,
    )
    assert resp_no_csrf.status_code == 403
    assert "CSRF validation failed" in resp_no_csrf.json()["detail"]

    # Attempt with invalid CSRF token -> must fail with 403
    resp_bad_csrf = await client.post(
        "/api/v1/auth/users",
        json=new_user_payload,
        headers={"X-CSRF-Token": "invalid-token"},
    )
    assert resp_bad_csrf.status_code == 403

    # Attempt with valid CSRF token -> must succeed with 201
    resp_valid = await client.post(
        "/api/v1/auth/users",
        json=new_user_payload,
        headers={"X-CSRF-Token": csrf_token},
    )
    assert resp_valid.status_code == 201
    created_user = resp_valid.json()
    assert created_user["email"] == new_user_payload["email"].lower()
    assert created_user["role"] == "network_engineer"


@pytest.mark.asyncio
async def test_role_based_access_control(client: AsyncClient, test_admin_user, test_viewer_user):
    # 1. Viewer login
    viewer_login = await client.post(
        "/api/v1/auth/login",
        json={"email": test_viewer_user["email"], "password": test_viewer_user["password"]},
    )
    viewer_cookie = viewer_login.cookies["airgrid_session"]
    viewer_csrf = viewer_login.json()["csrf_token"]
    client.cookies = {"airgrid_session": viewer_cookie}

    # Viewer attempts to list all users -> must be Forbidden (403)
    resp_forbidden = await client.get("/api/v1/auth/users")
    assert resp_forbidden.status_code == 403
    assert "Forbidden" in resp_forbidden.json()["detail"]

    # Viewer attempts to create user -> must be Forbidden (403)
    resp_create_forbidden = await client.post(
        "/api/v1/auth/users",
        json={"email": "hacker@test.com", "password": "Password123!", "full_name": "Hacker", "role": "admin"},
        headers={"X-CSRF-Token": viewer_csrf},
    )
    assert resp_create_forbidden.status_code == 403

    # 2. Administrator login
    admin_login = await client.post(
        "/api/v1/auth/login",
        json={"email": test_admin_user["email"], "password": test_admin_user["password"]},
    )
    admin_cookie = admin_login.cookies["airgrid_session"]
    client.cookies = {"airgrid_session": admin_cookie}

    # Admin lists users -> must succeed (200)
    resp_admin = await client.get("/api/v1/auth/users")
    assert resp_admin.status_code == 200
    user_list = resp_admin.json()
    assert isinstance(user_list, list)
    assert any(u["email"] == test_admin_user["email"] for u in user_list)


@pytest.mark.asyncio
async def test_logout_and_session_invalidation(client: AsyncClient, test_viewer_user):
    # Log in
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": test_viewer_user["email"], "password": test_viewer_user["password"]},
    )
    session_cookie = login_resp.cookies["airgrid_session"]
    csrf_token = login_resp.json()["csrf_token"]
    client.cookies = {"airgrid_session": session_cookie}

    # Verify active session works
    resp_me = await client.get("/api/v1/auth/me")
    assert resp_me.status_code == 200

    # Logout
    logout_resp = await client.post(
        "/api/v1/auth/logout",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert logout_resp.status_code == 200
    assert logout_resp.json()["message"] == "Logged out successfully"

    # Subsequent calls with old session cookie must return 401
    client.cookies = {"airgrid_session": session_cookie}
    resp_after = await client.get("/api/v1/auth/me")
    assert resp_after.status_code == 401


@pytest.mark.asyncio
async def test_cookie_secure_flags_and_samesite(client: AsyncClient, test_admin_user):
    """Verify that session cookies enforce HttpOnly, SameSite, and Secure flags under HTTPS."""
    # Under HTTPS forwarding
    response_https = await client.post(
        "/api/v1/auth/login",
        json={"email": test_admin_user["email"], "password": test_admin_user["password"]},
        headers={"x-forwarded-proto": "https"},
    )
    assert response_https.status_code == 200

    set_cookie_headers = response_https.headers.get_list("set-cookie")
    session_cookie_header = next(h for h in set_cookie_headers if "airgrid_session=" in h)

    # Must contain HttpOnly, SameSite=lax, and Secure
    assert "httponly" in session_cookie_header.lower()
    assert "samesite=lax" in session_cookie_header.lower()
    assert "secure" in session_cookie_header.lower()


@pytest.mark.asyncio
async def test_database_persisted_rate_limiting_across_restarts(client: AsyncClient):
    """
    Verify that rate limiting persists via PostgreSQL AuditLog across server restarts
    even when the in-memory cache is wiped.
    """
    target_email = f"target-{uuid.uuid4().hex[:8]}@airgrid.test"

    # 1. Generate 5 failed attempts
    for i in range(5):
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": target_email, "password": f"bad-pass-{i}"},
        )
        assert resp.status_code == 401

    # 2. Simulate process restart by clearing in-memory rate limiter dictionary completely
    login_rate_limiter._failures.clear()
    assert len(login_rate_limiter._failures) == 0

    # 3. Next attempt MUST STILL be rate-limited (HTTP 429) due to PostgreSQL AuditLog records!
    resp_restarted = await client.post(
        "/api/v1/auth/login",
        json={"email": target_email, "password": "another-attempt"},
    )
    assert resp_restarted.status_code == 429
    assert "Too many failed login attempts" in resp_restarted.json()["detail"]

