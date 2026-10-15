import uuid
import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from airgrid.core.config import settings, verify_test_database_isolation
from airgrid.core.database import async_engine, AsyncSessionLocal
from airgrid.models.all_models import User, InternetSpeedTest


@pytest.mark.asyncio
async def test_active_database_engine_is_isolated():
    """
    Verify that the test suite is strictly bound to the isolated test database.
    """
    assert settings.AIRGRID_ENV == "testing", (
        f"Expected AIRGRID_ENV='testing', found '{settings.AIRGRID_ENV}'"
    )
    assert "airgrid_test_db" in settings.DATABASE_URL, (
        f"settings.DATABASE_URL does not point to test database: {settings.DATABASE_URL}"
    )
    assert async_engine is not None, "Async engine is not configured"
    assert async_engine.url.database == "airgrid_test_db", (
        f"Async engine is connected to '{async_engine.url.database}', expected 'airgrid_test_db'"
    )


def test_safeguard_blocks_development_database():
    """
    Verify that the safeguard function immediately raises RuntimeError when presented with the dev database.
    """
    dev_url = "postgresql+asyncpg://airgrid:secret@127.0.0.1:5432/airgrid_db"
    with pytest.raises(RuntimeError) as exc_info:
        verify_test_database_isolation(dev_url, "testing")
    assert "FATAL SAFEGUARD" in str(exc_info.value)
    assert "airgrid_db" in str(exc_info.value)


@pytest.mark.parametrize("env", ["production", "prod", "staging"])
def test_safeguard_blocks_production_environments(env: str):
    """
    Verify that the safeguard blocks execution in production or staging environments.
    """
    test_url = "postgresql+asyncpg://airgrid:secret@127.0.0.1:5432/airgrid_test_db"
    with pytest.raises(RuntimeError) as exc_info:
        verify_test_database_isolation(test_url, env)
    assert "FATAL SAFEGUARD" in str(exc_info.value)
    assert env in str(exc_info.value)


def test_safeguard_blocks_unauthorized_database_names():
    """
    Verify that database names lacking 'test' are strictly rejected.
    """
    arbitrary_url = "postgresql+asyncpg://airgrid:secret@127.0.0.1:5432/campus_production_data"
    with pytest.raises(RuntimeError) as exc_info:
        verify_test_database_isolation(arbitrary_url, "testing")
    assert "FATAL SAFEGUARD" in str(exc_info.value)
    assert "campus_production_data" in str(exc_info.value)


def test_safeguard_permits_valid_test_databases():
    """
    Verify that legitimate test database configurations pass without raising exceptions.
    """
    valid_urls = [
        "postgresql+asyncpg://airgrid:secret@127.0.0.1:5432/airgrid_test_db",
        "postgresql://airgrid:secret@127.0.0.1:5432/airgrid_ci_test",
        "postgresql+asyncpg://user:pass@db:5432/automated_test_db?ssl=true",
    ]
    for url in valid_urls:
        verify_test_database_isolation(url, "testing")


@pytest.mark.asyncio
async def test_isolated_db_transaction_does_not_leak_to_dev_db():
    """
    Verify cross-database isolation:
    Inserts a canary user into the test database (AsyncSessionLocal) and verifies
    that connecting directly to airgrid_db confirms zero presence of the canary record.
    """
    canary_email = f"isolation-canary-{uuid.uuid4().hex[:10]}@airgrid.test"

    # 1. Insert into isolated test database
    async with AsyncSessionLocal() as session:
        user = User(
            email=canary_email,
            hashed_password="CanaryHashedPassword2026!",
            full_name="Database Isolation Canary",
            role="viewer",
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        canary_id = user.id

    # 2. Verify canary exists in airgrid_test_db
    async with AsyncSessionLocal() as session:
        stmt = select(User).where(User.id == canary_id)
        res = await session.execute(stmt)
        assert res.scalar_one_or_none() is not None, "Canary must exist in test database"

    # 3. Connect directly to development database (airgrid_db) and verify ZERO presence
    dev_db_url = "postgresql+asyncpg://airgrid:airgrid_local_dev_secret@127.0.0.1:5432/airgrid_db"
    dev_engine = create_async_engine(dev_db_url, pool_pre_ping=True)
    DevSessionLocal = async_sessionmaker(bind=dev_engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with DevSessionLocal() as dev_session:
            stmt_dev = select(User).where(User.email == canary_email)
            res_dev = await dev_session.execute(stmt_dev)
            dev_user = res_dev.scalar_one_or_none()
            assert dev_user is None, (
                f"LEAK DETECTED: Canary record {canary_email} was found in development database airgrid_db!"
            )
    finally:
        await dev_engine.dispose()

    # 4. Clean up canary in test database
    async with AsyncSessionLocal() as session:
        u = await session.get(User, canary_id)
        if u:
            await session.delete(u)
            await session.commit()


@pytest.mark.asyncio
async def test_speed_measurement_provenance_enforced_in_test_db():
    """
    Verify that speed measurement records created in the test database enforce
    client_reported provenance and client_browser vantage point.
    """
    test_record = InternetSpeedTest(
        vantage_point="client_browser",
        provider_engine="cloudflare",
        status="completed",
        data_provenance="client_reported",
        download_mbps=155.2,
        upload_mbps=45.8,
        latency_ms=12.5,
    )
    async with AsyncSessionLocal() as session:
        session.add(test_record)
        await session.commit()
        await session.refresh(test_record)
        rec_id = test_record.id

    async with AsyncSessionLocal() as session:
        r = await session.get(InternetSpeedTest, rec_id)
        assert r is not None
        assert r.vantage_point == "client_browser"
        assert r.data_provenance == "client_reported"
        assert r.status == "completed"

        # Cleanup test record
        await session.delete(r)
        await session.commit()
