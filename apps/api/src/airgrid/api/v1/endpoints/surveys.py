from typing import Optional, List, Dict, Any
import uuid
from fastapi import APIRouter, Depends, Request, Query, Path, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from airgrid.core.database import get_db
from airgrid.api.deps import (
    require_authenticated,
    require_engineer_or_admin,
    verify_csrf,
)
from airgrid.models.all_models import User, SurveySession, SurveyMeasurement, AuditLog
from airgrid.schemas.survey import (
    SurveySessionCreate,
    SurveySessionUpdate,
    SurveyMeasurementCreate,
    SurveyMeasurementResponse,
    LiveMeasurementCreate,
    MeasurementRepositionRequest,
    SurveyValidationResponse,
    SnapshotPlacementCreate,
    SurveySessionResponse,
    SurveySessionListResponse,
    SurveySummaryStats,
    HeatmapGridResponse,
    SurveyComparisonResponse,
)
from airgrid.services.survey_service import SurveyService
from airgrid.services.diagnostic_service import snapshot_to_response
from airgrid.schemas.diagnostics import TelemetrySnapshotResponse
from airgrid.services import campus_service

router = APIRouter(prefix="/surveys", tags=["Wi-Fi Surveys & Heatmaps"])


def _format_measurement(m: SurveyMeasurement) -> SurveyMeasurementResponse:
    snap = getattr(m, "source_telemetry_snapshot", None)
    return SurveyMeasurementResponse(
        id=m.id,
        survey_session_id=m.survey_session_id,
        floor_id=m.floor_id,
        position_x=m.position_x,
        position_y=m.position_y,
        normalized_x=m.normalized_x,
        normalized_y=m.normalized_y,
        rssi_dbm=m.rssi_dbm,
        measurement_source=m.measurement_source,
        network_label=m.network_label,
        ap_reference=m.ap_reference,
        frequency_mhz=m.frequency_mhz,
        channel=m.channel,
        notes=m.notes,
        data_provenance=m.data_provenance,
        source_telemetry_snapshot_id=m.source_telemetry_snapshot_id,
        rx_bitrate_mbps=snap.rx_bitrate_mbps if snap else None,
        tx_bitrate_mbps=snap.tx_bitrate_mbps if snap else None,
        interface_name=snap.interface_name if snap else None,
        observed_at=m.observed_at,
        created_at=m.created_at,
    )


def _format_survey(session: SurveySession, include_measurements: bool = False) -> SurveySessionResponse:
    op_name = None
    if session.technician:
        op_name = session.technician.full_name or session.technician.email
    elif session.technician_id:
        op_name = "Assigned Operator"

    measurements_resp = None
    meas_count = len(session.measurements) if session.measurements else 0

    if include_measurements and session.measurements:
        measurements_resp = [_format_measurement(m) for m in session.measurements]

    return SurveySessionResponse(
        id=session.id,
        campus_id=session.campus_id,
        building_id=session.building_id,
        floor_id=session.floor_id,
        technician_id=session.technician_id,
        operator_name=op_name,
        session_name=session.session_name,
        description=session.description,
        status=session.status,
        started_at=session.started_at,
        completed_at=session.completed_at,
        created_at=session.created_at,
        updated_at=session.updated_at,
        measurement_count=meas_count,
        measurements=measurements_resp,
    )


async def _require_survey_access(db: AsyncSession, survey_id: uuid.UUID, user: User) -> SurveySession:
    session = await SurveyService.get_survey_session(db, survey_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Survey session '{survey_id}' not found.",
        )
    if user.role != "administrator" and session.campus_id:
        await campus_service.require_campus_access(db, user, session.campus_id)
    return session


@router.post(
    "",
    response_model=SurveySessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new Wi-Fi survey session",
)
async def create_survey(
    payload: SurveySessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineer_or_admin),
    _: None = Depends(verify_csrf),
):
    """
    Creates a new named survey session bound to a verified campus/building/floor.
    Requires Network Engineer or Administrator role and campus scoping.
    """
    await campus_service.get_floor_by_id(db, payload.floor_id, current_user=current_user)

    session = await SurveyService.create_survey_session(
        db=db,
        payload=payload,
        technician_id=current_user.id,
    )
    # Refresh to load relationships
    full_session = await SurveyService.get_survey_session(db, session.id)
    return _format_survey(full_session or session)


@router.get(
    "",
    response_model=SurveySessionListResponse,
    summary="List Wi-Fi survey sessions",
)
async def list_surveys(
    campus_id: Optional[uuid.UUID] = Query(None, description="Filter by campus"),
    building_id: Optional[uuid.UUID] = Query(None, description="Filter by building"),
    floor_id: Optional[uuid.UUID] = Query(None, description="Filter by floor"),
    status: Optional[str] = Query(None, description="Filter by status (in_progress, completed, archived)"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_authenticated),
):
    """Lists survey sessions matching filter parameters, scoped by campus."""
    if campus_id and current_user.role != "administrator":
        await campus_service.require_campus_access(db, current_user, campus_id)

    items, total = await SurveyService.list_survey_sessions(
        db=db,
        campus_id=campus_id,
        building_id=building_id,
        floor_id=floor_id,
        status_filter=status,
        limit=limit,
        offset=offset,
    )
    if current_user.role != "administrator":
        authorized_ids = await campus_service.get_authorized_campus_ids(db, current_user)
        if authorized_ids is not None:
            items = [item for item in items if item.campus_id in authorized_ids]
            total = len(items)

    return SurveySessionListResponse(
        total=total,
        items=[_format_survey(item) for item in items],
    )


@router.get(
    "/compare",
    response_model=SurveyComparisonResponse,
    summary="Compare two survey sessions on the same floor",
)
async def compare_surveys(
    session1: uuid.UUID = Query(..., description="First survey session UUID"),
    session2: uuid.UUID = Query(..., description="Second survey session UUID"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_authenticated),
):
    """Generates a delta comparison between two survey sessions conducted on the same floor."""
    return await SurveyService.compare_surveys(db, session1, session2)


@router.get(
    "/client-telemetry/status",
    summary="Query host wireless telemetry status",
)
async def get_client_telemetry_status(
    _: User = Depends(require_authenticated),
):
    """
    Passive, read-only query of the host system's wireless status.
    Clearly notes server-host provenance to prevent conflation with the browser client.
    """
    return SurveyService.get_host_telemetry()


@router.get(
    "/{survey_id}",
    response_model=SurveySessionResponse,
    summary="Retrieve survey session details and observations",
)
async def get_survey(
    survey_id: uuid.UUID = Path(..., description="Survey session UUID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_authenticated),
):
    """Retrieves a single survey session including all recorded measurements (enforces campus scoping)."""
    session = await _require_survey_access(db, survey_id, current_user)
    return _format_survey(session, include_measurements=True)


@router.patch(
    "/{survey_id}",
    response_model=SurveySessionResponse,
    summary="Update survey session metadata",
)
async def update_survey(
    payload: SurveySessionUpdate,
    survey_id: uuid.UUID = Path(..., description="Survey session UUID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineer_or_admin),
    _: None = Depends(verify_csrf),
):
    """Updates survey session name, description, or status (enforces campus scoping)."""
    await _require_survey_access(db, survey_id, current_user)
    updated = await SurveyService.update_survey_session(db, survey_id, payload)
    return _format_survey(updated)


@router.post(
    "/{survey_id}/complete",
    response_model=SurveySessionResponse,
    summary="Mark survey session as completed",
)
async def complete_survey(
    survey_id: uuid.UUID = Path(..., description="Survey session UUID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineer_or_admin),
    _: None = Depends(verify_csrf),
):
    """Marks survey session status as completed with a completion timestamp (enforces campus scoping)."""
    await _require_survey_access(db, survey_id, current_user)
    completed = await SurveyService.complete_survey_session(db, survey_id)
    return _format_survey(completed)


@router.post(
    "/{survey_id}/measurements",
    response_model=SurveyMeasurementResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record a Wi-Fi signal measurement",
)
async def add_measurement(
    payload: SurveyMeasurementCreate,
    survey_id: uuid.UUID = Path(..., description="Survey session UUID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineer_or_admin),
    _: None = Depends(verify_csrf),
):
    """
    Validates and stores a legitimate signal observation on the specified floor plan coordinates.
    Requires Network Engineer or Administrator permissions and campus access.
    """
    await _require_survey_access(db, survey_id, current_user)
    measurement = await SurveyService.add_measurement(
        db=db,
        session_id=survey_id,
        payload=payload,
        technician_id=current_user.id,
    )
    return _format_measurement(measurement)


@router.get(
    "/{survey_id}/placeable-snapshots",
    response_model=List[TelemetrySnapshotResponse],
    summary="Recent instrument observations that can be placed on this survey",
)
async def list_placeable_snapshots(
    survey_id: uuid.UUID = Path(..., description="Survey session UUID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_authenticated),
):
    await _require_survey_access(db, survey_id, current_user)
    return [snapshot_to_response(s) for s in await SurveyService.placeable_snapshots(db, survey_id)]


@router.post(
    "/{survey_id}/measurements/from-snapshot",
    response_model=SurveyMeasurementResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Place a stored instrument observation at an operator-selected location",
)
async def place_instrument_snapshot(
    payload: SnapshotPlacementCreate,
    survey_id: uuid.UUID = Path(..., description="Survey session UUID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineer_or_admin),
    _: None = Depends(verify_csrf),
):
    """The only path that creates field_instrument_verified survey points."""
    await _require_survey_access(db, survey_id, current_user)
    measurement = await SurveyService.place_snapshot(db, survey_id, payload, current_user.id)
    return _format_measurement(measurement)


@router.get(
    "/{survey_id}/measurements",
    response_model=List[SurveyMeasurementResponse],
    summary="List all measurements for a survey session",
)
async def list_measurements(
    survey_id: uuid.UUID = Path(..., description="Survey session UUID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_authenticated),
):
    """Returns all measurements recorded for the given survey session."""
    await _require_survey_access(db, survey_id, current_user)
    measurements = await SurveyService.list_measurements(db, survey_id)
    return [_format_measurement(m) for m in measurements]


@router.post(
    "/{survey_id}/measurements/collect-live",
    response_model=SurveyMeasurementResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Capture live connected Wi-Fi observation at selected coordinates",
)
async def collect_live_measurement(
    payload: LiveMeasurementCreate,
    survey_id: uuid.UUID = Path(..., description="Survey session UUID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineer_or_admin),
    _: None = Depends(verify_csrf),
):
    """
    Safely captures a read-only snapshot of the currently connected Wi-Fi link on the measuring host,
    creates verified instrument telemetry, and associates it with the operator's chosen coordinates.
    Zero packet sniffing, zero scanning, zero credential access.
    """
    await _require_survey_access(db, survey_id, current_user)
    measurement = await SurveyService.collect_live_measurement(
        db=db,
        session_id=survey_id,
        payload=payload,
        technician_id=current_user.id,
    )
    return _format_measurement(measurement)


@router.patch(
    "/{survey_id}/measurements/{measurement_id}/reposition",
    response_model=SurveyMeasurementResponse,
    summary="Correct mistaken position of an existing survey measurement",
)
async def reposition_measurement(
    payload: MeasurementRepositionRequest,
    survey_id: uuid.UUID = Path(..., description="Survey session UUID"),
    measurement_id: uuid.UUID = Path(..., description="Measurement UUID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineer_or_admin),
    _: None = Depends(verify_csrf),
):
    """
    Adjusts the coordinates of a mistakenly placed measurement point.
    Preserves original measurement values and logs position change in audit history.
    """
    await _require_survey_access(db, survey_id, current_user)
    measurement = await SurveyService.reposition_measurement(
        db=db,
        session_id=survey_id,
        measurement_id=measurement_id,
        payload=payload,
        technician_id=current_user.id,
    )
    return _format_measurement(measurement)


@router.delete(
    "/{survey_id}/measurements/{measurement_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a measurement record",
)
async def delete_measurement(
    survey_id: uuid.UUID = Path(..., description="Survey session UUID"),
    measurement_id: uuid.UUID = Path(..., description="Measurement UUID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineer_or_admin),
    _: None = Depends(verify_csrf),
):
    """Deletes an invalid or erroneous measurement with audit tracking."""
    await _require_survey_access(db, survey_id, current_user)
    await SurveyService.delete_measurement(db, survey_id, measurement_id)
    return None


@router.post(
    "/{survey_id}/heatmap",
    response_model=HeatmapGridResponse,
    summary="Generate IDW estimated coverage heatmap grid",
)
@router.get(
    "/{survey_id}/heatmap",
    response_model=HeatmapGridResponse,
    summary="Retrieve IDW estimated coverage heatmap grid",
)
async def get_or_calculate_heatmap(
    request: Request,
    survey_id: uuid.UUID = Path(..., description="Survey session UUID"),
    grid_cols: int = Query(80, ge=20, le=120, description="Horizontal grid density"),
    grid_rows: int = Query(50, ge=15, le=80, description="Vertical grid density"),
    power: float = Query(2.0, ge=1.0, le=4.0, description="IDW distance weighting power"),
    network_label: Optional[str] = Query(None, description="Optional network SSID filter to prevent cross-network contamination"),
    ap_reference: Optional[str] = Query(None, description="Optional AP identifier filter"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_authenticated),
):
    """
    Generates an estimated coverage surface from real saved survey points using Inverse Distance Weighting.
    Requires at least 3 non-collinear observations.
    Enforces convex-hull spatial support masking and per-network isolation to prevent contamination.
    """
    await _require_survey_access(db, survey_id, current_user)
    result = await SurveyService.calculate_heatmap(
        db=db,
        session_id=survey_id,
        grid_cols=grid_cols,
        grid_rows=grid_rows,
        power=power,
        network_label=network_label,
        ap_reference=ap_reference,
    )
    if request.method == "POST":
        db.add(
            AuditLog(
                actor_id=current_user.id,
                action="survey.heatmap_generated",
                resource_type="survey_sessions",
                resource_id=str(survey_id),
                payload={
                    "sample_count": result.sample_count,
                    "grid_cols": grid_cols,
                    "grid_rows": grid_rows,
                    "power": power,
                    "network_label": result.network_label,
                    "min_rssi": result.min_rssi,
                    "max_rssi": result.max_rssi,
                    "avg_rssi": result.avg_rssi,
                },
            )
        )
        await db.commit()
    return result


@router.get(
    "/{survey_id}/analysis",
    response_model=SurveySummaryStats,
    summary="Retrieve statistical metrics and coverage breakdown",
)
async def get_survey_analysis(
    survey_id: uuid.UUID = Path(..., description="Survey session UUID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_authenticated),
):
    """Computes genuine mathematical min/max/average RSSI, source breakdown, and coverage estimates."""
    await _require_survey_access(db, survey_id, current_user)
    return await SurveyService.get_survey_analysis(db, survey_id)


@router.get(
    "/{survey_id}/validation",
    response_model=SurveyValidationResponse,
    summary="Evaluate heatmap interpolation accuracy via Leave-One-Out Cross-Validation",
)
async def validate_survey_heatmap(
    survey_id: uuid.UUID = Path(..., description="Survey session UUID"),
    network_label: Optional[str] = Query(None, description="Optional network SSID filter"),
    power: float = Query(2.0, ge=1.0, le=4.0, description="IDW distance weighting power"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_authenticated),
):
    """
    Empirically validates spatial IDW interpolation accuracy by holding out each survey point,
    predicting its signal strength using the remaining points, and computing Mean Absolute Error (MAE in dBm).
    """
    await _require_survey_access(db, survey_id, current_user)
    return await SurveyService.validate_survey_heatmap(
        db=db,
        session_id=survey_id,
        network_label=network_label,
        power=power,
    )
