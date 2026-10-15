from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from airgrid import __version__
from airgrid.core.config import settings
from airgrid.core.logging import logger
from airgrid.api.v1.router import api_router
from airgrid.api.v1.endpoints.health import liveness_probe, detailed_health


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing AirGrid API v%s (Env: %s)", __version__, settings.AIRGRID_ENV)
    logger.info("AI Gateway enabled=%s, provider=%s", settings.AIRGRID_AI_ENABLED, settings.AIRGRID_AI_PROVIDER)
    logger.info("Automation Webhook configured for: %s", settings.AIRGRID_N8N_WEBHOOK_URL)
    yield
    logger.info("Shutting down AirGrid API cleanly.")


def create_application() -> FastAPI:
    app = FastAPI(
        title="AirGrid Network Intelligence API",
        description="Modular Monolith API for Campus Network Intelligence, Monitoring, and RF Optimization",
        version=__version__,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    # CORS configuration
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.AIRGRID_ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Root probes for Kubernetes & Docker healthchecks
    app.add_api_route("/healthz", liveness_probe, methods=["GET"], tags=["System"])
    app.add_api_route("/api/v1/health", detailed_health, methods=["GET"], tags=["System"])

    # Include versioned routers
    app.include_router(api_router, prefix="/api/v1")

    return app


app = create_application()
