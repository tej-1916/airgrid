"""Scenario studio API: authorization, shared coordinates, persistence/versions, export, and real-vs-synthetic separation.

Synthetic geometry only (airgrid.lab_fixtures); the private Blender files are never needed.
"""
import json
import uuid

import pytest
from sqlalchemy import func, select

from airgrid.core.database import AsyncSessionLocal
from airgrid.lab_fixtures import SYNTHETIC_EXISTING_APS, synthetic_floor_geometry, synthetic_recorded_points
from airgrid.models.all_models import AccessPoint, Building, Campus, CampusMembership, Floor, SurveyMeasurement, SurveySession
from airgrid.services import campus_model as cm

GEOM = synthetic_floor_geometry()
CAL = GEOM["calibration"]
W, H = CAL["resolution_px"]
CAND = {"id": "c1", "name": "Candidate 1", "x_m": 0.0, "y_m": -9.0}


@pytest.fixture
def model_files(tmp_path, monkeypatch):
    (tmp_path / cm.GEOMETRY_FILE).write_text(json.dumps({"coordinate_system": {"up": "Z"}, "campus": {}, "building": {"bounds": {}, "levels": 1}, "floors": [GEOM]}))
    (tmp_path / cm.GLB_FILE).write_bytes(b"glTF-synthetic")
    monkeypatch.setattr(cm, "model_dir", lambda: tmp_path)
    cm._cache.clear()


def mac():
    return "02:00:5e:%02x:%02x:%02x" % tuple(uuid.uuid4().bytes[:3])


async def build_site(code=cm.MODEL_BUILDING_CODE):
    async with AsyncSessionLocal() as s:
        campus = Campus(id=uuid.uuid4(), name=f"Scn {uuid.uuid4().hex[:6]}", code=f"SC-{uuid.uuid4().hex[:8]}", status="active")
        s.add(campus)
        await s.flush()
        b = Building(id=uuid.uuid4(), campus_id=campus.id, name="Synthetic Hall", building_code=code, status="active", floors_count=1)
        s.add(b)
        await s.flush()
        f = Floor(id=uuid.uuid4(), building_id=b.id, floor_number=0, name="Synthetic Floor", status="active")
        s.add(f)
        await s.flush()
        sess = SurveySession(id=uuid.uuid4(), campus_id=campus.id, building_id=b.id, floor_id=f.id, session_name="SYNTHETIC survey", status="completed")
        s.add(sess)
        await s.flush()
        for x, y, rssi in synthetic_recorded_points():
            px, py = cm.world_to_pixel(x, y, CAL)
            s.add(SurveyMeasurement(id=uuid.uuid4(), survey_session_id=sess.id, floor_id=f.id, position_x=px, position_y=py, normalized_x=px / W,
                                    normalized_y=py / H, rssi_dbm=rssi, measurement_source="controlled_test_import", data_provenance="controlled_test_import"))
        for a in SYNTHETIC_EXISTING_APS:
            px, py = cm.world_to_pixel(a["x_m"], a["y_m"], CAL)
            s.add(AccessPoint(id=uuid.uuid4(), floor_id=f.id, name=a["name"], mac_address=mac(), x_coord=px / W, y_coord=py / H,
                              tx_power_dbm=a["tx_power_dbm"], status="active"))
        s.add(AccessPoint(id=uuid.uuid4(), floor_id=f.id, name="UNPLACED", mac_address=mac(), status="active"))
        await s.commit()
        return {"campus": campus.id, "floor": f.id, "session": sess.id}


@pytest.fixture
async def world(model_files, auth_client):
    outsider = await auth_client("network_engineer")        # created BEFORE the campus: has no membership in it
    site = await build_site()
    engineer, viewer = await auth_client("network_engineer"), await auth_client("viewer")   # created after: auto-members
    return {**site, "outsider": outsider, "engineer": engineer, "viewer": viewer}


def body(w, *cands, params=None):
    return {"floor_id": str(w["floor"]), "scenario": {"candidates": list(cands), "parameters": params or {}}}


@pytest.mark.asyncio
async def test_context_is_authorized_and_uses_the_shared_world_coordinates(world, client):
    url = f"/api/v1/optimization/scenario/context?floor_id={world['floor']}"
    assert (await client.get(url)).status_code in (401, 403)                         # unauthenticated
    assert (await world["outsider"].get(url)).status_code in (403, 404)              # other campus
    r = await world["viewer"].get(url)
    assert r.status_code == 200, r.text
    ctx = r.json()
    assert len(ctx["zones"]) == 7 and ctx["floor"]["bounds"] == GEOM["bounds"]       # 6 rooms + 1 corridor
    # registered APs are stored as normalized plan coordinates; the API must return the same world metres the model/3D view use
    got = {a["name"]: (a["x_m"], a["y_m"]) for a in ctx["existing_access_points"]}
    for a in SYNTHETIC_EXISTING_APS:
        assert got[a["name"]] == pytest.approx((a["x_m"], a["y_m"]), abs=0.05)
    assert ctx["unplaced_access_points"] == 1 and len(ctx["existing_access_points"]) == 2
    assert len(ctx["recorded_points"]) == len(synthetic_recorded_points())
    assert ctx["session"]["all_synthetic_demo"] is True and ctx["model"]["validated"] is False
    assert ctx["model"]["parameters"]["wall_loss_db"]["default"] == 6.0


@pytest.mark.asyncio
async def test_predict_is_deterministic_labels_synthetic_vs_modelled_and_rejects_bad_input(world):
    c = world["viewer"]
    a = (await c.post("/api/v1/optimization/scenario/predict", json=body(world, CAND))).json()
    b = (await c.post("/api/v1/optimization/scenario/predict", json=body(world, CAND))).json()
    assert a == b and a["scenario"]["inputs_hash"] != a["baseline"]["inputs_hash"]
    assert a["scenario"]["labels"]["layer"] == "model_predicted" and a["scenario"]["labels"]["physically_validated"] is False
    assert a["scenario"]["labels"]["recorded_data"].startswith("SYNTHETIC")
    assert a["comparison"]["zones_improved"] >= 1 and "not measured improvements" in a["comparison"]["caveat"]
    assert a["baseline"]["labels"]["hypothetical_access_points"] == 0 and a["scenario"]["labels"]["hypothetical_access_points"] == 1
    assert (await c.post("/api/v1/optimization/scenario/predict", json=body(world, {**CAND, "x_m": 999}))).status_code == 422
    assert (await c.post("/api/v1/optimization/scenario/predict", json=body(world, {**CAND, "x_m": 40.0}))).status_code == 422   # inside +-500 but outside this floor
    assert (await c.post("/api/v1/optimization/scenario/predict", json=body(world, CAND, params={"wall_loss_db": 99}))).status_code == 422
    assert (await c.post("/api/v1/optimization/scenario/predict", json=body(world, CAND, params={"bogus": 1}))).status_code == 422
    assert (await c.post("/api/v1/optimization/scenario/predict", json=body(world, CAND, CAND))).status_code == 422               # duplicate id


@pytest.mark.asyncio
async def test_predict_and_compare_are_denied_across_campuses(world):
    assert (await world["outsider"].post("/api/v1/optimization/scenario/predict", json=body(world, CAND))).status_code in (403, 404)
    r = await world["outsider"].post("/api/v1/optimization/scenario/compare", json={"floor_id": str(world["floor"]), "b": {"scenario": {}}})
    assert r.status_code in (403, 404)


@pytest.mark.asyncio
async def test_scenario_persistence_versions_reopen_compare_and_export(world):
    eng, viewer, outsider = world["engineer"], world["viewer"], world["outsider"]
    create = {"floor_id": str(world["floor"]), "name": "Two APs", "notes": "hypothetical",
              "scenario": {"candidates": [CAND], "parameters": {"wall_loss_db": 8.0}, "baseline_session_id": str(world["session"])}}
    assert (await viewer.post("/api/v1/optimization/plans", json=create)).status_code == 403            # viewers cannot save
    r = await eng.post("/api/v1/optimization/plans", json=create)
    assert r.status_code == 201, r.text
    plan = r.json()
    assert plan["version"] == 1 and plan["scenario"]["candidates"][0]["id"] == "c1" and plan["speculative"] is True

    moved = {"candidates": [{**CAND, "x_m": 4.0}, {"id": "c2", "name": "Candidate 2", "x_m": 16.0, "y_m": -9.0}], "parameters": {"wall_loss_db": 8.0}}
    up = await eng.patch(f"/api/v1/optimization/plans/{plan['id']}", json={"expected_version": 1, "scenario": moved})
    assert up.status_code == 200 and up.json()["version"] == 2
    assert (await eng.patch(f"/api/v1/optimization/plans/{plan['id']}", json={"expected_version": 1, "name": "stale"})).status_code == 409

    versions = (await viewer.get(f"/api/v1/optimization/plans/{plan['id']}/versions")).json()
    assert [v["version"] for v in versions] == [2, 1] and [v["candidates"] for v in versions] == [2, 1]
    v1 = (await viewer.get(f"/api/v1/optimization/plans/{plan['id']}/versions/1")).json()
    assert v1["scenario"]["candidates"][0]["x_m"] == 0.0                                                   # the old version is reopenable unchanged
    assert (await viewer.get(f"/api/v1/optimization/plans/{plan['id']}/versions/9")).status_code == 404

    cmp = (await viewer.post("/api/v1/optimization/scenario/compare", json={
        "floor_id": str(world["floor"]), "a": {"plan_id": plan["id"], "version": 1}, "b": {"plan_id": plan["id"], "version": 2}})).json()
    assert cmp["a"]["descriptor"]["version"] == 1 and cmp["b"]["descriptor"]["version"] == 2
    assert cmp["b"]["result"]["labels"]["hypothetical_access_points"] == 2
    cur = (await viewer.post("/api/v1/optimization/scenario/compare", json={"floor_id": str(world["floor"]), "b": {"plan_id": plan["id"]}})).json()
    assert cur["a"]["descriptor"]["kind"] == "current_layout" and cur["comparison"]["zones_improved"] >= 1
    both = await viewer.post("/api/v1/optimization/scenario/compare", json={"floor_id": str(world["floor"]), "b": {"plan_id": plan["id"], "scenario": {}}})
    assert both.status_code == 422

    exp = (await viewer.get(f"/api/v1/optimization/plans/{plan['id']}/export?version=1")).json()
    assert exp["format"] == "airgrid-scenario-export/1" and exp["scenario"]["candidates"][0]["id"] == "c1" and "not physically validated" in exp["statement"]
    md = await viewer.get(f"/api/v1/optimization/plans/{plan['id']}/export?version=2&format=markdown")
    assert md.status_code == 200 and md.headers["content-type"].startswith("text/markdown")
    for needle in ("Not a measurement and not physically validated", "Input hash", "Assumptions and limitations", "SYNTHETIC demonstration points", "scenario_set"):
        assert needle in md.text
    assert md.text == (await viewer.get(f"/api/v1/optimization/plans/{plan['id']}/export?version=2&format=markdown")).text   # deterministic report

    for path in ("/versions", "/versions/1", "/export"):
        assert (await outsider.get(f"/api/v1/optimization/plans/{plan['id']}{path}")).status_code in (403, 404)


@pytest.mark.asyncio
async def test_saving_validates_the_scenario_and_plain_plans_still_work(world):
    eng = world["engineer"]
    bad = {"floor_id": str(world["floor"]), "name": "Outside", "scenario": {"candidates": [{**CAND, "y_m": 100}]}}
    assert (await eng.post("/api/v1/optimization/plans", json=bad)).status_code == 422
    assert (await eng.post("/api/v1/optimization/plans", json={**bad, "scenario": {"parameters": {"nope": 1}}})).status_code == 422
    plain = await eng.post("/api/v1/optimization/plans", json={"floor_id": str(world["floor"]), "name": "Markers only", "markers": [{"x": .5, "y": .5, "label": "m"}]})
    assert plain.status_code == 201 and plain.json()["scenario"] is None
    assert (await eng.get(f"/api/v1/optimization/plans/{plain.json()['id']}/export")).status_code == 422                       # nothing to export


@pytest.mark.asyncio
async def test_scenarios_never_touch_inventory_or_recorded_measurements(world):
    async def snapshot():
        async with AsyncSessionLocal() as s:
            aps = (await s.execute(select(func.count()).select_from(AccessPoint).where(AccessPoint.floor_id == world["floor"]))).scalar_one()
            m = (await s.execute(select(func.count(), func.sum(SurveyMeasurement.rssi_dbm)).where(SurveyMeasurement.floor_id == world["floor"]))).one()
            return aps, tuple(m)
    before = await snapshot()
    eng = world["engineer"]
    await eng.post("/api/v1/optimization/scenario/predict", json=body(world, CAND, {**CAND, "id": "c2", "x_m": 10}))
    await eng.post("/api/v1/optimization/plans", json={"floor_id": str(world["floor"]), "name": "x", "scenario": {"candidates": [CAND]}})
    assert await snapshot() == before


@pytest.mark.asyncio
async def test_floor_without_registered_geometry_is_reported_not_invented(model_files, auth_client):
    user = await auth_client("viewer")
    site = await build_site(code="PLAIN-BLDG")
    async with AsyncSessionLocal() as s:                     # the viewer predates the campus, so grant access explicitly
        s.add(CampusMembership(campus_id=site["campus"], user_id=user.user.id))
        await s.commit()
    r = await user.get(f"/api/v1/optimization/scenario/context?floor_id={site['floor']}")
    assert r.status_code == 422 and "No floor geometry" in r.json()["detail"]
