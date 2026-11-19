"""Hypothetical-AP scenario studio API. Read-only with respect to the network: nothing here registers or configures an AP."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from airgrid.api.deps import require_authenticated
from airgrid.core.database import get_db
from airgrid.models.all_models import OptimizationPlan, User
from airgrid.schemas.optimization import ScenarioCompareRequest, ScenarioPredictRequest
from airgrid.services import ap_prediction as ap
from airgrid.services import scenario_service as ss
from airgrid.services.campus_service import require_floor_access

router = APIRouter(prefix="/optimization", tags=["Scenario Studio"])


@router.get("/scenario/context")
async def scenario_context(floor_id: uuid.UUID, session_id: Optional[uuid.UUID] = None,
                           db: AsyncSession = Depends(get_db), user: User = Depends(require_authenticated)):
    """Everything the editor needs to draw a floor: zones, registered APs, recorded points (labelled), sessions, model documentation."""
    await require_floor_access(db, user, floor_id)
    ctx = await ss.floor_context(db, floor_id, session_id)
    layout = ap.build_layout(ctx["fgeom"])
    courtyard = ctx["fgeom"].get("courtyard")
    return {
        "floor": ctx["floor"], "coordinate_system": "Blender world metres: x east, y north, origin at the site centre (shared with the 3D model and 2D plan).",
        "zones": [{"id": z["id"], "name": z["name"], "kind": z["kind"], "area_m2": round(z["area_m2"], 1), "polygon_world": z["polygon"]} for z in layout["zones"]],
        "courtyard_bounds": courtyard["bounds"] if courtyard else None,
        "existing_access_points": ctx["existing_aps"], "unplaced_access_points": ctx["unplaced_access_points"],
        "session": ctx["session"], "sessions": ctx["sessions"],
        "recorded_points": [{"x_m": x, "y_m": y, "rssi_dbm": r} for x, y, r in ctx["recorded"]],
        "model": {"id": ap.MODEL_ID, "version": ap.MODEL_VERSION, "validated": False, "assumptions": ap.ASSUMPTIONS,
                  "thresholds_dbm": {"good_min": ap.GOOD_DBM, "weak_below": ap.WEAK_DBM}, "max_candidates": ap.MAX_CANDIDATES,
                  "parameters": {k: {"default": v[0], "min": v[1], "max": v[2], "unit": v[3], "description": v[4]} for k, v in ap.PARAM_SPEC.items()}},
    }


@router.post("/scenario/predict")
async def scenario_predict(req: ScenarioPredictRequest, db: AsyncSession = Depends(get_db), user: User = Depends(require_authenticated)):
    """Model-predicted current layout vs the scenario, with the per-zone difference. Deterministic for identical inputs."""
    await require_floor_access(db, user, req.floor_id)
    ctx = await ss.floor_context(db, req.floor_id, req.scenario.baseline_session_id)
    baseline = ss.evaluate(ctx, {"parameters": req.scenario.parameters})
    scenario = ss.evaluate(ctx, req.scenario.model_dump(mode="json"))
    return {"baseline": baseline, "scenario": scenario, "comparison": ap.compare_results(baseline, scenario)}


@router.post("/scenario/compare")
async def scenario_compare(req: ScenarioCompareRequest, db: AsyncSession = Depends(get_db), user: User = Depends(require_authenticated)):
    """Compare any two scenarios: inline, a saved plan version, or the current layout."""
    await require_floor_access(db, user, req.floor_id)
    spec_a, desc_a = await ss.resolve_ref(db, req.floor_id, req.a)
    spec_b, desc_b = await ss.resolve_ref(db, req.floor_id, req.b)
    session_id = (spec_b or {}).get("baseline_session_id") or (spec_a or {}).get("baseline_session_id")
    ctx = await ss.floor_context(db, req.floor_id, uuid.UUID(str(session_id)) if session_id else None)
    ra, rb = ss.evaluate(ctx, spec_a), ss.evaluate(ctx, spec_b)
    return {"a": {"descriptor": desc_a, "result": ra}, "b": {"descriptor": desc_b, "result": rb}, "comparison": ap.compare_results(ra, rb)}


async def _plan_for(db: AsyncSession, user: User, plan_id: uuid.UUID) -> OptimizationPlan:
    plan = await db.get(OptimizationPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found.")
    await require_floor_access(db, user, plan.floor_id)
    return plan


@router.get("/plans/{plan_id}/versions")
async def plan_versions(plan_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(require_authenticated)):
    await _plan_for(db, user, plan_id)
    return await ss.list_versions(db, plan_id)


@router.get("/plans/{plan_id}/versions/{version}")
async def plan_version(plan_id: uuid.UUID, version: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_authenticated)):
    return await ss.get_version(db, await _plan_for(db, user, plan_id), version)


@router.get("/plans/{plan_id}/export")
async def plan_export(plan_id: uuid.UUID, version: Optional[int] = Query(default=None, ge=1), format: str = Query(default="json", pattern="^(json|markdown)$"),
                      db: AsyncSession = Depends(get_db), user: User = Depends(require_authenticated)):
    """Scenario data (JSON) or the deterministic explanation report (Markdown) for a saved plan version."""
    plan = await _plan_for(db, user, plan_id)
    snap = await ss.get_version(db, plan, version)
    if not snap.get("scenario"):
        raise HTTPException(status_code=422, detail="This plan version has no AP scenario to export.")
    spec = snap["scenario"]
    sid = spec.get("baseline_session_id")
    ctx = await ss.floor_context(db, plan.floor_id, uuid.UUID(str(sid)) if sid else None)
    baseline = ss.evaluate(ctx, {"parameters": spec.get("parameters")})
    result = ss.evaluate(ctx, spec)
    comparison = ap.compare_results(baseline, result)
    if format == "markdown":
        return PlainTextResponse(ss.render_report(snap["name"], snap["version"], baseline, result, comparison), media_type="text/markdown; charset=utf-8")
    return {"format": "airgrid-scenario-export/1", "plan": {"id": str(plan.id), "name": snap["name"], "version": snap["version"], "status": snap["status"], "notes": snap["notes"]},
            "scenario": spec, "baseline": baseline, "result": result, "comparison": comparison,
            "statement": "Model prediction for hypothetical access points. Not a measurement and not physically validated."}
