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
from airgrid.models.all_models import User, SurveySession, SurveyMeasurement
from airgrid.schemas.survey import (
    SurveySessionCreate,
    SurveySessionUpdate,
    SurveyMeasurementCreate,
    SurveyMeasurementResponse,
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

router = APIRouter(prefix="/surveys", tags=["Wi-Fi Surveys & Heatmaps"])


def _format_measurement(m: SurveyMeasurement) -> SurveyMeasurementResponse:
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
    Requires Network Engineer or Administrator role.
    """
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
    _: User = Depends(require_authenticated),
):
    """Lists survey sessions matching filter parameters."""
    items, total = await SurveyService.list_survey_sessions(
        db=db,
        campus_id=campus_id,
        building_id=building_id,
        floor_id=floor_id,
        status_filter=status,
        limit=limit,
        offset=offset,
    )
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
    _: User = Depends(require_authenticated),
):
    """Retrieves a single survey session including all recorded measurements."""
    session = await SurveyService.get_survey_session(db, survey_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Survey session '{survey_id}' not found.",
        )
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
    """Updates survey session name, description, or status."""
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
    """Marks survey session status as completed with a completion timestamp."""
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
    Requires Network Engineer or Administrator permissions.
    """
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
    _: User = Depends(require_authenticated),
):
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
    _: User = Depends(require_authenticated),
):
    """Returns all measurements recorded for the given survey session."""
    measurements = await SurveyService.list_measurements(db, survey_id)
    return [_format_measurement(m) for m in measurements]


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
    survey_id: uuid.UUID = Path(..., description="Survey session UUID"),
    grid_cols: int = Query(80, ge=20, le=120, description="Horizontal grid density"),
    grid_rows: int = Query(50, ge=15, le=80, description="Vertical grid density"),
    power: float = Query(2.0, ge=1.0, le=4.0, description="IDW distance weighting power"),
    network_label: Optional[str] = Query(None, description="Optional network SSID filter to prevent cross-network contamination"),
    ap_reference: Optional[str] = Query(None, description="Optional AP identifier filter"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_authenticated),
):
    """
    Generates an estimated coverage surface from real saved survey points using Inverse Distance Weighting.
    Requires at least 3 non-collinear observations.
    Enforces convex-hull spatial support masking and per-network isolation to prevent contamination.
    """
    return await SurveyService.calculate_heatmap(
        db=db,
        session_id=survey_id,
        grid_cols=grid_cols,
        grid_rows=grid_rows,
        power=power,
        network_label=network_label,
        ap_reference=ap_reference,
    )


@router.get(
    "/{survey_id}/analysis",
    response_model=SurveySummaryStats,
    summary="Retrieve statistical metrics and coverage breakdown",
)
async def get_survey_analysis(
    survey_id: uuid.UUID = Path(..., description="Survey session UUID"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_authenticated),
):
    """Computes genuine mathematical min/max/average RSSI, source breakdown, and coverage estimates."""
    return await SurveyService.get_survey_analysis(db, survey_id)
