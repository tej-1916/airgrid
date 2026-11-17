import io
import math
import os
import uuid
from typing import Optional, List, Tuple
from PIL import Image, ImageDraw, ImageFont
from fastapi import HTTPException, status
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from airgrid.core.config import settings
from airgrid.core.logging import logger
from airgrid.models.all_models import Campus, Building, Floor, FloorPlanAsset, User, CampusMembership
from airgrid.schemas.campus import (
    CampusCreate,
    CampusUpdate,
    BuildingCreate,
    BuildingUpdate,
    FloorCreate,
    FloorUpdate,
    CalibrationRequest,
    FloorOutlineCreateRequest,
)
from airgrid.services.auth_service import log_auth_audit_event


def get_secure_upload_dir() -> str:
    """Returns absolute path to secure uploads directory and ensures it exists."""
    upload_dir = os.path.abspath(settings.AIRGRID_UPLOAD_DIR)
    os.makedirs(upload_dir, exist_ok=True)
    return upload_dir


# =========================================================================
# Campus-Scoped Access Control Helpers
# =========================================================================

async def get_authorized_campus_ids(db: AsyncSession, user: User) -> Optional[List[uuid.UUID]]:
    """
    Returns a list of campus IDs that the user is authorized to access.
    Returns None if the user is a global administrator (unrestricted).
    """
    if user.role == "administrator":
        return None
    stmt = select(CampusMembership.campus_id).where(CampusMembership.user_id == user.id)
    res = await db.execute(stmt)
    return list(res.scalars().all())


async def check_user_campus_access(db: AsyncSession, user: User, campus_id: uuid.UUID) -> bool:
    """Returns True if the user is authorized for the specified campus."""
    if user.role == "administrator":
        return True
    stmt = select(func.count(CampusMembership.id)).where(
        and_(CampusMembership.user_id == user.id, CampusMembership.campus_id == campus_id)
    )
    res = await db.execute(stmt)
    return (res.scalar() or 0) > 0


async def require_campus_access(db: AsyncSession, user: User, campus_id: uuid.UUID) -> None:
    """Raises HTTP 403 Forbidden if user is not authorized for the campus."""
    if not await check_user_campus_access(db, user, campus_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You do not have access to this campus.",
        )


async def get_campus_id_for_floor(db: AsyncSession, floor_id: uuid.UUID) -> Optional[uuid.UUID]:
    """Helper that resolves a floor's campus_id via its building."""
    stmt = (
        select(Building.campus_id)
        .join(Floor, Floor.building_id == Building.id)
        .where(Floor.id == floor_id)
    )
    res = await db.execute(stmt)
    return res.scalar_one_or_none()


async def require_floor_access(db: AsyncSession, user: User, floor_id: uuid.UUID) -> uuid.UUID:
    """Resolves the campus_id for a floor and checks that the user has access.
    Raises 404 if floor/building is not found, or 403 if user lacks access.
    Returns the resolved campus_id.
    """
    if user.role == "administrator":
        floor = await db.get(Floor, floor_id)
        if not floor:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Floor not found.")
        campus_id = await get_campus_id_for_floor(db, floor_id)
        return campus_id

    campus_id = await get_campus_id_for_floor(db, floor_id)
    if not campus_id:
        floor = await db.get(Floor, floor_id)
        if not floor:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Floor not found.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campus association not found.")
    await require_campus_access(db, user, campus_id)
    return campus_id



# =========================================================================
# Campus Operations
# =========================================================================

async def list_campuses(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 50,
    query: Optional[str] = None,
    status_filter: Optional[str] = None,
    current_user: Optional[User] = None,
) -> Tuple[int, List[Campus]]:
    """List campuses with pagination, search query, and campus scoping for non-admins."""
    stmt = select(Campus).options(
        selectinload(Campus.buildings).selectinload(Building.floors).selectinload(Floor.floor_plan)
    )

    conditions = []
    if current_user and current_user.role != "administrator":
        authorized_ids = await get_authorized_campus_ids(db, current_user)
        if authorized_ids is not None:
            if not authorized_ids:
                return 0, []
            conditions.append(Campus.id.in_(authorized_ids))

    if query:
        search_term = f"%{query.strip()}%"
        conditions.append(
            (Campus.name.ilike(search_term)) | (Campus.code.ilike(search_term)) | (Campus.address.ilike(search_term))
        )
    if status_filter:
        conditions.append(Campus.status == status_filter)

    if conditions:
        stmt = stmt.where(and_(*conditions))

    # Total count
    count_stmt = select(func.count(Campus.id))
    if conditions:
        count_stmt = count_stmt.where(and_(*conditions))
    total_res = await db.execute(count_stmt)
    total = total_res.scalar() or 0

    stmt = stmt.order_by(Campus.name.asc()).offset(skip).limit(limit)
    res = await db.execute(stmt)
    campuses = list(res.scalars().all())
    return total, campuses


async def get_campus_by_id(
    db: AsyncSession,
    campus_id: uuid.UUID,
    current_user: Optional[User] = None,
) -> Campus:
    """Retrieve single campus by UUID with related hierarchy. Enforces membership for non-admins."""
    if current_user and current_user.role != "administrator":
        await require_campus_access(db, current_user, campus_id)

    stmt = (
        select(Campus)
        .where(Campus.id == campus_id)
        .options(
            selectinload(Campus.buildings)
            .selectinload(Building.floors)
            .selectinload(Floor.floor_plan)
        )
    )
    res = await db.execute(stmt)
    campus = res.scalar_one_or_none()
    if not campus:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campus with id '{campus_id}' not found",
        )
    return campus


async def create_campus(
    db: AsyncSession,
    data: CampusCreate,
    current_user: User,
    ip_address: Optional[str] = None,
) -> Campus:
    """Create a new campus record."""
    # Check uniqueness of campus code
    existing = await db.execute(select(Campus).where(Campus.code == data.code))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Campus with code '{data.code}' already exists",
        )

    campus = Campus(
        name=data.name.strip(),
        code=data.code.strip().upper(),
        description=data.description.strip() if data.description else None,
        address=data.address.strip() if data.address else None,
        latitude=data.latitude,
        longitude=data.longitude,
        status="active",
    )
    db.add(campus)
    await db.commit()
    await db.refresh(campus)

    await log_auth_audit_event(
        db=db,
        action="campus.created",
        actor_id=current_user.id,
        payload={"campus_id": str(campus.id), "name": campus.name, "code": campus.code},
        ip_address=ip_address,
    )
    return await get_campus_by_id(db, campus.id)


async def update_campus(
    db: AsyncSession,
    campus_id: uuid.UUID,
    data: CampusUpdate,
    current_user: User,
    ip_address: Optional[str] = None,
) -> Campus:
    """Update campus metadata."""
    campus = await get_campus_by_id(db, campus_id)

    if data.code and data.code.strip().upper() != campus.code:
        norm_code = data.code.strip().upper()
        existing = await db.execute(
            select(Campus).where(and_(Campus.code == norm_code, Campus.id != campus_id))
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Campus with code '{norm_code}' already exists",
            )
        campus.code = norm_code

    if data.name is not None:
        campus.name = data.name.strip()
    if data.description is not None:
        campus.description = data.description.strip() if data.description else None
    if data.address is not None:
        campus.address = data.address.strip() if data.address else None
    if data.latitude is not None:
        campus.latitude = data.latitude
    if data.longitude is not None:
        campus.longitude = data.longitude
    if data.status is not None:
        campus.status = data.status

    await db.commit()
    await db.refresh(campus)

    await log_auth_audit_event(
        db=db,
        action="campus.updated",
        actor_id=current_user.id,
        payload={"campus_id": str(campus.id), "name": campus.name, "code": campus.code},
        ip_address=ip_address,
    )
    return await get_campus_by_id(db, campus.id)


async def delete_campus(
    db: AsyncSession,
    campus_id: uuid.UUID,
    current_user: User,
    ip_address: Optional[str] = None,
) -> None:
    """Delete a campus and cascaded hierarchy."""
    campus = await get_campus_by_id(db, campus_id)
    payload = {"campus_id": str(campus.id), "name": campus.name, "code": campus.code}
    await db.delete(campus)
    await db.commit()

    await log_auth_audit_event(
        db=db,
        action="campus.deleted",
        actor_id=current_user.id,
        payload=payload,
        ip_address=ip_address,
    )


# =========================================================================
# Building Operations
# =========================================================================

async def list_buildings_for_campus(
    db: AsyncSession,
    campus_id: uuid.UUID,
    current_user: Optional[User] = None,
) -> List[Building]:
    """List all buildings within a specified campus. Enforces campus scoping."""
    # Ensure campus exists and user has access
    await get_campus_by_id(db, campus_id, current_user=current_user)

    stmt = (
        select(Building)
        .where(Building.campus_id == campus_id)
        .options(selectinload(Building.floors).selectinload(Floor.floor_plan))
        .order_by(Building.name.asc())
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())


async def get_building_by_id(
    db: AsyncSession,
    building_id: uuid.UUID,
    current_user: Optional[User] = None,
) -> Building:
    """Retrieve single building by UUID. Enforces campus scoping."""
    stmt = (
        select(Building)
        .where(Building.id == building_id)
        .options(selectinload(Building.floors).selectinload(Floor.floor_plan))
    )
    res = await db.execute(stmt)
    building = res.scalar_one_or_none()
    if not building:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Building with id '{building_id}' not found",
        )
    if current_user and current_user.role != "administrator":
        await require_campus_access(db, current_user, building.campus_id)
    return building


async def create_building(
    db: AsyncSession,
    campus_id: uuid.UUID,
    data: BuildingCreate,
    current_user: User,
    ip_address: Optional[str] = None,
) -> Building:
    """Create a new building under a campus."""
    campus = await get_campus_by_id(db, campus_id)

    norm_code = data.building_code.strip().upper()
    existing = await db.execute(
        select(Building).where(
            and_(Building.campus_id == campus_id, Building.building_code == norm_code)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Building with code '{norm_code}' already exists in this campus",
        )

    building = Building(
        campus_id=campus_id,
        name=data.name.strip(),
        building_code=norm_code,
        description=data.description.strip() if data.description else None,
        floors_count=data.floors_count,
        status="active",
    )
    db.add(building)
    await db.commit()
    await db.refresh(building)

    await log_auth_audit_event(
        db=db,
        action="building.created",
        actor_id=current_user.id,
        payload={
            "building_id": str(building.id),
            "campus_id": str(campus.id),
            "name": building.name,
            "code": building.building_code,
        },
        ip_address=ip_address,
    )
    return await get_building_by_id(db, building.id)


async def update_building(
    db: AsyncSession,
    building_id: uuid.UUID,
    data: BuildingUpdate,
    current_user: User,
    ip_address: Optional[str] = None,
) -> Building:
    """Update building metadata."""
    building = await get_building_by_id(db, building_id)

    if data.building_code:
        norm_code = data.building_code.strip().upper()
        if norm_code != building.building_code:
            existing = await db.execute(
                select(Building).where(
                    and_(
                        Building.campus_id == building.campus_id,
                        Building.building_code == norm_code,
                        Building.id != building_id,
                    )
                )
            )
            if existing.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Building with code '{norm_code}' already exists in this campus",
                )
            building.building_code = norm_code

    if data.name is not None:
        building.name = data.name.strip()
    if data.description is not None:
        building.description = data.description.strip() if data.description else None
    if data.floors_count is not None:
        building.floors_count = data.floors_count
    if data.status is not None:
        building.status = data.status

    await db.commit()
    await db.refresh(building)

    await log_auth_audit_event(
        db=db,
        action="building.updated",
        actor_id=current_user.id,
        payload={"building_id": str(building.id), "name": building.name},
        ip_address=ip_address,
    )
    return await get_building_by_id(db, building.id)


async def delete_building(
    db: AsyncSession,
    building_id: uuid.UUID,
    current_user: User,
    ip_address: Optional[str] = None,
) -> None:
    """Delete building and its floors."""
    building = await get_building_by_id(db, building_id)
    payload = {"building_id": str(building.id), "name": building.name}
    await db.delete(building)
    await db.commit()

    await log_auth_audit_event(
        db=db,
        action="building.deleted",
        actor_id=current_user.id,
        payload=payload,
        ip_address=ip_address,
    )


# =========================================================================
# Floor Operations
# =========================================================================

async def list_floors_for_building(
    db: AsyncSession,
    building_id: uuid.UUID,
    current_user: Optional[User] = None,
) -> List[Floor]:
    """List all floors for a specified building. Enforces campus scoping."""
    await get_building_by_id(db, building_id, current_user=current_user)
    stmt = (
        select(Floor)
        .where(Floor.building_id == building_id)
        .options(selectinload(Floor.floor_plan))
        .order_by(Floor.floor_number.asc())
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())


async def get_floor_by_id(
    db: AsyncSession,
    floor_id: uuid.UUID,
    current_user: Optional[User] = None,
) -> Floor:
    """Retrieve single floor by UUID. Enforces campus scoping."""
    stmt = (
        select(Floor)
        .where(Floor.id == floor_id)
        .options(selectinload(Floor.floor_plan), selectinload(Floor.building))
    )
    res = await db.execute(stmt)
    floor = res.scalar_one_or_none()
    if not floor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Floor with id '{floor_id}' not found",
        )
    if current_user and current_user.role != "administrator" and floor.building:
        await require_campus_access(db, current_user, floor.building.campus_id)
    return floor


async def create_floor(
    db: AsyncSession,
    building_id: uuid.UUID,
    data: FloorCreate,
    current_user: User,
    ip_address: Optional[str] = None,
) -> Floor:
    """Create a new floor under a building."""
    building = await get_building_by_id(db, building_id)

    # Check uniqueness of floor_number in building
    existing = await db.execute(
        select(Floor).where(
            and_(Floor.building_id == building_id, Floor.floor_number == data.floor_number)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Floor number {data.floor_number} already exists in building '{building.name}'",
        )

    floor = Floor(
        building_id=building_id,
        floor_number=data.floor_number,
        name=data.name.strip(),
        dimensions_width_m=data.dimensions_width_m,
        dimensions_height_m=data.dimensions_height_m,
        status="active",
    )
    db.add(floor)
    await db.commit()
    await db.refresh(floor)

    await log_auth_audit_event(
        db=db,
        action="floor.created",
        actor_id=current_user.id,
        payload={
            "floor_id": str(floor.id),
            "building_id": str(building.id),
            "name": floor.name,
            "floor_number": floor.floor_number,
        },
        ip_address=ip_address,
    )
    return await get_floor_by_id(db, floor.id)


async def update_floor(
    db: AsyncSession,
    floor_id: uuid.UUID,
    data: FloorUpdate,
    current_user: User,
    ip_address: Optional[str] = None,
) -> Floor:
    """Update floor metadata or physical dimensions."""
    floor = await get_floor_by_id(db, floor_id)

    if data.floor_number is not None and data.floor_number != floor.floor_number:
        existing = await db.execute(
            select(Floor).where(
                and_(
                    Floor.building_id == floor.building_id,
                    Floor.floor_number == data.floor_number,
                    Floor.id != floor_id,
                )
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Floor number {data.floor_number} already exists in this building",
            )
        floor.floor_number = data.floor_number

    if data.name is not None:
        floor.name = data.name.strip()
    if data.dimensions_width_m is not None:
        floor.dimensions_width_m = data.dimensions_width_m
    if data.dimensions_height_m is not None:
        floor.dimensions_height_m = data.dimensions_height_m
    if data.status is not None:
        floor.status = data.status

    await db.commit()
    await db.refresh(floor)

    await log_auth_audit_event(
        db=db,
        action="floor.updated",
        actor_id=current_user.id,
        payload={"floor_id": str(floor.id), "name": floor.name},
        ip_address=ip_address,
    )
    return await get_floor_by_id(db, floor.id)


async def delete_floor(
    db: AsyncSession,
    floor_id: uuid.UUID,
    current_user: User,
    ip_address: Optional[str] = None,
) -> None:
    """Delete floor and cleanup plan files."""
    floor = await get_floor_by_id(db, floor_id)
    if floor.floor_plan:
        _safe_remove_file(floor.floor_plan.file_path)

    payload = {"floor_id": str(floor.id), "name": floor.name}
    await db.delete(floor)
    await db.commit()

    await log_auth_audit_event(
        db=db,
        action="floor.deleted",
        actor_id=current_user.id,
        payload=payload,
        ip_address=ip_address,
    )


# =========================================================================
# Floor Plan Operations & Upload Validation
# =========================================================================

def _safe_remove_file(file_path: str) -> None:
    """Removes a file from disk safely without raising exceptions if missing."""
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception as e:
        logger.warning("Could not remove floor plan file %s: %s", file_path, e)


async def save_floor_plan(
    db: AsyncSession,
    floor_id: uuid.UUID,
    file_bytes: bytes,
    original_filename: str,
    current_user: User,
    ip_address: Optional[str] = None,
) -> FloorPlanAsset:
    """
    Validates uploaded image file, checks bounds, saves with UUID filename
    outside the public directory, and records or updates FloorPlanAsset.
    """
    floor = await get_floor_by_id(db, floor_id)

    # 1. Check file size
    file_size = len(file_bytes)
    if file_size > settings.AIRGRID_MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {settings.AIRGRID_MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)}MB",
        )
    if file_size < 10:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="File is empty or corrupted",
        )

    # 2. Inspect with Pillow (MIME & magic bytes validation)
    try:
        image = Image.open(io.BytesIO(file_bytes))
        image.verify()  # Verifies integrity without decoding entire image
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Uploaded file is not a valid image or is corrupted",
        )

    # Re-open after verify() closes the stream
    image = Image.open(io.BytesIO(file_bytes))
    image_format = (image.format or "").lower()
    if image_format not in settings.AIRGRID_ALLOWED_IMAGE_FORMATS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Unsupported format '{image_format}'. Allowed formats: {', '.join(settings.AIRGRID_ALLOWED_IMAGE_FORMATS)}",
        )

    width, height = image.size
    if width < 10 or height < 10 or width > 20000 or height > 20000:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Image dimensions ({width}x{height}) must be between 10x10 and 20000x20000 pixels",
        )

    # 3. Store file securely
    upload_dir = get_secure_upload_dir()
    safe_filename = f"{uuid.uuid4().hex}.{image_format}"
    target_path = os.path.join(upload_dir, safe_filename)

    # Ensure target path stays strictly inside upload_dir (path traversal guard)
    if not os.path.abspath(target_path).startswith(upload_dir):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file path configuration",
        )

    # Write file to disk
    try:
        with open(target_path, "wb") as f:
            f.write(file_bytes)
    except Exception as e:
        logger.error("Failed to write floor plan file: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist floor plan to disk",
        )

    # 4. Check if floor already has a plan and replace
    existing_plan_stmt = select(FloorPlanAsset).where(FloorPlanAsset.floor_id == floor_id)
    res = await db.execute(existing_plan_stmt)
    existing_plan = res.scalar_one_or_none()

    # Default scale: calculate so image fits the floor's dimensions_width_m
    initial_scale = round(width / max(floor.dimensions_width_m, 1.0), 2)

    if existing_plan:
        # Delete old file
        _safe_remove_file(existing_plan.file_path)
        existing_plan.file_path = target_path
        existing_plan.file_format = image_format
        existing_plan.original_filename = original_filename[:255] if original_filename else None
        existing_plan.file_size_bytes = file_size
        existing_plan.pixel_width = width
        existing_plan.pixel_height = height
        existing_plan.scale_pixels_per_meter = initial_scale
        existing_plan.is_calibrated = False
        existing_plan.calibration_metadata = None
        plan_asset = existing_plan
    else:
        plan_asset = FloorPlanAsset(
            floor_id=floor_id,
            file_path=target_path,
            file_format=image_format,
            original_filename=original_filename[:255] if original_filename else None,
            file_size_bytes=file_size,
            pixel_width=width,
            pixel_height=height,
            scale_pixels_per_meter=initial_scale,
            is_calibrated=False,
            calibration_metadata=None,
        )
        db.add(plan_asset)

    try:
        await db.commit()
        await db.refresh(plan_asset)
    except Exception as e:
        _safe_remove_file(target_path)
        await db.rollback()
        logger.error("Database error saving floor plan asset: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record floor plan in database",
        )

    await log_auth_audit_event(
        db=db,
        action="floor_plan.uploaded",
        actor_id=current_user.id,
        payload={
            "plan_id": str(plan_asset.id),
            "floor_id": str(floor.id),
            "dimensions": f"{width}x{height}",
            "filename": original_filename,
        },
        ip_address=ip_address,
    )
    return plan_asset


async def get_floor_plan_by_id(
    db: AsyncSession,
    plan_id: uuid.UUID,
    current_user: Optional[User] = None,
) -> FloorPlanAsset:
    """Retrieve floor plan asset by UUID. Enforces campus scoping."""
    stmt = (
        select(FloorPlanAsset)
        .where(FloorPlanAsset.id == plan_id)
        .options(selectinload(FloorPlanAsset.floor).selectinload(Floor.building))
    )
    res = await db.execute(stmt)
    plan = res.scalar_one_or_none()
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Floor plan with id '{plan_id}' not found",
        )
    if current_user and current_user.role != "administrator" and plan.floor and plan.floor.building:
        await require_campus_access(db, current_user, plan.floor.building.campus_id)
    return plan


async def calibrate_floor_plan(
    db: AsyncSession,
    plan_id: uuid.UUID,
    data: CalibrationRequest,
    current_user: User,
    ip_address: Optional[str] = None,
) -> FloorPlanAsset:
    """
    Computes pixels-per-meter scale from 2 user-selected points and real-world distance.
    Persists calibration metadata and updates floor physical dimensions.
    """
    plan = await get_floor_plan_by_id(db, plan_id)
    floor = await get_floor_by_id(db, plan.floor_id)

    dx = data.point2.x - data.point1.x
    dy = data.point2.y - data.point1.y
    pixel_distance = math.sqrt(dx * dx + dy * dy)

    if pixel_distance < 5.0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Calibration points must be at least 5 pixels apart",
        )

    # Calculate scale (pixels per meter)
    scale_px_per_m = round(pixel_distance / data.distance_m, 4)
    if scale_px_per_m <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Calculated scale is invalid",
        )

    # Update asset
    plan.scale_pixels_per_meter = scale_px_per_m
    plan.is_calibrated = True
    plan.calibration_metadata = {
        "point1": {"x": data.point1.x, "y": data.point1.y},
        "point2": {"x": data.point2.x, "y": data.point2.y},
        "pixel_distance": round(pixel_distance, 2),
        "distance_m": data.distance_m,
        "scale_pixels_per_meter": scale_px_per_m,
    }

    # Automatically recalculate floor physical dimensions based on image aspect and scale
    new_width_m = round(plan.pixel_width / scale_px_per_m, 2)
    new_height_m = round(plan.pixel_height / scale_px_per_m, 2)
    floor.dimensions_width_m = new_width_m
    floor.dimensions_height_m = new_height_m

    plan_id_val = plan.id
    floor_id_val = floor.id

    await db.commit()

    await log_auth_audit_event(
        db=db,
        action="floor_plan.calibrated",
        actor_id=current_user.id,
        payload={
            "plan_id": str(plan_id_val),
            "floor_id": str(floor_id_val),
            "scale_pixels_per_meter": scale_px_per_m,
            "distance_m": data.distance_m,
        },
        ip_address=ip_address,
    )
    return await get_floor_plan_by_id(db, plan_id_val)


def generate_floor_outline_image(
    width_m: float,
    height_m: float,
    grid_interval_m: float = 5.0,
    title: str = "Floor Outline",
) -> Tuple[bytes, float, int, int]:
    """
    Renders a crisp architectural floor outline image with perimeter walls,
    regular dimensioned grid lines, metric scale markings, and a title block.
    Returns (png_bytes, scale_px_per_m, pixel_width, pixel_height).
    """
    scale = max(10.0, min(40.0, round(1200.0 / max(width_m, 1.0), 2)))
    pixel_width = max(200, int(round(width_m * scale)))
    pixel_height = max(150, int(round(height_m * scale)))

    img = Image.new("RGB", (pixel_width, pixel_height), color=(248, 250, 252))
    draw = ImageDraw.Draw(img)

    # 1. Subtle grid lines for distance measurement
    grid_px = grid_interval_m * scale
    if grid_px >= 15:
        x = grid_px
        while x < pixel_width:
            draw.line([(x, 0), (x, pixel_height)], fill=(226, 232, 240), width=1)
            x += grid_px
        y = grid_px
        while y < pixel_height:
            draw.line([(0, y), (pixel_width, y)], fill=(226, 232, 240), width=1)
            y += grid_px

    # 2. Outer structural boundary wall (thick dark slate stroke)
    wall_thickness = max(3, int(round(scale * 0.25)))
    inset = wall_thickness // 2
    draw.rectangle(
        [(inset, inset), (pixel_width - 1 - inset, pixel_height - 1 - inset)],
        outline=(30, 41, 59),
        width=wall_thickness,
    )

    # 3. Corner structural column markers
    col_size = max(6, int(round(scale * 0.5)))
    draw.rectangle([(0, 0), (col_size, col_size)], fill=(15, 23, 42))
    draw.rectangle([(pixel_width - col_size, 0), (pixel_width, col_size)], fill=(15, 23, 42))
    draw.rectangle([(0, pixel_height - col_size), (col_size, pixel_height)], fill=(15, 23, 42))
    draw.rectangle([(pixel_width - col_size, pixel_height - col_size), (pixel_width, pixel_height)], fill=(15, 23, 42))

    # 4. Dimension callout labels
    top_label = f"<--  {width_m:.1f} m  -->"
    side_label = f"^  {height_m:.1f} m  v"
    draw.text((max(10, pixel_width // 2 - 45), wall_thickness + 4), top_label, fill=(100, 116, 139))
    draw.text((wall_thickness + 6, max(10, pixel_height // 2 - 10)), side_label, fill=(100, 116, 139))

    # 5. Informational title stamp in bottom-left
    title_box_w = min(280, pixel_width - 20)
    title_box_h = 44
    t_x0 = wall_thickness + 10
    t_y0 = pixel_height - wall_thickness - title_box_h - 10
    if t_y0 > wall_thickness + 20 and title_box_w > 120:
        draw.rectangle(
            [(t_x0, t_y0), (t_x0 + title_box_w, t_y0 + title_box_h)],
            fill=(255, 255, 255),
            outline=(203, 213, 225),
            width=1,
        )
        draw.text((t_x0 + 8, t_y0 + 6), title[:30], fill=(15, 23, 42))
        draw.text(
            (t_x0 + 8, t_y0 + 22),
            f"{width_m:.1f}m x {height_m:.1f}m | Scale: {scale:.1f} px/m",
            fill=(100, 116, 139),
        )

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue(), scale, pixel_width, pixel_height


async def create_floor_outline_plan(
    db: AsyncSession,
    floor_id: uuid.UUID,
    data: FloorOutlineCreateRequest,
    current_user: User,
    ip_address: Optional[str] = None,
) -> FloorPlanAsset:
    """
    Generates an architectural dimensioned floor outline schematic and saves it as the FloorPlanAsset.
    Sets is_calibrated=True and scale_pixels_per_meter to the generated scale.
    """
    floor = await get_floor_by_id(db, floor_id, current_user=current_user)

    title = data.label or floor.name or "Floor Outline"
    png_bytes, scale, width_px, height_px = generate_floor_outline_image(
        width_m=data.width_m,
        height_m=data.height_m,
        grid_interval_m=data.grid_interval_m,
        title=title,
    )

    clean_name = (floor.name or "floor").lower().replace(" ", "_")
    filename = f"{clean_name}_outline.png"
    plan = await save_floor_plan(
        db=db,
        floor_id=floor_id,
        file_bytes=png_bytes,
        original_filename=filename,
        current_user=current_user,
        ip_address=ip_address,
    )

    # Mark calibrated with exact dimensions
    plan.is_calibrated = True
    plan.scale_pixels_per_meter = scale
    plan.calibration_metadata = {
        "method": "dimension_outline",
        "width_m": data.width_m,
        "height_m": data.height_m,
        "grid_interval_m": data.grid_interval_m,
        "scale_pixels_per_meter": scale,
    }
    floor.dimensions_width_m = data.width_m
    floor.dimensions_height_m = data.height_m

    await db.commit()
    await db.refresh(plan)

    await log_auth_audit_event(
        db=db,
        action="floor_plan.outline_created",
        actor_id=current_user.id,
        payload={
            "plan_id": str(plan.id),
            "floor_id": str(floor.id),
            "width_m": data.width_m,
            "height_m": data.height_m,
            "scale_pixels_per_meter": scale,
        },
        ip_address=ip_address,
    )

    return plan



# =========================================================================
# Campus Membership Operations
# =========================================================================

async def list_campus_members(
    db: AsyncSession,
    campus_id: uuid.UUID,
    current_user: User,
) -> List[dict]:
    """Lists members assigned to a campus."""
    if current_user.role != "administrator":
        await require_campus_access(db, current_user, campus_id)

    stmt = (
        select(CampusMembership)
        .where(CampusMembership.campus_id == campus_id)
        .options(selectinload(CampusMembership.user))
        .order_by(CampusMembership.created_at.asc())
    )
    res = await db.execute(stmt)
    memberships = list(res.scalars().all())
    result = []
    for m in memberships:
        if m.user:
            result.append({
                "id": m.id,
                "campus_id": m.campus_id,
                "user_id": m.user_id,
                "user_email": m.user.email,
                "user_full_name": m.user.full_name,
                "user_role": m.user.role,
                "membership_role": m.role,
                "created_at": m.created_at,
            })
    return result


async def add_campus_member(
    db: AsyncSession,
    campus_id: uuid.UUID,
    user_id: uuid.UUID,
    role: Optional[str],
    current_user: User,
    ip_address: Optional[str] = None,
) -> dict:
    """Assigns a user to a campus (Admin only)."""
    await get_campus_by_id(db, campus_id, current_user=current_user)
    target_user = await db.get(User, user_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User '{user_id}' not found.")

    existing = await db.execute(
        select(CampusMembership).where(
            and_(CampusMembership.campus_id == campus_id, CampusMembership.user_id == user_id)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already assigned to this campus.")

    membership = CampusMembership(
        campus_id=campus_id,
        user_id=user_id,
        role=role or target_user.role,
    )
    db.add(membership)
    await db.commit()
    await db.refresh(membership)

    await log_auth_audit_event(
        db=db,
        action="campus.member_added",
        actor_id=current_user.id,
        payload={
            "campus_id": str(campus_id),
            "user_id": str(user_id),
            "role": membership.role,
        },
        ip_address=ip_address,
    )
    return {
        "id": membership.id,
        "campus_id": membership.campus_id,
        "user_id": membership.user_id,
        "user_email": target_user.email,
        "user_full_name": target_user.full_name,
        "user_role": target_user.role,
        "membership_role": membership.role,
        "created_at": membership.created_at,
    }


async def remove_campus_member(
    db: AsyncSession,
    campus_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: User,
    ip_address: Optional[str] = None,
) -> bool:
    """Removes a user from a campus (Admin only)."""
    await get_campus_by_id(db, campus_id, current_user=current_user)
    stmt = select(CampusMembership).where(
        and_(CampusMembership.campus_id == campus_id, CampusMembership.user_id == user_id)
    )
    res = await db.execute(stmt)
    membership = res.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User is not a member of this campus.")

    await db.delete(membership)
    await db.commit()

    await log_auth_audit_event(
        db=db,
        action="campus.member_removed",
        actor_id=current_user.id,
        payload={"campus_id": str(campus_id), "user_id": str(user_id)},
        ip_address=ip_address,
    )
    return True

