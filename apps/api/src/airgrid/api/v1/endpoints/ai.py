from fastapi import APIRouter, Depends
from airgrid.api.deps import require_authenticated, require_engineer_or_admin, verify_csrf
from airgrid.schemas.ai import AIGenerateRequest, AIGenerateResponse
from airgrid.services.ai_gateway import ai_gateway

router = APIRouter()


@router.post("/generate", response_model=AIGenerateResponse, dependencies=[Depends(require_engineer_or_admin), Depends(verify_csrf)])
async def generate_completion(req: AIGenerateRequest):
    return await ai_gateway.generate(req)


@router.get("/status", dependencies=[Depends(require_authenticated)])
async def get_gateway_status():
    return {"is_configured": ai_gateway.is_configured(), "default_model": ai_gateway.default_model,
            "provider": "AI Gateway", "execution_identity": "Provider-reported only; not independently verified",
            "default_mode": "deterministic", "retry_limit": 0, "max_completion_tokens": 1024}


@router.post("/health", dependencies=[Depends(require_engineer_or_admin), Depends(verify_csrf)])
async def check_gateway_health():
    return await ai_gateway.health()
