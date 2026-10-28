from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from airgrid.api.deps import require_engineer_or_admin, verify_csrf
from airgrid.core.database import get_db
from airgrid.schemas.analyst import AnalystRequest, AnalystResponse
from airgrid.services.analyst_service import analyst_service

router = APIRouter(prefix='/analyst', tags=['AirGrid Analyst'])


@router.post('/analyze', response_model=AnalystResponse,
             dependencies=[Depends(require_engineer_or_admin), Depends(verify_csrf)])
async def analyze_recorded_report(req: AnalystRequest, db: AsyncSession = Depends(get_db)):
    return await analyst_service.analyze(db, req)
