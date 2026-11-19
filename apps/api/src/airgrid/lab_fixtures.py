"""Reproducible SYNTHETIC fixtures for the optimization lab, tests and the container simulation profile.

Nothing here is derived from the private Blender model or from any real network. The floor is an invented 48 x 32 m plan
(six rooms either side of one corridor) in the same schema as campus_geometry.json, so the prediction model, API and UI can be
exercised publicly and repeatably. Recorded "survey" points come from a fixed formula and are labelled controlled_test_import.
"""
import math
from typing import List, Tuple

FLOOR_ID = "synthetic"


def synthetic_floor_geometry() -> dict:
    """One floor: corridor y in [-2, 2]; north rooms y in [2, 16]; south rooms y in [-16, -2]; three rooms per side (16 m wide)."""
    rooms = []
    for side, (y0, y1) in (("N", (2, 16)), ("S", (-16, -2))):
        for i, x0 in enumerate((-24, -8, 8), start=1):
            rooms.append({"id": f"SYN-{side}-{i:02d}", "name": f"Synthetic {'North' if side == 'N' else 'South'} Room {i}", "kind": "room",
                          "wing": "Synthetic", "area_m2": 16.0 * 14.0, "centre": [x0 + 8, (y0 + y1) / 2],
                          "polygon": [[x0, y0], [x0 + 16, y0], [x0 + 16, y1], [x0, y1]]})
    return {"id": FLOOR_ID, "index": 0, "title": "Synthetic Floor", "code": "SYN", "finished_floor_z_m": 0.0, "clear_wall_top_z_m": 3.0,
            "bounds": {"min": [-24, -16], "max": [24, 16]}, "rooms": rooms,
            "corridors": [{"id": "SYN-CORRIDOR", "wing": "Synthetic", "bounds": {"min": [-24, -2], "max": [24, 2]}}],
            "calibration": {"resolution_px": [960, 640], "pixels_per_metre": 20.0, "image_centre_world_xy": [0.0, 0.0]}}


# Registered (existing) APs for the synthetic floor: metres; transmit power is registered for the first only.
SYNTHETIC_EXISTING_APS = [
    {"id": "syn-ap-1", "name": "SYNTHETIC-AP-1", "x_m": -16.0, "y_m": 9.0, "tx_power_dbm": 17.0, "antenna_gain_dbi": None},
    {"id": "syn-ap-2", "name": "SYNTHETIC-AP-2", "x_m": 16.0, "y_m": 9.0, "tx_power_dbm": None, "antenna_gain_dbi": None},
]


def synthetic_recorded_points(step: float = 8.0) -> List[Tuple[float, float, float]]:
    """Fixed-formula stand-ins for survey readings (distance decay from the existing APs + a deterministic +-2.5 dB term).
    These are NOT measurements and deliberately do not use the prediction model's own equation."""
    pts = []
    x = -20.0
    while x <= 20.0:
        y = -12.0
        while y <= 12.0:
            best = max(-35.0 - 30.0 * math.log10(math.hypot(x - a["x_m"], y - a["y_m"]) + 1.0) for a in SYNTHETIC_EXISTING_APS)
            pts.append((x, y, round(max(-95.0, min(-30.0, best + 2.5 * math.sin(x * 12.9898 + y * 78.233))), 1)))
            y += step
        x += step
    return pts
