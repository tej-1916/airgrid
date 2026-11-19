"""Phase 1 / performance checks against the REAL private Blender campus metadata. Skipped when the files are not installed.

Point AIRGRID_CAMPUS_MODEL_DIR at the folder holding campus_geometry.json to run it. It only asserts on numbers; it never
copies, prints or writes any of the private geometry.
"""
import time

import numpy as np
import pytest

from airgrid import demo_seed
from airgrid.services import ap_prediction as ap
from airgrid.services import campus_model as cm

GEOM = cm.load_geometry()
pytestmark = pytest.mark.skipif(not GEOM, reason="private campus model metadata is not installed (AIRGRID_CAMPUS_MODEL_DIR)")


def shoelace(poly):
    x, y = np.array(poly, dtype=float).T
    return abs(float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))) / 2


def floors():
    return {f["index"]: f for f in GEOM["floors"]}


def test_three_floors_with_consistent_rooms_polygons_and_bounds():
    fl = floors()
    assert sorted(fl) == [0, 1, 2]
    for n, f in fl.items():
        (x0, y0), (x1, y1) = f["bounds"]["min"], f["bounds"]["max"]
        assert len(f["rooms"]) == 20, n
        ids = [r["id"] for r in f["rooms"]]
        assert len(set(ids)) == 20
        for r in f["rooms"]:
            assert abs(shoelace(r["polygon"]) - r["area_m2"]) < 0.5, r["id"]                      # stored area == polygon area
            assert cm.point_in_polygon(*r["centre"], r["polygon"]), r["id"]                        # centre lies inside its own room
            assert all(x0 - 1e-6 <= px <= x1 + 1e-6 and y0 - 1e-6 <= py <= y1 + 1e-6 for px, py in r["polygon"]), r["id"]


def test_rooms_do_not_overlap_and_zones_plus_courtyard_account_for_the_footprint():
    for n, f in floors().items():
        (x0, y0), (x1, y1) = f["bounds"]["min"], f["bounds"]["max"]
        xs, ys = np.arange(x0 + 0.5, x1, 1.0), np.arange(y0 + 0.5, y1, 1.0)
        hits = [sum(cm.point_in_polygon(x, y, r["polygon"]) for r in f["rooms"]) for x in xs for y in ys]
        assert max(hits) <= 1, f"overlapping rooms on floor {n}"                                      # no point is in two rooms
        layout = ap.build_layout(f)
        modelled = sum(z["area_m2"] for z in layout["zones"])
        assert modelled > 0 and len(layout["zones"]) == len(f["rooms"]) + len(f.get("corridors") or [])
        assert layout["excluded"] and layout["excluded"][0]["id"] == "courtyard"                      # the open courtyard is reported, not silently modelled
        assert modelled < (x1 - x0) * (y1 - y0)                                                       # zones never exceed the bounding box


def test_world_pixel_transform_is_the_shared_blender_frame_and_round_trips():
    for n, f in floors().items():
        cal = f["calibration"]
        assert cal["resolution_px"] == [2240, 1493] and cal["pixels_per_metre"] == 20
        assert cm.world_to_pixel(0, 0, cal) == pytest.approx((1120.0, 746.5))                         # site centre = image centre
        for x, y in ((-48, -32), (48, 32), (0, 0), (-30.5, 20.25)):
            px, py = cm.world_to_pixel(x, y, cal)
            assert cm.pixel_to_world(px, py, cal) == pytest.approx((x, y), abs=1e-9)
        for x, y in demo_seed.APS.get(n, []):                                                         # demo AP positions survive the normalized-plan round trip
            px, py = cm.world_to_pixel(x, y, cal)
            w, h = cal["resolution_px"]
            assert cm.pixel_to_world((px / w) * w, (py / h) * h, cal) == pytest.approx((x, y), abs=1e-9)


@pytest.mark.parametrize("floor_number", [0, 1, 2])
def test_prediction_on_the_real_floor_is_deterministic_fast_and_improves_with_candidates(floor_number):
    f = floors()[floor_number]
    existing = [{"id": f"e{i}", "name": f"E{i}", "x_m": x, "y_m": y, "tx_power_dbm": None} for i, (x, y) in enumerate(demo_seed.APS[floor_number])]
    cands = [{"id": "c1", "name": "C1", "x_m": 30.0, "y_m": 20.0}, {"id": "c2", "name": "C2", "x_m": -30.0, "y_m": -20.0}]
    t = time.perf_counter()
    base = ap.run_scenario(f, existing, [], None, [], [])
    scen = ap.run_scenario(f, existing, cands, None, [], [])
    elapsed = time.perf_counter() - t
    assert elapsed < 3.0, f"{elapsed:.2f}s for two model runs on a real floor"                         # interactive: placing an AP re-predicts in well under a second
    assert ap.run_scenario(f, existing, cands, None, [], []) == scen                                  # deterministic on the real geometry
    cmp = ap.compare_results(base, scen)
    assert cmp["zones_worsened"] == 0                                                                 # strongest-AP model: adding an AP never lowers a zone
    assert scen["summary"]["weak_area_m2"] <= base["summary"]["weak_area_m2"]
    assert scen["labels"]["physically_validated"] is False and scen["summary"]["modelled_area_m2"] == base["summary"]["modelled_area_m2"]
