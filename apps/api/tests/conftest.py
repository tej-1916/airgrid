import os
import sys

# 1. Enforce Test Database Environment Variables BEFORE any airgrid imports
os.environ["AIRGRID_ENV"] = "testing"
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
    assert async_engine.url.database == "airgrid_test_db", (
        f"Engine database '{async_engine.url.database}' does not match expected isolated test database 'airgrid_test_db'"
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
