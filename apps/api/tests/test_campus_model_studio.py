"""Unified heatmap studio backend: recorded points in world metres, evidence distance, survey comparison, 2D/3D data consistency.

Synthetic fixtures only (shared with test_campus_model); no private Blender files.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from airgrid.core.database import AsyncSessionLocal
from airgrid.models.all_models import SurveyMeasurement, SurveySession
from airgrid.services import campus_model as cm
from tests.test_authz_remediation import login
from tests.test_campus_model import CAL, model_files, site  # noqa: F401  (fixtures)

POINTS = [(-12, -3, -55), (-12, 3, -57), (-8, 0, -60), (12, -3, -82), (12, 3, -84), (16, 0, -86)]   # as seeded by the `site` fixture


async def second_session(site, shift_db):
    f0 = site["floors"][0]
    async with AsyncSessionLocal() as s:
        sess = SurveySession(id=uuid.uuid4(), campus_id=site["building"].campus_id, building_id=site["building"].id, floor_id=f0.id,
                             session_name="follow-up", started_at=datetime.now(timezone.utc) + timedelta(minutes=5), status="completed")
        s.add(sess)
        await s.flush()
        for wx, wy, rssi in POINTS:
            px, py = cm.world_to_pixel(wx, wy, CAL)
            s.add(SurveyMeasurement(id=uuid.uuid4(), survey_session_id=sess.id, floor_id=f0.id, position_x=px, position_y=py, normalized_x=px / 2240,
                                    normalized_y=py / 1493, rssi_dbm=rssi + shift_db, measurement_source="controlled_test_import", data_provenance="controlled_test_import"))
        await s.commit()
        return sess.id


@pytest.mark.asyncio
async def test_coverage_returns_recorded_points_in_world_metres_with_provenance_and_evidence_distance(client, site, model_files):
    hb = await login(client, site["beta"])
    r = (await client.get(f"/api/v1/campus-model/floors/{site['floors'][0].id}/room-coverage", headers=hb)).json()
    got = sorted((p["x_m"], p["y_m"], p["rssi_dbm"]) for p in r["points"])
    assert got == pytest.approx(sorted(POINTS), abs=0.05)                     # same frame as the 3D model: pixel -> world round-trips
    assert {p["provenance"] for p in r["points"]} == {"controlled_test_import"}
    assert [s["id"] for s in r["sessions"]] == [str(site["session"].id)]
    rooms = {x["id"]: x for x in r["rooms"]}
    assert 2.9 <= rooms["GF-1"]["nearest_point_m"] <= 3.2 and 2.9 <= rooms["GF-2"]["nearest_point_m"] <= 3.2
    empty = (await client.get(f"/api/v1/campus-model/floors/{site['floors'][1].id}/room-coverage", headers=hb)).json()
    assert empty["points"] == [] and empty["sessions"] == [] and all(x["nearest_point_m"] is None for x in empty["rooms"])     # nothing invented


@pytest.mark.asyncio
async def test_2d_and_3d_views_read_identical_room_data_for_the_same_survey(client, site, model_files):
    """The 3D viewer and the 2D plan both render /room-coverage polygons; /rooms (pixel plan) must agree on ids and world polygons."""
    hb = await login(client, site["beta"])
    f0 = str(site["floors"][0].id)
    cov = (await client.get(f"/api/v1/campus-model/floors/{f0}/room-coverage", headers=hb)).json()
    rooms = (await client.get(f"/api/v1/campus-model/floors/{f0}/rooms", headers=hb)).json()
    plan = {r["id"]: r for r in rooms["rooms"]}
    assert set(plan) == {r["id"] for r in cov["rooms"]}
    for r in cov["rooms"]:
        assert plan[r["id"]]["polygon_world"] == r["polygon_world"]
        px = [cm.world_to_pixel(x, y, CAL) for x, y in r["polygon_world"]]
        assert [tuple(p) for p in plan[r["id"]]["polygon_px"]] == pytest.approx(px)
    selected = (await client.get(f"/api/v1/campus-model/floors/{f0}/room-coverage?session_id={site['session'].id}", headers=hb)).json()
    assert selected["rooms"] == cov["rooms"]                                     # explicit selection of the latest session == default


@pytest.mark.asyncio
async def test_survey_comparison_is_per_room_difference_of_recorded_estimates(client, site, model_files):
    hb, ha = await login(client, site["beta"]), await login(client, site["alpha"])
    f0 = str(site["floors"][0].id)
    b = await second_session(site, shift_db=-10)
    url = f"/api/v1/campus-model/floors/{f0}/room-coverage/compare?a={site['session'].id}&b={b}"
    r = (await client.get(url, headers=hb)).json()
    assert r["available"] and "not a prediction" in r["note"]
    rooms = {x["id"]: x for x in r["rooms"]}
    assert rooms["GF-1"]["delta_db"] == -10.0 and rooms["GF-2"]["delta_db"] == -10.0 and rooms["GF-1"]["comparable"]
    assert rooms["GF-1"]["a_band"] == "good" and rooms["GF-2"]["b_band"] == "weak"
    assert len(r["points_a"]) == len(r["points_b"]) == 6
    same = (await client.get(f"/api/v1/campus-model/floors/{f0}/room-coverage/compare?a={b}&b={b}", headers=hb)).json()
    assert {x["delta_db"] for x in same["rooms"]} == {0.0}
    missing = (await client.get(f"/api/v1/campus-model/floors/{f0}/room-coverage/compare?a={b}&b={uuid.uuid4()}", headers=hb)).json()
    assert missing["available"] is False and missing["rooms"] == []              # unknown session: reported, not guessed
    other_floor = (await client.get(f"/api/v1/campus-model/floors/{site['floors'][1].id}/room-coverage/compare?a={b}&b={b}", headers=hb)).json()
    assert other_floor["available"] is False                                     # a session from a different floor is rejected
    denied = await client.get(url, headers=ha)                                   # other campus: denied before any data
    assert denied.status_code == 403 and "GF-1" not in denied.text
