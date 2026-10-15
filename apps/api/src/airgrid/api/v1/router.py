from fastapi import APIRouter
from airgrid.api.v1.endpoints import health, ai, automations, auth, campuses, dashboard, speed_tests

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(auth.router, prefix="/auth")
api_router.include_router(campuses.router)
api_router.include_router(dashboard.router)
api_router.include_router(speed_tests.router)
api_router.include_router(ai.router, prefix="/ai")
api_router.include_router(automations.router, prefix="/automations")
