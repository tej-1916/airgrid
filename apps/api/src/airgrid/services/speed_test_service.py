import uuid
from typing import Optional, List, Tuple, Dict, Any
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status

from airgrid.models.all_models import (
    InternetSpeedTest,
    User,
    Campus,
    Building,
    Floor,
    AuditLog,
)
from airgrid.schemas.speed_test import SpeedTestCreate


class SpeedTestService:
    async def create_speed_test(
        self,
        db: AsyncSession,
        data: SpeedTestCreate,
        current_user: User,
        client_user_agent: Optional[str] = None,
        client_ip: Optional[str] = None,
    ) -> InternetSpeedTest:
        """
        Record a legitimate client-executed speed test measurement.
        Validates spatial hierarchy consistency if campus, building, or floor are specified.
        """
        resolved_campus_id = data.campus_id
        resolved_building_id = data.building_id
        resolved_floor_id = data.floor_id

        # 1. Validate Floor if provided
        if resolved_floor_id:
            floor = await db.get(Floor, resolved_floor_id)
            if not floor:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Floor with ID {resolved_floor_id} not found",
                )
            # If building_id was supplied, verify it matches the floor's actual building
            if resolved_building_id and resolved_building_id != floor.building_id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=f"Hierarchy mismatch: Floor {resolved_floor_id} does not belong to Building {resolved_building_id}",
                )
            resolved_building_id = floor.building_id

        # 2. Validate Building if provided or resolved
        if resolved_building_id:
            building = await db.get(Building, resolved_building_id)
            if not building:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Building with ID {resolved_building_id} not found",
                )
            # If campus_id was supplied, verify it matches building's campus
            if resolved_campus_id and resolved_campus_id != building.campus_id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=f"Hierarchy mismatch: Building {resolved_building_id} does not belong to Campus {resolved_campus_id}",
                )
            resolved_campus_id = building.campus_id

        # 3. Validate Campus if provided
        if resolved_campus_id:
            campus = await db.get(Campus, resolved_campus_id)
            if not campus:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Campus with ID {resolved_campus_id} not found",
                )
            # Writes must be attributed only to a campus the caller belongs to (administrators always pass).
            from airgrid.services.campus_service import require_campus_access
            await require_campus_access(db, current_user, resolved_campus_id)

        # 4. Construct record
        ua = (client_user_agent[:512]) if client_user_agent else None
        record = InternetSpeedTest(
            id=uuid.uuid4(),
            user_id=current_user.id,
            device_id=None,
            campus_id=resolved_campus_id,
            building_id=resolved_building_id,
            floor_id=resolved_floor_id,
            vantage_point=data.vantage_point or "client_browser",
            provider_engine=data.provider_engine,
            status=data.status,
            data_provenance="client_reported",
            download_mbps=data.download_mbps,
            upload_mbps=data.upload_mbps,
            latency_ms=data.latency_ms,
            jitter_ms=data.jitter_ms,
            loaded_latency_ms=data.loaded_latency_ms,
            packet_loss_pct=data.packet_loss_pct,
            server_location=data.server_location,
            client_ip_hashed=None,  # Do not persist IP addresses
            client_user_agent=ua,
            quality_metadata=data.quality_metadata,
            error_code=data.error_code,
            error_message=data.error_message,
            started_at=data.started_at,
            completed_at=data.completed_at,
            duration_seconds=data.duration_seconds,
        )

        db.add(record)

        # 5. Audit Log (secret-free)
        audit = AuditLog(
            actor_id=current_user.id,
            action="speed_test.created",
            resource_type="internet_speed_test",
            resource_id=str(record.id),
            payload={
                "provider": data.provider_engine,
                "status": data.status,
                "download_mbps": data.download_mbps,
                "upload_mbps": data.upload_mbps,
                "latency_ms": data.latency_ms,
                "campus_id": str(resolved_campus_id) if resolved_campus_id else None,
            },
            ip_address=None,  # Privacy preservation
        )
        db.add(audit)

        await db.commit()

        # Re-fetch with loaded relationships
        return await self.get_speed_test_by_id(db, record.id)

    async def get_speed_test_by_id(self, db: AsyncSession, test_id: uuid.UUID) -> InternetSpeedTest:
        """Retrieve a single speed test record with relations."""
        stmt = (
            select(InternetSpeedTest)
            .options(
                selectinload(InternetSpeedTest.user),
                selectinload(InternetSpeedTest.campus),
                selectinload(InternetSpeedTest.building),
                selectinload(InternetSpeedTest.floor),
            )
            .where(InternetSpeedTest.id == test_id)
        )
        result = await db.execute(stmt)
        record = result.scalar_one_or_none()
        if not record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Speed test record {test_id} not found",
            )
        return record

    async def list_speed_tests(
        self,
        db: AsyncSession,
        skip: int = 0,
        limit: int = 50,
        campus_id: Optional[uuid.UUID] = None,
        building_id: Optional[uuid.UUID] = None,
        floor_id: Optional[uuid.UUID] = None,
        status_filter: Optional[str] = None,
        provider_filter: Optional[str] = None,
        scope=None,
    ) -> Tuple[int, List[InternetSpeedTest]]:
        """List historical speed test measurements with optional filtering."""
        base_query = select(InternetSpeedTest)
        if scope is not None:
            base_query = base_query.where(scope)

        if campus_id:
            base_query = base_query.where(InternetSpeedTest.campus_id == campus_id)
        if building_id:
            base_query = base_query.where(InternetSpeedTest.building_id == building_id)
        if floor_id:
            base_query = base_query.where(InternetSpeedTest.floor_id == floor_id)
        if status_filter:
            base_query = base_query.where(InternetSpeedTest.status == status_filter)
        if provider_filter:
            base_query = base_query.where(InternetSpeedTest.provider_engine == provider_filter)

        # Count total
        count_stmt = select(func.count()).select_from(base_query.subquery())
        total_res = await db.execute(count_stmt)
        total = total_res.scalar_one()

        # Fetch page with relations
        stmt = (
            base_query.options(
                selectinload(InternetSpeedTest.user),
                selectinload(InternetSpeedTest.campus),
                selectinload(InternetSpeedTest.building),
                selectinload(InternetSpeedTest.floor),
            )
            .order_by(desc(InternetSpeedTest.executed_at))
            .offset(skip)
            .limit(limit)
        )
        items_res = await db.execute(stmt)
        items = list(items_res.scalars().all())

        return total, items

    async def get_stats_summary(
        self,
        db: AsyncSession,
        campus_id: Optional[uuid.UUID] = None,
        scope=None,
    ) -> Dict[str, Any]:
        """Compute aggregated statistics across historical test measurements."""
        base_filter = [] if scope is None else [scope]
        if campus_id:
            base_filter.append(InternetSpeedTest.campus_id == campus_id)

        # Status counts
        total_stmt = select(func.count(InternetSpeedTest.id)).where(*base_filter)
        completed_stmt = select(func.count(InternetSpeedTest.id)).where(
            *base_filter, InternetSpeedTest.status == "completed"
        )
        aborted_stmt = select(func.count(InternetSpeedTest.id)).where(
            *base_filter, InternetSpeedTest.status == "aborted"
        )
        failed_stmt = select(func.count(InternetSpeedTest.id)).where(
            *base_filter, InternetSpeedTest.status == "failed"
        )

        # Metric averages on completed tests
        metrics_stmt = select(
            func.avg(InternetSpeedTest.download_mbps),
            func.avg(InternetSpeedTest.upload_mbps),
            func.avg(InternetSpeedTest.latency_ms),
            func.avg(InternetSpeedTest.jitter_ms),
            func.max(InternetSpeedTest.download_mbps),
            func.max(InternetSpeedTest.upload_mbps),
            func.min(InternetSpeedTest.latency_ms),
        ).where(*base_filter, InternetSpeedTest.status == "completed")

        total = (await db.execute(total_stmt)).scalar_one()
        completed = (await db.execute(completed_stmt)).scalar_one()
        aborted = (await db.execute(aborted_stmt)).scalar_one()
        failed = (await db.execute(failed_stmt)).scalar_one()

        metrics_res = (await db.execute(metrics_stmt)).one_or_none()
        if metrics_res:
            avg_down, avg_up, avg_lat, avg_jit, max_down, max_up, min_lat = metrics_res
        else:
            avg_down = avg_up = avg_lat = avg_jit = max_down = max_up = min_lat = None

        return {
            "total_tests": total,
            "completed_count": completed,
            "aborted_count": aborted,
            "failed_count": failed,
            "avg_download_mbps": round(float(avg_down), 2) if avg_down is not None else None,
            "avg_upload_mbps": round(float(avg_up), 2) if avg_up is not None else None,
            "avg_latency_ms": round(float(avg_lat), 2) if avg_lat is not None else None,
            "avg_jitter_ms": round(float(avg_jit), 2) if avg_jit is not None else None,
            "max_download_mbps": round(float(max_down), 2) if max_down is not None else None,
            "max_upload_mbps": round(float(max_up), 2) if max_up is not None else None,
            "min_latency_ms": round(float(min_lat), 2) if min_lat is not None else None,
        }


speed_test_service = SpeedTestService()
