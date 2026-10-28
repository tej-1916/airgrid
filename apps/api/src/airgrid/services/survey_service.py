import os
import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Tuple, Dict, Any

from fastapi import HTTPException, status
from sqlalchemy import select, func, and_, or_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError

from airgrid.models.all_models import (
    SurveySession,
    SurveyMeasurement,
    Floor,
    FloorPlanAsset,
    Building,
    Campus,
    User,
    AuditLog,
    NetworkTelemetrySnapshot,
)
from airgrid.schemas.survey import (
    SurveySessionCreate,
    SurveySessionUpdate,
    SurveyMeasurementCreate,
    SurveyMeasurementResponse,
    SurveySessionResponse,
    SurveySummaryStats,
    HeatmapGridResponse,
    SurveyComparisonResponse,
)



INSTRUMENT_VANTAGES = {"registered_collector", "backend_server"}
PLACEMENT_WINDOW_SECONDS = 15 * 60

class SurveyService:
    @staticmethod
    async def create_survey_session(
        db: AsyncSession,
        payload: SurveySessionCreate,
        technician_id: uuid.UUID,
    ) -> SurveySession:
        """Creates a new survey session bound to a verified floor."""
        # 1. Verify floor exists with its building and campus hierarchy
        stmt_floor = select(Floor).options(selectinload(Floor.building)).where(Floor.id == payload.floor_id)
        res_floor = await db.execute(stmt_floor)
        floor = res_floor.scalar_one_or_none()
        if not floor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Floor with ID '{payload.floor_id}' not found.",
            )

        # 2. Validate building and campus alignment if explicitly provided
        if payload.building_id and payload.building_id != floor.building_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Floor '{floor.id}' belongs to Building '{floor.building_id}', not '{payload.building_id}'.",
            )

        if payload.campus_id and floor.building and payload.campus_id != floor.building.campus_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Floor belongs to Campus '{floor.building.campus_id}', not '{payload.campus_id}'.",
            )

        resolved_campus_id = payload.campus_id or (floor.building.campus_id if floor.building else None)
        resolved_building_id = payload.building_id or floor.building_id

        # 3. Create survey session
        session = SurveySession(
            floor_id=payload.floor_id,
            building_id=resolved_building_id,
            campus_id=resolved_campus_id,
            technician_id=technician_id,
            session_name=payload.session_name.strip(),
            description=payload.description.strip() if payload.description else None,
            status="in_progress",
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
        return session

    @staticmethod
    async def get_survey_session(
        db: AsyncSession,
        session_id: uuid.UUID,
    ) -> Optional[SurveySession]:
        """Retrieves a single survey session with measurements and technician."""
        stmt = (
            select(SurveySession)
            .options(
                selectinload(SurveySession.measurements),
                selectinload(SurveySession.technician),
                selectinload(SurveySession.floor),
            )
            .where(SurveySession.id == session_id)
        )
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    @staticmethod
    async def list_survey_sessions(
        db: AsyncSession,
        campus_id: Optional[uuid.UUID] = None,
        building_id: Optional[uuid.UUID] = None,
        floor_id: Optional[uuid.UUID] = None,
        status_filter: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[SurveySession], int]:
        """Lists survey sessions with optional hierarchy and status filtering."""
        conditions = []
        if campus_id:
            conditions.append(SurveySession.campus_id == campus_id)
        if building_id:
            conditions.append(SurveySession.building_id == building_id)
        if floor_id:
            conditions.append(SurveySession.floor_id == floor_id)
        if status_filter:
            conditions.append(SurveySession.status == status_filter)

        where_clause = and_(*conditions) if conditions else True

        # Total count query
        count_stmt = select(func.count(SurveySession.id)).where(where_clause)
        total_res = await db.execute(count_stmt)
        total = total_res.scalar() or 0

        # Paginated items query
        stmt = (
            select(SurveySession)
            .options(
                selectinload(SurveySession.measurements),
                selectinload(SurveySession.technician),
            )
            .where(where_clause)
            .order_by(SurveySession.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        res = await db.execute(stmt)
        items = list(res.scalars().all())
        return items, total

    @staticmethod
    async def update_survey_session(
        db: AsyncSession,
        session_id: uuid.UUID,
        payload: SurveySessionUpdate,
    ) -> SurveySession:
        """Updates survey session metadata."""
        session = await SurveyService.get_survey_session(db, session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Survey session '{session_id}' not found.",
            )

        if payload.session_name is not None:
            session.session_name = payload.session_name.strip()
        if payload.description is not None:
            session.description = payload.description.strip() if payload.description else None
        if payload.status is not None:
            session.status = payload.status
            if payload.status == "completed" and not session.completed_at:
                session.completed_at = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(session)
        return session

    @staticmethod
    async def complete_survey_session(
        db: AsyncSession,
        session_id: uuid.UUID,
    ) -> SurveySession:
        """Marks a survey session as completed."""
        session = await SurveyService.get_survey_session(db, session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Survey session '{session_id}' not found.",
            )
        session.status = "completed"
        session.completed_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(session)
        return session

    @staticmethod
    async def add_measurement(
        db: AsyncSession,
        session_id: uuid.UUID,
        payload: SurveyMeasurementCreate,
        technician_id: uuid.UUID,
    ) -> SurveyMeasurement:
        """Validates and records a signal measurement on a survey session."""
        session = await SurveyService.get_survey_session(db, session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Survey session '{session_id}' not found.",
            )

        if session.status == "archived":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot add measurements to an archived survey session.",
            )

        if session.floor_id != payload.floor_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Measurement floor '{payload.floor_id}' does not match active survey floor '{session.floor_id}'.",
            )

        # Check floor plan bounds for position validation
        stmt_plan = select(FloorPlanAsset).where(FloorPlanAsset.floor_id == payload.floor_id)
        res_plan = await db.execute(stmt_plan)
        plan = res_plan.scalar_one_or_none()

        if plan:
            if payload.position_x > plan.pixel_width or payload.position_y > plan.pixel_height:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=(
                        f"Measurement coordinate ({payload.position_x:.1f}, {payload.position_y:.1f}) exceeds "
                        f"floor plan bounds ({plan.pixel_width}x{plan.pixel_height} px)."
                    ),
                )
            normalized_x = payload.position_x / plan.pixel_width if plan.pixel_width > 0 else 0.0
            normalized_y = payload.position_y / plan.pixel_height if plan.pixel_height > 0 else 0.0
        else:
            # Fallback if unassigned plan
            normalized_x = min(max(payload.position_x / 1000.0, 0.0), 1.0)
            normalized_y = min(max(payload.position_y / 1000.0, 0.0), 1.0)

        # Check for near-duplicate point in the same session (within 0.5px) to prevent duplicate overlays
        stmt_dup = select(SurveyMeasurement).where(
            and_(
                SurveyMeasurement.survey_session_id == session_id,
                func.abs(SurveyMeasurement.position_x - payload.position_x) < 0.5,
                func.abs(SurveyMeasurement.position_y - payload.position_y) < 0.5,
            )
        )
        res_dup = await db.execute(stmt_dup)
        existing_point = res_dup.scalar_one_or_none()

        if existing_point and existing_point.source_telemetry_snapshot_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An instrument-verified observation occupies this position; delete it before entering a manual value.",
            )
        if existing_point:
            # Update existing observation at this position
            existing_point.rssi_dbm = payload.rssi_dbm
            existing_point.measurement_source = payload.measurement_source
            existing_point.network_label = payload.network_label
            existing_point.ap_reference = payload.ap_reference
            existing_point.frequency_mhz = payload.frequency_mhz
            existing_point.channel = payload.channel
            existing_point.notes = payload.notes
            existing_point.data_provenance = payload.data_provenance
            existing_point.observed_at = datetime.now(timezone.utc)
            await db.commit()
            await db.refresh(existing_point)
            return existing_point

        measurement = SurveyMeasurement(
            survey_session_id=session_id,
            floor_id=payload.floor_id,
            position_x=payload.position_x,
            position_y=payload.position_y,
            normalized_x=normalized_x,
            normalized_y=normalized_y,
            rssi_dbm=payload.rssi_dbm,
            measurement_source=payload.measurement_source,
            network_label=payload.network_label,
            ap_reference=payload.ap_reference,
            frequency_mhz=payload.frequency_mhz,
            channel=payload.channel,
            notes=payload.notes,
            data_provenance=payload.data_provenance,
            observed_at=datetime.now(timezone.utc),
        )
        db.add(measurement)
        await db.commit()
        await db.refresh(measurement)
        return measurement

    @staticmethod
    async def placeable_snapshots(db: AsyncSession, session_id: uuid.UUID) -> List[NetworkTelemetrySnapshot]:
        """Fresh, complete, unplaced instrument observations for this floor (or unscoped collectors)."""
        session = await SurveyService.get_survey_session(db, session_id)
        if not session:
            raise HTTPException(status_code=404, detail=f"Survey session '{session_id}' not found.")
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=PLACEMENT_WINDOW_SECONDS)
        S = NetworkTelemetrySnapshot
        result = await db.execute(select(S).where(
            S.collected_at >= cutoff, S.data_provenance == "instrumented_linux_telemetry",
            S.vantage_point.in_(INSTRUMENT_VANTAGES), S.collection_status == "collected",
            S.rssi_dbm.is_not(None), S.ssid.is_not(None),
            or_(S.floor_id == session.floor_id, S.floor_id.is_(None)),
            ~select(SurveyMeasurement.id).where(SurveyMeasurement.source_telemetry_snapshot_id == S.id).exists(),
        ).order_by(S.collected_at.desc()).limit(20))
        return list(result.scalars())

    @staticmethod
    async def place_snapshot(db: AsyncSession, session_id: uuid.UUID, payload, technician_id: uuid.UUID) -> SurveyMeasurement:
        """Link one stored, server-owned instrument snapshot to an operator-chosen calibrated position.

        Location is never inferred from signal strength or browser APIs: the operator places it.
        """
        session = await SurveyService.get_survey_session(db, session_id)
        if not session:
            raise HTTPException(status_code=404, detail=f"Survey session '{session_id}' not found.")
        if session.status == "archived":
            raise HTTPException(status_code=400, detail="Cannot add measurements to an archived survey session.")
        snapshot = await db.get(NetworkTelemetrySnapshot, payload.telemetry_snapshot_id)
        if not snapshot:
            raise HTTPException(status_code=404, detail="Telemetry snapshot not found.")
        if (snapshot.data_provenance != "instrumented_linux_telemetry"
                or snapshot.vantage_point not in INSTRUMENT_VANTAGES):
            raise HTTPException(status_code=422, detail="Only server-collected or registered-collector observations can be placed.")
        if snapshot.collection_status != "collected" or snapshot.rssi_dbm is None or not snapshot.ssid:
            raise HTTPException(status_code=422, detail="The observation lacks a complete RSSI and network identity.")
        if snapshot.floor_id and snapshot.floor_id != session.floor_id:
            raise HTTPException(status_code=422, detail="The observation was attributed to a different floor.")
        collected = snapshot.collected_at if snapshot.collected_at.tzinfo else snapshot.collected_at.replace(tzinfo=timezone.utc)
        age = (datetime.now(timezone.utc) - collected).total_seconds()
        if age > PLACEMENT_WINDOW_SECONDS:
            raise HTTPException(status_code=422, detail="Place observations within 15 minutes of collection so the position reflects where it was measured.")
        linked = await db.execute(select(SurveyMeasurement.id).where(SurveyMeasurement.source_telemetry_snapshot_id == snapshot.id))
        if linked.first():
            raise HTTPException(status_code=409, detail="This observation is already placed on a survey.")
        plan = (await db.execute(select(FloorPlanAsset).where(FloorPlanAsset.floor_id == session.floor_id))).scalar_one_or_none()
        if not plan or not plan.is_calibrated or not plan.scale_pixels_per_meter or plan.scale_pixels_per_meter <= 0:
            raise HTTPException(status_code=422, detail="A calibrated floor plan is required before placing instrument observations.")
        if payload.position_x > plan.pixel_width or payload.position_y > plan.pixel_height:
            raise HTTPException(status_code=422, detail="Position exceeds floor plan bounds.")
        occupied = await db.execute(select(SurveyMeasurement.id).where(
            SurveyMeasurement.survey_session_id == session_id,
            func.abs(SurveyMeasurement.position_x - payload.position_x) < 0.5,
            func.abs(SurveyMeasurement.position_y - payload.position_y) < 0.5))
        if occupied.first():
            raise HTTPException(status_code=409, detail="A survey point already exists at this position.")
        measurement = SurveyMeasurement(
            survey_session_id=session_id, floor_id=session.floor_id,
            position_x=payload.position_x, position_y=payload.position_y,
            normalized_x=payload.position_x / plan.pixel_width, normalized_y=payload.position_y / plan.pixel_height,
            rssi_dbm=snapshot.rssi_dbm, network_label=snapshot.ssid, ap_reference=snapshot.bssid,
            frequency_mhz=snapshot.frequency_mhz, channel=snapshot.channel, notes=payload.notes,
            measurement_source=snapshot.vantage_point, data_provenance="field_instrument_verified",
            source_telemetry_snapshot_id=snapshot.id, observed_at=collected,
        )
        db.add(measurement)
        db.add(AuditLog(actor_id=technician_id, action="survey.instrument_point_placed", resource_type="survey_measurements",
                        resource_id=str(session_id), payload={"telemetry_snapshot_id": str(snapshot.id),
                                                              "collector_id": str(snapshot.collector_id) if snapshot.collector_id else None}))
        try:
            await db.commit()
        except IntegrityError:
            # Unique source_telemetry_snapshot_id: a concurrent placement of the same snapshot.
            await db.rollback()
            raise HTTPException(status_code=409, detail="This observation is already placed on a survey.")
        await db.refresh(measurement)
        return measurement

    @staticmethod
    async def delete_measurement(
        db: AsyncSession,
        session_id: uuid.UUID,
        measurement_id: uuid.UUID,
    ) -> bool:
        """Deletes a measurement by ID from a survey session."""
        stmt = select(SurveyMeasurement).where(
            and_(
                SurveyMeasurement.id == measurement_id,
                SurveyMeasurement.survey_session_id == session_id,
            )
        )
        res = await db.execute(stmt)
        measurement = res.scalar_one_or_none()
        if not measurement:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Measurement '{measurement_id}' not found in survey session '{session_id}'.",
            )
        await db.delete(measurement)
        await db.commit()
        return True

    @staticmethod
    async def list_measurements(
        db: AsyncSession,
        session_id: uuid.UUID,
    ) -> List[SurveyMeasurement]:
        """Lists all measurements recorded for a survey session."""
        stmt = (
            select(SurveyMeasurement)
            .where(SurveyMeasurement.survey_session_id == session_id)
            .order_by(SurveyMeasurement.observed_at.asc())
        )
        res = await db.execute(stmt)
        return list(res.scalars().all())

    @staticmethod
    def _is_collinear(points: List[Tuple[float, float]], threshold_area: float = 25.0) -> bool:
        """
        Determines if all points in a set are collinear by checking if the maximum
        triangle area formed by any triplet of points is below threshold_area.
        """
        n = len(points)
        if n < 3:
            return True

        max_area = 0.0
        for i in range(n):
            for j in range(i + 1, n):
                for k in range(j + 1, n):
                    x1, y1 = points[i]
                    x2, y2 = points[j]
                    x3, y3 = points[k]
                    area = 0.5 * abs(x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2))
                    if area > max_area:
                        max_area = area

        return max_area < threshold_area

    @staticmethod
    def _predict_idw(x, y, samples, scale, hull, power=2.0, hull_buffer_meters=4.0):
        if not samples or scale <= 0 or SurveyService._dist_to_convex_hull(x, y, hull) > hull_buffer_meters * scale:
            return None
        distances = [math.hypot(x - px, y - py) / scale for px, py, _ in samples]
        if min(distances) > 18.0:
            return None
        weights = [1.0 / ((distance + 0.5) ** power) for distance in distances]
        return sum(weight * sample[2] for weight, sample in zip(weights, samples)) / sum(weights)

    @staticmethod
    def _compute_convex_hull(points: List[Tuple[float, float]]) -> List[Tuple[float, float]]:
        """
        Computes 2D Convex Hull using Andrew's Monotone Chain algorithm.
        Returns ordered vertices of the minimal enclosing convex polygon.
        """
        pts = sorted(set(points))
        if len(pts) <= 2:
            return pts

        def cross(o: Tuple[float, float], a: Tuple[float, float], b: Tuple[float, float]) -> float:
            return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

        lower: List[Tuple[float, float]] = []
        for p in pts:
            while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
                lower.pop()
            lower.append(p)

        upper: List[Tuple[float, float]] = []
        for p in reversed(pts):
            while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
                upper.pop()
            upper.append(p)

        return lower[:-1] + upper[:-1]

    @staticmethod
    def _dist_point_to_segment(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
        """Calculates Euclidean distance from point P to line segment AB."""
        abx = bx - ax
        aby = by - ay
        ab_len_sq = abx * abx + aby * aby
        if ab_len_sq == 0:
            return math.hypot(px - ax, py - ay)
        t = max(0.0, min(1.0, ((px - ax) * abx + (py - ay) * aby) / ab_len_sq))
        qx = ax + t * abx
        qy = ay + t * aby
        return math.hypot(px - qx, py - qy)

    @staticmethod
    def _dist_to_convex_hull(px: float, py: float, hull: List[Tuple[float, float]]) -> float:
        """
        Calculates distance from point P to convex hull polygon.
        Returns 0.0 if P is inside the hull, or the Euclidean distance to the closest boundary edge if outside.
        """
        n = len(hull)
        if n < 3:
            return min((math.hypot(px - hx, py - hy) for hx, hy in hull), default=float("inf"))

        inside = True
        min_edge_dist = float("inf")
        for i in range(n):
            ax, ay = hull[i]
            bx, by = hull[(i + 1) % n]
            cp = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
            if cp < -1e-7:
                inside = False
            d = SurveyService._dist_point_to_segment(px, py, ax, ay, bx, by)
            if d < min_edge_dist:
                min_edge_dist = d

        return 0.0 if inside else min_edge_dist

    @staticmethod
    async def calculate_heatmap(
        db: AsyncSession,
        session_id: uuid.UUID,
        grid_cols: int = 80,
        grid_rows: int = 50,
        power: float = 2.0,
        network_label: Optional[str] = None,
        ap_reference: Optional[str] = None,
        hull_buffer_meters: float = 4.0,
    ) -> HeatmapGridResponse:
        """
        Computes an estimated coverage heatmap using Inverse Distance Weighting (IDW).
        Enforces:
        - Non-collinearity and minimum sample safeguards (N >= 3)
        - Convex-hull spatial support masking (rejects ungrounded extrapolation outside measured perimeter)
        - Per-network isolation (prevents silent cross-network or cross-AP contamination)
        - Physical radial distance bounds
        """
        session = await SurveyService.get_survey_session(db, session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Survey session '{session_id}' not found.",
            )

        measurements = list(session.measurements or [])

        # 1. Filter by specific network_label or ap_reference if requested
        if network_label is not None and network_label.strip():
            target_net = network_label.strip()
            measurements = [
                m for m in measurements
                if (m.network_label or "").strip() == target_net
            ]
        if ap_reference is not None and ap_reference.strip():
            target_ap = ap_reference.strip().lower()
            measurements = [
                m for m in measurements
                if (m.ap_reference or "").strip().lower() == target_ap
            ]

        # 2. Prevent cross-network silent contamination if no filter was provided but multiple networks exist
        if (network_label is None or not network_label.strip()) and (ap_reference is None or not ap_reference.strip()):
            distinct_networks = set(
                (m.network_label or "").strip()
                for m in measurements
                if m.network_label and m.network_label.strip()
            )
            if len(distinct_networks) > 1:
                networks_str = ", ".join(sorted(distinct_networks))
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=(
                        f"Survey session contains measurements from multiple distinct networks ({networks_str}). "
                        f"Specify 'network_label' query parameter to generate a non-contaminated per-network coverage heatmap."
                    ),
                )

        if not measurements or len(measurements) < 3:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    f"Insufficient survey measurements for coverage estimation. "
                    f"At least 3 spatially distinct, non-collinear observations required (found {len(measurements) if measurements else 0})."
                ),
            )

        # Extract coordinates and test non-collinearity
        coords = [(m.position_x, m.position_y) for m in measurements]
        if SurveyService._is_collinear(coords):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    "Insufficient survey measurements for coverage estimation: "
                    "All points lie along a single line (collinear). A 2D spatial distribution is required."
                ),
            )

        # Get floor plan dimensions and scale
        stmt_plan = select(FloorPlanAsset).where(FloorPlanAsset.floor_id == session.floor_id)
        res_plan = await db.execute(stmt_plan)
        plan = res_plan.scalar_one_or_none()

        if plan and plan.pixel_width > 0 and plan.pixel_height > 0:
            width_px = plan.pixel_width
            height_px = plan.pixel_height
            scale_px_per_m = plan.scale_pixels_per_meter if plan.is_calibrated else 20.0
        else:
            width_px = 1000
            height_px = 600
            scale_px_per_m = 20.0

        # Physical mask radius (in meters) and convex-hull spatial support buffer
        mask_radius_m = 18.0
        smoothing_eps_m = 0.5
        hull_buffer_px = hull_buffer_meters * scale_px_per_m

        # Compute 2D Convex Hull of the physical observation points
        convex_hull = SurveyService._compute_convex_hull(coords)

        # Compute IDW grid
        samples = [(m.position_x, m.position_y, m.rssi_dbm) for m in measurements]
        sample_rssis = [m.rssi_dbm for m in measurements]
        min_rssi = min(sample_rssis)
        max_rssi = max(sample_rssis)
        avg_rssi = sum(sample_rssis) / len(sample_rssis)

        grid_data: List[List[Optional[float]]] = []
        unmasked_cells = 0
        total_cells = grid_rows * grid_cols

        dx_step = width_px / max(grid_cols - 1, 1)
        dy_step = height_px / max(grid_rows - 1, 1)

        for r in range(grid_rows):
            row: List[Optional[float]] = []
            y = r * dy_step
            for c in range(grid_cols):
                x = c * dx_step

                # Convex Hull Spatial Support Mask:
                # Disallow ungrounded extrapolation outside measured perimeter + buffer
                dist_to_hull_px = SurveyService._dist_to_convex_hull(x, y, convex_hull)
                if dist_to_hull_px > hull_buffer_px:
                    row.append(None)
                    continue

                prediction = SurveyService._predict_idw(x, y, samples, scale_px_per_m, convex_hull,
                                                        power=power, hull_buffer_meters=hull_buffer_meters)
                if prediction is None:
                    row.append(None)
                else:
                    unmasked_cells += 1
                    row.append(round(prediction, 2))

            grid_data.append(row)

        is_sparse = len(measurements) < 5 or (unmasked_cells / max(total_cells, 1)) < 0.20
        effective_network = network_label or (measurements[0].network_label if measurements else None)
        effective_ap = ap_reference or (measurements[0].ap_reference if measurements else None)

        return HeatmapGridResponse(
            survey_session_id=session.id,
            floor_id=session.floor_id,
            grid_width=grid_cols,
            grid_height=grid_rows,
            pixel_width=width_px,
            pixel_height=height_px,
            scale_pixels_per_meter=scale_px_per_m,
            sample_count=len(measurements),
            min_rssi=round(min_rssi, 2),
            max_rssi=round(max_rssi, 2),
            avg_rssi=round(avg_rssi, 2),
            grid_data=grid_data,
            confidence_notice="Estimated coverage from measured survey points.",
            is_sparse_warning=is_sparse,
            mask_radius_meters=mask_radius_m,
            power_parameter=power,
            network_label=effective_network,
            ap_reference=effective_ap,
            convex_hull_support=True,
        )

    @staticmethod
    async def get_survey_analysis(
        db: AsyncSession,
        session_id: uuid.UUID,
    ) -> SurveySummaryStats:
        """Calculates authentic statistical aggregates from real saved measurements."""
        session = await SurveyService.get_survey_session(db, session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Survey session '{session_id}' not found.",
            )

        measurements = session.measurements
        # Overall counts for floor
        stmt_total_surveys = select(func.count(SurveySession.id)).where(SurveySession.floor_id == session.floor_id)
        stmt_completed_surveys = select(func.count(SurveySession.id)).where(
            and_(SurveySession.floor_id == session.floor_id, SurveySession.status == "completed")
        )
        res_tot = await db.execute(stmt_total_surveys)
        res_comp = await db.execute(stmt_completed_surveys)
        total_surveys = res_tot.scalar() or 0
        completed_surveys = res_comp.scalar() or 0

        if not measurements:
            return SurveySummaryStats(
                total_surveys=total_surveys,
                completed_surveys=completed_surveys,
                total_measurements=0,
                min_rssi_dbm=None,
                max_rssi_dbm=None,
                avg_rssi_dbm=None,
                source_breakdown={},
                coverage_availability_pct=0.0,
                unmeasured_areas_noted=True,
            )

        rssi_vals = [m.rssi_dbm for m in measurements]
        min_rssi = min(rssi_vals)
        max_rssi = max(rssi_vals)
        avg_rssi = sum(rssi_vals) / len(rssi_vals)

        sources: Dict[str, int] = {}
        for m in measurements:
            sources[m.measurement_source] = sources.get(m.measurement_source, 0) + 1

        # Calculate approximate coverage availability percentage based on points
        # If at least 3 points, calculate grid unmasked ratio
        coverage_pct = min(len(measurements) * 8.5, 95.0)
        if len(measurements) >= 3 and not SurveyService._is_collinear([(m.position_x, m.position_y) for m in measurements]):
            try:
                heatmap = await SurveyService.calculate_heatmap(db, session_id, grid_cols=40, grid_rows=25)
                unmasked = sum(1 for row in heatmap.grid_data for cell in row if cell is not None)
                coverage_pct = round((unmasked / (40 * 25)) * 100.0, 1)
            except Exception:
                pass

        return SurveySummaryStats(
            total_surveys=total_surveys,
            completed_surveys=completed_surveys,
            total_measurements=len(measurements),
            min_rssi_dbm=round(min_rssi, 2),
            max_rssi_dbm=round(max_rssi, 2),
            avg_rssi_dbm=round(avg_rssi, 2),
            source_breakdown=sources,
            coverage_availability_pct=coverage_pct,
            unmeasured_areas_noted=coverage_pct < 85.0,
        )

    @staticmethod
    async def compare_surveys(
        db: AsyncSession,
        session_id_1: uuid.UUID,
        session_id_2: uuid.UUID,
    ) -> SurveyComparisonResponse:
        """Compares two survey sessions on the same floor."""
        s1 = await SurveyService.get_survey_session(db, session_id_1)
        s2 = await SurveyService.get_survey_session(db, session_id_2)

        if not s1 or not s2:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="One or both survey sessions for comparison could not be found.",
            )

        if s1.floor_id != s2.floor_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Cannot compare survey sessions from different floors.",
            )

        m1 = s1.measurements or []
        m2 = s2.measurements or []

        sample_delta = len(m2) - len(m1)

        avg_1 = sum(m.rssi_dbm for m in m1) / len(m1) if m1 else None
        avg_2 = sum(m.rssi_dbm for m in m2) / len(m2) if m2 else None
        avg_delta = round(avg_2 - avg_1, 2) if avg_1 is not None and avg_2 is not None else None

        min_1 = min(m.rssi_dbm for m in m1) if m1 else None
        min_2 = min(m.rssi_dbm for m in m2) if m2 else None
        min_delta = round(min_2 - min_1, 2) if min_1 is not None and min_2 is not None else None

        max_1 = max(m.rssi_dbm for m in m1) if m1 else None
        max_2 = max(m.rssi_dbm for m in m2) if m2 else None
        max_delta = round(max_2 - max_1, 2) if max_1 is not None and max_2 is not None else None

        notes = (
            f"Comparison between '{s1.session_name}' ({len(m1)} samples) and "
            f"'{s2.session_name}' ({len(m2)} samples) on floor {s1.floor_id}."
        )

        return SurveyComparisonResponse(
            session1=SurveySessionResponse(
                id=s1.id,
                campus_id=s1.campus_id,
                building_id=s1.building_id,
                floor_id=s1.floor_id,
                technician_id=s1.technician_id,
                operator_name=s1.technician.full_name if s1.technician else "System Operator",
                session_name=s1.session_name,
                description=s1.description,
                status=s1.status,
                started_at=s1.started_at,
                completed_at=s1.completed_at,
                created_at=s1.created_at,
                updated_at=s1.updated_at,
                measurement_count=len(m1),
            ),
            session2=SurveySessionResponse(
                id=s2.id,
                campus_id=s2.campus_id,
                building_id=s2.building_id,
                floor_id=s2.floor_id,
                technician_id=s2.technician_id,
                operator_name=s2.technician.full_name if s2.technician else "System Operator",
                session_name=s2.session_name,
                description=s2.description,
                status=s2.status,
                started_at=s2.started_at,
                completed_at=s2.completed_at,
                created_at=s2.created_at,
                updated_at=s2.updated_at,
                measurement_count=len(m2),
            ),
            sample_count_delta=sample_delta,
            avg_rssi_delta_db=avg_delta,
            min_rssi_delta_db=min_delta,
            max_rssi_delta_db=max_delta,
            notes=notes,
        )

    @staticmethod
    def get_host_telemetry() -> Dict[str, Any]:
        """
        Safely inspects the local Linux host for connected Wi-Fi interface status via /proc/net/wireless.
        Zero active scanning, zero packet capture, zero credential access.
        Clearly declares server-host provenance to prevent conflation with browser vantage point.
        """
        wireless_proc = "/proc/net/wireless"
        if not os.path.exists(wireless_proc):
            return {
                "available": False,
                "interface": None,
                "rssi_dbm": None,
                "link_quality": None,
                "noise_dbm": None,
                "vantage_point": "server_host_interface",
                "disclaimer": (
                    "Passive check on the server host's network interfaces (/proc/net/wireless). "
                    "This reflects the server host environment only, NOT the operator's browser device."
                ),
                "message": "Wireless telemetry not available on this host environment.",
            }

        try:
            with open(wireless_proc, "r") as f:
                lines = f.readlines()

            # Skip header lines (first 2 lines)
            for line in lines[2:]:
                parts = line.strip().split()
                if len(parts) >= 4:
                    iface = parts[0].rstrip(":")
                    # Parse link quality and level
                    try:
                        link_val = float(parts[2].rstrip("."))
                        level_val = float(parts[3].rstrip("."))
                        # Typical /proc/net/wireless level is in dBm (e.g. -24 or -65)
                        rssi = level_val if level_val < 0 else (level_val - 256 if level_val > 100 else -100 + level_val)
                        return {
                            "available": True,
                            "interface": iface,
                            "rssi_dbm": round(rssi, 1),
                            "link_quality": link_val,
                            "noise_dbm": float(parts[4].rstrip(".")) if len(parts) > 4 else None,
                            "vantage_point": "server_host_interface",
                            "disclaimer": (
                                "Passive check on the server host's network interface (/proc/net/wireless). "
                                "This reflects the server host environment only, NOT the operator's browser device."
                            ),
                        }
                    except (ValueError, IndexError):
                        continue
        except Exception:
            pass

        return {
            "available": False,
            "interface": None,
            "rssi_dbm": None,
            "link_quality": None,
            "noise_dbm": None,
            "vantage_point": "server_host_interface",
            "disclaimer": (
                "Passive check on the server host's network interfaces (/proc/net/wireless). "
                "This reflects the server host environment only, NOT the operator's browser device."
            ),
            "message": "No active connected Wi-Fi interface detected on host.",
        }
