from fastapi import APIRouter
from airgrid.schemas.ai import AIGenerateRequest, AIGenerateResponse
from airgrid.services.ai_gateway import ai_gateway
from airgrid.core.config import settings

router = APIRouter()


@router.post("/generate", response_model=AIGenerateResponse, tags=["AI Gateway"])
async def generate_completion(req: AIGenerateRequest):
    """
    Executes a prompt against the AI Gateway.
    Safely degrades and marks execution as unconfigured/unverified in Phase 00.
    """
    return await ai_gateway.generate(req)


@router.get("/status", tags=["AI Gateway"])
async def get_gateway_status():
    """Returns AI Gateway configuration and provider state."""
    return {
        "enabled": settings.AIRGRID_AI_ENABLED,
        "provider": settings.AIRGRID_AI_PROVIDER,
        "base_url": settings.AIRGRID_AI_API_BASE_URL,
        "default_model": settings.AIRGRID_AI_DEFAULT_MODEL,
        "is_configured": ai_gateway.is_configured(),
        "phase": "Phase 00 Foundation",
    }
