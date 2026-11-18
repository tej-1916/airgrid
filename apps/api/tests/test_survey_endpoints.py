import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select, and_

from airgrid.core.database import AsyncSessionLocal
from airgrid.core.security import hash_password
from airgrid.models.all_models import (
    User,
    Campus,
    Building,
    Floor,
    FloorPlanAsset,
    SurveySession,
    SurveyMeasurement,
)


@pytest.fixture
async def engineer_auth(client: AsyncClient):
    """Creates a temporary authenticated network engineer."""
    email = f"engineer-{uuid.uuid4().hex[:8]}@airgrid.test"
    password = "EngineerPassword2026!"
    hashed = hash_password(password)

    async with AsyncSessionLocal() as session:
        user = User(
            email=email,
            hashed_password=hashed,
            full_name="Survey Network Engineer",
            role="network_engineer",
            is_active=True,
        )
        session.add(user)
        await session.flush()
        from airgrid.models.all_models import CampusMembership
        campuses = (await session.execute(select(Campus))).scalars().all()
        for c in campuses:
            session.add(CampusMembership(campus_id=c.id, user_id=user.id))
        await session.commit()
        await session.refresh(user)

    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_resp.status_code == 200
    csrf_token = login_resp.json()["csrf_token"]
    cookies = {"airgrid_session": login_resp.cookies["airgrid_session"]}
    client.cookies = cookies

    yield {
        "user": user,
        "email": email,
        "csrf_token": csrf_token,
        "cookies": cookies,
        "headers": {"X-CSRF-Token": csrf_token},
    }

    async with AsyncSessionLocal() as session:
        u = await session.get(User, user.id)
        if u:
            await session.delete(u)
            await session.commit()


@pytest.fixture
async def viewer_auth(client: AsyncClient):
    """Creates a temporary authenticated viewer (read-only)."""
    email = f"viewer-{uuid.uuid4().hex[:8]}@airgrid.test"
    password = "ViewerPassword2026!"
    hashed = hash_password(password)

    async with AsyncSessionLocal() as session:
        user = User(
            email=email,
            hashed_password=hashed,
            full_name="Survey Observer Viewer",
            role="viewer",
            is_active=True,
        )
        session.add(user)
        await session.flush()
        from airgrid.models.all_models import CampusMembership
        campuses = (await session.execute(select(Campus))).scalars().all()
        for c in campuses:
            session.add(CampusMembership(campus_id=c.id, user_id=user.id))
        await session.commit()
        await session.refresh(user)

    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_resp.status_code == 200
    csrf_token = login_resp.json()["csrf_token"]
    cookies = {"airgrid_session": login_resp.cookies["airgrid_session"]}
    client.cookies = cookies

    yield {
        "user": user,
        "email": email,
        "csrf_token": csrf_token,
        "cookies": cookies,
        "headers": {"X-CSRF-Token": csrf_token},
    }

    async with AsyncSessionLocal() as session:
        u = await session.get(User, user.id)
        if u:
            await session.delete(u)
            await session.commit()


@pytest.fixture
async def test_survey_hierarchy():
    """Sets up a calibrated test campus, building, floor, and floor plan asset."""
    async with AsyncSessionLocal() as session:
        campus = Campus(
            name="Survey Test Campus",
            code=f"SRV-{uuid.uuid4().hex[:6].upper()}",
            status="active",
        )
        session.add(campus)
        await session.flush()
        from airgrid.models.all_models import CampusMembership
        users = (await session.execute(select(User))).scalars().all()
        for u in users:
            session.add(CampusMembership(campus_id=campus.id, user_id=u.id))

        building = Building(
            campus_id=campus.id,
            name="Wireless Testing Facility",
            building_code=f"WTF-{uuid.uuid4().hex[:4].upper()}",
            status="active",
            floors_count=1,
        )
        session.add(building)
        await session.flush()

        floor = Floor(
            building_id=building.id,
            name="Level 2 RF Lab",
            floor_number=2,
            status="active",
            dimensions_width_m=50.0,
            dimensions_height_m=30.0,
        )
        session.add(floor)
        await session.flush()

        plan = FloorPlanAsset(
            floor_id=floor.id,
            file_path="/tmp/test_plan.png",
            file_format="png",
            original_filename="survey_lab_floor.png",
            file_size_bytes=102400,
            pixel_width=1000,
            pixel_height=600,
            scale_pixels_per_meter=20.0,
            is_calibrated=True,
        )
        session.add(plan)
        await session.commit()

        yield {
            "campus": campus,
            "building": building,
            "floor": floor,
            "plan": plan,
        }

        # Cleanup
        await session.delete(campus)
        await session.commit()


# =========================================================================
# 1. Survey Creation, Retrieval, Updates & Completion
# =========================================================================

@pytest.mark.asyncio
async def test_create_survey(client: AsyncClient, engineer_auth, test_survey_hierarchy):
    floor = test_survey_hierarchy["floor"]
    campus = test_survey_hierarchy["campus"]
    building = test_survey_hierarchy["building"]

    resp = await client.post(
        "/api/v1/surveys",
        json={
            "floor_id": str(floor.id),
            "campus_id": str(campus.id),
            "building_id": str(building.id),
            "session_name": "RF Survey Session A",
            "description": "Baseline coverage assessment",
        },
        headers=engineer_auth["headers"],
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["session_name"] == "RF Survey Session A"
    assert data["status"] == "in_progress"
    assert data["floor_id"] == str(floor.id)
    assert data["campus_id"] == str(campus.id)
    assert data["building_id"] == str(building.id)
    assert data["operator_name"] == engineer_auth["user"].full_name


@pytest.mark.asyncio
async def test_get_and_list_surveys(client: AsyncClient, engineer_auth, test_survey_hierarchy):
    floor = test_survey_hierarchy["floor"]

    create_resp = await client.post(
        "/api/v1/surveys",
        json={
            "floor_id": str(floor.id),
            "session_name": "Session for Retrieval",
        },
        headers=engineer_auth["headers"],
    )
    assert create_resp.status_code == 201
    survey_id = create_resp.json()["id"]

    # 1. Get single survey
    get_resp = await client.get(
        f"/api/v1/surveys/{survey_id}",
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == survey_id
    assert get_resp.json()["measurement_count"] == 0

    # 2. List surveys with floor filter
    list_resp = await client.get(
        f"/api/v1/surveys?floor_id={floor.id}",
    )
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert list_data["total"] >= 1
    assert any(s["id"] == survey_id for s in list_data["items"])


@pytest.mark.asyncio
async def test_update_and_complete_survey(client: AsyncClient, engineer_auth, test_survey_hierarchy):
    floor = test_survey_hierarchy["floor"]

    create_resp = await client.post(
        "/api/v1/surveys",
        json={"floor_id": str(floor.id), "session_name": "Active Session"},
        headers=engineer_auth["headers"],
    )
    survey_id = create_resp.json()["id"]

    # Update description
    patch_resp = await client.patch(
        f"/api/v1/surveys/{survey_id}",
        json={"description": "Updated notes on Wi-Fi test"},
        headers=engineer_auth["headers"],
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["description"] == "Updated notes on Wi-Fi test"

    # Complete survey
    complete_resp = await client.post(
        f"/api/v1/surveys/{survey_id}/complete",
        headers=engineer_auth["headers"],
    )
    assert complete_resp.status_code == 200
    assert complete_resp.json()["status"] == "completed"
    assert complete_resp.json()["completed_at"] is not None


# =========================================================================
# 2. Measurement Creation & Validation Safeguards
# =========================================================================

@pytest.mark.asyncio
async def test_valid_measurement_creation(client: AsyncClient, engineer_auth, test_survey_hierarchy):
    floor = test_survey_hierarchy["floor"]

    create_resp = await client.post(
        "/api/v1/surveys",
        json={"floor_id": str(floor.id), "session_name": "Measurement Session"},
        headers=engineer_auth["headers"],
    )
    survey_id = create_resp.json()["id"]

    # Record valid measurement
    m_resp = await client.post(
        f"/api/v1/surveys/{survey_id}/measurements",
        json={
            "floor_id": str(floor.id),
            "position_x": 250.0,
            "position_y": 180.0,
            "rssi_dbm": -58.5,
            "measurement_source": "manual_observation",
            "network_label": "AirGrid-Corporate",
            "ap_reference": "AP-WEST-01",
            "frequency_mhz": 5180,
            "channel": 36,
            "notes": "Near conference room doorway",
            "data_provenance": "operator_reported",
        },
        headers=engineer_auth["headers"],
    )
    assert m_resp.status_code == 201
    m_data = m_resp.json()
    assert m_data["rssi_dbm"] == -58.5
    assert m_data["position_x"] == 250.0
    assert m_data["position_y"] == 180.0
    assert m_data["normalized_x"] == 0.25  # 250 / 1000
    assert m_data["normalized_y"] == 0.30  # 180 / 600
    assert m_data["network_label"] == "AirGrid-Corporate"
    assert m_data["data_provenance"] == "operator_reported"


@pytest.mark.asyncio
async def test_invalid_rssi_bounds_rejection(client: AsyncClient, engineer_auth, test_survey_hierarchy):
    floor = test_survey_hierarchy["floor"]

    create_resp = await client.post(
        "/api/v1/surveys",
        json={"floor_id": str(floor.id), "session_name": "Bounds Session"},
        headers=engineer_auth["headers"],
    )
    survey_id = create_resp.json()["id"]

    # RSSI too strong (> -20 dBm)
    resp_too_high = await client.post(
        f"/api/v1/surveys/{survey_id}/measurements",
        json={"floor_id": str(floor.id), "position_x": 100, "position_y": 100, "rssi_dbm": -10.0},
        headers=engineer_auth["headers"],
    )
    assert resp_too_high.status_code == 422

    # RSSI too weak (< -100 dBm)
    resp_too_low = await client.post(
        f"/api/v1/surveys/{survey_id}/measurements",
        json={"floor_id": str(floor.id), "position_x": 100, "position_y": 100, "rssi_dbm": -115.0},
        headers=engineer_auth["headers"],
    )
    assert resp_too_low.status_code == 422


@pytest.mark.asyncio
async def test_invalid_coordinates_exceeding_bounds(client: AsyncClient, engineer_auth, test_survey_hierarchy):
    floor = test_survey_hierarchy["floor"]
    plan = test_survey_hierarchy["plan"]  # 1000 x 600

    create_resp = await client.post(
        "/api/v1/surveys",
        json={"floor_id": str(floor.id), "session_name": "Coord Bounds Session"},
        headers=engineer_auth["headers"],
    )
    survey_id = create_resp.json()["id"]

    # X exceeds image width
    resp = await client.post(
        f"/api/v1/surveys/{survey_id}/measurements",
        json={"floor_id": str(floor.id), "position_x": 1250.0, "position_y": 300.0, "rssi_dbm": -65.0},
        headers=engineer_auth["headers"],
    )
    assert resp.status_code == 422
    assert "bounds" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_wrong_floor_association_rejection(client: AsyncClient, engineer_auth, test_survey_hierarchy):
    floor = test_survey_hierarchy["floor"]
    other_floor_id = str(uuid.uuid4())

    create_resp = await client.post(
        "/api/v1/surveys",
        json={"floor_id": str(floor.id), "session_name": "Floor Mismatch Session"},
        headers=engineer_auth["headers"],
    )
    survey_id = create_resp.json()["id"]

    # Measurement with mismatched floor
    resp = await client.post(
        f"/api/v1/surveys/{survey_id}/measurements",
        json={"floor_id": other_floor_id, "position_x": 100.0, "position_y": 100.0, "rssi_dbm": -65.0},
        headers=engineer_auth["headers"],
    )
    assert resp.status_code == 422
    assert "does not match" in resp.json()["detail"].lower()


# =========================================================================
# 3. RBAC, Security & CSRF
# =========================================================================

@pytest.mark.asyncio
async def test_viewer_read_only_access_permitted(client: AsyncClient, viewer_auth, engineer_auth, test_survey_hierarchy):
    floor = test_survey_hierarchy["floor"]

    # Engineer creates survey
    create_resp = await client.post(
        "/api/v1/surveys",
        json={"floor_id": str(floor.id), "session_name": "Viewer Check Session"},
        headers=engineer_auth["headers"],
    )
    survey_id = create_resp.json()["id"]

    # Viewer can read
    view_resp = await client.get(
        f"/api/v1/surveys/{survey_id}",
    )
    assert view_resp.status_code == 200

    # Viewer cannot mutate (403 Forbidden)
    mutate_resp = await client.post(
        f"/api/v1/surveys/{survey_id}/measurements",
        json={"floor_id": str(floor.id), "position_x": 100, "position_y": 100, "rssi_dbm": -60.0},
        headers=viewer_auth["headers"],
    )
    assert mutate_resp.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_requests_blocked(client: AsyncClient, test_survey_hierarchy):
    floor = test_survey_hierarchy["floor"]

    resp = await client.post(
        "/api/v1/surveys",
        json={"floor_id": str(floor.id), "session_name": "No Auth Session"},
    )
    assert resp.status_code == 401


# =========================================================================
# 4. Duplicate Positions & Measurement Deletion
# =========================================================================

@pytest.mark.asyncio
async def test_duplicate_position_handling(client: AsyncClient, engineer_auth, test_survey_hierarchy):
    floor = test_survey_hierarchy["floor"]

    create_resp = await client.post(
        "/api/v1/surveys",
        json={"floor_id": str(floor.id), "session_name": "Dedup Session"},
        headers=engineer_auth["headers"],
    )
    survey_id = create_resp.json()["id"]

    # 1. Post first measurement
    r1 = await client.post(
        f"/api/v1/surveys/{survey_id}/measurements",
        json={"floor_id": str(floor.id), "position_x": 200.0, "position_y": 200.0, "rssi_dbm": -65.0, "notes": "Initial reading"},
        headers=engineer_auth["headers"],
    )
    assert r1.status_code == 201
    pt1_id = r1.json()["id"]

    # 2. Post second measurement at exact same coordinate (within 0.5px)
    r2 = await client.post(
        f"/api/v1/surveys/{survey_id}/measurements",
        json={"floor_id": str(floor.id), "position_x": 200.2, "position_y": 200.1, "rssi_dbm": -55.0, "notes": "Updated reading"},
        headers=engineer_auth["headers"],
    )
    assert r2.status_code == 201
    assert r2.json()["id"] == pt1_id  # Re-used existing point without duplicating marker
    assert r2.json()["rssi_dbm"] == -55.0
    assert r2.json()["notes"] == "Updated reading"

    # Verify single measurement in listing
    list_m = await client.get(
        f"/api/v1/surveys/{survey_id}/measurements",
    )
    assert len(list_m.json()) == 1


@pytest.mark.asyncio
async def test_delete_measurement(client: AsyncClient, engineer_auth, test_survey_hierarchy):
    floor = test_survey_hierarchy["floor"]

    create_resp = await client.post(
        "/api/v1/surveys",
        json={"floor_id": str(floor.id), "session_name": "Delete Test Session"},
        headers=engineer_auth["headers"],
    )
    survey_id = create_resp.json()["id"]

    m_resp = await client.post(
        f"/api/v1/surveys/{survey_id}/measurements",
        json={"floor_id": str(floor.id), "position_x": 300.0, "position_y": 300.0, "rssi_dbm": -70.0},
        headers=engineer_auth["headers"],
    )
    measurement_id = m_resp.json()["id"]

    # Delete measurement
    del_resp = await client.delete(
        f"/api/v1/surveys/{survey_id}/measurements/{measurement_id}",
        headers=engineer_auth["headers"],
    )
    assert del_resp.status_code == 204

    # Verify deletion
    list_resp = await client.get(
        f"/api/v1/surveys/{survey_id}/measurements",
    )
    assert len(list_resp.json()) == 0


# =========================================================================
# 5. IDW Heatmap Interpolation, Sparse Check, Collinear Rejection & Masking
# =========================================================================

@pytest.mark.asyncio
async def test_sparse_measurement_rejection(client: AsyncClient, engineer_auth, test_survey_hierarchy):
    floor = test_survey_hierarchy["floor"]

    create_resp = await client.post(
        "/api/v1/surveys",
        json={"floor_id": str(floor.id), "session_name": "Sparse Session"},
        headers=engineer_auth["headers"],
    )
    survey_id = create_resp.json()["id"]

    # Add only 2 measurements (< 3 required)
    for x, y, rssi in [(100.0, 100.0, -50.0), (300.0, 200.0, -65.0)]:
        await client.post(
            f"/api/v1/surveys/{survey_id}/measurements",
            json={"floor_id": str(floor.id), "position_x": x, "position_y": y, "rssi_dbm": rssi},
            headers=engineer_auth["headers"],
        )

    # Attempt heatmap generation
    resp = await client.get(
        f"/api/v1/surveys/{survey_id}/heatmap",
    )
    assert resp.status_code == 422
    assert "insufficient survey measurements" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_collinear_measurement_rejection(client: AsyncClient, engineer_auth, test_survey_hierarchy):
    floor = test_survey_hierarchy["floor"]

    create_resp = await client.post(
        "/api/v1/surveys",
        json={"floor_id": str(floor.id), "session_name": "Collinear Session"},
        headers=engineer_auth["headers"],
    )
    survey_id = create_resp.json()["id"]

    # Add 4 measurements lying strictly along the horizontal line y = 200
    for x in [100.0, 200.0, 300.0, 400.0]:
        await client.post(
            f"/api/v1/surveys/{survey_id}/measurements",
            json={"floor_id": str(floor.id), "position_x": x, "position_y": 200.0, "rssi_dbm": -60.0},
            headers=engineer_auth["headers"],
        )

    resp = await client.get(
        f"/api/v1/surveys/{survey_id}/heatmap",
    )
    assert resp.status_code == 422
    assert "collinear" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_heatmap_idw_interpolation_and_masking(client: AsyncClient, engineer_auth, test_survey_hierarchy):
    floor = test_survey_hierarchy["floor"]

    create_resp = await client.post(
        "/api/v1/surveys",
        json={"floor_id": str(floor.id), "session_name": "Full Heatmap Session"},
        headers=engineer_auth["headers"],
    )
    survey_id = create_resp.json()["id"]

    # Add 5 spatially distributed measurements forming a triangle/polygon
    points = [
        (200.0, 150.0, -45.0),  # Strong near AP
        (350.0, 180.0, -55.0),
        (220.0, 320.0, -68.0),
        (400.0, 350.0, -78.0),  # Weak far corner
        (300.0, 240.0, -58.0),
    ]
    for x, y, rssi in points:
        await client.post(
            f"/api/v1/surveys/{survey_id}/measurements",
            json={"floor_id": str(floor.id), "position_x": x, "position_y": y, "rssi_dbm": rssi},
            headers=engineer_auth["headers"],
        )

    resp = await client.get(
        f"/api/v1/surveys/{survey_id}/heatmap?grid_cols=60&grid_rows=40",
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["sample_count"] == 5
    assert data["grid_width"] == 60
    assert data["grid_height"] == 40
    assert data["min_rssi"] == -78.0
    assert data["max_rssi"] == -45.0
    assert "Estimated coverage" in data["confidence_notice"]

    grid = data["grid_data"]
    assert len(grid) == 40
    assert len(grid[0]) == 60

    # Verify that cells close to sample points have numerical estimated values
    # e.g. center cells around (300, 240) which is approx row 16, col 18
    col_idx = int((300.0 / 1000.0) * 59)
    row_idx = int((240.0 / 600.0) * 39)
    assert grid[row_idx][col_idx] is not None
    assert -80.0 <= grid[row_idx][col_idx] <= -40.0

    # Verify that distant cells (e.g. far corner x=950, y=550) are masked (None)
    far_col = 58
    far_row = 38
    assert grid[far_row][far_col] is None


# =========================================================================
# 6. Analysis Stats, Historical Comparison & Host Telemetry
# =========================================================================

@pytest.mark.asyncio
async def test_survey_summary_calculations(client: AsyncClient, engineer_auth, test_survey_hierarchy):
    floor = test_survey_hierarchy["floor"]

    create_resp = await client.post(
        "/api/v1/surveys",
        json={"floor_id": str(floor.id), "session_name": "Stats Session"},
        headers=engineer_auth["headers"],
    )
    survey_id = create_resp.json()["id"]

    for x, y, rssi, src in [
        (100.0, 100.0, -50.0, "manual_observation"),
        (200.0, 150.0, -60.0, "manual_observation"),
        (300.0, 250.0, -70.0, "controlled_test_import"),
    ]:
        await client.post(
            f"/api/v1/surveys/{survey_id}/measurements",
            json={"floor_id": str(floor.id), "position_x": x, "position_y": y, "rssi_dbm": rssi, "measurement_source": src},
            headers=engineer_auth["headers"],
        )

    analysis_resp = await client.get(
        f"/api/v1/surveys/{survey_id}/analysis",
    )
    assert analysis_resp.status_code == 200
    stats = analysis_resp.json()
    assert stats["total_measurements"] == 3
    assert stats["min_rssi_dbm"] == -70.0
    assert stats["max_rssi_dbm"] == -50.0
    assert stats["avg_rssi_dbm"] == -60.0
    assert stats["source_breakdown"]["manual_observation"] == 2
    assert stats["source_breakdown"]["controlled_test_import"] == 1


@pytest.mark.asyncio
async def test_historical_survey_comparison(client: AsyncClient, engineer_auth, test_survey_hierarchy):
    floor = test_survey_hierarchy["floor"]

    # Survey 1
    s1 = await client.post(
        "/api/v1/surveys",
        json={"floor_id": str(floor.id), "session_name": "Pre-Optimization Survey"},
        headers=engineer_auth["headers"],
    )
    s1_id = s1.json()["id"]
    await client.post(
        f"/api/v1/surveys/{s1_id}/measurements",
        json={"floor_id": str(floor.id), "position_x": 100.0, "position_y": 100.0, "rssi_dbm": -75.0},
        headers=engineer_auth["headers"],
    )

    # Survey 2
    s2 = await client.post(
        "/api/v1/surveys",
        json={"floor_id": str(floor.id), "session_name": "Post-Optimization Survey"},
        headers=engineer_auth["headers"],
    )
    s2_id = s2.json()["id"]
    await client.post(
        f"/api/v1/surveys/{s2_id}/measurements",
        json={"floor_id": str(floor.id), "position_x": 100.0, "position_y": 100.0, "rssi_dbm": -55.0},
        headers=engineer_auth["headers"],
    )
    await client.post(
        f"/api/v1/surveys/{s2_id}/measurements",
        json={"floor_id": str(floor.id), "position_x": 200.0, "position_y": 200.0, "rssi_dbm": -58.0},
        headers=engineer_auth["headers"],
    )

    compare_resp = await client.get(
        f"/api/v1/surveys/compare?session1={s1_id}&session2={s2_id}",
    )
    assert compare_resp.status_code == 200
    comp = compare_resp.json()
    assert comp["sample_count_delta"] == 1  # 2 - 1
    assert comp["avg_rssi_delta_db"] > 0  # Signal improved from -75 to -56.5 (+18.5 dB)


@pytest.mark.asyncio
async def test_host_telemetry_safe_query(client: AsyncClient, engineer_auth):
    resp = await client.get(
        "/api/v1/surveys/client-telemetry/status",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "vantage_point" in data
    assert data["vantage_point"] == "server_host_interface"
    assert "disclaimer" in data


@pytest.mark.asyncio
async def test_cross_network_contamination_protection(client: AsyncClient, engineer_auth, test_survey_hierarchy):
    """
    Verify that sessions with multiple distinct SSIDs require network_label parameter
    to prevent silent cross-network RF contamination.
    """
    floor = test_survey_hierarchy["floor"]
    survey_resp = await client.post(
        "/api/v1/surveys",
        json={"floor_id": str(floor.id), "session_name": "Multi-SSID Walkthrough"},
        headers=engineer_auth["headers"],
    )
    survey_id = survey_resp.json()["id"]

    # Add 3 points for Staff-Secure
    staff_points = [(100.0, 100.0, -45.0), (300.0, 100.0, -50.0), (200.0, 300.0, -55.0)]
    for x, y, rssi in staff_points:
        await client.post(
            f"/api/v1/surveys/{survey_id}/measurements",
            json={
                "floor_id": str(floor.id),
                "position_x": x,
                "position_y": y,
                "rssi_dbm": rssi,
                "network_label": "Staff-Secure",
            },
            headers=engineer_auth["headers"],
        )

    # Add 3 points for Guest-Open
    guest_points = [(150.0, 150.0, -70.0), (350.0, 150.0, -75.0), (250.0, 350.0, -80.0)]
    for x, y, rssi in guest_points:
        await client.post(
            f"/api/v1/surveys/{survey_id}/measurements",
            json={
                "floor_id": str(floor.id),
                "position_x": x,
                "position_y": y,
                "rssi_dbm": rssi,
                "network_label": "Guest-Open",
            },
            headers=engineer_auth["headers"],
        )

    # Request without filter -> Must be rejected with 422 to prevent cross-network contamination
    unfiltered_resp = await client.get(
        f"/api/v1/surveys/{survey_id}/heatmap",
    )
    assert unfiltered_resp.status_code == 422
    err_msg = unfiltered_resp.json()["detail"]
    assert "multiple distinct networks" in err_msg
    assert "Guest-Open" in err_msg
    assert "Staff-Secure" in err_msg

    # Request with network_label='Staff-Secure' -> succeeds with filtered points only
    staff_resp = await client.get(
        f"/api/v1/surveys/{survey_id}/heatmap?network_label=Staff-Secure",
    )
    assert staff_resp.status_code == 200
    staff_data = staff_resp.json()
    assert staff_data["sample_count"] == 3
    assert staff_data["network_label"] == "Staff-Secure"
    assert staff_data["avg_rssi"] == -50.0  # (-45 - 50 - 55) / 3

    # Request with network_label='Guest-Open' -> succeeds with filtered points only
    guest_resp = await client.get(
        f"/api/v1/surveys/{survey_id}/heatmap?network_label=Guest-Open",
    )
    assert guest_resp.status_code == 200
    guest_data = guest_resp.json()
    assert guest_data["sample_count"] == 3
    assert guest_data["network_label"] == "Guest-Open"
    assert guest_data["avg_rssi"] == -75.0  # (-70 - 75 - 80) / 3


@pytest.mark.asyncio
async def test_convex_hull_spatial_support_mask(client: AsyncClient, engineer_auth, test_survey_hierarchy):
    """
    Verify that IDW interpolation does not extrapolate into unsupported regions outside
    the convex hull of the measured points.
    """
    floor = test_survey_hierarchy["floor"]
    survey_resp = await client.post(
        "/api/v1/surveys",
        json={"floor_id": str(floor.id), "session_name": "Corner Survey Session"},
        headers=engineer_auth["headers"],
    )
    survey_id = survey_resp.json()["id"]

    # Points restricted strictly to the top-left quadrant (X in [50, 200], Y in [50, 200])
    points = [
        (50.0, 50.0, -45.0),
        (200.0, 50.0, -50.0),
        (200.0, 200.0, -55.0),
        (50.0, 200.0, -48.0),
    ]
    for x, y, rssi in points:
        await client.post(
            f"/api/v1/surveys/{survey_id}/measurements",
            json={"floor_id": str(floor.id), "position_x": x, "position_y": y, "rssi_dbm": rssi},
            headers=engineer_auth["headers"],
        )

    # Request heatmap
    h_resp = await client.get(
        f"/api/v1/surveys/{survey_id}/heatmap",
    )
    assert h_resp.status_code == 200
    h_data = h_resp.json()
    assert h_data["convex_hull_support"] is True

    grid = h_data["grid_data"]
    # Top-left cell (close to (50, 50)) should have interpolated estimate
    assert grid[0][0] is not None
    # Bottom-right cell (far from the top-left convex hull) MUST be masked (None)
    assert grid[-1][-1] is None
    # Bottom-left cell (far from top-left convex hull) MUST be masked (None)
    assert grid[-1][0] is None


@pytest.mark.asyncio
async def test_widely_separated_measurements_masking(client: AsyncClient, engineer_auth, test_survey_hierarchy):
    """
    Verify that when survey observations are widely separated, the 18-meter radial mask
    and convex hull buffer work in tandem to mask unsampled spatial gaps between points.
    """
    floor = test_survey_hierarchy["floor"]
    survey_resp = await client.post(
        "/api/v1/surveys",
        json={"floor_id": str(floor.id), "session_name": "Widely Separated Session"},
        headers=engineer_auth["headers"],
    )
    survey_id = survey_resp.json()["id"]

    # Place 3 widely separated points on the 1000x600 floor plan (scale = 20 px/m)
    # Distance between (100, 100) and (900, 100) is 800px = 40 meters
    points = [
        (100.0, 100.0, -45.0),
        (900.0, 100.0, -50.0),
        (500.0, 550.0, -55.0),
    ]
    for x, y, rssi in points:
        resp = await client.post(
            f"/api/v1/surveys/{survey_id}/measurements",
            json={"floor_id": str(floor.id), "position_x": x, "position_y": y, "rssi_dbm": rssi},
            headers=engineer_auth["headers"],
        )
        assert resp.status_code == 201

    # Request heatmap with 80 cols x 50 rows
    h_resp = await client.get(
        f"/api/v1/surveys/{survey_id}/heatmap?grid_cols=80&grid_rows=50",
    )
    assert h_resp.status_code == 200
    h_data = h_resp.json()
    grid = h_data["grid_data"]

    # The midpoint between (100, 100) and (900, 100) is at X=500, Y=100 (row 8, col 40)
    # That midpoint is 400 px = 20 meters away from nearest sample point, exceeding the 18m mask radius.
    # Therefore, it MUST be masked (None).
    midpoint_col = int(500.0 / (1000.0 / 79))
    midpoint_row = int(100.0 / (600.0 / 49))
    assert grid[midpoint_row][midpoint_col] is None

    # Cells immediately adjacent to sample points should have valid interpolated RSSI
    # Top-left corner (near (100, 100))
    tl_col = int(100.0 / (1000.0 / 79))
    tl_row = int(100.0 / (600.0 / 49))
    assert grid[tl_row][tl_col] is not None


@pytest.mark.asyncio
async def test_collect_live_measurement_success(client: AsyncClient, engineer_auth, test_survey_hierarchy, monkeypatch):
    """Verify live read-only Wi-Fi collection at operator-selected coordinates."""
    floor = test_survey_hierarchy["floor"]
    survey_resp = await client.post(
        "/api/v1/surveys",
        json={"floor_id": str(floor.id), "session_name": "Live Collection Session"},
        headers=engineer_auth["headers"],
    )
    assert survey_resp.status_code == 201
    survey_id = survey_resp.json()["id"]

    # Mock telemetry_collector to return genuine active link
    mock_status = {
        "is_connected": True,
        "connection_state": "connected",
        "interface_name": "wlp0s20f3",
        "ssid": "Jain_Student",
        "bssid": "02:00:5E:00:00:02",
        "frequency_mhz": 5200,
        "channel": 40,
        "channel_width_mhz": 160,
        "band": "5 GHz",
        "rssi_dbm": -52.0,
        "signal_quality_pct": 85,
        "rx_bitrate_mbps": 1200.9,
        "tx_bitrate_mbps": 1441.3,
        "security_protocol": "WPA2",
        "measuring_device": "Backend host (zephyrus)",
        "hostname": "zephyrus",
        "ip_address": "192.168.1.105",
        "default_gateway": "192.168.1.1",
        "data_provenance": "live_system_probe",
    }
    from airgrid.services.survey_service import telemetry_collector
    monkeypatch.setattr(telemetry_collector, "get_live_connection_status", lambda: mock_status)

    resp = await client.post(
        f"/api/v1/surveys/{survey_id}/measurements/collect-live",
        json={"position_x": 250.0, "position_y": 180.0, "notes": "Measured next to reception desk"},
        headers=engineer_auth["headers"],
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["position_x"] == 250.0
    assert data["position_y"] == 180.0
    assert data["rssi_dbm"] == -52.0
    assert data["network_label"] == "Jain_Student"
    assert data["ap_reference"] == "02:00:5E:00:00:02"
    assert data["frequency_mhz"] == 5200
    assert data["channel"] == 40
    assert data["data_provenance"] == "field_instrument_verified"
    assert data["measurement_source"] == "live_system_probe"
    assert data["source_telemetry_snapshot_id"] is not None
    assert data["rx_bitrate_mbps"] == 1200.9
    assert data["tx_bitrate_mbps"] == 1441.3
    assert data["interface_name"] == "wlp0s20f3"


@pytest.mark.asyncio
async def test_collect_live_measurement_disconnected_rejection(client: AsyncClient, engineer_auth, test_survey_hierarchy, monkeypatch):
    """Verify live capture fails gracefully if Wi-Fi is disconnected."""
    floor = test_survey_hierarchy["floor"]
    survey_resp = await client.post(
        "/api/v1/surveys",
        json={"floor_id": str(floor.id), "session_name": "Disconnected Session"},
        headers=engineer_auth["headers"],
    )
    survey_id = survey_resp.json()["id"]

    mock_status = {
        "is_connected": False,
        "connection_state": "disconnected",
        "interface_name": "wlp0s20f3",
        "ssid": None,
        "rssi_dbm": None,
    }
    from airgrid.services.survey_service import telemetry_collector
    monkeypatch.setattr(telemetry_collector, "get_live_connection_status", lambda: mock_status)

    resp = await client.post(
        f"/api/v1/surveys/{survey_id}/measurements/collect-live",
        json={"position_x": 200.0, "position_y": 200.0},
        headers=engineer_auth["headers"],
    )
    assert resp.status_code == 422
    assert "No active connected Wi-Fi interface detected" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_reposition_measurement_with_audit_trail(client: AsyncClient, engineer_auth, test_survey_hierarchy):
    """Verify operator can correct mistakenly placed measurement coordinates with audit log tracking."""
    floor = test_survey_hierarchy["floor"]
    survey_resp = await client.post(
        "/api/v1/surveys",
        json={"floor_id": str(floor.id), "session_name": "Reposition Session"},
        headers=engineer_auth["headers"],
    )
    survey_id = survey_resp.json()["id"]

    # Record initial measurement at (150, 150)
    add_resp = await client.post(
        f"/api/v1/surveys/{survey_id}/measurements",
        json={
            "floor_id": str(floor.id),
            "position_x": 150.0,
            "position_y": 150.0,
            "rssi_dbm": -58.0,
            "network_label": "AirGrid-Staff",
        },
        headers=engineer_auth["headers"],
    )
    assert add_resp.status_code == 201
    meas_id = add_resp.json()["id"]

    # Reposition to (220, 310) with reason
    repo_resp = await client.patch(
        f"/api/v1/surveys/{survey_id}/measurements/{meas_id}/reposition",
        json={
            "position_x": 220.0,
            "position_y": 310.0,
            "reason": "Corrected 3.5m offset to align with structural column",
        },
        headers=engineer_auth["headers"],
    )
    assert repo_resp.status_code == 200
    updated = repo_resp.json()
    assert updated["position_x"] == 220.0
    assert updated["position_y"] == 310.0
    assert updated["normalized_x"] == 220.0 / 1000.0
    assert updated["normalized_y"] == 310.0 / 600.0

    # Verify audit log recorded in database
    async with AsyncSessionLocal() as session:
        from airgrid.models.all_models import AuditLog
        stmt = (
            select(AuditLog)
            .where(
                and_(
                    AuditLog.action == "survey.measurement_repositioned",
                    AuditLog.resource_id == str(meas_id),
                )
            )
            .order_by(AuditLog.created_at.desc())
        )
        res = await session.execute(stmt)
        log = res.scalar_one_or_none()
        assert log is not None
        assert log.payload["old_position"]["x"] == 150.0
        assert log.payload["old_position"]["y"] == 150.0
        assert log.payload["new_position"]["x"] == 220.0
        assert log.payload["new_position"]["y"] == 310.0
        assert "column" in log.payload["reason"]


@pytest.mark.asyncio
async def test_heatmap_generation_audit_logging(client: AsyncClient, engineer_auth, test_survey_hierarchy):
    """Verify POST /heatmap records an audit entry in PostgreSQL."""
    floor = test_survey_hierarchy["floor"]
    survey_resp = await client.post(
        "/api/v1/surveys",
        json={"floor_id": str(floor.id), "session_name": "Audit Logged Heatmap Session"},
        headers=engineer_auth["headers"],
    )
    survey_id = survey_resp.json()["id"]

    # Place 3 non-collinear points
    points = [(100.0, 100.0, -42.0), (300.0, 100.0, -56.0), (200.0, 250.0, -68.0)]
    for x, y, r in points:
        await client.post(
            f"/api/v1/surveys/{survey_id}/measurements",
            json={"floor_id": str(floor.id), "position_x": x, "position_y": y, "rssi_dbm": r, "network_label": "AirGrid-HQ"},
            headers=engineer_auth["headers"],
        )

    # Trigger POST heatmap
    h_resp = await client.post(
        f"/api/v1/surveys/{survey_id}/heatmap?grid_cols=40&grid_rows=25",
        headers=engineer_auth["headers"],
    )
    assert h_resp.status_code == 200

    # Verify AuditLog in DB
    async with AsyncSessionLocal() as session:
        from airgrid.models.all_models import AuditLog
        stmt = select(AuditLog).where(
            and_(
                AuditLog.action == "survey.heatmap_generated",
                AuditLog.resource_id == str(survey_id),
            )
        )
        res = await session.execute(stmt)
        log = res.scalar_one_or_none()
        assert log is not None
        assert log.payload["sample_count"] == 3
        assert log.payload["grid_cols"] == 40
        assert log.payload["grid_rows"] == 25


@pytest.mark.asyncio
async def test_leave_one_out_cross_validation(client: AsyncClient, engineer_auth, test_survey_hierarchy):
    """Verify Leave-One-Out Cross-Validation (LOOCV) calculates MAE and error distribution."""
    floor = test_survey_hierarchy["floor"]
    survey_resp = await client.post(
        "/api/v1/surveys",
        json={"floor_id": str(floor.id), "session_name": "Validation Test Session"},
        headers=engineer_auth["headers"],
    )
    survey_id = survey_resp.json()["id"]

    # 5 non-collinear observation points on calibrated floor plan
    pts = [
        (150.0, 150.0, -45.0),
        (350.0, 150.0, -55.0),
        (550.0, 150.0, -62.0),
        (250.0, 350.0, -52.0),
        (450.0, 350.0, -58.0),
    ]
    for x, y, r in pts:
        await client.post(
            f"/api/v1/surveys/{survey_id}/measurements",
            json={"floor_id": str(floor.id), "position_x": x, "position_y": y, "rssi_dbm": r, "network_label": "AirGrid-Val"},
            headers=engineer_auth["headers"],
        )

    val_resp = await client.get(
        f"/api/v1/surveys/{survey_id}/validation?network_label=AirGrid-Val",
        headers=engineer_auth["headers"],
    )
    assert val_resp.status_code == 200
    data = val_resp.json()

    assert data["survey_session_id"] == survey_id
    assert data["evaluated_samples_count"] == 5
    assert data["valid_predictions_count"] > 0
    assert data["mae_db"] is not None
    assert data["mae_db"] >= 0.0
    assert data["rmse_db"] is not None
    assert data["rmse_db"] >= 0.0
    assert "under_2db" in data["error_distribution"]
    assert len(data["points"]) == 5
    for p in data["points"]:
        assert p["actual_rssi_dbm"] is not None
        if not p["is_masked"]:
            assert p["predicted_rssi_dbm"] is not None
            assert p["absolute_error_db"] is not None

