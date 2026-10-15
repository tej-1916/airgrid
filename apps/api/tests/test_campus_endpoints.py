import io
import uuid
import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import select

from airgrid.core.database import AsyncSessionLocal
from airgrid.core.security import hash_password
from airgrid.models.all_models import User, Campus, Building, Floor, FloorPlanAsset


@pytest.fixture
async def admin_auth(client: AsyncClient):
    """Creates a temporary admin user and authenticates."""
    unique_email = f"admin-{uuid.uuid4().hex[:8]}@airgrid.test"
    password = "AdminSecurePassword2026!"
    hashed = hash_password(password)

    async with AsyncSessionLocal() as session:
        user = User(
            email=unique_email,
            hashed_password=hashed,
            full_name="Admin User",
            role="administrator",
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": unique_email, "password": password},
    )
    assert login_resp.status_code == 200
    csrf_token = login_resp.json()["csrf_token"]
    cookies = {"airgrid_session": login_resp.cookies["airgrid_session"]}

    yield {
        "user": user,
        "email": unique_email,
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
async def engineer_auth(client: AsyncClient):
    """Creates a temporary network engineer user and authenticates."""
    unique_email = f"engineer-{uuid.uuid4().hex[:8]}@airgrid.test"
    password = "EngineerSecurePassword2026!"
    hashed = hash_password(password)

    async with AsyncSessionLocal() as session:
        user = User(
            email=unique_email,
            hashed_password=hashed,
            full_name="Network Engineer",
            role="network_engineer",
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": unique_email, "password": password},
    )
    assert login_resp.status_code == 200
    csrf_token = login_resp.json()["csrf_token"]
    cookies = {"airgrid_session": login_resp.cookies["airgrid_session"]}

    yield {
        "user": user,
        "email": unique_email,
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
    """Creates a temporary viewer user and authenticates."""
    unique_email = f"viewer-{uuid.uuid4().hex[:8]}@airgrid.test"
    password = "ViewerSecurePassword2026!"
    hashed = hash_password(password)

    async with AsyncSessionLocal() as session:
        user = User(
            email=unique_email,
            hashed_password=hashed,
            full_name="Viewer User",
            role="viewer",
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": unique_email, "password": password},
    )
    assert login_resp.status_code == 200
    csrf_token = login_resp.json()["csrf_token"]
    cookies = {"airgrid_session": login_resp.cookies["airgrid_session"]}

    yield {
        "user": user,
        "email": unique_email,
        "csrf_token": csrf_token,
        "cookies": cookies,
        "headers": {"X-CSRF-Token": csrf_token},
    }

    async with AsyncSessionLocal() as session:
        u = await session.get(User, user.id)
        if u:
            await session.delete(u)
            await session.commit()


def create_test_image_bytes(width: int = 800, height: int = 600, fmt: str = "PNG") -> bytes:
    """Generates valid image bytes using Pillow."""
    img = Image.new("RGB", (width, height), color=(240, 240, 240))
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


# =========================================================================
# Campus Tests
# =========================================================================

@pytest.mark.asyncio
async def test_campus_lifecycle_admin(client: AsyncClient, admin_auth):
    headers = admin_auth["headers"]
    client.cookies = admin_auth["cookies"]

    code = f"CMP-{uuid.uuid4().hex[:6].upper()}"
    create_payload = {
        "name": "Oakridge North Campus",
        "code": code,
        "description": "Primary academic campus facility",
        "address": "100 Science Way, Cityville",
        "latitude": 37.7749,
        "longitude": -122.4194,
    }

    # 1. Create Campus
    resp = await client.post("/api/v1/campuses", json=create_payload, headers=headers)
    assert resp.status_code == 201
    campus_data = resp.json()
    campus_id = campus_data["id"]
    assert campus_data["name"] == "Oakridge North Campus"
    assert campus_data["code"] == code
    assert campus_data["buildings_count"] == 0

    # 2. Get Campus by ID
    resp2 = await client.get(f"/api/v1/campuses/{campus_id}")
    assert resp2.status_code == 200
    assert resp2.json()["id"] == campus_id

    # 3. List Campuses with query
    resp3 = await client.get(f"/api/v1/campuses?q={code}")
    assert resp3.status_code == 200
    list_data = resp3.json()
    assert list_data["total"] >= 1
    assert any(item["id"] == campus_id for item in list_data["items"])

    # 4. Update Campus
    update_payload = {"name": "Oakridge Main Campus", "description": "Updated description"}
    resp4 = await client.patch(f"/api/v1/campuses/{campus_id}", json=update_payload, headers=headers)
    assert resp4.status_code == 200
    assert resp4.json()["name"] == "Oakridge Main Campus"

    # Cleanup
    del_resp = await client.delete(f"/api/v1/campuses/{campus_id}", headers=headers)
    assert del_resp.status_code == 204


@pytest.mark.asyncio
async def test_campus_duplicate_code_conflict(client: AsyncClient, admin_auth):
    headers = admin_auth["headers"]
    client.cookies = admin_auth["cookies"]

    code = f"DUP-{uuid.uuid4().hex[:6].upper()}"
    p1 = {"name": "Campus One", "code": code}
    resp1 = await client.post("/api/v1/campuses", json=p1, headers=headers)
    assert resp1.status_code == 201
    campus_id = resp1.json()["id"]

    # Try duplicate code
    p2 = {"name": "Campus Two", "code": code}
    resp2 = await client.post("/api/v1/campuses", json=p2, headers=headers)
    assert resp2.status_code == 409
    assert "already exists" in resp2.json()["detail"]

    # Cleanup
    await client.delete(f"/api/v1/campuses/{campus_id}", headers=headers)


# =========================================================================
# Building & Floor Tests
# =========================================================================

@pytest.mark.asyncio
async def test_building_and_floor_lifecycle(client: AsyncClient, admin_auth):
    headers = admin_auth["headers"]
    client.cookies = admin_auth["cookies"]

    # 1. Setup parent campus
    code = f"CMP-{uuid.uuid4().hex[:6].upper()}"
    c_resp = await client.post(
        "/api/v1/campuses",
        json={"name": "Engineering Center", "code": code},
        headers=headers,
    )
    campus_id = c_resp.json()["id"]

    # 2. Add Building
    b_resp = await client.post(
        f"/api/v1/campuses/{campus_id}/buildings",
        json={"name": "Turing Hall", "building_code": "TUR-A", "description": "CS Department"},
        headers=headers,
    )
    assert b_resp.status_code == 201
    building_id = b_resp.json()["id"]
    assert b_resp.json()["building_code"] == "TUR-A"

    # 3. Duplicate building code in same campus -> 409
    b_dup = await client.post(
        f"/api/v1/campuses/{campus_id}/buildings",
        json={"name": "Another Turing", "building_code": "TUR-A"},
        headers=headers,
    )
    assert b_dup.status_code == 409

    # 4. Add Floor
    f_resp = await client.post(
        f"/api/v1/buildings/{building_id}/floors",
        json={"floor_number": 1, "name": "Ground Level", "dimensions_width_m": 60.0, "dimensions_height_m": 40.0},
        headers=headers,
    )
    assert f_resp.status_code == 201
    floor_id = f_resp.json()["id"]
    assert f_resp.json()["floor_number"] == 1
    assert f_resp.json()["has_floor_plan"] is False

    # 5. Duplicate floor number in same building -> 409
    f_dup = await client.post(
        f"/api/v1/buildings/{building_id}/floors",
        json={"floor_number": 1, "name": "Duplicate Floor"},
        headers=headers,
    )
    assert f_dup.status_code == 409

    # 6. List floors
    floors_list = await client.get(f"/api/v1/buildings/{building_id}/floors")
    assert floors_list.status_code == 200
    assert len(floors_list.json()) == 1

    # Cleanup campus (cascades to building & floor)
    await client.delete(f"/api/v1/campuses/{campus_id}", headers=headers)


# =========================================================================
# Floor Plan Upload & Calibration Tests
# =========================================================================

@pytest.mark.asyncio
async def test_floor_plan_upload_and_calibration(client: AsyncClient, engineer_auth, admin_auth):
    # Admin creates campus, building, floor
    client.cookies = admin_auth["cookies"]
    headers = admin_auth["headers"]

    c_resp = await client.post(
        "/api/v1/campuses",
        json={"name": "Cal Tech Campus", "code": f"CAL-{uuid.uuid4().hex[:6].upper()}"},
        headers=headers,
    )
    campus_id = c_resp.json()["id"]

    b_resp = await client.post(
        f"/api/v1/campuses/{campus_id}/buildings",
        json={"name": "Robotics Lab", "building_code": "ROB-1"},
        headers=headers,
    )
    building_id = b_resp.json()["id"]

    f_resp = await client.post(
        f"/api/v1/buildings/{building_id}/floors",
        json={"floor_number": 2, "name": "Upper Lab", "dimensions_width_m": 50.0, "dimensions_height_m": 30.0},
        headers=headers,
    )
    floor_id = f_resp.json()["id"]

    # Now Network Engineer uploads floor plan
    client.cookies = engineer_auth["cookies"]
    eng_headers = engineer_auth["headers"]

    image_bytes = create_test_image_bytes(width=1000, height=600, fmt="PNG")
    files = {"file": ("floor_plan_level2.png", image_bytes, "image/png")}

    upload_resp = await client.post(
        f"/api/v1/floors/{floor_id}/plans",
        files=files,
        headers=eng_headers,
    )
    assert upload_resp.status_code == 201
    plan_data = upload_resp.json()
    plan_id = plan_data["id"]
    assert plan_data["pixel_width"] == 1000
    assert plan_data["pixel_height"] == 600
    assert plan_data["is_calibrated"] is False
    assert "/image" in plan_data["image_url"]

    # Test authorized image streaming
    img_stream = await client.get(f"/api/v1/floor-plans/{plan_id}/image")
    assert img_stream.status_code == 200
    assert img_stream.headers["content-type"] == "image/png"
    assert len(img_stream.content) == len(image_bytes)

    # Test 2-point scale calibration
    # Distance between (100, 100) and (500, 100) is 400 pixels. Real distance is 20 meters.
    # Expected scale: 400 / 20 = 20 pixels/meter.
    calib_payload = {
        "point1": {"x": 100.0, "y": 100.0},
        "point2": {"x": 500.0, "y": 100.0},
        "distance_m": 20.0,
    }
    calib_resp = await client.patch(
        f"/api/v1/floor-plans/{plan_id}/calibration",
        json=calib_payload,
        headers=eng_headers,
    )
    assert calib_resp.status_code == 200
    calib_data = calib_resp.json()
    assert calib_data["is_calibrated"] is True
    assert calib_data["scale_pixels_per_meter"] == 20.0
    assert calib_data["calibration_metadata"]["pixel_distance"] == 400.0

    # Verify floor physical dimensions updated automatically (1000/20 = 50m, 600/20 = 30m)
    floor_check = await client.get(f"/api/v1/floors/{floor_id}")
    assert floor_check.status_code == 200
    assert floor_check.json()["dimensions_width_m"] == 50.0
    assert floor_check.json()["dimensions_height_m"] == 30.0

    # Cleanup
    client.cookies = admin_auth["cookies"]
    await client.delete(f"/api/v1/campuses/{campus_id}", headers=headers)


@pytest.mark.asyncio
async def test_floor_plan_validation_errors(client: AsyncClient, engineer_auth, admin_auth):
    client.cookies = admin_auth["cookies"]
    headers = admin_auth["headers"]

    c_resp = await client.post(
        "/api/v1/campuses",
        json={"name": "Validation Campus", "code": f"VAL-{uuid.uuid4().hex[:6].upper()}"},
        headers=headers,
    )
    campus_id = c_resp.json()["id"]

    b_resp = await client.post(
        f"/api/v1/campuses/{campus_id}/buildings",
        json={"name": "Hall", "building_code": "HAL"},
        headers=headers,
    )
    building_id = b_resp.json()["id"]

    f_resp = await client.post(
        f"/api/v1/buildings/{building_id}/floors",
        json={"floor_number": 1, "name": "Ground"},
        headers=headers,
    )
    floor_id = f_resp.json()["id"]

    client.cookies = engineer_auth["cookies"]
    eng_headers = engineer_auth["headers"]

    # 1. Invalid text file disguised as PNG
    invalid_files = {"file": ("fake.png", b"This is not an image file at all", "image/png")}
    resp_invalid = await client.post(
        f"/api/v1/floors/{floor_id}/plans",
        files=invalid_files,
        headers=eng_headers,
    )
    assert resp_invalid.status_code == 422
    assert "not a valid image" in resp_invalid.json()["detail"]

    # 2. Calibration with points too close together (< 5px)
    valid_bytes = create_test_image_bytes(200, 200)
    up_resp = await client.post(
        f"/api/v1/floors/{floor_id}/plans",
        files={"file": ("plan.png", valid_bytes, "image/png")},
        headers=eng_headers,
    )
    assert up_resp.status_code == 201
    plan_id = up_resp.json()["id"]

    calib_close = {
        "point1": {"x": 10.0, "y": 10.0},
        "point2": {"x": 12.0, "y": 10.0},  # only 2 pixels apart
        "distance_m": 5.0,
    }
    close_resp = await client.patch(
        f"/api/v1/floor-plans/{plan_id}/calibration",
        json=calib_close,
        headers=eng_headers,
    )
    assert close_resp.status_code == 422
    assert "at least 5 pixels apart" in close_resp.json()["detail"]

    # Cleanup
    client.cookies = admin_auth["cookies"]
    await client.delete(f"/api/v1/campuses/{campus_id}", headers=headers)


# =========================================================================
# RBAC Tests
# =========================================================================

@pytest.mark.asyncio
async def test_rbac_viewer_cannot_modify(client: AsyncClient, viewer_auth, admin_auth):
    # Admin creates campus
    client.cookies = admin_auth["cookies"]
    headers = admin_auth["headers"]

    c_resp = await client.post(
        "/api/v1/campuses",
        json={"name": "Protected Campus", "code": f"PRT-{uuid.uuid4().hex[:6].upper()}"},
        headers=headers,
    )
    campus_id = c_resp.json()["id"]

    # Viewer attempts mutations
    client.cookies = viewer_auth["cookies"]
    v_headers = viewer_auth["headers"]

    # Create campus forbidden
    v_create = await client.post(
        "/api/v1/campuses",
        json={"name": "Hacker Campus", "code": "HACK"},
        headers=v_headers,
    )
    assert v_create.status_code == 403

    # Delete campus forbidden
    v_del = await client.delete(f"/api/v1/campuses/{campus_id}", headers=v_headers)
    assert v_del.status_code == 403

    # Read allowed
    v_read = await client.get(f"/api/v1/campuses/{campus_id}")
    assert v_read.status_code == 200

    # Cleanup
    client.cookies = admin_auth["cookies"]
    await client.delete(f"/api/v1/campuses/{campus_id}", headers=headers)


@pytest.mark.asyncio
async def test_unauthenticated_requests_rejected(client: AsyncClient):
    client.cookies.clear()
    resp = await client.get("/api/v1/campuses")
    assert resp.status_code == 401

    resp2 = await client.get(f"/api/v1/floor-plans/{uuid.uuid4()}/image")
    assert resp2.status_code == 401
