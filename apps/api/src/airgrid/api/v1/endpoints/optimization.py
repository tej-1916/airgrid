import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from airgrid.api.deps import require_authenticated
from airgrid.core.database import get_db
from airgrid.services.optimization_service import get_optimization

router = APIRouter(prefix='/optimization', tags=['Network Optimization'])


@router.get('/survey', dependencies=[Depends(require_authenticated)])
async def survey_opportunities(floor_id: uuid.UUID, network_label: str | None = Query(default=None, min_length=1, max_length=64), db: AsyncSession = Depends(get_db)):
    return await get_optimization(db, floor_id, network_label)
