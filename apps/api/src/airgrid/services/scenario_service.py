"""Hypothetical-AP scenarios on a modelled floor: context loading, evaluation, saved-version resolution and the explanation report.

Authorization is the caller's job (endpoints call require_floor_access before anything here). Nothing in this module writes to
the AP inventory, configures equipment or modifies recorded measurements. See ap_prediction for the model and its limits.
"""
import uuid
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from airgrid.models.all_models import (
    AccessPoint, Building, Floor, OptimizationPlan, OptimizationPlanVersion, SurveyMeasurement, SurveySession,
)
from airgrid.services import ap_prediction as ap
from airgrid.services import campus_model as cm

MAX_RECORDED_POINTS = 5000
SYNTHETIC_PROVENANCE = {"controlled_test_import"}


def _unavailable() -> HTTPException:
    return HTTPException(status_code=422,
                         detail="No floor geometry is registered for this floor, so AP layouts cannot be modelled. "
                                "Campus model files must be installed on the server and the building registered as the model building.")


async def floor_context(db: AsyncSession, floor_id: uuid.UUID, session_id: Optional[uuid.UUID] = None) -> Dict[str, Any]:
    """Geometry, registered APs (converted to world metres), session list and the chosen session's recorded points."""
    floor = await db.get(Floor, floor_id)
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found.")
    building = await db.get(Building, floor.building_id)
    geom = cm.load_geometry()
    fgeom = cm.floor_geometry(geom, floor.floor_number) if geom and building and building.building_code == cm.MODEL_BUILDING_CODE else None
    b = (fgeom or {}).get("bounds") or {}
    if not fgeom or not fgeom.get("calibration") or "min" not in b or "max" not in b or "title" not in fgeom:   # incomplete geometry: report, don't guess
        raise _unavailable()
    cal = fgeom["calibration"]
    width, height = cal["resolution_px"]

    aps = list((await db.execute(select(AccessPoint).where(AccessPoint.floor_id == floor_id).order_by(AccessPoint.name).limit(500))).scalars())
    existing, unplaced = [], 0
    for a in aps:
        if a.status == "retired":
            continue
        if a.x_coord is None or a.y_coord is None:
            unplaced += 1
            continue
        x_m, y_m = cm.pixel_to_world(a.x_coord * width, a.y_coord * height, cal)   # normalized plan coords -> world metres
        existing.append({"id": str(a.id), "name": a.name, "x_m": round(x_m, 2), "y_m": round(y_m, 2), "tx_power_dbm": a.tx_power_dbm,
                         "antenna_gain_dbi": None, "status": a.status, "source": "operator_registered"})

    counts = dict((await db.execute(select(SurveyMeasurement.survey_session_id, func.count()).where(SurveyMeasurement.floor_id == floor_id)
                  .group_by(SurveyMeasurement.survey_session_id))).all())
    sessions = list((await db.execute(select(SurveySession).where(SurveySession.floor_id == floor_id).order_by(SurveySession.started_at.desc()).limit(50))).scalars())
    chosen = None
    if session_id:
        chosen = next((s for s in sessions if s.id == session_id), None) or await db.get(SurveySession, session_id)
        if not chosen or chosen.floor_id != floor_id:
            raise HTTPException(status_code=404, detail="Survey session not found on this floor.")
    elif sessions:
        chosen = sessions[0]

    recorded: List[Tuple[float, float, float]] = []
    provenance: Dict[str, int] = {}
    if chosen:
        meas = (await db.execute(select(SurveyMeasurement).where(SurveyMeasurement.survey_session_id == chosen.id).limit(MAX_RECORDED_POINTS))).scalars().all()
        for m in meas:
            x_m, y_m = cm.pixel_to_world(m.position_x, m.position_y, cal)
            recorded.append((round(x_m, 2), round(y_m, 2), float(m.rssi_dbm)))
            provenance[m.data_provenance] = provenance.get(m.data_provenance, 0) + 1
    session_info = None if not chosen else {
        "id": str(chosen.id), "name": chosen.session_name, "points": len(recorded), "provenance_counts": provenance,
        "all_synthetic_demo": bool(recorded) and set(provenance) <= SYNTHETIC_PROVENANCE}
    return {
        "floor": {"id": str(floor.id), "title": fgeom["title"], "floor_number": floor.floor_number, "bounds": fgeom["bounds"],
                  "finished_floor_z_m": fgeom.get("finished_floor_z_m")},
        "fgeom": fgeom, "existing_aps": existing, "unplaced_access_points": unplaced, "recorded": recorded,
        "session": session_info,
        "sessions": [{"id": str(s.id), "name": s.session_name, "status": s.status, "points": counts.get(s.id, 0),
                      "started_at": s.started_at.isoformat() if s.started_at else None} for s in sessions],
    }


def check_candidates_in_bounds(fgeom: dict, candidates: List[dict]) -> None:
    (x0, y0), (x1, y1) = fgeom["bounds"]["min"], fgeom["bounds"]["max"]
    bad = [c["id"] for c in candidates if not (x0 <= c["x_m"] <= x1 and y0 <= c["y_m"] <= y1)]
    if bad:
        raise HTTPException(status_code=422, detail=f"Candidate AP(s) {bad} lie outside the floor bounds x[{x0},{x1}] y[{y0},{y1}] metres.")


def evaluate(ctx: Dict[str, Any], spec: Optional[dict]) -> Dict[str, Any]:
    """Run the prediction model for `spec` (a ScenarioSpec dict, or None for the current registered layout)."""
    spec = spec or {}
    candidates = [dict(c) for c in spec.get("candidates", [])]
    check_candidates_in_bounds(ctx["fgeom"], candidates)
    try:
        result = ap.run_scenario(ctx["fgeom"], ctx["existing_aps"], candidates, spec.get("parameters"), ctx["recorded"],
                                 [str(i) for i in spec.get("disabled_existing_ap_ids", [])])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    result["floor"] = ctx["floor"]
    result["recorded_evidence"] = ctx["session"]
    result["labels"]["recorded_data"] = (
        "No survey session" if not ctx["session"] else
        "SYNTHETIC demonstration points (not field measurements)" if ctx["session"]["all_synthetic_demo"] else "Recorded survey points")
    result["unplaced_access_points"] = ctx["unplaced_access_points"]
    return result


# ---------------------------------------------------------------------------------------------------------------- versions

def plan_snapshot(plan: OptimizationPlan) -> dict:
    return {"name": plan.name, "notes": plan.notes, "status": plan.status, "markers": plan.markers, "scenario": plan.scenario,
            "network_label": plan.network_label}


def record_version(db: AsyncSession, plan: OptimizationPlan, user) -> None:
    db.add(OptimizationPlanVersion(id=uuid.uuid4(), plan_id=plan.id, version=plan.version, snapshot=plan_snapshot(plan), author_id=user.id))


async def list_versions(db: AsyncSession, plan_id: uuid.UUID) -> List[dict]:
    rows = (await db.execute(select(OptimizationPlanVersion).where(OptimizationPlanVersion.plan_id == plan_id)
                             .order_by(OptimizationPlanVersion.version.desc()).limit(200))).scalars().all()
    return [{"version": r.version, "name": r.snapshot.get("name"), "status": r.snapshot.get("status"),
             "candidates": len(((r.snapshot.get("scenario") or {}).get("candidates") or [])),
             "has_scenario": bool(r.snapshot.get("scenario")), "created_at": r.created_at.isoformat() if r.created_at else None,
             "author_id": str(r.author_id) if r.author_id else None} for r in rows]


async def get_version(db: AsyncSession, plan: OptimizationPlan, version: Optional[int]) -> dict:
    version = version or plan.version
    row = (await db.execute(select(OptimizationPlanVersion).where(OptimizationPlanVersion.plan_id == plan.id,
                                                                    OptimizationPlanVersion.version == version))).scalar_one_or_none()
    if row:
        return {"version": row.version, **row.snapshot}
    if version == plan.version:                                    # plans saved before version history existed
        return {"version": plan.version, **plan_snapshot(plan)}
    raise HTTPException(status_code=404, detail=f"Plan version {version} not found.")


async def resolve_ref(db: AsyncSession, floor_id: uuid.UUID, ref) -> Tuple[Optional[dict], dict]:
    """(scenario dict or None for the current layout, descriptor). A saved plan must belong to the authorised floor."""
    if ref.plan_id is not None:
        if ref.scenario is not None:
            raise HTTPException(status_code=422, detail="Give either an inline scenario or a plan reference, not both.")
        plan = await db.get(OptimizationPlan, ref.plan_id)
        if not plan or plan.floor_id != floor_id:                  # same 404 for foreign and missing: no existence oracle
            raise HTTPException(status_code=404, detail="Plan not found on this floor.")
        snap = await get_version(db, plan, ref.version)
        return snap.get("scenario"), {"kind": "saved_plan", "plan_id": str(plan.id), "name": snap["name"], "version": snap["version"]}
    if ref.scenario is not None:
        return ref.scenario.model_dump(mode="json"), {"kind": "inline", "name": "Unsaved scenario"}
    return None, {"kind": "current_layout", "name": "Current registered layout (no candidates)"}


# ---------------------------------------------------------------------------------------------------------------- report

def _row(cells) -> str:
    return "| " + " | ".join(str(c) for c in cells) + " |"


def render_report(plan_name: str, version: Optional[int], baseline: dict, result: dict, comparison: dict) -> str:
    """Deterministic Markdown explanation. Every number comes from the model result; nothing is added by an LLM."""
    s1, lab = result["summary"], result["labels"]
    L: List[str] = [f"# Hypothetical AP layout report: {plan_name}" + (f" (version {version})" if version else ""), "",
                    "> **Model prediction for hypothetical access points. Not a measurement and not physically validated.** "
                    "Nothing in this report configures or changes any real network equipment.", "",
                    f"Floor: {result['floor']['title']} | Model: {result['model']['id']} v{result['model']['version']} | Input hash: `{result['inputs_hash']}`", "",
                    "## Data layers", "",
                    _row(["Layer", "What it is", "Status"]), _row(["---", "---", "---"]),
                    _row(["Recorded measurements", lab["recorded_data"], "Evidence only; never altered by the model"]),
                    _row(["Model-predicted current layout", "Registered APs only", "Model prediction"]),
                    _row(["Hypothetical APs", f"{lab['hypothetical_access_points']} candidate(s) enabled", "Not installed; speculative"]),
                    _row(["Model-predicted scenario", "Registered APs + candidates", "Model prediction"]), "",
                    "## Result (model vs model)", "", _row(["Metric", "Current layout", "Scenario", "Change"]), _row(["---", "---", "---", "---"])]
    for key, label in (("weak_area_m2", "Weak area (< -75 dBm), m2"), ("fair_area_m2", "Fair area, m2"), ("good_area_m2", "Good area (>= -67 dBm), m2"),
                       ("expected_weak_area_m2", "Expected weak area incl. modelled uncertainty, m2"), ("weak_zones", "Weak zones"),
                       ("uncertain_zones", "Zones whose band is uncertain")):
        c = comparison["summary"][key]
        L.append(_row([label, c["a"], c["b"], f"{c['delta']:+}"]))
    L += ["", f"Zones improved: {comparison['zones_improved']}; worsened: {comparison['zones_worsened']}; "
              f"changes smaller than the modelled uncertainty: {comparison['changes_within_model_uncertainty']} of {len(comparison['zones'])}.", "",
          "## Zone changes", "", _row(["Zone", "Current dBm", "Scenario dBm", "Change dB", "Band", "Within uncertainty"]), _row(["---"] * 6)]
    for z in sorted(comparison["zones"], key=lambda r: (r["delta_db"] is None, -(r["delta_db"] or 0))):
        L.append(_row([f"{z['id']} {z['name']}", z["a_dbm"], z["b_dbm"], z["delta_db"], f"{z['a_band']} -> {z['b_band']}", z["within_model_uncertainty"]]))
    gaps = [z for z in result["zones"] if z["evidence"]["support"] == "no_recorded_evidence"]
    L += ["", "## Uncertainty and missing evidence", "",
          f"- Zones with no recorded measurement within {ap.NEAR_EVIDENCE_M:.0f} m: {len(gaps)} ({s1['area_without_recorded_evidence_m2']} m2). "
          "Predictions there cannot be checked against any recorded data: " + (", ".join(z["id"] for z in gaps[:20]) or "none") + ".",
          f"- Zones whose coverage band is uncertain under the modelled uncertainty: {s1['uncertain_zones']}."]
    mc = result.get("model_check")
    L.append(f"- Model residual against recorded points (existing APs only): bias {mc['bias_db']} dB, MAE {mc['mae_db']} dB, RMSE {mc['rmse_db']} dB "
             f"over {mc['points']} points. The model is not fitted to them." if mc else "- No model residual could be computed (too few recorded points or no registered AP).")
    L += ["", "## Parameters", "", _row(["Parameter", "Value", "Unit", "Provenance"]), _row(["---"] * 4)]
    for name, p in result["parameters"].items():
        L.append(_row([name, p["value"], p["unit"], p["provenance"]]))
    L += ["", "## Access points", "", _row(["Name", "Kind", "x m", "y m", "Tx dBm", "Enabled"]), _row(["---"] * 6)]
    for a in result["access_points"]:
        L.append(_row([a["name"], a["kind"], a["x_m"], a["y_m"], a["tx_power_dbm"] if a["tx_power_dbm"] is not None else "assumed default", a["enabled"]]))
    L += ["", "## Assumptions and limitations", ""] + [f"- {t}" for t in result["model"]["assumptions"]]
    L += [f"- {r['id']}: {r['reason']}" for r in result.get("excluded_regions", [])]
    L += ["", f"**{comparison['caveat']}** Verify any proposed change with a physical survey before acting on it.", ""]
    return "\n".join(L)


# ---------------------------------------------------------------------------------------------------------------- copilot grounding

async def copilot_grounding(db: AsyncSession, floor_id: uuid.UUID, max_plans: int = 3) -> Tuple[List[str], List[dict]]:
    """Text + citations for the Copilot. Everything is a MODEL_PREDICTION about hypothetical APs; recorded data stays separate.
    Caller must already have authorised the floor."""
    try:
        ctx = await floor_context(db, floor_id)
    except HTTPException:
        return [], []
    base = evaluate(ctx, None)
    L = ["", "### Model-predicted coverage [MODEL_PREDICTION]",
         f"- Model {base['model']['id']} v{base['model']['version']}: NOT physically validated. Values below are predictions from registered AP positions "
         "and floor geometry, not measurements. Recorded survey points are used only to judge evidence and residual error, never to fit the prediction.",
         f"- Recorded evidence: {base['labels']['recorded_data']}. Registered APs modelled: {base['summary']['enabled_access_points']}; "
         f"APs without a floor position (ignored): {ctx['unplaced_access_points']}."]
    cites: List[dict] = []
    for z in base["zones"]:
        if z["band"] in ("weak", "unknown") or z["uncertain"] or z["evidence"]["support"] == "no_recorded_evidence":
            L.append(f"  - {z['id']} {z['name']}: predicted {z['mean_dbm']} dBm (sigma {z['sigma_db']} dB), band {z['band']}, P(weak)={z['p_weak']}, "
                     f"serving AP {z['serving_ap_name'] or z['serving_ap']} through {z['walls_to_serving_ap']} wall(s); recorded evidence: {z['evidence']['support']}"
                     f" ({z['evidence']['recorded_points']} pts, nearest {z['evidence']['nearest_recorded_m']} m)")
            cites.append({"source_id": f"model:{floor_id}:{z['id']}", "kind": "room", "label": f"{z['id']} {z['name']}", "metric": "Predicted RSSI",
                          "value": z["mean_dbm"], "unit": "dBm", "provenance": "MODEL_PREDICTION"})
    gaps = [z["id"] for z in base["zones"] if z["evidence"]["support"] == "no_recorded_evidence"]
    L.append(f"- Zones with no recorded measurement nearby (more real measurements needed): {', '.join(gaps) if gaps else 'none'}.")
    L.append("- Model assumptions: " + " | ".join(base["model"]["assumptions"]))

    plans = (await db.execute(select(OptimizationPlan).where(OptimizationPlan.floor_id == floor_id, OptimizationPlan.scenario.is_not(None))
                              .order_by(OptimizationPlan.updated_at.desc()).limit(max_plans))).scalars().all()
    for p in plans:
        spec = p.scenario
        try:
            res = evaluate(ctx, spec)
        except HTTPException:
            continue
        cmp = ap.compare_results(base, res)
        sm = cmp["summary"]
        cands = "; ".join(f"{c['name']} at ({c['x_m']}, {c['y_m']}) m" + ("" if c.get("enabled", True) else " [disabled]") for c in spec.get("candidates", []))
        L += ["", f"### Saved hypothetical scenario '{sanitize(p.name)}' v{p.version} [MODEL_PREDICTION]",
              f"- Hypothetical (not installed) APs: {cands or 'none'}. Parameter overrides: {spec.get('parameters') or 'none (defaults are assumptions)'}.",
              f"- Weak area {sm['weak_area_m2']['a']} -> {sm['weak_area_m2']['b']} m2; expected weak area incl. uncertainty "
              f"{sm['expected_weak_area_m2']['a']} -> {sm['expected_weak_area_m2']['b']} m2; zones improved {cmp['zones_improved']}, worsened {cmp['zones_worsened']}; "
              f"{cmp['changes_within_model_uncertainty']} of {len(cmp['zones'])} changes are smaller than the modelled uncertainty.",
              f"- Zones still uncertain in the scenario: {res['summary']['uncertain_zones']}."]
        for z in sorted(cmp["zones"], key=lambda r: -(r["delta_db"] or 0))[:6]:
            L.append(f"  - {z['id']}: {z['a_dbm']} -> {z['b_dbm']} dBm ({z['delta_db']:+} dB), {z['a_band']} -> {z['b_band']}, within uncertainty: {z['within_model_uncertainty']}")
        cites.append({"source_id": f"scenario:{p.id}:{p.version}", "kind": "plan", "label": f"Scenario {p.name} v{p.version}", "metric": "Predicted weak area",
                      "value": sm["weak_area_m2"]["b"], "unit": "m2", "provenance": "MODEL_PREDICTION"})
    return L, cites


def sanitize(text: str) -> str:
    from airgrid.services.copilot_service import sanitize_text
    return sanitize_text(text)
