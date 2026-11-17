import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from airgrid.api.deps import get_db, require_authenticated
from airgrid.models.all_models import User
from airgrid.schemas.dashboard import (
    DashboardSummaryResponse,
    CampusInventoryResponse,
    DashboardActivityResponse,
    DashboardSystemStatusResponse,
)
from airgrid.services import campus_service, dashboard_service

router = APIRouter()


@router.get("/dashboard/summary", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(
    campus_id: Optional[uuid.UUID] = Query(None, description="Filter metrics by specific campus"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_authenticated),
):
    """
    Returns real PostgreSQL counts for campuses, buildings, floors, and floor plans.
    Supports global aggregation or campus-specific filtering.
    """
    if campus_id:
        await campus_service.require_campus_access(db, user, campus_id)
    return await dashboard_service.get_dashboard_summary(
        db, campus_id=campus_id, authorized_ids=await campus_service.get_authorized_campus_ids(db, user)
    )


@router.get("/dashboard/inventory", response_model=CampusInventoryResponse)
async def get_campus_inventory(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_authenticated),
):
    """
    Returns campus inventory table data with aggregated building, floor, and plan counts.
    """
    return await dashboard_service.get_campus_inventory(
        db, authorized_ids=await campus_service.get_authorized_campus_ids(db, user)
    )


@router.get("/dashboard/activity", response_model=DashboardActivityResponse)
async def get_recent_activity(
    limit: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_authenticated),
):
    """
    Returns sanitized recent audit events (campus, building, floor, plan changes) without secrets.
    """
    # Administrators see the platform-wide feed; everyone else sees only their own events.
    actor_id = None if user.role == "administrator" else user.id
    return await dashboard_service.get_recent_activity(db, limit=limit, actor_id=actor_id)


@router.get("/dashboard/system-status", response_model=DashboardSystemStatusResponse)
async def get_system_status(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_authenticated),
):
    """
    Returns live health states of FastAPI ASGI, PostgreSQL, AI Gateway, and n8n engine.
    """
    return await dashboard_service.get_system_status(db)
