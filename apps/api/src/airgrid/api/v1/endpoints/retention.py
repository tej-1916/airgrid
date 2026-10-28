from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from airgrid.api.deps import require_admin, require_authenticated, verify_csrf
from airgrid.core.database import get_db
from airgrid.models.all_models import User
from airgrid.schemas.collectors import RetentionApplyRequest, RetentionPolicyUpdate
from airgrid.services import telemetry_history

router = APIRouter(prefix="/retention", tags=["Data Retention"])


@router.get("")
async def list_retention_policies(db: AsyncSession = Depends(get_db), _: User = Depends(require_authenticated)):
    return await telemetry_history.list_policies(db)


@router.put("/{dataset}", dependencies=[Depends(verify_csrf)])
async def update_retention_policy(dataset: str, req: RetentionPolicyUpdate, db: AsyncSession = Depends(get_db),
                                  user: User = Depends(require_admin)):
    return await telemetry_history.update_policy(db, dataset, req.retention_days, req.aggregate_before_delete, user)


@router.get("/{dataset}/preview")
async def preview_retention(dataset: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    return await telemetry_history.preview(db, dataset)


@router.post("/{dataset}/apply", dependencies=[Depends(verify_csrf)])
async def apply_retention(dataset: str, req: RetentionApplyRequest, db: AsyncSession = Depends(get_db),
                          user: User = Depends(require_admin)):
    return await telemetry_history.apply(db, dataset, req.confirm, req.expected_count, user)
