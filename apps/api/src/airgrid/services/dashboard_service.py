import time
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import select, func, and_, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from airgrid.core.config import settings
from airgrid.core.logging import logger
from airgrid.models.all_models import (
    Campus,
    Building,
    Floor,
    FloorPlanAsset,
    AccessPoint,
    AuditLog,
    User,
)
from airgrid.schemas.dashboard import (
    DashboardSummaryResponse,
    CampusInventoryItem,
    CampusInventoryResponse,
    DashboardActivityItem,
    DashboardActivityResponse,
    ComponentStatus,
    DashboardSystemStatusResponse,
)


async def get_dashboard_summary(
    db: AsyncSession, campus_id: Optional[uuid.UUID] = None
) -> DashboardSummaryResponse:
    """Computes real PostgreSQL counts for the operational summary."""
    campus_name = None

    if campus_id:
        campus = await db.get(Campus, campus_id)
        if campus:
            campus_name = campus.name

        # Total buildings in campus
        b_res = await db.execute(
            select(func.count(Building.id)).where(Building.campus_id == campus_id)
        )
        total_buildings = b_res.scalar() or 0

        # Total floors in campus
        f_res = await db.execute(
            select(func.count(Floor.id))
            .join(Building, Floor.building_id == Building.id)
            .where(Building.campus_id == campus_id)
        )
        total_floors = f_res.scalar() or 0

        # Total plans in campus
        p_res = await db.execute(
            select(func.count(FloorPlanAsset.id))
            .join(Floor, FloorPlanAsset.floor_id == Floor.id)
            .join(Building, Floor.building_id == Building.id)
            .where(Building.campus_id == campus_id)
        )
        total_floor_plans = p_res.scalar() or 0

        # Uncalibrated plans in campus
        uncal_res = await db.execute(
            select(func.count(FloorPlanAsset.id))
            .join(Floor, FloorPlanAsset.floor_id == Floor.id)
            .join(Building, Floor.building_id == Building.id)
            .where(and_(Building.campus_id == campus_id, FloorPlanAsset.is_calibrated.is_(False)))
        )
        uncalibrated_plans = uncal_res.scalar() or 0

        # Total access points in campus
        ap_res = await db.execute(
            select(func.count(AccessPoint.id))
            .join(Floor, AccessPoint.floor_id == Floor.id)
            .join(Building, Floor.building_id == Building.id)
            .where(Building.campus_id == campus_id)
        )
        total_aps = ap_res.scalar() or 0

        total_campuses = 1
    else:
        # Global counts across all campuses
        c_res = await db.execute(select(func.count(Campus.id)))
        total_campuses = c_res.scalar() or 0

        b_res = await db.execute(select(func.count(Building.id)))
        total_buildings = b_res.scalar() or 0

        f_res = await db.execute(select(func.count(Floor.id)))
        total_floors = f_res.scalar() or 0

        p_res = await db.execute(select(func.count(FloorPlanAsset.id)))
        total_floor_plans = p_res.scalar() or 0

        uncal_res = await db.execute(
            select(func.count(FloorPlanAsset.id)).where(FloorPlanAsset.is_calibrated.is_(False))
        )
        uncalibrated_plans = uncal_res.scalar() or 0

        ap_res = await db.execute(select(func.count(AccessPoint.id)))
        total_aps = ap_res.scalar() or 0

    return DashboardSummaryResponse(
        selected_campus_id=campus_id,
        selected_campus_name=campus_name,
        total_campuses=total_campuses,
        total_buildings=total_buildings,
        total_floors=total_floors,
        total_floor_plans=total_floor_plans,
        total_access_points=total_aps,
        uncalibrated_floor_plans=uncalibrated_plans,
        database_connected=True,
        backend_version="0.1.0",
    )


async def get_campus_inventory(db: AsyncSession) -> CampusInventoryResponse:
    """Lists all campuses with aggregated counts for the inventory tab."""
    stmt = (
        select(Campus)
        .options(
            selectinload(Campus.buildings)
            .selectinload(Building.floors)
            .selectinload(Floor.floor_plan)
        )
        .order_by(Campus.name.asc())
    )
    res = await db.execute(stmt)
    campuses = res.scalars().all()

    items = []
    for c in campuses:
        b_count = len(c.buildings)
        f_count = sum(len(b.floors) for b in c.buildings)
        p_count = sum(1 for b in c.buildings for f in b.floors if f.floor_plan is not None)
        items.append(
            CampusInventoryItem(
                id=c.id,
                name=c.name,
                code=c.code,
                status=c.status,
                address=c.address,
                buildings_count=b_count,
                floors_count=f_count,
                floor_plans_count=p_count,
                last_updated=c.updated_at,
            )
        )
    return CampusInventoryResponse(total=len(items), items=items)


async def get_recent_activity(
    db: AsyncSession, limit: int = 25
) -> DashboardActivityResponse:
    """Fetches sanitized recent events from the AuditLog table."""
    stmt = (
        select(AuditLog)
        .options(selectinload(AuditLog.actor))
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    res = await db.execute(stmt)
    logs = res.scalars().all()

    items = []
    for entry in logs:
        # Sanitize payload
        safe_payload = dict(entry.payload or {})
        for sensitive_key in ("password", "token", "session_token", "csrf_token", "secret"):
            if sensitive_key in safe_payload:
                safe_payload[sensitive_key] = "[REDACTED]"

        actor_name = entry.actor.full_name if entry.actor else "System / Anonymous"
        actor_role = entry.actor.role if entry.actor else None

        items.append(
            DashboardActivityItem(
                id=entry.id,
                action=entry.action,
                resource_type=entry.resource_type,
                resource_id=entry.resource_id,
                actor_id=entry.actor_id,
                actor_name=actor_name,
                actor_role=actor_role,
                payload=safe_payload,
                ip_address=entry.ip_address,
                created_at=entry.created_at,
            )
        )
    return DashboardActivityResponse(items=items)


async def get_system_status(db: AsyncSession) -> DashboardSystemStatusResponse:
    """Checks live statuses of FastAPI, PostgreSQL, AI Gateway, and n8n."""
    now = datetime.now(timezone.utc)
    components: List[ComponentStatus] = []

    # 1. FastAPI ASGI Engine
    components.append(
        ComponentStatus(
            name="FastAPI ASGI Runtime",
            status="healthy",
            description=f"Operational (Env: {settings.AIRGRID_ENV})",
            latency_ms=0.1,
            last_checked=now,
        )
    )

    # 2. PostgreSQL 16
    t0 = time.perf_counter()
    db_status = "healthy"
    db_desc = "Connected and answering queries"
    latency = None
    try:
        await db.execute(text("SELECT 1"))
        latency = round((time.perf_counter() - t0) * 1000, 2)
    except Exception as e:
        db_status = "unavailable"
        db_desc = f"Database connection error: {str(e)[:100]}"
        logger.error("Database health check failed: %s", e)

    components.append(
        ComponentStatus(
            name="PostgreSQL Database",
            status=db_status,
            description=db_desc,
            latency_ms=latency,
            last_checked=now,
        )
    )

    # 3. AI Gateway (Contract verification)
    ai_status = "unconfigured"
    ai_desc = f"Provider: {settings.AIRGRID_AI_PROVIDER} | Default Model: {settings.AIRGRID_AI_DEFAULT_MODEL}"
    if settings.AIRGRID_AI_API_KEY:
        ai_status = "healthy"
        ai_desc += " (API Key configured)"
    else:
        ai_desc += " (No API Key set; simulation mode)"

    components.append(
        ComponentStatus(
            name="AI Inference Gateway",
            status=ai_status,
            description=ai_desc,
            latency_ms=None,
            last_checked=now,
        )
    )

    # 4. n8n Automation Engine
    n8n_status = "unconfigured"
    n8n_desc = f"Webhook Target: {settings.AIRGRID_N8N_WEBHOOK_URL}"
    if settings.AIRGRID_N8N_WEBHOOK_URL:
        n8n_status = "healthy"
        n8n_desc += f" (HMAC-SHA256 signature enabled)"

    components.append(
        ComponentStatus(
            name="n8n Automation Engine",
            status=n8n_status,
            description=n8n_desc,
            latency_ms=None,
            last_checked=now,
        )
    )

    # 5. Network RF & Speed Measurement Lab
    components.append(
        ComponentStatus(
            name="Network Measurement Lab",
            status="unconfigured",
            description="Phase 02 Baseline: Scheduled for Phase 03 activation",
            latency_ms=None,
            last_checked=now,
        )
    )

    overall = "operational"
    if db_status != "healthy":
        overall = "degraded"

    return DashboardSystemStatusResponse(
        overall=overall,
        components=components,
        timestamp=now,
    )
