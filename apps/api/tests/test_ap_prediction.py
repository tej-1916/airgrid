"""Hypothetical-AP prediction model: determinism, physics sanity, evidence separation. Synthetic fixtures only (no DB)."""
import copy
import json
import time

import numpy as np
import pytest

from airgrid.lab_fixtures import SYNTHETIC_EXISTING_APS, synthetic_floor_geometry, synthetic_recorded_points
from airgrid.services import ap_prediction as ap

GEOM = synthetic_floor_geometry()
REC = synthetic_recorded_points()
CAND_SOUTH = {"id": "c1", "name": "Candidate South", "x_m": 0.0, "y_m": -9.0}


def run(cands=(), overrides=None, recorded=REC, disabled=()):
    return ap.run_scenario(GEOM, SYNTHETIC_EXISTING_APS, list(cands), overrides, recorded, disabled)


def zone(res, zid):
    return next(z for z in res["zones"] if z["id"] == zid)


def test_wall_counts_merge_shared_walls_and_count_partitions():
    edges = ap.build_layout(GEOM)["edges"]
    src = (-16.0, 9.0)                                   # inside SYN-N-01
    pts = np.array([[-12.0, 9.0],                         # same room            -> 0
                    [0.0, 9.0],                           # next room east       -> 1 (shared wall counted once, not twice)
                    [16.0, 9.0],                          # two rooms east       -> 2
                    [-16.0, 0.0],                         # corridor             -> 1
                    [-16.0, -9.0]])                       # south room via corridor -> 2
    assert ap.wall_counts(src, pts, edges).tolist() == [0, 1, 2, 1, 2]


def test_zones_cover_the_whole_synthetic_floor_exactly():
    res = run([CAND_SOUTH])
    assert res["summary"]["modelled_area_m2"] == 48 * 32
    s = res["summary"]
    assert abs(s["weak_area_m2"] + s["fair_area_m2"] + s["good_area_m2"] - s["modelled_area_m2"]) < 0.5


def test_prediction_is_deterministic_and_hash_tracks_inputs():
    a, b = run([CAND_SOUTH]), run([CAND_SOUTH])
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
    assert run([{**CAND_SOUTH, "x_m": 1.0}])["inputs_hash"] != a["inputs_hash"]
    assert run([CAND_SOUTH], {"wall_loss_db": 8.0})["inputs_hash"] != a["inputs_hash"]


def test_adding_a_candidate_never_lowers_any_zone_and_improves_the_weak_south():
    base, with_c = run(), run([CAND_SOUTH])
    for zb, zc in zip(base["zones"], with_c["zones"]):
        assert zc["mean_dbm"] >= zb["mean_dbm"] - 1e-9          # strongest AP wins: more APs cannot hurt the model
    assert zone(with_c, "SYN-S-02")["mean_dbm"] > zone(base, "SYN-S-02")["mean_dbm"] + 5
    cmp = ap.compare_results(base, with_c)
    assert cmp["zones_improved"] >= 1 and cmp["zones_worsened"] == 0
    assert "not measured improvements" in cmp["caveat"]


def test_moving_an_ap_toward_a_room_raises_its_prediction_and_distance_decay_is_monotonic():
    far = run([{**CAND_SOUTH, "y_m": -9.0, "x_m": -16.0}])     # two walls away from SYN-S-03
    near = run([{**CAND_SOUTH, "y_m": -9.0, "x_m": 16.0}])    # inside SYN-S-03
    assert zone(near, "SYN-S-03")["mean_dbm"] > zone(far, "SYN-S-03")["mean_dbm"]
    pts = np.array([[x, 9.0] for x in (-15.0, -12.0, -8.5)])   # same room as the AP, increasing distance, 0 walls
    p = ap.predict_points(pts, [{"id": "a", "x_m": -16.0, "y_m": 9.0, "enabled": True}], ap.resolve_parameters(None), np.zeros((0, 4)))
    assert p["mean"][0] > p["mean"][1] > p["mean"][2]


def test_disabled_candidate_and_disabled_existing_ap_behave_as_removed():
    assert run([{**CAND_SOUTH, "enabled": False}])["zones"] == run()["zones"]
    assert zone(run(disabled=["syn-ap-1"]), "SYN-N-01")["mean_dbm"] < zone(run(), "SYN-N-01")["mean_dbm"]


def test_no_enabled_access_point_means_unknown_not_weak():
    res = run(disabled=["syn-ap-1", "syn-ap-2"])
    assert {z["band"] for z in res["zones"]} == {"unknown"}
    assert all(z["basis"] == "no_enabled_access_points" and z["mean_dbm"] is None for z in res["zones"])
    assert res["summary"]["unknown_area_m2"] == res["summary"]["modelled_area_m2"] and res["summary"]["weak_area_m2"] == 0
    assert res["model_check"] is None


def test_parameters_are_validated_and_provenance_is_explicit():
    res = run(overrides={"wall_loss_db": 10.0})
    assert res["parameters"]["wall_loss_db"]["provenance"] == "scenario_set"
    assert res["parameters"]["path_loss_exponent"]["provenance"] == "assumed_default"
    for bad in ({"nope": 1}, {"wall_loss_db": 99}, {"path_loss_exponent": float("nan")}):
        with pytest.raises(ValueError):
            ap.resolve_parameters(bad)
    assert res["model"]["validated"] is False and res["labels"]["physically_validated"] is False


def test_recorded_points_only_inform_evidence_and_never_change_the_prediction():
    rec = list(REC)
    before = copy.deepcopy(rec)
    a = run([CAND_SOUTH], recorded=rec)
    shifted = run([CAND_SOUTH], recorded=[(x, y, r - 30.0) for x, y, r in rec])
    assert rec == before                                                                       # inputs are not mutated
    assert [z["mean_dbm"] for z in a["zones"]] == [z["mean_dbm"] for z in shifted["zones"]]   # unlike IDW, recorded values do not move the prediction
    assert a["model_check"]["bias_db"] != shifted["model_check"]["bias_db"]
    assert zone(a, "SYN-N-01")["evidence"]["support"] == "recorded_in_zone"
    none = run([CAND_SOUTH], recorded=[])
    assert {z["evidence"]["support"] for z in none["zones"]} == {"no_recorded_evidence"}
    assert none["summary"]["area_without_recorded_evidence_m2"] == none["summary"]["modelled_area_m2"]


def test_model_check_uses_only_existing_aps():
    assert run([CAND_SOUTH])["model_check"] == run()["model_check"]
    assert run()["model_check"]["points"] == len(REC)


def test_uncertainty_grows_with_walls_and_probabilities_are_valid():
    res = run()
    assert zone(res, "SYN-N-01")["sigma_db"] < zone(res, "SYN-S-03")["sigma_db"]     # more walls to the serving AP -> larger sigma
    assert all(0 <= z["p_weak"] <= 1 and 0 <= z["confidence"] <= 1 and isinstance(z["uncertain"], bool) for z in res["zones"])


def test_candidate_limits_and_duplicate_ids_are_rejected():
    with pytest.raises(ValueError):
        run([{**CAND_SOUTH, "id": f"c{i}"} for i in range(ap.MAX_CANDIDATES + 1)])
    with pytest.raises(ValueError):
        run([CAND_SOUTH, CAND_SOUTH])
    with pytest.raises(ValueError):
        run([{**CAND_SOUTH, "id": "syn-ap-1"}])


def test_compare_identical_scenarios_is_all_zero_and_flags_uncertainty():
    a = run([CAND_SOUTH])
    c = ap.compare_results(a, a)
    assert all(r["delta_db"] == 0 and r["change"] == "same_band" for r in c["zones"])
    assert c["zones_improved"] == c["zones_worsened"] == 0 and c["changes_within_model_uncertainty"] == len(c["zones"])


def test_runtime_is_interactive_on_the_synthetic_floor():
    t = time.perf_counter()
    run([CAND_SOUTH, {**CAND_SOUTH, "id": "c2", "x_m": -16.0}])
    assert time.perf_counter() - t < 1.5
