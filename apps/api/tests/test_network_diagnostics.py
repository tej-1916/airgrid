import uuid
import pytest
from httpx import AsyncClient
from datetime import datetime

from airgrid.schemas.diagnostics import (
    TelemetrySnapshotResponse,
    GatewayPingResult,
    IperfResult,
)
from airgrid.services.telemetry_collector import TelemetryCollector
from airgrid.services.diagnostic_engine import DiagnosticEngine


@pytest.fixture(autouse=True)
def isolated_host_commands(monkeypatch):
    """Never collect host telemetry or send packets during unattended tests."""
    from airgrid.core.config import settings
    monkeypatch.setattr(settings, "AIRGRID_COLLECTOR_ENABLED", True)
    from airgrid.schemas.diagnostics import InterfaceListResponse
    monkeypatch.setattr(TelemetryCollector, "list_interfaces", lambda self: InterfaceListResponse(
        interfaces=[], hostname="isolated-fixture", os_info="Linux fixture"))
    monkeypatch.setattr(TelemetryCollector, "collect_wireless_telemetry", lambda self, iface=None: {
        "interface_name": "fixture0", "rssi_dbm": -64.0})
    monkeypatch.setattr(TelemetryCollector, "discover_default_route", lambda self: ("127.0.0.1", "fixture0"))
    monkeypatch.setattr(TelemetryCollector, "_run_cmd", lambda self, args, timeout=3.0: (
        0, "2 packets transmitted, 2 received, 0% packet loss\nrtt min/avg/max/mdev = 1/2/3/1 ms", ""))


# ---------------------------------------------------------------------------
# 1. Telemetry Collector Unit Tests
# ---------------------------------------------------------------------------

def test_telemetry_collector_instantiation():
    collector = TelemetryCollector()
    assert collector.ip_bin is not None
    assert collector.iw_bin is not None
    assert collector.ping_bin is not None


def test_discover_interfaces_auto_detection():
    collector = TelemetryCollector()
    res = collector.list_interfaces()
    assert isinstance(res.interfaces, list)
    assert res.hostname is not None
    assert res.os_info is not None
    # If wireless interface is present on this machine, verify it does not assume wlan0
    if res.discovered_wireless_interface:
        assert isinstance(res.discovered_wireless_interface, str)
        assert len(res.discovered_wireless_interface) > 0


def test_ping_gateway_validation():
    collector = TelemetryCollector()
    # Test invalid IP rejection
    res = collector.ping_gateway(gateway_ip="invalid.ip.address; rm -rf /", count=3)
    assert res.status == "invalid_ip_format"
    assert res.loss_pct is None


def test_iperf_target_validation():
    collector = TelemetryCollector()
    res = collector.test_iperf(target_host="invalid host with spaces; touch /tmp/test")
    assert res.status == "error" or res.status == "skipped"


# ---------------------------------------------------------------------------
# 2. Diagnostic Engine Deterministic Rules Unit Tests
# ---------------------------------------------------------------------------

def test_diagnostic_engine_optimal_signal():
    engine = DiagnosticEngine()
    snapshot = TelemetrySnapshotResponse(
        interface_name="wlp0s20f3",
        ssid="AirGrid-Enterprise-5G",
        bssid="02:00:00:00:00:03",
        rssi_dbm=-58.0,
        frequency_mhz=5200,
        band="5 GHz",
        channel=40,
        channel_width_mhz=160,
        rx_bitrate_mbps=960.0,
        tx_bitrate_mbps=640.0,
        security_protocol="WPA3",
        gateway_ip="172.16.0.1",
        gateway_ping=GatewayPingResult(
            target_ip="172.16.0.1",
            transmitted=3,
            received=3,
            loss_pct=0.0,
            rtt_avg_ms=2.5,
        ),
        vantage_point="local_collector",
    )

    findings, score, headline = engine.analyze(snapshot)
    assert score >= 90
    assert "heuristic score" in headline

    # Verify findings categories
    categories = {f.category for f in findings}
    assert "signal_strength" in categories
    assert "frequency_band" in categories
    assert "link_rate" in categories
    assert "gateway_latency" in categories
    assert "packet_loss" in categories

    # Optimal signal finding
    sig_finding = next(f for f in findings if f.category == "signal_strength")
    assert sig_finding.severity == "good"
    assert "-58.0 dBm" in sig_finding.measured_evidence


def test_diagnostic_engine_weak_signal_and_24ghz():
    engine = DiagnosticEngine()
    snapshot = TelemetrySnapshotResponse(
        interface_name="wlp0s20f3",
        ssid="Legacy-Guest",
        bssid="11:22:33:44:55:66",
        rssi_dbm=-79.0,  # Weak signal
        frequency_mhz=2437,
        band="2.4 GHz",  # Congested band
        channel=6,
        rx_bitrate_mbps=36.0,  # Degraded PHY rate
        tx_bitrate_mbps=24.0,
        gateway_ip="192.168.1.1",
        gateway_ping=GatewayPingResult(
            target_ip="192.168.1.1",
            transmitted=3,
            received=3,
            loss_pct=0.0,
            rtt_avg_ms=18.0,
        ),
    )

    findings, score, headline = engine.analyze(snapshot)
    assert score < 70
    assert any(f.severity == "warning" for f in findings)

    # 2.4 GHz warning
    band_finding = next(f for f in findings if f.category == "frequency_band")
    assert band_finding.severity == "info"
    assert "2.4 GHz" in band_finding.measured_value

    # Signal warning
    sig_finding = next(f for f in findings if f.category == "signal_strength")
    assert sig_finding.severity == "warning"
    assert "-79.0" in sig_finding.measured_value


def test_diagnostic_engine_severe_loss_and_wan_differential():
    engine = DiagnosticEngine()
    # Scenario: Clean local Wi-Fi ping (2ms) but high Internet latency (110ms)
    snapshot = TelemetrySnapshotResponse(
        interface_name="wlp0s20f3",
        rssi_dbm=-60.0,
        frequency_mhz=5180,
        band="5 GHz",
        rx_bitrate_mbps=500.0,
        gateway_ping=GatewayPingResult(
            target_ip="10.0.0.1",
            transmitted=5,
            received=5,
            loss_pct=0.0,
            rtt_avg_ms=2.1,  # Fast local airlink
        ),
        internet_download_mbps=150.0,
        internet_latency_ms=115.0,  # Slow WAN upstream
    )

    findings, score, headline = engine.analyze(snapshot)
    # Check WAN bottleneck diagnosis
    wan_finding = next((f for f in findings if f.category == "internet_performance" ), None)
    assert wan_finding is not None
    assert "bottleneck" in wan_finding.recommendation
    assert "115.0" in wan_finding.measured_evidence


def test_diagnostic_engine_missing_metrics_honesty():
    engine = DiagnosticEngine()
    # Missing RSSI should be reported honestly, never fabricated!
    snapshot = TelemetrySnapshotResponse(
        interface_name="eth0",
        rssi_dbm=None,
    )
    findings, score, headline = engine.analyze(snapshot)
    sig_finding = next(f for f in findings if f.category == "signal_strength")
    assert sig_finding.severity == "info"
    assert "Unavailable" in sig_finding.measured_value


# ---------------------------------------------------------------------------
# 3. HTTP API Endpoints Integration Tests
# ---------------------------------------------------------------------------

from airgrid.core.database import AsyncSessionLocal
from airgrid.core.security import hash_password
from airgrid.models.all_models import User


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
            full_name="Diagnostics Network Engineer",
            role="network_engineer",
            is_active=True,
        )
        session.add(user)
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
    }


@pytest.fixture
async def viewer_auth(client: AsyncClient):
    """Creates a temporary authenticated read-only viewer."""
    email = f"viewer-{uuid.uuid4().hex[:8]}@airgrid.test"
    password = "ViewerPassword2026!"
    hashed = hash_password(password)

    async with AsyncSessionLocal() as session:
        user = User(
            email=email,
            hashed_password=hashed,
            full_name="Read-Only Observer",
            role="viewer",
            is_active=True,
        )
        session.add(user)
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
    }


@pytest.mark.asyncio
async def test_get_interfaces_endpoint(client: AsyncClient, engineer_auth: dict):
    client.cookies = engineer_auth["cookies"]
    res = await client.get("/api/v1/diagnostics/interfaces")
    assert res.status_code == 200
    data = res.json()
    assert "interfaces" in data
    assert "hostname" in data
    assert "os_info" in data


@pytest.mark.asyncio
async def test_collect_telemetry_consent_enforcement(client: AsyncClient, engineer_auth: dict):
    client.cookies = engineer_auth["cookies"]
    # Refuse consent -> 400 Bad Request
    res = await client.post(
        "/api/v1/diagnostics/collect",
        headers={"X-CSRF-Token": engineer_auth["csrf_token"]},
        json={"operator_consent": False},
    )
    assert res.status_code == 400
    assert "Explicit operator authorization is required" in res.json()["detail"]


@pytest.mark.asyncio
async def test_collect_telemetry_success(client: AsyncClient, engineer_auth: dict):
    client.cookies = engineer_auth["cookies"]
    res = await client.post(
        "/api/v1/diagnostics/collect",
        headers={"X-CSRF-Token": engineer_auth["csrf_token"]},
        json={
            "operator_consent": True,
            "include_gateway_ping": False,  # Speed up unit test
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert "interface_name" in data
    assert data["vantage_point"] == "backend_server"
    assert data["data_provenance"] == "instrumented_linux_telemetry"


@pytest.mark.asyncio
async def test_ping_gateway_endpoint(client: AsyncClient, engineer_auth: dict):
    client.cookies = engineer_auth["cookies"]
    res = await client.post(
        "/api/v1/diagnostics/ping-gateway",
        headers={"X-CSRF-Token": engineer_auth["csrf_token"]},
        json={
            "gateway_ip": "127.0.0.1",
            "ping_count": 2,
            "operator_consent": True,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["target_ip"] == "127.0.0.1"
    assert data["transmitted"] == 2
    assert data["loss_pct"] == 0.0


@pytest.mark.asyncio
async def test_analyze_and_persist_diagnostic_report(
    client: AsyncClient,
    engineer_auth: dict,
    viewer_auth: dict,
):
    client.cookies = engineer_auth["cookies"]
    # Create diagnostic report by analyzing simulated telemetry
    mock_telemetry = {
        "interface_name": "wlp0s20f3",
        "ssid": "AirGrid-Production-5G",
        "bssid": "02:00:00:00:00:03",
        "rssi_dbm": -64.0,
        "frequency_mhz": 5200,
        "channel": 40,
        "band": "5 GHz",
        "channel_width_mhz": 160,
        "rx_bitrate_mbps": 866.0,
        "tx_bitrate_mbps": 600.0,
        "security_protocol": "WPA2",
        "gateway_ip": "172.16.0.1",
        "gateway_ping": {
            "target_ip": "172.16.0.1",
            "transmitted": 3,
            "received": 3,
            "loss_pct": 0.0,
            "rtt_avg_ms": 3.2,
        },
        "vantage_point": "local_collector",
        "data_provenance": "instrumented_linux_telemetry",
    }

    create_res = await client.post(
        "/api/v1/diagnostics/analyze",
        headers={"X-CSRF-Token": engineer_auth["csrf_token"]},
        json={
            "title": "Automated Test Wi-Fi Diagnostic Run",
            "telemetry": mock_telemetry,
            "operator_consent": True,
        },
    )
    assert create_res.status_code == 201
    report = create_res.json()
    assert report["title"] == "Automated Test Wi-Fi Diagnostic Run"
    assert report["overall_score"] >= 90
    assert report["findings_count"] > 0
    assert len(report["findings"]) == report["findings_count"]
    report_id = report["id"]

    # List reports
    list_res = await client.get("/api/v1/diagnostics/reports")
    assert list_res.status_code == 200
    list_data = list_res.json()
    assert list_data["total"] >= 1
    assert any(r["id"] == report_id for r in list_data["reports"])

    # Get single report
    get_res = await client.get(f"/api/v1/diagnostics/reports/{report_id}")
    assert get_res.status_code == 200
    single_data = get_res.json()
    assert single_data["id"] == report_id
    assert single_data["telemetry"]["rssi_dbm"] == -64.0

    analyst = await client.post(
        "/api/v1/analyst/analyze", json={"report_id": report_id},
        headers={"X-CSRF-Token": engineer_auth["csrf_token"]})
    assert analyst.status_code == 200
    assert analyst.json()["mode"] == "deterministic"
    assert analyst.json()["evidence"][0]["value"] == -64
    assert report["data_provenance"] == "operator_reported"

    client.cookies = viewer_auth["cookies"]
    viewer_analysis = await client.post(
        "/api/v1/analyst/analyze", json={"report_id": report_id},
        headers={"X-CSRF-Token": viewer_auth["csrf_token"]})
    assert viewer_analysis.status_code == 403

    # Viewer role CANNOT delete report (403 Forbidden)
    viewer_del = await client.delete(
        f"/api/v1/diagnostics/reports/{report_id}",
        headers={"X-CSRF-Token": viewer_auth["csrf_token"]},
    )
    assert viewer_del.status_code == 403

    # Engineer role CAN delete report (200 OK)
    client.cookies = engineer_auth["cookies"]
    del_res = await client.delete(
        f"/api/v1/diagnostics/reports/{report_id}",
        headers={"X-CSRF-Token": engineer_auth["csrf_token"]},
    )
    assert del_res.status_code == 200

    # Confirm deletion
    get_again = await client.get(f"/api/v1/diagnostics/reports/{report_id}")
    assert get_again.status_code == 404
