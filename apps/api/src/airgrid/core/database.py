from typing import AsyncGenerator
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from airgrid.core.config import settings
from airgrid.core.logging import logger

# Base for all SQLAlchemy models
Base = declarative_base()

# Async Engine (Used by FastAPI handlers)
try:
    async_engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,
        future=True,
        pool_pre_ping=True,
    )
    AsyncSessionLocal = async_sessionmaker(
        bind=async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )
except Exception as e:
    logger.warning("Could not initialize async database engine: %s", e)
    async_engine = None
    AsyncSessionLocal = None


# Sync Engine (Used by Alembic and sync tools)
try:
    sync_engine = create_engine(
        settings.DATABASE_URL_SYNC,
        pool_pre_ping=True,
    )
    SyncSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=sync_engine,
    )
except Exception as e:
    logger.warning("Could not initialize sync database engine: %s", e)
    sync_engine = None
    SyncSessionLocal = None


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency providing an async database session."""
    if AsyncSessionLocal is None:
        raise RuntimeError("Database session factory is not configured.")
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def check_database_health() -> dict:
    """Verifies database connectivity without throwing unhandled exceptions."""
    if async_engine is None:
        return {"status": "error", "message": "Engine not configured"}
    try:
        async with async_engine.connect() as conn:
            result = await conn.execute(text("SELECT 1"))
            val = result.scalar()
            if val == 1:
                return {"status": "connected"}
            return {"status": "degraded", "detail": f"Unexpected ping value {val}"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}
