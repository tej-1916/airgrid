import uuid
from datetime import datetime, timezone
import pytest
from httpx import AsyncClient

from airgrid.core.database import AsyncSessionLocal
from airgrid.core.security import hash_password
from airgrid.models.all_models import (
    AccessPoint,
    Building,
    Campus,
    CampusMembership,
    Floor,
    InternetSpeedTest,
    NetworkDiagnosticFinding,
    NetworkDiagnosticReport,
    NetworkTelemetrySnapshot,
    SurveyMeasurement,
    SurveySession,
    User,
)
from airgrid.services.copilot_service import gather_network_intelligence


@pytest.fixture
async def multi_tenant_fixture():
    """Sets up two isolated campuses with buildings, floors, APs, surveys, telemetry, speed tests, and diagnostics."""
    u_id = uuid.uuid4().hex[:6]
    async with AsyncSessionLocal() as session:
        # 1. Campuses
        campus_a = Campus(
            id=uuid.uuid4(),
            name=f"Alpha Science Campus {u_id}",
            code=f"ALP-{u_id}",
            status="active",
        )
        campus_b = Campus(
            id=uuid.uuid4(),
            name=f"Beta Engineering Campus {u_id}",
            code=f"BET-{u_id}",
            status="active",
        )
        session.add_all([campus_a, campus_b])
        await session.flush()

        # 2. Users: Alpha (network_engineer), Beta (technician), Gamma (viewer, no campus), Admin (administrator)
        user_alpha = User(
            id=uuid.uuid4(),
            email=f"alpha-eng-{u_id}@airgrid.test",
            hashed_password=hash_password("TenantPass123!"),
            full_name="Engineer Alpha",
            role="network_engineer",
            is_active=True,
        )
        user_beta = User(
            id=uuid.uuid4(),
            email=f"beta-tech-{u_id}@airgrid.test",
            hashed_password=hash_password("TenantPass123!"),
            full_name="Technician Beta",
            role="technician",
            is_active=True,
        )
        user_gamma = User(
            id=uuid.uuid4(),
            email=f"gamma-unassigned-{u_id}@airgrid.test",
            hashed_password=hash_password("TenantPass123!"),
            full_name="Viewer Gamma",
            role="viewer",
            is_active=True,
        )
        user_admin = User(
            id=uuid.uuid4(),
            email=f"admin-global-{u_id}@airgrid.test",
            hashed_password=hash_password("TenantPass123!"),
            full_name="Admin Global",
            role="administrator",
            is_active=True,
        )
        session.add_all([user_alpha, user_beta, user_gamma, user_admin])
        await session.flush()

        # 3. Memberships: Alpha -> Campus A, Beta -> Campus B, Gamma -> None
        session.add(CampusMembership(campus_id=campus_a.id, user_id=user_alpha.id))
        session.add(CampusMembership(campus_id=campus_b.id, user_id=user_beta.id))
        await session.flush()

        mac_a = f"02:{u_id[:2]}:{u_id[2:4]}:{u_id[4:6]}:44:01"
        mac_b = f"02:{u_id[:2]}:{u_id[2:4]}:{u_id[4:6]}:44:02"

        # 4. Campus A Infrastructure
        bldg_a = Building(id=uuid.uuid4(), campus_id=campus_a.id, name="Alpha Hall", building_code="AH-1", status="active", floors_count=1)
        session.add(bldg_a)
        await session.flush()
        floor_a = Floor(id=uuid.uuid4(), building_id=bldg_a.id, floor_number=1, name="L1", status="active", dimensions_width_m=50.0, dimensions_height_m=30.0)
        session.add(floor_a)
        await session.flush()
        ap_a = AccessPoint(id=uuid.uuid4(), floor_id=floor_a.id, name="AP-Alpha-01", mac_address=mac_a, status="active")
        session.add(ap_a)

        # Campus A Records
        surv_a = SurveySession(id=uuid.uuid4(), campus_id=campus_a.id, floor_id=floor_a.id, session_name="Alpha RF Survey", started_at=datetime.now(timezone.utc), status="completed")
        session.add(surv_a)
        await session.flush()
        session.add(SurveyMeasurement(
            id=uuid.uuid4(), survey_session_id=surv_a.id, floor_id=floor_a.id,
            position_x=10.0, position_y=15.0, normalized_x=0.2, normalized_y=0.5, rssi_dbm=-62.0
        ))
        session.add(InternetSpeedTest(
            id=uuid.uuid4(), campus_id=campus_a.id, vantage_point="browser", provider_engine="cloudflare",
            status="completed", data_provenance="MEASURED", download_mbps=125.5, upload_mbps=45.2,
            latency_ms=14.0, jitter_ms=2.1, executed_at=datetime.now(timezone.utc)
        ))
        session.add(NetworkTelemetrySnapshot(
            id=uuid.uuid4(), campus_id=campus_a.id, interface_name="wlan0", rssi_dbm=-60.0,
            vantage_point="client", data_provenance="MEASURED", raw_details={}, collected_at=datetime.now(timezone.utc),
            collection_status="completed"
        ))
        rep_a = NetworkDiagnosticReport(
            id=uuid.uuid4(), title="Alpha Diagnostics", campus_id=campus_a.id, interface_name="wlan0",
            summary_headline="Good RF", overall_score=85, findings_count=1, critical_count=0,
            warning_count=0, good_count=1, status="completed", vantage_point="client", data_provenance="MEASURED"
        )
        session.add(rep_a)
        await session.flush()
        session.add(NetworkDiagnosticFinding(
            id=uuid.uuid4(), report_id=rep_a.id, category="wifi", severity="info",
            title="Alpha Low Noise Floor", description="Clean 5GHz spectrum",
            measured_evidence="Noise: -95 dBm", recommendation="Maintain AP density"
        ))

        # 5. Campus B Infrastructure
        bldg_b = Building(id=uuid.uuid4(), campus_id=campus_b.id, name="Beta Tower", building_code="BT-1", status="active", floors_count=1)
        session.add(bldg_b)
        await session.flush()
        floor_b = Floor(id=uuid.uuid4(), building_id=bldg_b.id, floor_number=1, name="L2", status="active", dimensions_width_m=60.0, dimensions_height_m=40.0)
        session.add(floor_b)
        await session.flush()
        ap_b = AccessPoint(id=uuid.uuid4(), floor_id=floor_b.id, name="AP-Beta-01", mac_address=mac_b, status="active")
        session.add(ap_b)

        # Campus B Records
        surv_b = SurveySession(id=uuid.uuid4(), campus_id=campus_b.id, floor_id=floor_b.id, session_name="Beta High Density Survey", started_at=datetime.now(timezone.utc), status="completed")
        session.add(surv_b)
        await session.flush()
        session.add(SurveyMeasurement(
            id=uuid.uuid4(), survey_session_id=surv_b.id, floor_id=floor_b.id,
            position_x=25.0, position_y=35.0, normalized_x=0.4, normalized_y=0.8, rssi_dbm=-78.0
        ))
        session.add(InternetSpeedTest(
            id=uuid.uuid4(), campus_id=campus_b.id, vantage_point="browser", provider_engine="cloudflare",
            status="completed", data_provenance="MEASURED", download_mbps=12.5, upload_mbps=3.1,
            latency_ms=95.0, jitter_ms=18.4, executed_at=datetime.now(timezone.utc)
        ))
        session.add(NetworkTelemetrySnapshot(
            id=uuid.uuid4(), campus_id=campus_b.id, interface_name="wlan0", rssi_dbm=-82.0,
            vantage_point="client", data_provenance="MEASURED", raw_details={}, collected_at=datetime.now(timezone.utc),
            collection_status="completed"
        ))
        rep_b = NetworkDiagnosticReport(
            id=uuid.uuid4(), title="Beta Diagnostics", campus_id=campus_b.id, interface_name="wlan0",
            summary_headline="Degraded RF", overall_score=40, findings_count=1, critical_count=1,
            warning_count=0, good_count=0, status="completed", vantage_point="client", data_provenance="MEASURED"
        )
        session.add(rep_b)
        await session.flush()
        session.add(NetworkDiagnosticFinding(
            id=uuid.uuid4(), report_id=rep_b.id, category="wifi", severity="critical",
            title="Beta Co-channel Interference", description="High channel overlap on 2.4GHz",
            measured_evidence="Overlap: 65%", recommendation="Retune AP power and channels"
        ))

        await session.commit()

        yield {
            "campus_a": campus_a,
            "campus_b": campus_b,
            "user_alpha": user_alpha,
            "user_beta": user_beta,
            "user_gamma": user_gamma,
            "user_admin": user_admin,
            "password": "TenantPass123!",
        }


@pytest.mark.asyncio
async def test_service_tenant_isolation_alpha_beta(multi_tenant_fixture):
    """Verify that gather_network_intelligence strictly partitions records between Campus A and Campus B."""
    f = multi_tenant_fixture
    async with AsyncSessionLocal() as session:
        # Reload users attached to current session
        user_alpha = await session.get(User, f["user_alpha"].id)
        user_beta = await session.get(User, f["user_beta"].id)

        # 1. User Alpha context inspection
        context_alpha, citations_alpha = await gather_network_intelligence(session, user_alpha, f["campus_a"].id)
        assert f["campus_a"].name in context_alpha
        assert "125.5 Mbps" in context_alpha
        assert "-60.0 dBm" in context_alpha
        assert "Alpha RF Survey" in context_alpha
        assert "Alpha Low Noise Floor" in context_alpha
        assert "Managed APs in Authorized Scope: 1" in context_alpha

        # Strict non-leakage of Campus B records into Alpha context
        assert f["campus_b"].name not in context_alpha
        assert "12.5 Mbps" not in context_alpha
        assert "-82.0 dBm" not in context_alpha
        assert "Beta High Density Survey" not in context_alpha
        assert "Beta Co-channel Interference" not in context_alpha

        # 2. User Beta context inspection
        context_beta, citations_beta = await gather_network_intelligence(session, user_beta, f["campus_b"].id)
        assert f["campus_b"].name in context_beta
        assert "12.5 Mbps" in context_beta
        assert "-82.0 dBm" in context_beta
        assert "Beta High Density Survey" in context_beta
        assert "Beta Co-channel Interference" in context_beta
        assert "Managed APs in Authorized Scope: 1" in context_beta

        # Strict non-leakage of Campus A records into Beta context
        assert f["campus_a"].name not in context_beta
        assert "125.5 Mbps" not in context_beta
        assert "-60.0 dBm" not in context_beta
        assert "Alpha RF Survey" not in context_beta
        assert "Alpha Low Noise Floor" not in context_beta


@pytest.mark.asyncio
async def test_service_cross_campus_rejection(multi_tenant_fixture):
    """Verify that a user requesting context for an unauthorized campus is rejected."""
    f = multi_tenant_fixture
    async with AsyncSessionLocal() as session:
        user_alpha = await session.get(User, f["user_alpha"].id)
        context, citations = await gather_network_intelligence(session, user_alpha, f["campus_b"].id)
        assert context == "Selected campus is not accessible for this account."
        assert citations == []


@pytest.mark.asyncio
async def test_service_zero_campus_user_rejection(multi_tenant_fixture):
    """Verify that a user with zero authorized campuses receives no data."""
    f = multi_tenant_fixture
    async with AsyncSessionLocal() as session:
        user_gamma = await session.get(User, f["user_gamma"].id)
        context, citations = await gather_network_intelligence(session, user_gamma)
        assert context == "No authorized campus data accessible for this account."
        assert citations == []


@pytest.mark.asyncio
async def test_admin_preservation(multi_tenant_fixture):
    """Verify that administrator retains authorized cross-campus visibility when querying globally or specifically."""
    f = multi_tenant_fixture
    async with AsyncSessionLocal() as session:
        user_admin = await session.get(User, f["user_admin"].id)

        # Global query with campus_id=None
        context_global, _ = await gather_network_intelligence(session, user_admin, campus_id=None)
        assert f["campus_a"].name in context_global
        assert f["campus_b"].name in context_global
        assert "Managed APs in Authorized Scope:" in context_global

        # Targeted query with campus_a
        context_targeted, _ = await gather_network_intelligence(session, user_admin, campus_id=f["campus_a"].id)
        assert f["campus_a"].name in context_targeted
        assert f["campus_b"].name not in context_targeted
        assert "Managed APs in Authorized Scope: 1" in context_targeted


@pytest.mark.asyncio
async def test_endpoint_create_and_update_conversation_tenant_authorization(client: AsyncClient, multi_tenant_fixture):
    """Verify that conversation endpoints enforce server-side campus authorization checks."""
    f = multi_tenant_fixture

    # Log in as User Alpha
    login_a = await client.post("/api/v1/auth/login", json={"email": f["user_alpha"].email, "password": f["password"]})
    assert login_a.status_code == 200
    headers_a = {
        "X-CSRF-Token": login_a.json()["csrf_token"],
        "Cookie": f"airgrid_session={login_a.cookies['airgrid_session']}",
    }

    # 1. User Alpha attempts to create conversation with unauthorized Campus B -> 403 Forbidden
    res_bad = await client.post(
        "/api/v1/ai/copilot/conversations",
        json={"title": "Intrusion Attempt", "campus_id": str(f["campus_b"].id)},
        headers=headers_a,
    )
    assert res_bad.status_code == 403, "Must forbid creating conversation with unauthorized campus"

    # 2. User Alpha attempts to create conversation with non-existent campus -> 404 Not Found
    res_not_found = await client.post(
        "/api/v1/ai/copilot/conversations",
        json={"title": "Missing Campus", "campus_id": str(uuid.uuid4())},
        headers=headers_a,
    )
    assert res_not_found.status_code == 404, "Must return 404 for non-existent campus"

    # 3. User Alpha creates conversation with authorized Campus A -> 200 OK
    res_ok = await client.post(
        "/api/v1/ai/copilot/conversations",
        json={"title": "Authorized Alpha Chat", "campus_id": str(f["campus_a"].id)},
        headers=headers_a,
    )
    assert res_ok.status_code == 200
    conv_id = res_ok.json()["id"]

    # 4. User Alpha attempts to update conversation to unauthorized Campus B -> 403 Forbidden
    res_patch_bad = await client.patch(
        f"/api/v1/ai/copilot/conversations/{conv_id}",
        json={"campus_id": str(f["campus_b"].id)},
        headers=headers_a,
    )
    assert res_patch_bad.status_code == 403, "Must forbid updating conversation to unauthorized campus"


@pytest.mark.asyncio
async def test_endpoint_send_and_stream_message_revoked_access(client: AsyncClient, multi_tenant_fixture, monkeypatch):
    """Verify that message sending and streaming block requests if user access to campus was revoked."""
    f = multi_tenant_fixture

    # Log in as User Alpha
    login_a = await client.post("/api/v1/auth/login", json={"email": f["user_alpha"].email, "password": f["password"]})
    assert login_a.status_code == 200
    headers_a = {
        "X-CSRF-Token": login_a.json()["csrf_token"],
        "Cookie": f"airgrid_session={login_a.cookies['airgrid_session']}",
    }

    # Create conversation for Campus A
    res_ok = await client.post(
        "/api/v1/ai/copilot/conversations",
        json={"title": "Revocation Test", "campus_id": str(f["campus_a"].id)},
        headers=headers_a,
    )
    assert res_ok.status_code == 200
    conv_id = res_ok.json()["id"]

    # Revoke User Alpha's membership from Campus A
    async with AsyncSessionLocal() as session:
        from sqlalchemy import delete
        await session.execute(
            delete(CampusMembership).where(
                CampusMembership.user_id == f["user_alpha"].id,
                CampusMembership.campus_id == f["campus_a"].id,
            )
        )
        await session.commit()

    # Attempt to send message -> 403 Forbidden
    res_msg = await client.post(
        f"/api/v1/ai/copilot/conversations/{conv_id}/messages",
        json={"content": "What is our RF status?"},
        headers=headers_a,
    )
    assert res_msg.status_code == 403, "Must block message send if campus access revoked"

    # Attempt to stream message -> 403 Forbidden
    res_stream = await client.post(
        f"/api/v1/ai/copilot/conversations/{conv_id}/messages/stream",
        json={"content": "Stream RF status"},
        headers=headers_a,
    )
    assert res_stream.status_code == 403, "Must block streaming if campus access revoked"
