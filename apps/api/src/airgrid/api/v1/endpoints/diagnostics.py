import uuid
from starlette.concurrency import run_in_threadpool
from typing import Optional
from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from airgrid.core.database import get_db
from airgrid.core.config import settings
from airgrid.api.deps import require_authenticated, require_engineer_or_admin, verify_csrf
from airgrid.models.all_models import User
from airgrid.schemas.diagnostics import (
    InterfaceListResponse,
    TelemetryCollectionRequest,
    TelemetrySnapshotResponse,
    LiveConnectionResponse,
    PingGatewayRequest,
    GatewayPingResult,
    IperfTestRequest,
    IperfResult,
    AnalyzeDiagnosticsRequest,
    DiagnosticReportResponse,
    DiagnosticReportListResponse,
)
from airgrid.services.telemetry_collector import telemetry_collector
from airgrid.services.diagnostic_service import diagnostic_service, snapshot_to_response
from airgrid.services import telemetry_history
from airgrid.models.all_models import NetworkTelemetrySnapshot

router = APIRouter(prefix="/diagnostics", tags=["Network Diagnostics"])


@router.get(
    "/interfaces",
    response_model=InterfaceListResponse,
    summary="List network interfaces and discover wireless capabilities",
)
async def get_network_interfaces(
    current_user: User = Depends(require_engineer_or_admin),
):
    """
    Scans the local host for network interfaces and automatically identifies
    the primary connected wireless interface (does not assume wlan0).
    """
    if not settings.AIRGRID_COLLECTOR_ENABLED:
        raise HTTPException(status_code=409, detail="Backend collector disabled. Operator must enable AIRGRID_COLLECTOR_ENABLED on the authorized host.")
    return await run_in_threadpool(telemetry_collector.list_interfaces)


@router.get(
    "/live-connection",
    response_model=LiveConnectionResponse,
    summary="Get current connected Wi-Fi status on the backend host",
)
async def get_live_connection(
    current_user: User = Depends(require_authenticated),
):
    """
    Returns genuine real-time link information for the currently active wireless
    interface on the backend host (read-only, non-scanning, zero network modification).
    Distinguishes active connection from historical saved records.
    """
    return await run_in_threadpool(telemetry_collector.get_live_connection_status)


@router.post(
    "/collect",
    response_model=TelemetrySnapshotResponse,
    summary="Collect opt-in live wireless and network telemetry",
)
async def collect_telemetry(
    req: TelemetryCollectionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineer_or_admin),
    _: None = Depends(verify_csrf),
):
    """
    Collects live, read-only telemetry from the connected wireless interface.
    Extracts actual RSSI (dBm), SSID, BSSID, channel, band, and bitrates.
    Reuses recent Phase 03 internet speed tests when requested.
    Requires explicit operator authorization.
    """
    return await diagnostic_service.collect_and_store_snapshot(
        db=db,
        req=req,
        current_user=current_user,
    )


@router.post(
    "/ping-gateway",
    response_model=GatewayPingResult,
    summary="Bounded ICMP echo test to default gateway router",
)
async def ping_gateway(
    req: PingGatewayRequest,
    current_user: User = Depends(require_engineer_or_admin),
    _: None = Depends(verify_csrf),
):
    """
    Executes a bounded, safe ping probe (max 5 packets) to the local default gateway router.
    Measures first-hop wireless latency, jitter, and packet loss.
    """
    return await diagnostic_service.ping_gateway_probe(req)


@router.post(
    "/iperf",
    response_model=IperfResult,
    summary="Optional LAN throughput test with designated endpoint",
)
async def run_iperf_test(
    req: IperfTestRequest,
    current_user: User = Depends(require_engineer_or_admin),
    _: None = Depends(verify_csrf),
):
    """
    Executes an optional operator-approved iperf3 LAN throughput benchmark
    against a designated target host under operator control.
    """
    return await diagnostic_service.iperf_probe(req)


@router.post(
    "/analyze",
    response_model=DiagnosticReportResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Execute deterministic diagnostic engine and save report",
)
async def analyze_diagnostics(
    req: AnalyzeDiagnosticsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineer_or_admin),
    _: None = Depends(verify_csrf),
):
    """
    Evaluates real recorded telemetry using deterministic rules, links empirical evidence
    to each finding, assigns an overall health score, and persists the report to PostgreSQL.
    """
    return await diagnostic_service.analyze_and_create_report(
        db=db,
        req=req,
        current_user=current_user,
    )


@router.get(
    "/reports",
    response_model=DiagnosticReportListResponse,
    summary="List historical diagnostic reports",
)
async def list_diagnostic_reports(
    campus_id: Optional[uuid.UUID] = Query(None),
    building_id: Optional[uuid.UUID] = Query(None),
    floor_id: Optional[uuid.UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_authenticated),
):
    """Lists past diagnostic reports with filtering and pagination."""
    return await diagnostic_service.list_reports(
        db=db,
        campus_id=campus_id,
        building_id=building_id,
        floor_id=floor_id,
        skip=skip,
        limit=limit,
        current_user=current_user,
    )


@router.get(
    "/reports/{report_id}",
    response_model=DiagnosticReportResponse,
    summary="Get detailed diagnostic report by ID",
)
async def get_diagnostic_report(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_authenticated),
):
    """Retrieves full diagnostic findings and telemetry snapshot for a specific report."""
    from airgrid.services.campus_service import require_campus_access
    report = await diagnostic_service.get_report_by_id(db=db, report_id=report_id)
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Diagnostic report not found",
        )
    if report.campus_id:
        await require_campus_access(db, current_user, report.campus_id)
    return report


@router.delete(
    "/reports/{report_id}",
    summary="Delete diagnostic report",
)
async def delete_diagnostic_report(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineer_or_admin),
    _: None = Depends(verify_csrf),
):
    """Deletes a diagnostic report (Technician or Admin only)."""
    from airgrid.services.campus_service import require_campus_access
    report = await diagnostic_service.get_report_by_id(db=db, report_id=report_id)
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Diagnostic report not found",
        )
    if report.campus_id:
        await require_campus_access(db, current_user, report.campus_id)
    await diagnostic_service.delete_report(db=db, report_id=report_id, current_user=current_user)
    return {"ok": True, "message": "Diagnostic report deleted successfully"}


@router.get("/trends", summary="Persisted telemetry, speed-test and transition history")
async def get_telemetry_trends(
    collector_id: Optional[uuid.UUID] = Query(None),
    floor_id: Optional[uuid.UUID] = Query(None),
    days: int = Query(7, ge=1, le=90),
    include_operator_reported: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_authenticated),
):
    return await telemetry_history.get_trends(db, collector_id, floor_id, days, include_operator_reported, current_user=current_user)


@router.get("/snapshots/{snapshot_id}", response_model=TelemetrySnapshotResponse)
async def get_telemetry_snapshot(
    snapshot_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_authenticated),
):
    from airgrid.services.campus_service import require_campus_access
    snapshot = await db.get(NetworkTelemetrySnapshot, snapshot_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Telemetry snapshot not found.")
    if snapshot.campus_id:
        await require_campus_access(db, current_user, snapshot.campus_id)
    return snapshot_to_response(snapshot)
