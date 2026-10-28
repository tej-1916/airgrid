import time
from fastapi import APIRouter
from airgrid import __version__
from airgrid.core.config import settings
from airgrid.core.database import check_database_health
from airgrid.services.ai_gateway import ai_gateway
from airgrid.schemas.system import (
    SystemHealthResponse,
    LivenessResponse,
)

router = APIRouter()
START_TIME = time.time()


@router.get("/healthz", response_model=LivenessResponse, tags=["System"])
async def liveness_probe():
    """Kubernetes/Container liveness probe."""
    return LivenessResponse(status="ok")


@router.get("/api/v1/health", response_model=SystemHealthResponse, tags=["System"])
async def detailed_health():
    """
    Detailed system health endpoint verifying database and AI gateway configuration.
    Never fails or throws 500 when external services or AI keys are absent.
    """
    uptime = time.time() - START_TIME
    db_health = await check_database_health()

    ai_status = "configured_unchecked" if ai_gateway.is_configured() else "unconfigured"
    ai_health = {
        "status": ai_status,
        "active_provider": settings.AIRGRID_AI_PROVIDER,
        "credentials_present": ai_gateway.is_configured(),
        "configured_model": settings.AIRGRID_AI_DEFAULT_MODEL,
    }

    overall_status = "healthy"
    if db_health.get("status") == "error":
        overall_status = "degraded"

    return SystemHealthResponse(
        status=overall_status,
        version=__version__,
        environment=settings.AIRGRID_ENV,
        uptime_seconds=round(uptime, 2),
        dependencies={
            "database": db_health,
            "ai_gateway": ai_health,
        },
    )
