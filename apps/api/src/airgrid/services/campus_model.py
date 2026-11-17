"""Blender campus model integration: coordinate transforms, room lookup and room-level coverage.

The Blender source files (.blend, GLB, geometry JSON) are NOT part of the repository. They are read from a local
directory (AIRGRID_CAMPUS_MODEL_DIR, default creative/blender/airgrid-mega-campus). When the files are absent every
function reports "unavailable" instead of inventing geometry.

Coordinates: Blender world is Z-up, X east, Y north, metres, origin at the site centre. Floor-plan images are
orthographic top views with the image centre at world (0, 0), so
    px = W/2 + x_m * ppm        py = H/2 - y_m * ppm
The glTF export maps Blender (x, y, z) to glTF (x, z, -y).

Coverage here is an interpolation of operator/synthetic survey points with the existing IDW engine. It is not a
radio-propagation simulation, and walls in the 3D model are not used for signal prediction.
"""
import json
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from airgrid.core.config import settings
from airgrid.models.all_models import FloorPlanAsset, SurveyMeasurement, SurveySession
from airgrid.services.survey_service import SurveyService

MODEL_BUILDING_CODE = "MEGA-MAIN"
GEOMETRY_FILE = "campus_geometry.json"
GLB_FILE = "airgrid_mega_campus.glb"
# RSSI bands in dBm (documented thresholds shared with the Copilot prompt): good >= -67, fair -67..-75, weak < -75
GOOD_DBM, WEAK_DBM = -67.0, -75.0
IDW_POWER, HULL_BUFFER_M = 2.0, 4.0  # identical to the heatmap engine defaults

_cache: Dict[str, Any] = {}


def model_dir() -> Path:
    configured = getattr(settings, "AIRGRID_CAMPUS_MODEL_DIR", None)
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[5] / "creative" / "blender" / "airgrid-mega-campus"


def glb_path() -> Optional[Path]:
    p = model_dir() / GLB_FILE
    return p if p.is_file() else None


def load_geometry() -> Optional[dict]:
    p = model_dir() / GEOMETRY_FILE
    if not p.is_file():
        return None
    key = f"{p}:{p.stat().st_mtime_ns}"
    if _cache.get("key") != key:
        _cache.update(key=key, data=json.loads(p.read_text()))
    return _cache["data"]


# --- coordinate transforms -------------------------------------------------------------------------------------

def world_to_pixel(x_m: float, y_m: float, cal: dict) -> Tuple[float, float]:
    w, h = cal["resolution_px"]
    ppm = cal["pixels_per_metre"]
    return (w / 2 + x_m * ppm, h / 2 - y_m * ppm)


def pixel_to_world(px: float, py: float, cal: dict) -> Tuple[float, float]:
    w, h = cal["resolution_px"]
    ppm = cal["pixels_per_metre"]
    return ((px - w / 2) / ppm, (h / 2 - py) / ppm)


def blender_to_gltf(x: float, y: float, z: float) -> Tuple[float, float, float]:
    return (x, z, -y)


def point_in_polygon(x: float, y: float, poly: List[List[float]]) -> bool:
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def floor_geometry(geom: dict, floor_number: int) -> Optional[dict]:
    return next((f for f in geom.get("floors", []) if f.get("index") == floor_number), None)


def rooms_with_pixels(fgeom: dict) -> List[dict]:
    cal = fgeom["calibration"]
    out = []
    for r in fgeom.get("rooms", []):
        cx, cy = r["centre"]
        out.append({
            "id": r["id"], "name": r["name"], "kind": r["kind"], "wing": r.get("wing"), "area_m2": r.get("area_m2"),
            "centre_world": [cx, cy], "centre_px": list(world_to_pixel(cx, cy, cal)),
            "polygon_px": [list(world_to_pixel(px, py, cal)) for px, py in r["polygon"]],
            "polygon_world": r["polygon"],
        })
    return out


def band(rssi: Optional[float]) -> str:
    if rssi is None:
        return "unknown"
    return "good" if rssi >= GOOD_DBM else ("fair" if rssi >= WEAK_DBM else "weak")


# --- room coverage (reuses the heatmap engine) ----------------------------------------------------------------------

async def room_coverage(db: AsyncSession, floor_id: uuid.UUID, floor_number: int, session_id: Optional[uuid.UUID] = None) -> dict:
    geom = load_geometry()
    fgeom = floor_geometry(geom, floor_number) if geom else None
    if not fgeom:
        return {"available": False, "reason": "Campus model metadata is not installed on this server.", "rooms": []}

    if session_id:
        session = await db.get(SurveySession, session_id)
        if not session or session.floor_id != floor_id:
            return {"available": True, "session": None, "rooms": [], "reason": "Survey session not found on this floor."}
    else:
        res = await db.execute(select(SurveySession).where(SurveySession.floor_id == floor_id).order_by(SurveySession.started_at.desc()))
        session = next(iter(res.scalars().all()), None)
    rooms = rooms_with_pixels(fgeom)
    if not session:
        return {"available": True, "session": None, "rooms": [dict(r, rssi_dbm=None, band="unknown", basis="no_survey") for r in rooms],
                "reason": "No survey session exists for this floor."}

    meas = (await db.execute(select(SurveyMeasurement).where(SurveyMeasurement.survey_session_id == session.id))).scalars().all()
    plan = (await db.execute(select(FloorPlanAsset).where(FloorPlanAsset.floor_id == floor_id))).scalar_one_or_none()
    scale = plan.scale_pixels_per_meter if plan and plan.is_calibrated else 20.0
    coords = [(m.position_x, m.position_y) for m in meas]
    usable = len(meas) >= 3 and not SurveyService._is_collinear(coords)
    hull = SurveyService._compute_convex_hull(coords) if usable else []
    samples = [(m.position_x, m.position_y, m.rssi_dbm) for m in meas]
    provenance: Dict[str, int] = {}
    for m in meas:
        provenance[m.data_provenance] = provenance.get(m.data_provenance, 0) + 1

    out = []
    for r in rooms:
        inside = [m for m in meas if point_in_polygon(m.position_x, m.position_y, r["polygon_px"])]
        est = SurveyService._predict_idw(r["centre_px"][0], r["centre_px"][1], samples, scale, hull, IDW_POWER, HULL_BUFFER_M) if usable else None
        if inside:
            value, basis = sum(m.rssi_dbm for m in inside) / len(inside), "measured_points_in_room"
        elif est is not None:
            value, basis = est, "interpolated_at_room_centre"
        else:
            value, basis = None, "outside_measured_support"
        out.append(dict(r, rssi_dbm=None if value is None else round(value, 1), band=band(value), basis=basis, points_in_room=len(inside)))
    return {
        "available": True,
        "session": {"id": str(session.id), "name": session.session_name, "points": len(meas), "provenance_counts": provenance,
                    "all_synthetic_demo": bool(meas) and set(provenance) == {"controlled_test_import"}},
        "method": "inverse_distance_weighting (power 2, 4 m support buffer, 18 m reach); not a radio-propagation simulation",
        "thresholds_dbm": {"good_min": GOOD_DBM, "weak_below": WEAK_DBM},
        "rooms": out,
    }
