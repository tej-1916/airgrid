from fastapi import APIRouter
from airgrid.api.v1.endpoints import (
    health,
    ai,
    auth,
    campuses,
    dashboard,
    speed_tests,
    surveys,
    ml,
    diagnostics,
    analyst,
    optimization,
    collectors,
    retention,
)

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(auth.router, prefix="/auth")
api_router.include_router(campuses.router)
api_router.include_router(dashboard.router)
api_router.include_router(speed_tests.router)
api_router.include_router(surveys.router)
api_router.include_router(ml.router)
api_router.include_router(diagnostics.router)
api_router.include_router(analyst.router)
api_router.include_router(optimization.router)
api_router.include_router(collectors.router)
api_router.include_router(retention.router)
api_router.include_router(ai.router, prefix="/ai")
