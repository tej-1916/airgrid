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
    scenarios,
    collectors,
    retention,
    copilot,
    campus_model,
)

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(auth.router, prefix="/auth")
api_router.include_router(campuses.router)
api_router.include_router(campus_model.router)
api_router.include_router(dashboard.router)
api_router.include_router(speed_tests.router)
api_router.include_router(surveys.router)
api_router.include_router(ml.router)
api_router.include_router(diagnostics.router)
api_router.include_router(analyst.router)
api_router.include_router(optimization.router)
api_router.include_router(scenarios.router)
api_router.include_router(collectors.router)
api_router.include_router(retention.router)
api_router.include_router(ai.router, prefix="/ai")
api_router.include_router(copilot.router, prefix="/ai")
