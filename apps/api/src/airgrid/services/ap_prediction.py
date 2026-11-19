"""Hypothetical-AP coverage prediction. Deterministic, documented, and NOT physically validated.

This is a separate model from the survey IDW engine. IDW interpolates *recorded* observations; moving an AP does not
change a recorded observation, so IDW cannot say anything about a proposed layout. This module instead predicts signal
from modelled APs with a log-distance path-loss model and partition (wall) attenuation:

    RSSI(p) = P_tx + G_ant - PL_1m - 10 * n * log10(max(d3, 1 m)) - walls(p) * L_wall      (strongest AP wins)

    d3       straight-line distance incl. the AP/client height difference
    walls(p) number of distinct room-wall crossings on the straight AP->p segment (room polygons are the walls; corridors
             and the open courtyard add no walls)
    sigma(p) = sqrt(sigma_shadow^2 + (sigma_wall * walls)^2)   modelled uncertainty in dB (a heuristic, not a measured value)

Every parameter has a documented default and a provenance tag (assumed_default | scenario_set).
Defaults are generic indoor 5 GHz assumptions. They are NOT fitted to any measurement. Not modelled: floor-to-floor leakage,
doors, furniture, people, antenna patterns, channel/co-channel interference, client capacity, roaming, 2.4 GHz.
Outputs are model predictions for comparing hypothetical layouts, never measurements and never a promise of improvement.
"""
from __future__ import annotations

import hashlib
import json
import math
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

MODEL_ID = "airgrid-logdistance-walls"
MODEL_VERSION = "1.0.0"
GOOD_DBM, WEAK_DBM = -67.0, -75.0       # same bands as the existing heatmap / Copilot prompt
CELL_M = 2.0                              # sampling grid inside each zone
NEAR_EVIDENCE_M = 10.0                    # a zone within this distance of a recorded point counts as "nearby evidence"
CONFIDENT_P = 0.6                         # a zone band is "uncertain" when no band is at least this probable
MAX_CANDIDATES = 12
_ORDER = ["weak", "fair", "good"]

# name: (default, minimum, maximum, unit, description)
PARAM_SPEC: Dict[str, Tuple[float, float, float, str, str]] = {
    "pl_ref_db": (47.0, 30.0, 70.0, "dB", "Path loss at 1 m (free-space value near 5.5 GHz)."),
    "path_loss_exponent": (3.0, 1.6, 5.0, "", "Indoor path-loss exponent n; 2 = free space, 3-4 = obstructed indoor."),
    "wall_loss_db": (6.0, 0.0, 25.0, "dB", "Attenuation per interior wall crossed (drywall ~3, masonry/concrete 10-15)."),
    "shadow_sigma_db": (6.0, 1.0, 12.0, "dB", "Log-normal shadowing standard deviation (typical indoor 5-8 dB)."),
    "wall_sigma_db": (1.5, 0.0, 5.0, "dB/wall", "Extra uncertainty per wall crossed, added in quadrature (heuristic)."),
    "default_tx_power_dbm": (17.0, 0.0, 30.0, "dBm", "Assumed AP transmit power when none is registered or set."),
    "default_antenna_gain_dbi": (3.0, 0.0, 10.0, "dBi", "Assumed antenna gain when none is set."),
    "ap_height_m": (2.7, 1.0, 6.0, "m", "Assumed AP mounting height."),
    "client_height_m": (1.0, 0.3, 2.0, "m", "Assumed client device height."),
}
ASSUMPTIONS = [
    "Strongest-signal AP wins; co-channel interference, channel plan, transmit-power control and client capacity are not modelled.",
    "Only APs on the same floor are considered; leakage from other floors is ignored.",
    "Every interior wall has the same attenuation; doors, glass, furniture and people are not modelled.",
    "Default parameters are generic indoor 5 GHz assumptions and are not fitted to this building or to any measurement.",
    "Uncertainty is a modelled heuristic (shadowing + per-wall term). It is not a statistically validated confidence interval.",
    "Existing APs use the transmit power registered in the AP inventory; where none is registered the assumed default is used.",
    "Recorded measurements are never modified by this model; they are used only to show evidence support and the model's residual.",
]


def _phi(x: np.ndarray) -> np.ndarray:
    return 0.5 * (1.0 + np.array([math.erf(v / math.sqrt(2.0)) for v in x.ravel()]).reshape(x.shape))


def band(rssi: Optional[float]) -> str:
    if rssi is None:
        return "unknown"
    return "good" if rssi >= GOOD_DBM else ("fair" if rssi >= WEAK_DBM else "weak")


def resolve_parameters(overrides: Optional[Dict[str, float]]) -> Dict[str, Dict[str, Any]]:
    """Merge scenario overrides over documented defaults; reject unknown / out-of-range / non-finite values."""
    overrides = overrides or {}
    unknown = sorted(set(overrides) - set(PARAM_SPEC))
    if unknown:
        raise ValueError(f"Unknown model parameter(s): {unknown}")
    out: Dict[str, Dict[str, Any]] = {}
    for name, (default, lo, hi, unit, desc) in PARAM_SPEC.items():
        value, prov = default, "assumed_default"
        if name in overrides:
            value, prov = float(overrides[name]), "scenario_set"
            if not math.isfinite(value) or not lo <= value <= hi:
                raise ValueError(f"Parameter {name}={overrides[name]} is outside the allowed range {lo}..{hi}.")
        out[name] = {"value": value, "provenance": prov, "unit": unit, "description": desc, "default": default}
    return out


# ---------------------------------------------------------------------------------------------------------------- layout

def _poly_area(p: Sequence[Sequence[float]]) -> float:
    return abs(sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))) / 2.0


def _inside(x: float, y: float, poly: Sequence[Sequence[float]]) -> bool:
    c, j = False, len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def build_layout(floor_geom: dict) -> dict:
    """Zones to predict (rooms + corridors) and wall edges (room polygon edges). The open courtyard is not modelled."""
    zones, edges = [], []
    for r in floor_geom.get("rooms", []):
        poly = [[float(a), float(b)] for a, b in r["polygon"]]
        zones.append({"id": r["id"], "name": r["name"], "kind": r.get("kind", "room"), "polygon": poly, "area_m2": _poly_area(poly)})
        edges += [(poly[i][0], poly[i][1], poly[(i + 1) % len(poly)][0], poly[(i + 1) % len(poly)][1]) for i in range(len(poly))]
    for c in floor_geom.get("corridors") or []:
        (x0, y0), (x1, y1) = c["bounds"]["min"], c["bounds"]["max"]
        poly = [[float(x0), float(y0)], [float(x1), float(y0)], [float(x1), float(y1)], [float(x0), float(y1)]]
        wing = str(c.get("wing", "")).replace("_", " ").strip()
        zones.append({"id": c["id"], "name": f"Corridor ({wing})" if wing else "Corridor", "kind": "corridor",
                      "polygon": poly, "area_m2": _poly_area(poly)})
    excluded = [{"id": "courtyard", "reason": "Open to sky; outdoor propagation is not modelled."}] if floor_geom.get("courtyard") else []
    return {"zones": zones, "edges": np.array(edges, dtype=float).reshape(-1, 4), "bounds": floor_geom["bounds"], "excluded": excluded}


def _samples(zone: dict) -> np.ndarray:
    poly = zone["polygon"]
    xs, ys = [p[0] for p in poly], [p[1] for p in poly]
    gx = np.arange(min(xs) + CELL_M / 2, max(xs), CELL_M)
    gy = np.arange(min(ys) + CELL_M / 2, max(ys), CELL_M)
    pts = [(float(x), float(y)) for x in gx for y in gy if _inside(float(x), float(y), poly)]
    if not pts:
        pts = [(sum(xs) / len(xs), sum(ys) / len(ys))]
    return np.array(pts, dtype=float)


# ---------------------------------------------------------------------------------------------------------------- physics

def wall_counts(src: Tuple[float, float], pts: np.ndarray, edges: np.ndarray) -> np.ndarray:
    """Distinct wall crossings on the segment src->pt for every pt (vectorised; crossings closer than 0.3 m merge into one)."""
    if len(edges) == 0 or len(pts) == 0:
        return np.zeros(len(pts))
    px, py = src
    rx, ry = pts[:, 0] - px, pts[:, 1] - py                       # (N,)
    ax, ay, bx, by = (edges[:, k][None, :] for k in range(4))     # (1,M)
    sx, sy = bx - ax, by - ay
    denom = rx[:, None] * sy - ry[:, None] * sx                   # (N,M)
    qx, qy = ax - px, ay - py
    with np.errstate(divide="ignore", invalid="ignore"):
        t = (qx * sy - qy * sx) / denom
        u = (qx * ry[:, None] - qy * rx[:, None]) / denom
    hit = (np.abs(denom) > 1e-12) & (t > 1e-9) & (t < 1 - 1e-9) & (u >= -1e-9) & (u <= 1 + 1e-9)
    t = np.where(hit, t, np.inf)
    t.sort(axis=1)
    tol = 0.3 / np.maximum(np.hypot(rx, ry), 1e-9)
    valid = np.isfinite(t)
    with np.errstate(invalid="ignore"):   # inf - inf for unused slots is masked by `valid`
        distinct = ((t[:, 1:] - t[:, :-1]) > tol[:, None]) & valid[:, 1:]
    return valid[:, 0].astype(float) + distinct.sum(axis=1)


def predict_points(pts: np.ndarray, aps: List[dict], params: Dict[str, Dict[str, Any]], edges: np.ndarray) -> Dict[str, np.ndarray]:
    """Strongest-AP mean RSSI, modelled sigma, wall count and serving AP index for each point."""
    n = len(pts)
    p = {k: v["value"] for k, v in params.items()}
    best = np.full(n, -np.inf)
    walls_best = np.zeros(n)
    serving = np.full(n, -1)
    dh = p["ap_height_m"] - p["client_height_m"]
    for i, ap in enumerate(aps):
        if not ap.get("enabled", True):
            continue
        tx = ap["tx_power_dbm"] if ap.get("tx_power_dbm") is not None else p["default_tx_power_dbm"]
        g = ap["antenna_gain_dbi"] if ap.get("antenna_gain_dbi") is not None else p["default_antenna_gain_dbi"]
        d3 = np.maximum(np.sqrt((pts[:, 0] - ap["x_m"]) ** 2 + (pts[:, 1] - ap["y_m"]) ** 2 + dh ** 2), 1.0)
        walls = wall_counts((ap["x_m"], ap["y_m"]), pts, edges)
        rssi = tx + g - p["pl_ref_db"] - 10.0 * p["path_loss_exponent"] * np.log10(d3) - walls * p["wall_loss_db"]
        better = rssi > best
        best, walls_best, serving = np.where(better, rssi, best), np.where(better, walls, walls_best), np.where(better, i, serving)
    sigma = np.sqrt(p["shadow_sigma_db"] ** 2 + (p["wall_sigma_db"] * walls_best) ** 2)
    return {"mean": best, "sigma": sigma, "walls": walls_best, "serving": serving}


# ---------------------------------------------------------------------------------------------------------------- scenario

def normalise_aps(existing: Sequence[dict], candidates: Sequence[dict], disabled_existing: Sequence[str] = ()) -> List[dict]:
    """Existing (operator-registered) APs first, then hypothetical candidates; ids must be unique."""
    aps: List[dict] = []
    off = set(map(str, disabled_existing))
    for a in existing:
        aps.append({"id": str(a["id"]), "name": a["name"], "kind": "existing", "x_m": float(a["x_m"]), "y_m": float(a["y_m"]),
                    "tx_power_dbm": a.get("tx_power_dbm"), "antenna_gain_dbi": a.get("antenna_gain_dbi"), "enabled": str(a["id"]) not in off})
    if len(candidates) > MAX_CANDIDATES:
        raise ValueError(f"At most {MAX_CANDIDATES} candidate APs per scenario.")
    seen = {a["id"] for a in aps}
    for c in candidates:
        cid = str(c["id"])
        if cid in seen:
            raise ValueError(f"Duplicate access point id {cid}.")
        seen.add(cid)
        aps.append({"id": cid, "name": c.get("name") or cid, "kind": "candidate", "x_m": float(c["x_m"]), "y_m": float(c["y_m"]),
                    "tx_power_dbm": c.get("tx_power_dbm"), "antenna_gain_dbi": c.get("antenna_gain_dbi"), "enabled": bool(c.get("enabled", True))})
    return aps


def _digest(*parts: Any) -> str:
    return hashlib.sha256(json.dumps(parts, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()[:16]


def predict_layout(layout: dict, aps: List[dict], params: Dict[str, Dict[str, Any]], recorded: Sequence[Tuple[float, float, float]] = ()) -> dict:
    """Zone-level prediction for one AP layout, with evidence support from recorded points (world metres, dBm)."""
    zones = layout["zones"]
    per_zone = [_samples(z) for z in zones]
    enabled = [a for a in aps if a.get("enabled", True)]
    res = predict_points(np.vstack(per_zone), aps, params, layout["edges"]) if enabled else None
    rec = np.array([(r[0], r[1]) for r in recorded], dtype=float).reshape(-1, 2)
    rec_dbm = np.array([r[2] for r in recorded], dtype=float)

    out_zones, offset = [], 0
    tot = {"weak": 0.0, "fair": 0.0, "good": 0.0, "expected_weak": 0.0, "unsupported": 0.0, "unknown": 0.0}
    for z, s in zip(zones, per_zone):
        n, area = len(s), z["area_m2"]
        centre = s.mean(axis=0)
        in_mask = np.array([_inside(float(x), float(y), z["polygon"]) for x, y in rec], dtype=bool) if len(rec) else np.zeros(0, bool)
        n_in = int(in_mask.sum())
        nearest = float(np.min(np.hypot(rec[:, 0] - centre[0], rec[:, 1] - centre[1]))) if len(rec) else None
        support = "recorded_in_zone" if n_in else ("nearby_recorded" if nearest is not None and nearest <= NEAR_EVIDENCE_M else "no_recorded_evidence")
        row = {"id": z["id"], "name": z["name"], "kind": z["kind"], "area_m2": round(area, 2), "polygon_world": z["polygon"],
               "evidence": {"support": support, "recorded_points": n_in,
                            "recorded_mean_dbm": round(float(rec_dbm[in_mask].mean()), 1) if n_in else None,
                            "nearest_recorded_m": None if nearest is None else round(nearest, 1)}}
        if support == "no_recorded_evidence":
            tot["unsupported"] += area
        if res is None:
            row.update(mean_dbm=None, band="unknown", basis="no_enabled_access_points", sigma_db=None, p_good=None, p_weak=None,
                       confidence=None, uncertain=True, weak_fraction=None, worst_dbm=None, serving_ap=None, walls_to_serving_ap=None)
            tot["unknown"] += area
        else:
            sl = slice(offset, offset + n)
            m, sg = res["mean"][sl], res["sigma"][sl]
            p_good, p_weak = 1.0 - _phi((GOOD_DBM - m) / sg), _phi((WEAK_DBM - m) / sg)
            p_fair = np.clip(1.0 - p_good - p_weak, 0.0, 1.0)
            pg, pw, pf = float(p_good.mean()), float(p_weak.mean()), float(p_fair.mean())
            mean, conf = float(m.mean()), max(pg, pw, pf)
            ci = int(np.argmin(np.hypot(s[:, 0] - centre[0], s[:, 1] - centre[1])))
            sv = int(res["serving"][sl][ci])
            row.update(mean_dbm=round(mean, 1), band=band(mean), basis="model_prediction", sigma_db=round(float(sg.mean()), 1),
                       p_good=round(pg, 3), p_weak=round(pw, 3), confidence=round(conf, 3), uncertain=conf < CONFIDENT_P,
                       weak_fraction=round(float((m < WEAK_DBM).mean()), 3), worst_dbm=round(float(np.percentile(m, 10)), 1),
                       serving_ap=aps[sv]["id"] if sv >= 0 else None, walls_to_serving_ap=int(res["walls"][sl][ci]))
            tot["weak"] += area * float((m < WEAK_DBM).mean())
            tot["good"] += area * float((m >= GOOD_DBM).mean())
            tot["fair"] += area * float(((m >= WEAK_DBM) & (m < GOOD_DBM)).mean())
            tot["expected_weak"] += area * pw
        offset += n
        out_zones.append(row)
    summary = {"zones": len(zones), "modelled_area_m2": round(sum(z["area_m2"] for z in zones), 1),
               "weak_area_m2": round(tot["weak"], 1), "fair_area_m2": round(tot["fair"], 1), "good_area_m2": round(tot["good"], 1),
               "expected_weak_area_m2": round(tot["expected_weak"], 1), "unknown_area_m2": round(tot["unknown"], 1),
               "area_without_recorded_evidence_m2": round(tot["unsupported"], 1),
               "weak_zones": sum(1 for z in out_zones if z["band"] == "weak"), "uncertain_zones": sum(1 for z in out_zones if z["uncertain"]),
               "enabled_access_points": len(enabled)}
    return {"zones": out_zones, "summary": summary}


def model_check(layout: dict, existing_aps: List[dict], params: Dict[str, Dict[str, Any]], recorded: Sequence[Tuple[float, float, float]]) -> Optional[dict]:
    """Residual of this (uncalibrated) model against recorded points, using ONLY the existing AP layout."""
    if len(recorded) < 3 or not any(a.get("enabled", True) for a in existing_aps):
        return None
    pts = np.array([(r[0], r[1]) for r in recorded], dtype=float)
    obs = np.array([r[2] for r in recorded], dtype=float)
    res = predict_points(pts, existing_aps, params, layout["edges"])
    err = res["mean"] - obs
    return {"points": len(obs), "bias_db": round(float(err.mean()), 1), "mae_db": round(float(np.abs(err).mean()), 1),
            "rmse_db": round(float(math.sqrt((err ** 2).mean())), 1), "within_one_sigma_fraction": round(float((np.abs(err) <= res["sigma"]).mean()), 2),
            "note": "Positive bias = the model predicts stronger signal than was recorded. The model is not fitted to these points; "
                    "a large residual means its predictions deserve correspondingly less confidence."}


def run_scenario(floor_geom: dict, existing: Sequence[dict], candidates: Sequence[dict], overrides: Optional[Dict[str, float]] = None,
                 recorded: Sequence[Tuple[float, float, float]] = (), disabled_existing: Sequence[str] = ()) -> dict:
    layout = build_layout(floor_geom)
    params = resolve_parameters(overrides)
    aps = normalise_aps(existing, candidates, disabled_existing)
    result = predict_layout(layout, aps, params, recorded)
    return {
        "model": {"id": MODEL_ID, "version": MODEL_VERSION, "validated": False, "assumptions": ASSUMPTIONS,
                  "equation": "RSSI = P_tx + G - PL_1m - 10 n log10(d3) - walls * L_wall (strongest AP wins)"},
        "labels": {"layer": "model_predicted", "hypothetical_access_points": sum(1 for a in aps if a["kind"] == "candidate" and a["enabled"]),
                   "physically_validated": False,
                   "statement": "Model prediction for hypothetical APs. Not a measurement and not physically validated."},
        "inputs_hash": _digest([[z["id"], z["polygon"]] for z in layout["zones"]], aps, {k: v["value"] for k, v in params.items()},
                               [list(r) for r in recorded]),
        "parameters": params, "access_points": aps, "excluded_regions": layout["excluded"],
        "zones": result["zones"], "summary": result["summary"],
        "model_check": model_check(layout, [a for a in aps if a["kind"] == "existing"], params, recorded),
    }


def compare_results(a: dict, b: dict) -> dict:
    """Per-zone and floor-level difference (b - a) between two model results on the same floor."""
    az = {z["id"]: z for z in a["zones"]}
    rows = []
    for zb in b["zones"]:
        za = az.get(zb["id"])
        if not za:
            continue
        d = None if za["mean_dbm"] is None or zb["mean_dbm"] is None else round(zb["mean_dbm"] - za["mean_dbm"], 1)
        sig = max(za["sigma_db"] or 0.0, zb["sigma_db"] or 0.0)
        change = "unknown" if d is None else ("improved" if _ORDER.index(zb["band"]) > _ORDER.index(za["band"])
                                              else "worsened" if _ORDER.index(zb["band"]) < _ORDER.index(za["band"]) else "same_band")
        rows.append({"id": zb["id"], "name": zb["name"], "kind": zb["kind"], "a_dbm": za["mean_dbm"], "b_dbm": zb["mean_dbm"], "delta_db": d,
                     "a_band": za["band"], "b_band": zb["band"], "change": change,
                     "within_model_uncertainty": None if d is None else abs(d) < sig})
    keys = ["weak_area_m2", "fair_area_m2", "good_area_m2", "expected_weak_area_m2", "weak_zones", "uncertain_zones"]
    return {"zones": rows, "summary": {k: {"a": a["summary"][k], "b": b["summary"][k], "delta": round(b["summary"][k] - a["summary"][k], 1)} for k in keys},
            "zones_improved": sum(r["change"] == "improved" for r in rows), "zones_worsened": sum(r["change"] == "worsened" for r in rows),
            "changes_within_model_uncertainty": sum(bool(r["within_model_uncertainty"]) for r in rows),
            "caveat": "Differences are between two model predictions, not measured improvements; changes smaller than the modelled "
                      "uncertainty cannot be distinguished from model error."}
