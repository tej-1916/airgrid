"""Campus model: Blender->plan coordinate mapping, floor selection, authorization and room coverage.

All geometry and measurements are synthetic (a tiny two-room floor written to tmp_path); no Blender files are needed.
"""
import json
import uuid
from datetime import datetime, timezone

import pytest

from airgrid.core.database import AsyncSessionLocal
from airgrid.models.all_models import Building, Campus, CampusMembership, Floor, SurveyMeasurement, SurveySession
from airgrid.services import campus_model as cm
from tests.test_authz_remediation import _user, login

CAL = {"resolution_px": [2240, 1493], "pixels_per_metre": 20.0}  # same scale/size as the real exported plans


def test_known_blender_coordinates_map_to_expected_pixels():
    # image centre is world (0, 0); +x east is +px; +y north is -py (image rows grow downward)
    assert cm.world_to_pixel(0, 0, CAL) == (1120.0, 746.5)
    assert cm.world_to_pixel(-48, -32, CAL) == (160.0, 1386.5)   # SW corner, matches exported calibration
    assert cm.world_to_pixel(48, 32, CAL) == (2080.0, 106.5)     # NE corner
    for x, y in [(-45.0, 24.5), (12.3, -7.7), (0, 0)]:
        px, py = cm.world_to_pixel(x, y, CAL)
        assert cm.pixel_to_world(px, py, CAL) == pytest.approx((x, y))
    # glTF is Y-up: (x, y, z) -> (x, z, -y)
    assert cm.blender_to_gltf(5, 10, 4) == (5, 4, -10)


def test_point_in_polygon_and_band():
    sq = [[0, 0], [10, 0], [10, 10], [0, 10]]
    assert cm.point_in_polygon(5, 5, sq) and not cm.point_in_polygon(11, 5, sq)
    assert [cm.band(v) for v in (-60, -70, -80, None)] == ["good", "fair", "weak", "unknown"]


def _geometry():
    room = lambda rid, x0, x1: {"id": rid, "name": rid, "kind": "room", "wing": "W", "area_m2": (x1 - x0) * 10,
                                "centre": [(x0 + x1) / 2, 0], "polygon": [[x0, -5], [x1, -5], [x1, 5], [x0, 5]]}
    floors = [{"id": k, "index": i, "title": k, "code": c, "finished_floor_z_m": 4.0 * i, "clear_wall_top_z_m": 4.0 * i + 3.7,
               "calibration": dict(CAL), "rooms": [room(f"{c}-1", -20, -5), room(f"{c}-2", 5, 20)]}
              for i, (k, c) in enumerate([("ground", "GF"), ("first", "FF"), ("second", "SF")])]
    return {"coordinate_system": {"up": "Z"}, "campus": {}, "building": {"bounds": {}, "levels": 3}, "floors": floors}


@pytest.fixture
def model_files(tmp_path, monkeypatch):
    (tmp_path / cm.GEOMETRY_FILE).write_text(json.dumps(_geometry()))
    (tmp_path / cm.GLB_FILE).write_bytes(b"glTF-synthetic")
    monkeypatch.setattr(cm, "model_dir", lambda: tmp_path)
    cm._cache.clear()


@pytest.fixture
async def site():
    async with AsyncSessionLocal() as s:
        ca, cb = [Campus(id=uuid.uuid4(), name=f"CM {t} {uuid.uuid4().hex[:5]}", code=f"CM{t}-{uuid.uuid4().hex[:5]}", status="active") for t in "AB"]
        alpha, beta = _user("alpha", "network_engineer"), _user("beta", "network_engineer")
        s.add_all([ca, cb, alpha, beta])
        await s.flush()
        s.add_all([CampusMembership(campus_id=ca.id, user_id=alpha.id), CampusMembership(campus_id=cb.id, user_id=beta.id)])
        b = Building(id=uuid.uuid4(), campus_id=cb.id, name="Mega", building_code=cm.MODEL_BUILDING_CODE, status="active", floors_count=3)
        s.add(b)
        await s.flush()
        floors = [Floor(id=uuid.uuid4(), building_id=b.id, floor_number=i, name=f"L{i}", status="active",
                        dimensions_width_m=96.0, dimensions_height_m=64.0) for i in range(3)]
        s.add_all(floors)
        await s.flush()
        sess = SurveySession(id=uuid.uuid4(), campus_id=cb.id, building_id=b.id, floor_id=floors[0].id, session_name="synthetic demo",
                             started_at=datetime.now(timezone.utc), status="completed")
        s.add(sess)
        await s.flush()
        # synthetic demo points: strong near room GF-1 (world x -12), weak near GF-2 (world x 12)
        for wx, wy, rssi in [(-12, -3, -55), (-12, 3, -57), (-8, 0, -60), (12, -3, -82), (12, 3, -84), (16, 0, -86)]:
            px, py = cm.world_to_pixel(wx, wy, CAL)
            s.add(SurveyMeasurement(id=uuid.uuid4(), survey_session_id=sess.id, floor_id=floors[0].id, position_x=px, position_y=py,
                                    normalized_x=px / 2240, normalized_y=py / 1493, rssi_dbm=rssi, measurement_source="controlled_test_import",
                                    data_provenance="controlled_test_import"))
        await s.commit()
    return dict(alpha=alpha, beta=beta, building=b, floors=floors, session=sess)


@pytest.mark.asyncio
async def test_model_endpoints_are_tenant_isolated(client, site, model_files):
    ha, hb = await login(client, site["alpha"]), await login(client, site["beta"])
    b, f0 = site["building"], site["floors"][0]
    urls = [f"/api/v1/campus-model/buildings/{b.id}/model", f"/api/v1/campus-model/buildings/{b.id}/model.glb",
            f"/api/v1/campus-model/floors/{f0.id}/rooms", f"/api/v1/campus-model/floors/{f0.id}/room-coverage"]
    for u in urls:  # alpha belongs to campus A only: denied before any model data is returned
        r = await client.get(u, headers=ha)
        assert r.status_code == 403, (u, r.status_code)
        assert "GF-1" not in r.text and "glTF" not in r.text
    info = (await client.get(urls[0], headers=hb)).json()
    assert info["available"] and [lv["key"] for lv in info["levels"]] == ["ground", "first", "second"]
    assert info["levels"][1]["airgrid_floor_id"] == str(site["floors"][1].id)  # floor selection maps model level -> AirGrid floor
    assert (await client.get(urls[1], headers=hb)).content == b"glTF-synthetic"


@pytest.mark.asyncio
async def test_room_coverage_reuses_idw_and_labels_synthetic(client, site, model_files):
    hb = await login(client, site["beta"])
    f0 = site["floors"][0]
    r = (await client.get(f"/api/v1/campus-model/floors/{f0.id}/room-coverage", headers=hb)).json()
    assert r["session"]["all_synthetic_demo"] is True and r["session"]["provenance_counts"] == {"controlled_test_import": 6}
    rooms = {x["id"]: x for x in r["rooms"]}
    assert rooms["GF-1"]["basis"] == "measured_points_in_room" and rooms["GF-1"]["band"] == "good"
    assert rooms["GF-2"]["band"] == "weak" and rooms["GF-2"]["rssi_dbm"] < -80
    # a floor with no survey reports unknown coverage rather than inventing values
    r1 = (await client.get(f"/api/v1/campus-model/floors/{site['floors'][1].id}/room-coverage", headers=hb)).json()
    assert r1["session"] is None and {x["band"] for x in r1["rooms"]} == {"unknown"}


@pytest.mark.asyncio
async def test_model_reports_unavailable_when_files_missing(client, site, tmp_path, monkeypatch):
    monkeypatch.setattr(cm, "model_dir", lambda: tmp_path)  # empty directory
    cm._cache.clear()
    hb = await login(client, site["beta"])
    r = (await client.get(f"/api/v1/campus-model/buildings/{site['building'].id}/model", headers=hb)).json()
    assert r["available"] is False and "not installed" in r["reason"]
