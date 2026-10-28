"""Persisted plans, manual AP inventory, AP-distance review and measured before/after comparisons (fixtures only)."""
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from airgrid.core.database import AsyncSessionLocal
from airgrid.models.all_models import (
    AuditLog, Building, Campus, Floor, FloorPlanAsset, NetworkTelemetrySnapshot, SurveyMeasurement, SurveySession,
)
from airgrid.services.optimization_service import ap_review

NOW = datetime.now(timezone.utc)


def fixture_mac():
    return "02:%02x:%02x:%02x:%02x:%02x" % tuple(uuid.uuid4().bytes[:5])


async def floor_with_plan(calibrated=True):
    async with AsyncSessionLocal() as s:
        campus = Campus(name="Plan Fixture", code=f"PL-{uuid.uuid4().hex[:8]}")
        s.add(campus)
        await s.flush()
        building = Building(campus_id=campus.id, name="Plan Hall", building_code="PH")
        s.add(building)
        await s.flush()
        floor = Floor(building_id=building.id, floor_number=1, name="Plan floor")
        s.add(floor)
        await s.flush()
        s.add(FloorPlanAsset(floor_id=floor.id, file_path="data/test_plans/plan.png", file_format="png", pixel_width=1000,
                             pixel_height=600, scale_pixels_per_meter=20.0, is_calibrated=calibrated))
        await s.commit()
        return floor.id


async def session_with_points(floor_id, points, provenance="operator_reported", source="manual_observation"):
    async with AsyncSessionLocal() as s:
        session = SurveySession(floor_id=floor_id, session_name=f"walk {uuid.uuid4().hex[:4]}")
        s.add(session)
        await s.flush()
        ids = []
        for x, y, rssi in points:
            m = SurveyMeasurement(survey_session_id=session.id, floor_id=floor_id, position_x=x * 1000, position_y=y * 600,
                                  normalized_x=x, normalized_y=y, rssi_dbm=rssi, network_label="Fixture",
                                  measurement_source=source, data_provenance=provenance)
            s.add(m)
            await s.flush()
            ids.append(str(m.id))
        await s.commit()
        return str(session.id), ids


@pytest.mark.asyncio
async def test_plan_lifecycle_rbac_versioning_and_audit(auth_client):
    floor = await floor_with_plan()
    other_floor = await floor_with_plan()
    _, evidence = await session_with_points(floor, [(.1, .1, -80)])
    _, foreign = await session_with_points(other_floor, [(.1, .1, -80)])
    viewer = await auth_client("viewer")
    author = await auth_client("network_engineer")
    colleague = await auth_client("network_engineer")
    admin = await auth_client("administrator")
    body = {"floor_id": str(floor), "network_label": "Fixture", "name": "Plan A", "notes": "Speculative",
            "markers": [{"x": .4, "y": .5, "label": "AP-1"}], "evidence_refs": evidence}
    assert (await viewer.post("/api/v1/optimization/plans", json=body)).status_code == 403
    assert (await author.post("/api/v1/optimization/plans", json={**body, "evidence_refs": foreign})).status_code == 422
    assert (await author.post("/api/v1/optimization/plans", json={**body, "markers": [{"x": 2, "y": .5, "label": "x"}]})).status_code == 422
    created = await author.post("/api/v1/optimization/plans", json=body)
    assert created.status_code == 201, created.text
    plan = created.json()
    assert plan["version"] == 1 and plan["speculative"] and plan["author"] == author.user.email
    assert plan["building_id"] and plan["campus_id"]
    assert [p["id"] for p in (await viewer.get(f"/api/v1/optimization/plans?floor_id={floor}")).json()] == [plan["id"]]

    url = f"/api/v1/optimization/plans/{plan['id']}"
    updated = await colleague.patch(url, json={"expected_version": 1, "status": "proposed", "markers": []})
    assert updated.status_code == 200 and updated.json()["version"] == 2 and updated.json()["markers"] == []
    stale = await author.patch(url, json={"expected_version": 1, "name": "Overwrite"})
    assert stale.status_code == 409  # concurrent edits are not silently lost
    assert (await colleague.delete(url)).status_code == 403  # only author or admin
    assert (await admin.delete(url)).status_code == 200
    assert (await viewer.get(url)).status_code == 404
    async with AsyncSessionLocal() as s:
        actions = set((await s.execute(select(AuditLog.action).where(AuditLog.resource_id == plan["id"]))).scalars())
    assert actions == {"optimization_plan.created", "optimization_plan.updated", "optimization_plan.deleted"}


@pytest.mark.asyncio
async def test_manual_ap_inventory(auth_client):
    floor = await floor_with_plan()
    engineer, viewer = await auth_client("network_engineer"), await auth_client("viewer")
    mac = fixture_mac()
    body = {"floor_id": str(floor), "name": "Corridor AP", "mac_address": mac.upper(), "x_coord": .5, "y_coord": .5}
    assert (await viewer.post("/api/v1/optimization/access-points", json=body)).status_code == 403
    created = await engineer.post("/api/v1/optimization/access-points", json=body)
    assert created.status_code == 201, created.text
    ap = created.json()
    assert ap["tx_power_dbm"] is None and ap["source"] == "operator_registered" and ap["mac_address"] == mac.lower()
    assert (await engineer.post("/api/v1/optimization/access-points", json=body)).status_code == 409
    assert (await engineer.post("/api/v1/optimization/access-points", json={**body, "mac_address": "nope"})).status_code == 422
    patched = await engineer.patch(f"/api/v1/optimization/access-points/{ap['id']}", json={"channel_5ghz": 36, "status": "planned"})
    assert patched.json()["channel_5ghz"] == 36 and patched.json()["status"] == "planned"
    assert len((await viewer.get(f"/api/v1/optimization/access-points?floor_id={floor}")).json()) == 1
    assert (await engineer.delete(f"/api/v1/optimization/access-points/{ap['id']}")).status_code == 200


def test_ap_review_uses_measured_plan_distance_only():
    weak = [{"source_id": "p1", "x": .1, "y": .1, "rssi_dbm": -82}]
    plan = SimpleNamespace(pixel_width=1000, pixel_height=600, scale_pixels_per_meter=20.0)  # 50 m x 30 m
    ap = SimpleNamespace(name="AP-1", x_coord=.1, y_coord=.5, status="active")
    rec = ap_review(weak, [ap], plan)[0]
    assert rec["nearest_registered_aps"][0] == {"source_id": "p1", "rssi_dbm": -82, "nearest_ap": "AP-1", "distance_m": 12.0}
    assert "transmit power are unknown" in rec["required_evidence"]
    assert ap_review(weak, [], plan)[0]["title"] == "Register known AP positions"
    assert ap_review(weak, [ap], None)[0]["title"].startswith("Calibrate")
    assert ap_review([], [ap], plan) == []


@pytest.mark.asyncio
async def test_survey_recommendations_include_ap_and_repeated_change_review(auth_client):
    floor = await floor_with_plan()
    await session_with_points(floor, [(.1, .1, -82), (.9, .9, -60)])
    engineer = await auth_client("network_engineer")
    await engineer.post("/api/v1/optimization/access-points", json={"floor_id": str(floor), "name": "AP-1",
                                                                   "mac_address": fixture_mac(), "x_coord": .1, "y_coord": .5})
    async with AsyncSessionLocal() as s:
        for hours, rssi in [(30, -80.0), (31, -80.0), (32, -80.0), (2, -65.0), (3, -65.0), (4, -65.0)]:
            s.add(NetworkTelemetrySnapshot(floor_id=floor, interface_name="fixture0", rssi_dbm=rssi, vantage_point="backend_server",
                                           data_provenance="instrumented_linux_telemetry", collected_at=NOW - timedelta(hours=hours)))
        await s.commit()
    data = (await engineer.get(f"/api/v1/optimization/survey?floor_id={floor}&network_label=Fixture")).json()
    titles = [r["title"] for r in data["recommendations"]]
    assert "Review AP coverage near weak observations" in titles
    assert any(t.startswith("Recorded RSSI changed") for t in titles)
    assert data["access_points"][0]["name"] == "AP-1"


@pytest.mark.asyncio
async def test_measured_before_after_comparison(auth_client):
    floor = await floor_with_plan()
    before, _ = await session_with_points(floor, [(.05, .1, -80), (.3, .1, -81), (.6, .1, -79)])
    after, _ = await session_with_points(floor, [(.05, .1, -70), (.3, .1, -71), (.6, .1, -69)],
                                         provenance="field_instrument_verified", source="registered_collector")
    elsewhere, _ = await session_with_points(await floor_with_plan(), [(.05, .1, -70)])
    viewer = await auth_client("viewer")
    url = "/api/v1/optimization/compare-sessions"
    res = await viewer.post(url, json={"before_session_id": before, "after_session_id": after, "network_label": "Fixture"})
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["kind"] == "observed" and data["paired_cells"] == 3 and data["improved_cells"] == 3
    assert data["median_cell_delta_db"] == 10
    assert any("different measurement methods" in c for c in data["caveats"])
    assert (await viewer.post(url, json={"before_session_id": before, "after_session_id": elsewhere,
                                         "network_label": "Fixture"})).status_code == 422
    assert (await viewer.post(url, json={"before_session_id": before, "after_session_id": str(uuid.uuid4()),
                                         "network_label": "Fixture"})).status_code == 404
