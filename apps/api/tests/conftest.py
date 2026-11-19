import os
import sys

# 1. Enforce Test Database Environment Variables BEFORE any airgrid imports
os.environ["AIRGRID_ENV"] = "testing"
os.environ["AIRGRID_AI_ENABLED"] = "false"
os.environ["AIRGRID_AI_API_KEY"] = ""
os.environ["AIRGRID_COLLECTOR_ENABLED"] = "false"
os.environ["AIRGRID_DB_NAME"] = "airgrid_test_db"
os.environ["DATABASE_URL"] = os.getenv(
    "AIRGRID_TEST_DATABASE_URL",
    "postgresql+asyncpg://airgrid:airgrid_local_dev_secret@127.0.0.1:5432/airgrid_test_db",
)
os.environ["DATABASE_URL_SYNC"] = os.getenv(
    "AIRGRID_TEST_DATABASE_URL_SYNC",
    "postgresql://airgrid:airgrid_local_dev_secret@127.0.0.1:5432/airgrid_test_db",
)

import pytest
from httpx import AsyncClient, ASGITransport

from airgrid.core.config import settings, verify_test_database_isolation
from airgrid.core.database import async_engine
from airgrid.main import app


def pytest_configure(config):
    """
    Early test suite hook: validates database isolation safeguards before any tests execute.
    Immediately halts execution if tests are targeted at development or production databases.
    """
    verify_test_database_isolation(settings.DATABASE_URL, settings.AIRGRID_ENV)


@pytest.fixture(scope="session", autouse=True)
def verify_isolated_test_database_session():
    """
    Session-level safeguard fixture: verifies that the active SQLAlchemy engine
    is strictly connected to the isolated test database.
    """
    verify_test_database_isolation(settings.DATABASE_URL, settings.AIRGRID_ENV)
    assert async_engine is not None, "Async database engine must be configured for tests"
    # Default is airgrid_test_db; AIRGRID_TEST_DATABASE_URL may select another *test* database (e.g. one per worktree).
    expected_db = os.environ["DATABASE_URL"].split("?")[0].rsplit("/", 1)[-1]
    assert async_engine.url.database == expected_db, (
        f"Engine database '{async_engine.url.database}' does not match the selected isolated test database '{expected_db}'"
    )


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


@pytest.fixture(autouse=True)
async def dispose_db_engine():
    yield
    if async_engine:
        await async_engine.dispose()


@pytest.fixture(autouse=True)
def isolated_model_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "AIRGRID_MODEL_STORAGE_DIR", str(tmp_path / "models"))


@pytest.fixture
async def auth_client():
    """Factory: auth_client(role) -> AsyncClient logged in as a fresh user with CSRF header preset."""
    import uuid
    from airgrid.core.database import AsyncSessionLocal
    from airgrid.core.security import hash_password
    from airgrid.models.all_models import User

    clients = []

    async def make(role: str):
        email = f"{role}-{uuid.uuid4().hex[:8]}@airgrid.test"
        password = "FixturePassword2026!"
        async with AsyncSessionLocal() as session:
            user = User(email=email, hashed_password=hash_password(password), full_name=f"Fixture {role}",
                        role=role, is_active=True)
            session.add(user)
            await session.flush()
            from sqlalchemy import select
            from airgrid.models.all_models import Campus, CampusMembership
            campuses = (await session.execute(select(Campus))).scalars().all()
            for c in campuses:
                session.add(CampusMembership(campus_id=c.id, user_id=user.id))
            await session.commit()
            await session.refresh(user)
        ac = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
        clients.append(ac)
        response = await ac.post("/api/v1/auth/login", json={"email": email, "password": password})
        assert response.status_code == 200, response.text
        ac.headers["X-CSRF-Token"] = response.json()["csrf_token"]
        ac.user = user
        return ac

    yield make
    for ac in clients:
        await ac.aclose()
