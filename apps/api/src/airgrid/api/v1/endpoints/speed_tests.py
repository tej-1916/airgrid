from typing import Optional
import uuid
from fastapi import APIRouter, Depends, Request, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from airgrid.core.config import settings
from airgrid.core.database import get_db
from airgrid.api.deps import require_authenticated, verify_csrf
from airgrid.models.all_models import User, InternetSpeedTest
from airgrid.schemas.speed_test import (
    SpeedTestCreate,
    SpeedTestResponse,
    SpeedTestListResponse,
    SpeedTestStatsResponse,
    SpeedTestConfigResponse,
)
from airgrid.services.speed_test_service import speed_test_service

router = APIRouter(tags=["Speed Tests"])


def _format_speed_test_response(record: InternetSpeedTest) -> SpeedTestResponse:
    """Format ORM model with populated relationship attributes."""
    user_email = record.user.email if record.user else None
    user_name = record.user.full_name if record.user else None
    campus_name = record.campus.name if record.campus else None
    campus_code = record.campus.code if record.campus else None
    building_name = record.building.name if record.building else None
    building_code = record.building.building_code if record.building else None
    floor_name = record.floor.name if record.floor else None
    floor_number = record.floor.floor_number if record.floor else None

    return SpeedTestResponse(
        id=record.id,
        user_id=record.user_id,
        user_email=user_email,
        user_name=user_name,
        campus_id=record.campus_id,
        campus_name=campus_name,
        campus_code=campus_code,
        building_id=record.building_id,
        building_name=building_name,
        building_code=building_code,
        floor_id=record.floor_id,
        floor_name=floor_name,
        floor_number=floor_number,
        vantage_point=record.vantage_point,
        provider_engine=record.provider_engine,
        status=record.status,
        data_provenance=record.data_provenance,
        download_mbps=record.download_mbps,
        upload_mbps=record.upload_mbps,
        latency_ms=record.latency_ms,
        jitter_ms=record.jitter_ms,
        loaded_latency_ms=record.loaded_latency_ms,
        packet_loss_pct=record.packet_loss_pct,
        server_location=record.server_location,
        quality_metadata=record.quality_metadata,
        error_code=record.error_code,
        error_message=record.error_message,
        started_at=record.started_at,
        completed_at=record.completed_at,
        duration_seconds=record.duration_seconds,
        executed_at=record.executed_at,
    )


@router.post(
    "/speed-tests",
    response_model=SpeedTestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record a client speed test result",
)
async def create_speed_test(
    data: SpeedTestCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_authenticated),
    _: None = Depends(verify_csrf),
):
    """
    Persist client-reported speed test measurement.
    Requires authenticated session and CSRF verification token.
    Validates optional campus, building, and floor associations.
    """
    ua = request.headers.get("user-agent")
    record = await speed_test_service.create_speed_test(
        db=db,
        data=data,
        current_user=current_user,
        client_user_agent=ua,
    )
    return _format_speed_test_response(record)


@router.get(
    "/speed-tests",
    response_model=SpeedTestListResponse,
    summary="List historical speed test measurements",
)
async def list_speed_tests(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    campus_id: Optional[uuid.UUID] = Query(None, description="Filter by campus ID"),
    building_id: Optional[uuid.UUID] = Query(None, description="Filter by building ID"),
    floor_id: Optional[uuid.UUID] = Query(None, description="Filter by floor ID"),
    status: Optional[str] = Query(None, description="Filter by status (completed/aborted/failed)"),
    provider: Optional[str] = Query(None, description="Filter by provider engine"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_authenticated),
):
    """
    Retrieve paginated historical speed test measurements.
    Supports filtering by campus, building, floor, status, and provider.
    """
    total, items = await speed_test_service.list_speed_tests(
        db=db,
        skip=skip,
        limit=limit,
        campus_id=campus_id,
        building_id=building_id,
        floor_id=floor_id,
        status_filter=status,
        provider_filter=provider,
    )
    return SpeedTestListResponse(
        total=total,
        skip=skip,
        limit=limit,
        items=[_format_speed_test_response(r) for r in items],
    )


@router.get(
    "/speed-tests/stats/summary",
    response_model=SpeedTestStatsResponse,
    summary="Get aggregated speed test summary statistics",
)
async def get_speed_test_stats(
    campus_id: Optional[uuid.UUID] = Query(None, description="Optional campus filter"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_authenticated),
):
    """
    Compute aggregated statistics across historical speed tests (averages, maximums, counts).
    """
    stats = await speed_test_service.get_stats_summary(db=db, campus_id=campus_id)
    return SpeedTestStatsResponse(**stats)


@router.get(
    "/speed-tests/config",
    response_model=SpeedTestConfigResponse,
    summary="Get speed test safety limits and configuration",
)
async def get_speed_test_config(
    _: User = Depends(require_authenticated),
):
    """
    Retrieve safety limits and supported providers.
    """
    return SpeedTestConfigResponse(
        max_mb=settings.AIRGRID_SPEEDTEST_MAX_MB,
        duration_seconds=settings.AIRGRID_SPEEDTEST_DURATION_SECONDS,
        default_provider="cloudflare",
        supported_providers=["cloudflare", "librespeed"],
    )


@router.get(
    "/speed-tests/{test_id}",
    response_model=SpeedTestResponse,
    summary="Get details of a single speed test",
)
async def get_speed_test(
    test_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_authenticated),
):
    """
    Retrieve full details and metadata for a specific speed test record.
    """
    record = await speed_test_service.get_speed_test_by_id(db, test_id)
    return _format_speed_test_response(record)
