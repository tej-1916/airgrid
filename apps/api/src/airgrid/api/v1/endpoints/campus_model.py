"""Authorized access to the Blender campus model, room geometry and room-level coverage."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from airgrid.api.deps import require_authenticated
from airgrid.core.database import get_db
from airgrid.models.all_models import Building, Floor, User
from airgrid.services import campus_model as cm
from airgrid.services.campus_service import require_campus_access, require_floor_access

router = APIRouter(prefix="/campus-model", tags=["campus-model"])


async def _model_building(db: AsyncSession, user: User, building_id: uuid.UUID) -> Building:
    b = await db.get(Building, building_id)
    if not b:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Building not found.")
    await require_campus_access(db, user, b.campus_id)  # authorize before returning anything
    return b


@router.get("/buildings/{building_id}/model")
async def model_info(building_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(require_authenticated)):
    b = await _model_building(db, user, building_id)
    if b.building_code != cm.MODEL_BUILDING_CODE:
        return {"available": False, "reason": "No 3D model is registered for this building."}
    geom, glb = cm.load_geometry(), cm.glb_path()
    if not geom or not glb:
        return {"available": False, "reason": "The campus model files are not installed on this server (they are not distributed with the repository)."}
    floors = (await db.execute(select(Floor).where(Floor.building_id == b.id).order_by(Floor.floor_number))).scalars().all()
    by_number = {f.floor_number: f for f in floors}
    levels = []
    for fg in geom["floors"]:
        f = by_number.get(fg["index"])
        levels.append({
            "key": fg["id"], "code": fg["code"], "title": fg["title"], "floor_number": fg["index"],
            "airgrid_floor_id": str(f.id) if f else None,
            "finished_floor_z_m": fg["finished_floor_z_m"], "clear_wall_top_z_m": fg["clear_wall_top_z_m"],
            "room_count": len(fg["rooms"]),
        })
    return {
        "available": True, "glb_bytes": glb.stat().st_size, "glb_url": f"/api/v1/campus-model/buildings/{b.id}/model.glb",
        "coordinate_system": geom["coordinate_system"], "gltf_axis_map": "gltf(x,y,z) = (blender_x, blender_z, -blender_y)",
        "campus": geom["campus"], "building": {"bounds": geom["building"]["bounds"], "levels": geom["building"]["levels"]},
        "levels": levels, "node_floor_property": "extras.airgrid_floor",
    }


@router.get("/buildings/{building_id}/model.glb")
async def model_glb(building_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(require_authenticated)):
    b = await _model_building(db, user, building_id)
    path = cm.glb_path()
    if b.building_code != cm.MODEL_BUILDING_CODE or not path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campus model not available.")
    return FileResponse(path, media_type="model/gltf-binary", headers={"Cache-Control": "private, max-age=3600"})


async def _floor_for_model(db: AsyncSession, user: User, floor_id: uuid.UUID) -> Floor:
    floor = await db.get(Floor, floor_id)
    if not floor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Floor not found.")
    await require_floor_access(db, user, floor_id)
    b = await db.get(Building, floor.building_id)
    if not b or b.building_code != cm.MODEL_BUILDING_CODE:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No campus model is registered for this floor.")
    return floor


@router.get("/floors/{floor_id}/rooms")
async def floor_rooms(floor_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(require_authenticated)):
    floor = await _floor_for_model(db, user, floor_id)
    geom = cm.load_geometry()
    fg = cm.floor_geometry(geom, floor.floor_number) if geom else None
    if not fg:
        return {"available": False, "reason": "Campus model metadata is not installed on this server.", "rooms": []}
    return {"available": True, "title": fg["title"], "calibration": fg["calibration"], "rooms": cm.rooms_with_pixels(fg)}


@router.get("/floors/{floor_id}/room-coverage")
async def floor_room_coverage(floor_id: uuid.UUID, session_id: Optional[uuid.UUID] = Query(None), db: AsyncSession = Depends(get_db),
                              user: User = Depends(require_authenticated)):
    floor = await _floor_for_model(db, user, floor_id)
    return await cm.room_coverage(db, floor_id, floor.floor_number, session_id)
