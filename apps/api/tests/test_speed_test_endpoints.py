import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from airgrid.core.database import AsyncSessionLocal
from airgrid.core.security import hash_password
from airgrid.models.all_models import User, Campus, Building, Floor, InternetSpeedTest


@pytest.fixture
async def operator_auth(client: AsyncClient):
    """Creates a temporary authenticated operator and logs in."""
    unique_email = f"operator-{uuid.uuid4().hex[:8]}@airgrid.test"
    password = "OperatorSecurePassword2026!"
    hashed = hash_password(password)

    async with AsyncSessionLocal() as session:
        user = User(
            email=unique_email,
            hashed_password=hashed,
            full_name="Measurement Operator",
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
async def sample_campus_hierarchy():
    """Sets up a test campus, building, and floor hierarchy for spatial association."""
    async with AsyncSessionLocal() as session:
        campus = Campus(
            name="SpeedTest Test Campus",
            code=f"STC-{uuid.uuid4().hex[:6].upper()}",
            status="active",
        )
        session.add(campus)
        await session.flush()

        building = Building(
            campus_id=campus.id,
            name="Telecomm Building",
            building_code=f"TC-{uuid.uuid4().hex[:4].upper()}",
            status="active",
            floors_count=2,
        )
        session.add(building)
        await session.flush()

        floor = Floor(
            building_id=building.id,
            name="Floor 1 - NOC",
            floor_number=1,
            status="active",
            dimensions_width_m=45.0,
            dimensions_height_m=30.0,
        )
        session.add(floor)
        await session.commit()

        campus_id = campus.id
        building_id = building.id
        floor_id = floor.id

    yield {
        "campus_id": campus_id,
        "building_id": building_id,
        "floor_id": floor_id,
    }

    async with AsyncSessionLocal() as session:
        c = await session.get(Campus, campus_id)
        if c:
            await session.delete(c)
            await session.commit()


@pytest.mark.asyncio
async def test_speed_test_record_creation_valid(client: AsyncClient, operator_auth: dict):
    """Verify that legitimate client speed test records are created with proper provenance."""
    headers = operator_auth["headers"]
    client.cookies.update(operator_auth["cookies"])

    payload = {
        "provider_engine": "cloudflare",
        "vantage_point": "client_browser",
        "status": "completed",
        "download_mbps": 184.52,
        "upload_mbps": 42.18,
        "latency_ms": 14.2,
        "jitter_ms": 1.8,
        "loaded_latency_ms": 28.5,
        "packet_loss_pct": None,
        "server_location": "SJC (San Jose, US)",
        "duration_seconds": 12.4,
        "quality_metadata": {
            "colo": "SJC",
            "protocol": "h2",
            "packet_loss_unsupported": True,
        },
    }

    resp = await client.post("/api/v1/speed-tests", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()

    assert data["download_mbps"] == 184.52
    assert data["upload_mbps"] == 42.18
    assert data["latency_ms"] == 14.2
    assert data["jitter_ms"] == 1.8
    assert data["loaded_latency_ms"] == 28.5
    assert data["data_provenance"] == "client_reported"
    assert data["user_email"] == operator_auth["email"]
    assert data["status"] == "completed"
    assert data["server_location"] == "SJC (San Jose, US)"
    assert data["quality_metadata"]["colo"] == "SJC"
    assert "id" in data


@pytest.mark.asyncio
async def test_speed_test_spatial_association(
    client: AsyncClient, operator_auth: dict, sample_campus_hierarchy: dict
):
    """Verify associating a test with campus, building, and floor."""
    headers = operator_auth["headers"]
    client.cookies.update(operator_auth["cookies"])

    payload = {
        "provider_engine": "cloudflare",
        "status": "completed",
        "download_mbps": 95.4,
        "upload_mbps": 22.1,
        "latency_ms": 18.0,
        "jitter_ms": 2.1,
        "campus_id": str(sample_campus_hierarchy["campus_id"]),
        "building_id": str(sample_campus_hierarchy["building_id"]),
        "floor_id": str(sample_campus_hierarchy["floor_id"]),
    }

    resp = await client.post("/api/v1/speed-tests", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()

    assert data["campus_id"] == str(sample_campus_hierarchy["campus_id"])
    assert data["campus_name"] == "SpeedTest Test Campus"
    assert data["building_id"] == str(sample_campus_hierarchy["building_id"])
    assert data["building_name"] == "Telecomm Building"
    assert data["floor_id"] == str(sample_campus_hierarchy["floor_id"])
    assert data["floor_name"] == "Floor 1 - NOC"


@pytest.mark.asyncio
async def test_speed_test_hierarchy_mismatch_rejection(
    client: AsyncClient, operator_auth: dict, sample_campus_hierarchy: dict
):
    """Verify that mismatched building and campus associations are rejected with 422."""
    headers = operator_auth["headers"]
    client.cookies.update(operator_auth["cookies"])

    # Create a separate campus
    async with AsyncSessionLocal() as session:
        other_campus = Campus(
            name="Other Campus",
            code=f"OC-{uuid.uuid4().hex[:6].upper()}",
            status="active",
        )
        session.add(other_campus)
        await session.commit()
        other_campus_id = other_campus.id

    try:
        # Building belongs to sample_campus_hierarchy, NOT other_campus
        payload = {
            "provider_engine": "cloudflare",
            "status": "completed",
            "download_mbps": 50.0,
            "upload_mbps": 10.0,
            "latency_ms": 20.0,
            "campus_id": str(other_campus_id),
            "building_id": str(sample_campus_hierarchy["building_id"]),
        }

        resp = await client.post("/api/v1/speed-tests", json=payload, headers=headers)
        assert resp.status_code == 422
        assert "Hierarchy mismatch" in resp.json()["detail"]
    finally:
        async with AsyncSessionLocal() as session:
            c = await session.get(Campus, other_campus_id)
            if c:
                await session.delete(c)
                await session.commit()


@pytest.mark.asyncio
async def test_speed_test_validation_bounds(client: AsyncClient, operator_auth: dict):
    """Verify that absurd or negative metrics are rejected."""
    headers = operator_auth["headers"]
    client.cookies.update(operator_auth["cookies"])

    # Negative download
    resp = await client.post(
        "/api/v1/speed-tests",
        json={"provider_engine": "cloudflare", "download_mbps": -10.0},
        headers=headers,
    )
    assert resp.status_code == 422

    # Negative latency
    resp2 = await client.post(
        "/api/v1/speed-tests",
        json={"provider_engine": "cloudflare", "latency_ms": -5.0},
        headers=headers,
    )
    assert resp2.status_code == 422

    # Invalid status
    resp3 = await client.post(
        "/api/v1/speed-tests",
        json={"provider_engine": "cloudflare", "status": "magical_status"},
        headers=headers,
    )
    assert resp3.status_code == 422

    # Invalid provider
    resp4 = await client.post(
        "/api/v1/speed-tests",
        json={"provider_engine": "unknown_hacker_engine"},
        headers=headers,
    )
    assert resp4.status_code == 422


@pytest.mark.asyncio
async def test_speed_test_listing_and_filtering(
    client: AsyncClient, operator_auth: dict, sample_campus_hierarchy: dict
):
    """Verify listing and query parameter filtering."""
    headers = operator_auth["headers"]
    client.cookies.update(operator_auth["cookies"])

    # Post a completed test linked to campus
    await client.post(
        "/api/v1/speed-tests",
        json={
            "provider_engine": "cloudflare",
            "status": "completed",
            "download_mbps": 120.0,
            "upload_mbps": 30.0,
            "latency_ms": 15.0,
            "campus_id": str(sample_campus_hierarchy["campus_id"]),
        },
        headers=headers,
    )

    # Post an aborted test without campus
    await client.post(
        "/api/v1/speed-tests",
        json={
            "provider_engine": "cloudflare",
            "status": "aborted",
            "download_mbps": 45.0,
            "error_code": "USER_ABORTED",
            "error_message": "Operator cancelled test",
        },
        headers=headers,
    )

    # 1. List all
    list_all = await client.get("/api/v1/speed-tests?limit=10")
    assert list_all.status_code == 200
    assert list_all.json()["total"] >= 2

    # 2. Filter by status=aborted
    list_aborted = await client.get("/api/v1/speed-tests?status=aborted")
    assert list_aborted.status_code == 200
    for item in list_aborted.json()["items"]:
        assert item["status"] == "aborted"

    # 3. Filter by campus_id
    list_campus = await client.get(
        f"/api/v1/speed-tests?campus_id={sample_campus_hierarchy['campus_id']}"
    )
    assert list_campus.status_code == 200
    assert list_campus.json()["total"] >= 1
    for item in list_campus.json()["items"]:
        assert item["campus_id"] == str(sample_campus_hierarchy["campus_id"])


@pytest.mark.asyncio
async def test_speed_test_stats_summary(client: AsyncClient, operator_auth: dict):
    """Verify aggregated summary statistics calculation."""
    client.cookies.update(operator_auth["cookies"])

    resp = await client.get("/api/v1/speed-tests/stats/summary")
    assert resp.status_code == 200
    stats = resp.json()

    assert "total_tests" in stats
    assert "completed_count" in stats
    assert "aborted_count" in stats
    assert "failed_count" in stats
    assert stats["total_tests"] >= 1


@pytest.mark.asyncio
async def test_speed_test_unauthenticated_and_csrf_protection(client: AsyncClient):
    """Verify that unauthenticated requests return 401 and missing CSRF returns 403."""
    # 1. Unauthenticated request without cookies
    client.cookies.clear()
    resp = await client.get("/api/v1/speed-tests")
    assert resp.status_code == 401

    post_resp = await client.post(
        "/api/v1/speed-tests",
        json={"provider_engine": "cloudflare", "download_mbps": 100.0},
    )
    assert post_resp.status_code == 401


@pytest.mark.asyncio
async def test_speed_test_config_endpoint(client: AsyncClient, operator_auth: dict):
    """Verify safety limits and supported providers config endpoint."""
    client.cookies.update(operator_auth["cookies"])
    resp = await client.get("/api/v1/speed-tests/config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["max_mb"] == 150
    assert data["duration_seconds"] == 10
    assert data["default_provider"] == "cloudflare"
    assert "cloudflare" in data["supported_providers"]

