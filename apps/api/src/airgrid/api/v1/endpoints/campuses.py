import os
import uuid
from typing import Optional, List
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    UploadFile,
    File,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from airgrid.api.deps import (
    get_db,
    require_authenticated,
    require_admin,
    require_engineer_or_admin,
    verify_csrf,
)
from airgrid.models.all_models import User, FloorPlanAsset, Floor, Building, Campus
from airgrid.schemas.campus import (
    CampusCreate,
    CampusUpdate,
    CampusResponse,
    CampusListResponse,
    BuildingCreate,
    BuildingUpdate,
    BuildingResponse,
    FloorCreate,
    FloorUpdate,
    FloorResponse,
    FloorPlanResponse,
    CalibrationRequest,
)
from airgrid.services import campus_service

router = APIRouter()


def _format_floor_plan_response(plan: Optional[FloorPlanAsset]) -> Optional[FloorPlanResponse]:
    if not plan:
        return None
    return FloorPlanResponse(
        id=plan.id,
        floor_id=plan.floor_id,
        file_format=plan.file_format,
        original_filename=plan.original_filename,
        file_size_bytes=plan.file_size_bytes,
        pixel_width=plan.pixel_width,
        pixel_height=plan.pixel_height,
        scale_pixels_per_meter=plan.scale_pixels_per_meter,
        is_calibrated=plan.is_calibrated,
        calibration_metadata=plan.calibration_metadata,
        image_url=f"/api/v1/floor-plans/{plan.id}/image",
        created_at=plan.created_at,
        updated_at=plan.updated_at,
    )


def _format_floor_response(floor: Floor) -> FloorResponse:
    plan_resp = _format_floor_plan_response(floor.floor_plan)
    return FloorResponse(
        id=floor.id,
        building_id=floor.building_id,
        floor_number=floor.floor_number,
        name=floor.name,
        status=floor.status,
        dimensions_width_m=floor.dimensions_width_m,
        dimensions_height_m=floor.dimensions_height_m,
        has_floor_plan=plan_resp is not None,
        floor_plan=plan_resp,
        created_at=floor.created_at,
        updated_at=floor.updated_at,
    )


def _format_building_response(b: Building) -> BuildingResponse:
    floors = [_format_floor_response(f) for f in getattr(b, "floors", [])]
    return BuildingResponse(
        id=b.id,
        campus_id=b.campus_id,
        name=b.name,
        building_code=b.building_code,
        description=b.description,
        status=b.status,
        floors_count=b.floors_count,
        actual_floors_count=len(floors),
        floors=floors,
        created_at=b.created_at,
        updated_at=b.updated_at,
    )


def _format_campus_response(c: Campus) -> CampusResponse:
    buildings = [_format_building_response(b) for b in getattr(c, "buildings", [])]
    b_count = len(buildings)
    f_count = sum(b.actual_floors_count for b in buildings)
    p_count = sum(1 for b in buildings for f in b.floors if f.has_floor_plan)

    return CampusResponse(
        id=c.id,
        name=c.name,
        code=c.code,
        description=c.description,
        status=c.status,
        address=c.address,
        latitude=c.latitude,
        longitude=c.longitude,
        buildings_count=b_count,
        floors_count=f_count,
        floor_plans_count=p_count,
        buildings=buildings,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


# =========================================================================
# Campus Endpoints
# =========================================================================

@router.get("/campuses", response_model=CampusListResponse)
async def list_campuses(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    q: Optional[str] = Query(None, description="Search by name, code, or address"),
    status: Optional[str] = Query(None, description="Filter by status (active/archived)"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_authenticated),
):
    """List campuses with pagination, search, and hierarchy counts."""
    total, campuses = await campus_service.list_campuses(
        db, skip=skip, limit=limit, query=q, status_filter=status
    )
    items = [_format_campus_response(c) for c in campuses]
    return CampusListResponse(total=total, skip=skip, limit=limit, items=items)


@router.post("/campuses", response_model=CampusResponse, status_code=status.HTTP_201_CREATED)
async def create_campus(
    data: CampusCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
    _: None = Depends(verify_csrf),
):
    """Create a new campus (Administrator only)."""
    ip_addr = request.client.host if request.client else None
    campus = await campus_service.create_campus(
        db=db, data=data, current_user=current_user, ip_address=ip_addr
    )
    return _format_campus_response(campus)


@router.get("/campuses/{campus_id}", response_model=CampusResponse)
async def get_campus(
    campus_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_authenticated),
):
    """Get single campus details with buildings and floors."""
    campus = await campus_service.get_campus_by_id(db, campus_id)
    return _format_campus_response(campus)


@router.patch("/campuses/{campus_id}", response_model=CampusResponse)
async def update_campus(
    campus_id: uuid.UUID,
    data: CampusUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
    _: None = Depends(verify_csrf),
):
    """Update campus metadata (Administrator only)."""
    ip_addr = request.client.host if request.client else None
    campus = await campus_service.update_campus(
        db=db, campus_id=campus_id, data=data, current_user=current_user, ip_address=ip_addr
    )
    return _format_campus_response(campus)


@router.delete("/campuses/{campus_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_campus(
    campus_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
    _: None = Depends(verify_csrf),
):
    """Delete a campus and cascaded entities (Administrator only)."""
    ip_addr = request.client.host if request.client else None
    await campus_service.delete_campus(
        db=db, campus_id=campus_id, current_user=current_user, ip_address=ip_addr
    )
    return None


# =========================================================================
# Building Endpoints
# =========================================================================

@router.get("/campuses/{campus_id}/buildings", response_model=List[BuildingResponse])
async def list_buildings(
    campus_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_authenticated),
):
    """List buildings for a campus."""
    buildings = await campus_service.list_buildings_for_campus(db, campus_id)
    return [_format_building_response(b) for b in buildings]


@router.post(
    "/campuses/{campus_id}/buildings",
    response_model=BuildingResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_building(
    campus_id: uuid.UUID,
    data: BuildingCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
    _: None = Depends(verify_csrf),
):
    """Create a new building in a campus (Administrator only)."""
    ip_addr = request.client.host if request.client else None
    building = await campus_service.create_building(
        db=db, campus_id=campus_id, data=data, current_user=current_user, ip_address=ip_addr
    )
    return _format_building_response(building)


@router.get("/buildings/{building_id}", response_model=BuildingResponse)
async def get_building(
    building_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_authenticated),
):
    """Get single building details."""
    building = await campus_service.get_building_by_id(db, building_id)
    return _format_building_response(building)


@router.patch("/buildings/{building_id}", response_model=BuildingResponse)
async def update_building(
    building_id: uuid.UUID,
    data: BuildingUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
    _: None = Depends(verify_csrf),
):
    """Update building metadata (Administrator only)."""
    ip_addr = request.client.host if request.client else None
    building = await campus_service.update_building(
        db=db, building_id=building_id, data=data, current_user=current_user, ip_address=ip_addr
    )
    return _format_building_response(building)


@router.delete("/buildings/{building_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_building(
    building_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
    _: None = Depends(verify_csrf),
):
    """Delete a building (Administrator only)."""
    ip_addr = request.client.host if request.client else None
    await campus_service.delete_building(
        db=db, building_id=building_id, current_user=current_user, ip_address=ip_addr
    )
    return None


# =========================================================================
# Floor Endpoints
# =========================================================================

@router.get("/buildings/{building_id}/floors", response_model=List[FloorResponse])
async def list_floors(
    building_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_authenticated),
):
    """List floors for a building."""
    floors = await campus_service.list_floors_for_building(db, building_id)
    return [_format_floor_response(f) for f in floors]


@router.post(
    "/buildings/{building_id}/floors",
    response_model=FloorResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_floor(
    building_id: uuid.UUID,
    data: FloorCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
    _: None = Depends(verify_csrf),
):
    """Create a new floor (Administrator only)."""
    ip_addr = request.client.host if request.client else None
    floor = await campus_service.create_floor(
        db=db, building_id=building_id, data=data, current_user=current_user, ip_address=ip_addr
    )
    return _format_floor_response(floor)


@router.get("/floors/{floor_id}", response_model=FloorResponse)
async def get_floor(
    floor_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_authenticated),
):
    """Get single floor details including floor plan."""
    floor = await campus_service.get_floor_by_id(db, floor_id)
    return _format_floor_response(floor)


@router.patch("/floors/{floor_id}", response_model=FloorResponse)
async def update_floor(
    floor_id: uuid.UUID,
    data: FloorUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineer_or_admin),
    _: None = Depends(verify_csrf),
):
    """Update floor metadata or physical dimensions (Admin or Network Engineer)."""
    ip_addr = request.client.host if request.client else None
    floor = await campus_service.update_floor(
        db=db, floor_id=floor_id, data=data, current_user=current_user, ip_address=ip_addr
    )
    return _format_floor_response(floor)


@router.delete("/floors/{floor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_floor(
    floor_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
    _: None = Depends(verify_csrf),
):
    """Delete a floor (Administrator only)."""
    ip_addr = request.client.host if request.client else None
    await campus_service.delete_floor(
        db=db, floor_id=floor_id, current_user=current_user, ip_address=ip_addr
    )
    return None


# =========================================================================
# Floor Plan Endpoints
# =========================================================================

@router.post(
    "/floors/{floor_id}/plans",
    response_model=FloorPlanResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_floor_plan(
    floor_id: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineer_or_admin),
    _: None = Depends(verify_csrf),
):
    """Upload floor plan file (Admin or Network Engineer)."""
    file_bytes = await file.read()
    ip_addr = request.client.host if request.client else None
    plan = await campus_service.save_floor_plan(
        db=db,
        floor_id=floor_id,
        file_bytes=file_bytes,
        original_filename=file.filename or "floor_plan.png",
        current_user=current_user,
        ip_address=ip_addr,
    )
    return _format_floor_plan_response(plan)


@router.get("/floors/{floor_id}/plans", response_model=Optional[FloorPlanResponse])
async def get_floor_plan_for_floor(
    floor_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_authenticated),
):
    """Retrieve floor plan for a floor."""
    floor = await campus_service.get_floor_by_id(db, floor_id)
    return _format_floor_plan_response(floor.floor_plan)


@router.get("/floor-plans/{plan_id}", response_model=FloorPlanResponse)
async def get_floor_plan(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_authenticated),
):
    """Get floor plan metadata."""
    plan = await campus_service.get_floor_plan_by_id(db, plan_id)
    return _format_floor_plan_response(plan)


@router.get("/floor-plans/{plan_id}/image")
async def get_floor_plan_image(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_authenticated),
):
    """
    Authorized endpoint to stream floor plan image file.
    Requires authenticated session.
    """
    plan = await campus_service.get_floor_plan_by_id(db, plan_id)
    if not os.path.exists(plan.file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Floor plan image file not found on disk",
        )

    media_type_map = {
        "png": "image/png",
        "jpeg": "image/jpeg",
        "jpg": "image/jpeg",
        "webp": "image/webp",
    }
    media_type = media_type_map.get(plan.file_format.lower(), "application/octet-stream")

    return FileResponse(
        path=plan.file_path,
        media_type=media_type,
        headers={
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.patch("/floor-plans/{plan_id}/calibration", response_model=FloorPlanResponse)
async def calibrate_floor_plan(
    plan_id: uuid.UUID,
    data: CalibrationRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineer_or_admin),
    _: None = Depends(verify_csrf),
):
    """
    Persist 2-point scale calibration and update physical dimensions (Admin or Network Engineer).
    """
    ip_addr = request.client.host if request.client else None
    plan = await campus_service.calibrate_floor_plan(
        db=db,
        plan_id=plan_id,
        data=data,
        current_user=current_user,
        ip_address=ip_addr,
    )
    return _format_floor_plan_response(plan)
