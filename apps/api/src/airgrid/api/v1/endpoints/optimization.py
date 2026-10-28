import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from airgrid.api.deps import require_authenticated, require_engineer_or_admin, verify_csrf
from airgrid.core.database import get_db
from airgrid.models.all_models import User
from airgrid.schemas.optimization import (
    AccessPointCreate, AccessPointUpdate, PlanCreate, PlanUpdate, SessionCompareRequest,
)
from airgrid.services import optimization_service as svc
from airgrid.services.analyst_evidence import compare_sessions, load_session_pair
from airgrid.services.optimization_service import get_optimization

router = APIRouter(prefix='/optimization', tags=['Network Optimization'])


@router.get('/survey', dependencies=[Depends(require_authenticated)])
async def survey_opportunities(floor_id: uuid.UUID, network_label: str | None = Query(default=None, min_length=1, max_length=64), db: AsyncSession = Depends(get_db)):
    return await get_optimization(db, floor_id, network_label)


@router.post('/compare-sessions', dependencies=[Depends(require_authenticated)])
async def compare_survey_sessions(req: SessionCompareRequest, db: AsyncSession = Depends(get_db)):
    """Observed before/after comparison of two recorded survey sessions; read-only."""
    (before, before_points), (after, after_points) = await load_session_pair(db, req.before_session_id, req.after_session_id)
    return compare_sessions(before, after, before_points, after_points, req.network_label)


@router.get('/plans', dependencies=[Depends(require_authenticated)])
async def list_plans(floor_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db)):
    return await svc.list_plans(db, floor_id)


@router.get('/plans/{plan_id}', dependencies=[Depends(require_authenticated)])
async def get_plan(plan_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    return await svc.get_plan(db, plan_id)


@router.post('/plans', status_code=201, dependencies=[Depends(verify_csrf)])
async def create_plan(req: PlanCreate, db: AsyncSession = Depends(get_db), user: User = Depends(require_engineer_or_admin)):
    return await svc.create_plan(db, req, user)


@router.patch('/plans/{plan_id}', dependencies=[Depends(verify_csrf)])
async def update_plan(plan_id: uuid.UUID, req: PlanUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(require_engineer_or_admin)):
    return await svc.update_plan(db, plan_id, req, user)


@router.delete('/plans/{plan_id}', dependencies=[Depends(verify_csrf)])
async def delete_plan(plan_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(require_engineer_or_admin)):
    await svc.delete_plan(db, plan_id, user)
    return {'ok': True}


@router.get('/access-points', dependencies=[Depends(require_authenticated)])
async def list_access_points(floor_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    return await svc.list_access_points(db, floor_id)


@router.post('/access-points', status_code=201, dependencies=[Depends(verify_csrf)])
async def register_access_point(req: AccessPointCreate, db: AsyncSession = Depends(get_db), user: User = Depends(require_engineer_or_admin)):
    return await svc.create_access_point(db, req, user)


@router.patch('/access-points/{ap_id}', dependencies=[Depends(verify_csrf)])
async def update_access_point(ap_id: uuid.UUID, req: AccessPointUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(require_engineer_or_admin)):
    return await svc.update_access_point(db, ap_id, req, user)


@router.delete('/access-points/{ap_id}', dependencies=[Depends(verify_csrf)])
async def delete_access_point(ap_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(require_engineer_or_admin)):
    await svc.delete_access_point(db, ap_id, user)
    return {'ok': True}
