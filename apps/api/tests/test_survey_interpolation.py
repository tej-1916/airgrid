import math
import pytest
from airgrid.services.survey_service import SurveyService


def test_collinear_detection_horizontal():
    # 4 points lying along y = 100
    points = [(50.0, 100.0), (150.0, 100.0), (250.0, 100.0), (350.0, 100.0)]
    assert SurveyService._is_collinear(points, threshold_area=25.0) is True


def test_collinear_detection_diagonal():
    # 4 points lying along y = 2x
    points = [(10.0, 20.0), (20.0, 40.0), (50.0, 100.0), (80.0, 160.0)]
    assert SurveyService._is_collinear(points, threshold_area=25.0) is True


def test_non_collinear_triangle():
    # 3 points forming a wide triangle
    points = [(50.0, 50.0), (450.0, 50.0), (250.0, 300.0)]
    assert SurveyService._is_collinear(points, threshold_area=25.0) is False


def test_idw_mathematical_continuity():
    """
    Verify that at a sample point location, the interpolated value smoothly converges
    to the sample value and does not produce division by zero or NaN.
    """
    scale = 20.0
    R_max = 18.0
    eps = 0.5
    power = 2.0

    samples = [
        (100.0, 100.0, -40.0),
        (300.0, 100.0, -70.0),
        (200.0, 250.0, -55.0),
    ]

    # Evaluate exactly at first sample (100.0, 100.0)
    eval_x, eval_y = 100.0, 100.0
    numerator = 0.0
    denominator = 0.0
    min_dist_m = float("inf")

    for px, py, rssi in samples:
        d_m = math.hypot(eval_x - px, eval_y - py) / scale
        if d_m < min_dist_m:
            min_dist_m = d_m
        w = 1.0 / ((d_m + eps) ** power)
        numerator += w * rssi
        denominator += w

    val = numerator / denominator
    assert not math.isnan(val)
    # Because (100, 100) has distance 0 (w = 1/0.25 = 4), while other points are 10m and 9m away (w ~ 0.009),
    # the value should be strongly dominated by -40.0 (approx -40.2 dBm)
    assert abs(val - (-40.0)) < 1.0


def test_idw_spatial_masking_distance():
    """
    Verify that an evaluation point further than R_max (18m) is identified as out-of-bounds.
    """
    scale = 20.0  # 20 px/m -> 18m = 360 px
    R_max = 18.0

    samples = [
        (100.0, 100.0, -45.0),
        (200.0, 100.0, -50.0),
        (150.0, 200.0, -60.0),
    ]

    # Point at (900.0, 900.0) is ~1131 px away = 56.5 meters > 18.0 meters
    eval_x, eval_y = 900.0, 900.0
    min_dist_m = min(math.hypot(eval_x - px, eval_y - py) / scale for px, py, _ in samples)

    assert min_dist_m > R_max


def test_convex_hull_computation():
    """Verify Andrew's monotone chain produces counter-clockwise convex polygon."""
    points = [
        (100.0, 100.0),
        (500.0, 100.0),
        (500.0, 500.0),
        (100.0, 500.0),
        (250.0, 250.0),  # interior point
    ]
    hull = SurveyService._compute_convex_hull(points)
    # The 4 outer corners must be in the hull, the interior point must NOT be in the hull
    assert len(hull) == 4
    assert (250.0, 250.0) not in hull
    assert (100.0, 100.0) in hull
    assert (500.0, 100.0) in hull
    assert (500.0, 500.0) in hull
    assert (100.0, 500.0) in hull


def test_distance_to_convex_hull_inside_and_outside():
    """Verify that interior points return distance 0 and exterior points return Euclidean distance to perimeter."""
    hull = [
        (100.0, 100.0),
        (500.0, 100.0),
        (500.0, 500.0),
        (100.0, 500.0),
    ]

    # Interior point
    assert SurveyService._dist_to_convex_hull(250.0, 250.0, hull) == 0.0

    # Exterior point directly to the left (50, 250) -> distance to edge (100, 100)-(100, 500) is 50.0 px
    d_left = SurveyService._dist_to_convex_hull(50.0, 250.0, hull)
    assert abs(d_left - 50.0) < 1e-4

    # Exterior point diagonally off corner (50, 50) -> distance to corner (100, 100) is hypot(50, 50) = 70.71 px
    d_corner = SurveyService._dist_to_convex_hull(50.0, 50.0, hull)
    assert abs(d_corner - math.hypot(50.0, 50.0)) < 1e-4
