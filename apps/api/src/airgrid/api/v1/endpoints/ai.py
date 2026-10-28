from fastapi import APIRouter, Depends, HTTPException
from airgrid.api.deps import require_authenticated, require_engineer_or_admin, verify_csrf
from airgrid.schemas.ai import AIGenerateRequest, AIGenerateResponse, SelectModelRequest, AIStatusResponse
from airgrid.services.ai_gateway import ai_gateway

router = APIRouter()


@router.post("/generate", response_model=AIGenerateResponse, dependencies=[Depends(require_engineer_or_admin), Depends(verify_csrf)])
async def generate_completion(req: AIGenerateRequest):
    return await ai_gateway.generate(req)


@router.get("/status", response_model=AIStatusResponse, dependencies=[Depends(require_authenticated)])
async def get_gateway_status():
    return ai_gateway.get_status()


@router.post("/health", dependencies=[Depends(require_engineer_or_admin), Depends(verify_csrf)])
async def check_gateway_health():
    return await ai_gateway.health()


@router.post("/select-model", dependencies=[Depends(require_engineer_or_admin), Depends(verify_csrf)])
async def select_active_model(req: SelectModelRequest):
    success = ai_gateway.select_model(req.model)
    if not success:
        raise HTTPException(
            status_code=400,
            detail="Model is not recognized or not available from configured provider.",
        )
    return {"ok": True, "active_model": ai_gateway.active_model}
