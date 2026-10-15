import io
import uuid
import pytest
from httpx import AsyncClient
from PIL import Image

from airgrid.core.database import AsyncSessionLocal
from airgrid.core.security import hash_password
from airgrid.models.all_models import User


@pytest.fixture
async def admin_auth(client: AsyncClient):
    unique_email = f"admin-{uuid.uuid4().hex[:8]}@airgrid.test"
    password = "AdminSecurePassword2026!"
    hashed = hash_password(password)

    async with AsyncSessionLocal() as session:
        user = User(
            email=unique_email,
            hashed_password=hashed,
            full_name="Dashboard Admin",
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


def create_test_image_bytes(width: int = 400, height: int = 300) -> bytes:
    img = Image.new("RGB", (width, height), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.mark.asyncio
async def test_dashboard_summary_and_filtering(client: AsyncClient, admin_auth):
    client.cookies = admin_auth["cookies"]
    headers = admin_auth["headers"]

    # Global summary initially
    sum1 = await client.get("/api/v1/dashboard/summary")
    assert sum1.status_code == 200
    d1 = sum1.json()
    assert d1["database_connected"] is True
    assert isinstance(d1["total_campuses"], int)

    # Create test campus hierarchy
    code = f"DSH-{uuid.uuid4().hex[:6].upper()}"
    c_resp = await client.post(
        "/api/v1/campuses",
        json={"name": "Dashboard University", "code": code},
        headers=headers,
    )
    campus_id = c_resp.json()["id"]

    b_resp = await client.post(
        f"/api/v1/campuses/{campus_id}/buildings",
        json={"name": "Science Block", "building_code": "SCI"},
        headers=headers,
    )
    building_id = b_resp.json()["id"]

    f_resp = await client.post(
        f"/api/v1/buildings/{building_id}/floors",
        json={"floor_number": 1, "name": "Level 1"},
        headers=headers,
    )
    floor_id = f_resp.json()["id"]

    img_bytes = create_test_image_bytes()
    await client.post(
        f"/api/v1/floors/{floor_id}/plans",
        files={"file": ("plan.png", img_bytes, "image/png")},
        headers=headers,
    )

    # Query filtered summary for this campus
    sum_filtered = await client.get(f"/api/v1/dashboard/summary?campus_id={campus_id}")
    assert sum_filtered.status_code == 200
    df = sum_filtered.json()
    assert df["selected_campus_id"] == campus_id
    assert df["selected_campus_name"] == "Dashboard University"
    assert df["total_buildings"] == 1
    assert df["total_floors"] == 1
    assert df["total_floor_plans"] == 1
    assert df["uncalibrated_floor_plans"] == 1

    # Cleanup
    await client.delete(f"/api/v1/campuses/{campus_id}", headers=headers)


@pytest.mark.asyncio
async def test_dashboard_inventory_tab(client: AsyncClient, admin_auth):
    client.cookies = admin_auth["cookies"]
    headers = admin_auth["headers"]

    code = f"INV-{uuid.uuid4().hex[:6].upper()}"
    c_resp = await client.post(
        "/api/v1/campuses",
        json={"name": "Inventory Campus", "code": code, "address": "789 Campus Ave"},
        headers=headers,
    )
    campus_id = c_resp.json()["id"]

    inv_resp = await client.get("/api/v1/dashboard/inventory")
    assert inv_resp.status_code == 200
    inv = inv_resp.json()
    assert inv["total"] >= 1
    matching = [item for item in inv["items"] if item["id"] == campus_id]
    assert len(matching) == 1
    assert matching[0]["name"] == "Inventory Campus"
    assert matching[0]["code"] == code

    # Cleanup
    await client.delete(f"/api/v1/campuses/{campus_id}", headers=headers)


@pytest.mark.asyncio
async def test_dashboard_activity_tab(client: AsyncClient, admin_auth):
    client.cookies = admin_auth["cookies"]
    headers = admin_auth["headers"]

    # Trigger action
    code = f"ACT-{uuid.uuid4().hex[:6].upper()}"
    c_resp = await client.post(
        "/api/v1/campuses",
        json={"name": "Activity Campus", "code": code},
        headers=headers,
    )
    campus_id = c_resp.json()["id"]

    act_resp = await client.get("/api/v1/dashboard/activity?limit=10")
    assert act_resp.status_code == 200
    activities = act_resp.json()["items"]
    assert len(activities) > 0
    # Must contain recent campus.created event
    recent_campus_events = [a for a in activities if a["action"] == "campus.created"]
    assert len(recent_campus_events) > 0
    assert recent_campus_events[0]["actor_role"] == "administrator"
    # Ensure no secrets in payload
    for key in ("password", "token", "secret"):
        assert key not in recent_campus_events[0]["payload"]

    # Cleanup
    await client.delete(f"/api/v1/campuses/{campus_id}", headers=headers)


@pytest.mark.asyncio
async def test_dashboard_system_status(client: AsyncClient, admin_auth):
    client.cookies = admin_auth["cookies"]
    status_resp = await client.get("/api/v1/dashboard/system-status")
    assert status_resp.status_code == 200
    data = status_resp.json()
    assert data["overall"] in ("operational", "degraded")
    component_names = [c["name"] for c in data["components"]]
    assert "FastAPI ASGI Runtime" in component_names
    assert "PostgreSQL Database" in component_names
    assert "AI Inference Gateway" in component_names
    assert "n8n Automation Engine" in component_names

    # Check postgres component
    pg_comp = next(c for c in data["components"] if c["name"] == "PostgreSQL Database")
    assert pg_comp["status"] == "healthy"
    assert pg_comp["latency_ms"] is not None
