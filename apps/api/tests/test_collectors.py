"""Registered collectors, signed ingestion, server-owned snapshots, trends and retention.

All observations here are isolated fixtures in airgrid_test_db; no host command runs.
"""
import json
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from airgrid.core.database import AsyncSessionLocal
from airgrid.main import app
from airgrid.models.all_models import (
    AuditLog, Building, Campus, DataRetentionPolicy, Floor, NetworkCollector, NetworkDiagnosticReport,
    NetworkTelemetrySnapshot, TelemetryDailyAggregate,
)
from airgrid.services import collector_service
from airgrid.services.auth_service import LoginRateLimiter
from airgrid.services.collector_service import sign_submission
from airgrid.services.telemetry_collector import TelemetryCollector
from airgrid.services.telemetry_history import connection_transitions, merge_metrics

INGEST = "/api/v1/collectors/ingest"


def reading(**overrides):
    payload = {"schema_version": 1, "collected_at": datetime.now(timezone.utc).isoformat(),
               "collection_status": "collected", "interface_name": "fixture0", "connection_state": "connected",
               "ssid": "Fixture-Net", "bssid": "02:00:00:00:00:01", "rssi_dbm": -61.0, "frequency_mhz": 5180,
               "channel": 36, "band": "5 GHz", "rx_bitrate_mbps": 433.3, "tx_bitrate_mbps": 390.0,
               "gateway_ping": {"transmitted": 3, "received": 3, "loss_pct": 0.0, "rtt_avg_ms": 2.1}}
    payload.update(overrides)
    return payload


def signed(collector_id, secret, payload=None, *, body=None, nonce=None, timestamp=None):
    body = body if body is not None else json.dumps(payload).encode()
    timestamp = timestamp if timestamp is not None else int(time.time())
    nonce = nonce or secrets.token_urlsafe(24)
    return body, {"Content-Type": "application/json", "X-AirGrid-Collector": str(collector_id),
                  "X-AirGrid-Timestamp": str(timestamp), "X-AirGrid-Nonce": nonce,
                  "X-AirGrid-Signature": sign_submission(secret, str(collector_id), timestamp, nonce, body)}


async def make_floor():
    async with AsyncSessionLocal() as s:
        campus = Campus(name="Fixture Campus", code=f"FX-{uuid.uuid4().hex[:8]}")
        s.add(campus)
        await s.flush()
        from airgrid.models.all_models import CampusMembership, User
        users = (await s.execute(select(User))).scalars().all()
        for u in users:
            s.add(CampusMembership(campus_id=campus.id, user_id=u.id))
        building = Building(campus_id=campus.id, name="Fixture Hall", building_code="FH")
        s.add(building)
        await s.flush()
        floor = Floor(building_id=building.id, floor_number=1, name="Fixture Floor 1")
        s.add(floor)
        await s.commit()
        return SimpleNamespace(campus=campus.id, building=building.id, floor=floor.id)


@pytest.fixture
async def admin(auth_client):
    return await auth_client("administrator")


@pytest.fixture
async def registered(admin):
    scope = await make_floor()
    res = await admin.post("/api/v1/collectors", json={"name": "Fixture collector", "host_label": "lab-host",
                                                        "floor_id": str(scope.floor)})
    assert res.status_code == 201, res.text
    data = res.json()
    return SimpleNamespace(id=data["collector"]["id"], secret=data["secret"], scope=scope)


# --- Registration and authorization ------------------------------------------------

@pytest.mark.asyncio
async def test_registration_is_admin_only_and_secret_shown_once(auth_client, admin, registered):
    engineer, viewer = await auth_client("network_engineer"), await auth_client("viewer")
    for c in (engineer, viewer):
        assert (await c.post("/api/v1/collectors", json={"name": "nope"})).status_code == 403
    assert len(registered.secret) == 64
    listing = await viewer.get("/api/v1/collectors")
    assert listing.status_code == 200
    entry = next(c for c in listing.json() if c["id"] == registered.id)
    assert entry["status"] == "active" and entry["floor_id"] == str(registered.scope.floor)
    assert entry["building_id"] == str(registered.scope.building)  # scope derived server-side
    assert registered.secret not in listing.text and "secret_salt" not in listing.text
    async with AsyncSessionLocal() as s:
        audit = (await s.execute(select(AuditLog).where(AuditLog.action == "collector.registered",
                                                        AuditLog.resource_id == registered.id))).scalar_one()
        assert registered.secret not in json.dumps(audit.payload)


@pytest.mark.asyncio
async def test_registration_requires_csrf(admin):
    res = await admin.post("/api/v1/collectors", json={"name": "x"}, headers={"X-CSRF-Token": ""})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_registration_rejects_inconsistent_scope(admin):
    a, b = await make_floor(), await make_floor()
    res = await admin.post("/api/v1/collectors", json={"name": "x", "building_id": str(a.building), "floor_id": str(b.floor)})
    assert res.status_code == 422


# --- Signed ingestion ----------------------------------------------------------------

@pytest.mark.asyncio
async def test_signed_submission_is_persisted_as_collector_evidence(client, registered):
    body, headers = signed(registered.id, registered.secret, reading())
    res = await client.post(INGEST, content=body, headers=headers)
    assert res.status_code == 201, res.text
    async with AsyncSessionLocal() as s:
        snap = await s.get(NetworkTelemetrySnapshot, uuid.UUID(res.json()["snapshot_id"]))
        assert snap.vantage_point == "registered_collector"
        assert snap.data_provenance == "instrumented_linux_telemetry"
        assert str(snap.collector_id) == registered.id and snap.report_id is None and snap.user_id is None
        assert snap.floor_id == registered.scope.floor
        assert snap.rssi_dbm == -61.0 and snap.raw_details["gateway_ping"]["received"] == 3
        collector = await s.get(NetworkCollector, uuid.UUID(registered.id))
        assert collector.submission_count == 1 and collector.last_seen_at is not None


@pytest.mark.asyncio
async def test_bad_signature_and_session_cookie_are_rejected(client, admin, registered):
    body, headers = signed(registered.id, "0" * 64, reading())
    assert (await client.post(INGEST, content=body, headers=headers)).status_code == 401
    # An authenticated browser session is not a collector credential.
    assert (await admin.post(INGEST, json=reading())).status_code == 401
    async with AsyncSessionLocal() as s:
        collector = await s.get(NetworkCollector, uuid.UUID(registered.id))
        assert collector.rejected_count == 1 and collector.submission_count == 0


@pytest.mark.asyncio
async def test_replayed_nonce_is_rejected(client, registered):
    body, headers = signed(registered.id, registered.secret, reading())
    assert (await client.post(INGEST, content=body, headers=headers)).status_code == 201
    replay = await client.post(INGEST, content=body, headers=headers)
    assert replay.status_code == 409


@pytest.mark.asyncio
async def test_stale_request_timestamp_and_stale_observation_rejected(client, registered):
    body, headers = signed(registered.id, registered.secret, reading(), timestamp=int(time.time()) - 900)
    assert (await client.post(INGEST, content=body, headers=headers)).status_code == 401
    old = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    body, headers = signed(registered.id, registered.secret, reading(collected_at=old))
    assert (await client.post(INGEST, content=body, headers=headers)).status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", [
    reading(mac_address="02:00:00:00:00:09"),               # unknown field
    reading(rssi_dbm=12.0),                                  # out of range
    reading(collected_at="2026-10-28T12:00:00"),            # naive timestamp
    reading(collection_status="failed", error="no link"),   # failed but carries measurements
    reading(ssid="bad\x07ssid"),                             # control characters
    reading(gateway_ping={"transmitted": 2, "received": 3, "loss_pct": 0}),
])
async def test_invalid_telemetry_is_rejected(client, registered, payload):
    body, headers = signed(registered.id, registered.secret, payload)
    res = await client.post(INGEST, content=body, headers=headers)
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_failed_collection_is_recorded_without_measurements(client, registered):
    payload = {"schema_version": 1, "collected_at": datetime.now(timezone.utc).isoformat(),
               "collection_status": "failed", "error": "No wireless network interface detected on this system"}
    body, headers = signed(registered.id, registered.secret, payload)
    res = await client.post(INGEST, content=body, headers=headers)
    assert res.status_code == 201 and res.json()["collection_status"] == "failed"


@pytest.mark.asyncio
async def test_oversized_body_rejected(client, registered):
    body, headers = signed(registered.id, registered.secret, body=b'{"pad":"' + b"x" * 20000 + b'"}')
    assert (await client.post(INGEST, content=body, headers=headers)).status_code == 413


@pytest.mark.asyncio
async def test_remote_plain_http_is_refused(registered):
    transport = ASGITransport(app=app, client=("203.0.113.7", 40000))
    async with AsyncClient(transport=transport, base_url="http://testserver") as remote:
        body, headers = signed(registered.id, registered.secret, reading())
        assert (await remote.post(INGEST, content=body, headers=headers)).status_code == 403
    async with AsyncClient(transport=transport, base_url="https://testserver") as remote_tls:
        body, headers = signed(registered.id, registered.secret, reading())
        assert (await remote_tls.post(INGEST, content=body, headers=headers)).status_code == 201


@pytest.mark.asyncio
async def test_rate_limit(client, registered, monkeypatch):
    monkeypatch.setattr(collector_service, "ingest_limiter", LoginRateLimiter(max_attempts=2, window_seconds=60))
    codes = []
    for _ in range(3):
        body, headers = signed(registered.id, registered.secret, reading())
        codes.append((await client.post(INGEST, content=body, headers=headers)).status_code)
    assert codes == [201, 201, 429]


@pytest.mark.asyncio
async def test_revocation_and_rotation(client, admin, registered):
    rotated = await admin.post(f"/api/v1/collectors/{registered.id}/rotate")
    assert rotated.status_code == 200
    new_secret = rotated.json()["secret"]
    body, headers = signed(registered.id, registered.secret, reading())
    assert (await client.post(INGEST, content=body, headers=headers)).status_code == 401
    body, headers = signed(registered.id, new_secret, reading())
    assert (await client.post(INGEST, content=body, headers=headers)).status_code == 201

    assert (await admin.post(f"/api/v1/collectors/{registered.id}/revoke")).json()["status"] == "revoked"
    body, headers = signed(registered.id, new_secret, reading())
    assert (await client.post(INGEST, content=body, headers=headers)).status_code == 403
    assert (await admin.post(f"/api/v1/collectors/{registered.id}/rotate")).status_code == 409


# --- Server-owned snapshot analysis ----------------------------------------------------

@pytest.mark.asyncio
async def test_collector_snapshot_analysis_keeps_instrument_provenance(client, auth_client, registered):
    body, headers = signed(registered.id, registered.secret, reading())
    snapshot_id = (await client.post(INGEST, content=body, headers=headers)).json()["snapshot_id"]
    viewer, engineer = await auth_client("viewer"), await auth_client("network_engineer")
    request = {"telemetry_snapshot_id": snapshot_id, "operator_consent": True}
    assert (await viewer.post("/api/v1/diagnostics/analyze", json=request)).status_code == 403
    other = await make_floor()
    conflicting = {**request, "floor_id": str(other.floor)}
    assert (await engineer.post("/api/v1/diagnostics/analyze", json=conflicting)).status_code == 422
    res = await engineer.post("/api/v1/diagnostics/analyze", json=request)
    assert res.status_code == 201, res.text
    report = res.json()
    assert report["data_provenance"] == "instrumented_linux_telemetry"
    assert report["vantage_point"] == "registered_collector"
    assert report["device_name"] == "Collector: Fixture collector"
    assert report["floor_id"] == str(registered.scope.floor)
    assert report["telemetry"]["id"] == snapshot_id
    assert (await engineer.post("/api/v1/diagnostics/analyze", json=request)).status_code == 409


@pytest.mark.asyncio
async def test_backend_collect_returns_server_owned_handle(auth_client, monkeypatch):
    from airgrid.core.config import settings
    monkeypatch.setattr(settings, "AIRGRID_COLLECTOR_ENABLED", True)
    monkeypatch.setattr(TelemetryCollector, "collect_wireless_telemetry", lambda self, iface=None: {
        "interface_name": "fixture0", "rssi_dbm": -70.0, "bssid": "02:00:00:00:00:02"})
    monkeypatch.setattr(TelemetryCollector, "discover_default_route", lambda self: (None, "fixture0"))
    engineer = await auth_client("network_engineer")
    snap = (await engineer.post("/api/v1/diagnostics/collect", json={"operator_consent": True})).json()
    assert snap["id"] and snap["report_id"] is None
    fetched = await engineer.get(f"/api/v1/diagnostics/snapshots/{snap['id']}")
    assert fetched.status_code == 200 and fetched.json()["rssi_dbm"] == -70.0
    report = (await engineer.post("/api/v1/diagnostics/analyze", json={
        "telemetry_snapshot_id": snap["id"], "operator_consent": True})).json()
    assert report["data_provenance"] == "instrumented_linux_telemetry"  # not downgraded by the round-trip


@pytest.mark.asyncio
async def test_failed_snapshot_cannot_be_analyzed(client, auth_client, registered):
    payload = {"schema_version": 1, "collected_at": datetime.now(timezone.utc).isoformat(),
               "collection_status": "failed", "error": "iw unavailable"}
    body, headers = signed(registered.id, registered.secret, payload)
    snapshot_id = (await client.post(INGEST, content=body, headers=headers)).json()["snapshot_id"]
    engineer = await auth_client("network_engineer")
    res = await engineer.post("/api/v1/diagnostics/analyze", json={"telemetry_snapshot_id": snapshot_id, "operator_consent": True})
    assert res.status_code == 422


# --- Trends ------------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_trends_use_persisted_records_and_flag_roams(client, auth_client, registered):
    for bssid, rssi in (("02:00:00:00:00:01", -60.0), ("02:00:00:00:00:02", -72.0)):
        body, headers = signed(registered.id, registered.secret, reading(bssid=bssid, rssi_dbm=rssi))
        assert (await client.post(INGEST, content=body, headers=headers)).status_code == 201
    viewer = await auth_client("viewer")
    res = await viewer.get(f"/api/v1/diagnostics/trends?collector_id={registered.id}&days=1")
    assert res.status_code == 200
    data = res.json()
    assert [p["rssi_dbm"] for p in data["series"]] == [-60.0, -72.0]
    assert data["transitions"][0]["kind"] == "roam"
    assert data["availability"]["rssi_dbm"] == 2 and data["availability"]["gateway_rtt_avg_ms"] == 2
    assert data["freshness"]["observation_age_seconds"] < 120
    assert all(p["data_provenance"] != "operator_reported" for p in data["series"])


def test_transition_and_merge_helpers():
    def row(state, bssid, status="collected", rssi=None):
        return SimpleNamespace(id=uuid.uuid4(), collector_id="c", vantage_point="v", collection_status=status,
                               connection_state=state, bssid=bssid, collected_at=datetime.now(timezone.utc),
                               rssi_dbm=rssi, rx_bitrate_mbps=None, tx_bitrate_mbps=None,
                               gateway_ping_avg_ms=None, gateway_ping_loss_pct=None)
    rows = [row("connected", "a"), row("connected", "b"), row("disconnected", None), row(None, None, "failed")]
    assert [t["kind"] for t in connection_transitions(rows)] == ["roam", "state_change", "state_change"]
    once = merge_metrics({}, [row("connected", "a", rssi=-60.0)])
    twice = merge_metrics(once, [row("connected", "a", rssi=-70.0)])
    assert twice["rssi_dbm"] == {"count": 2, "sum": -130.0, "min": -70.0, "max": -60.0}
    assert "rx_bitrate_mbps" not in twice  # missing values are not averaged in as zero


# --- Retention ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_retention_is_previewed_confirmed_and_protects_linked_rows(auth_client, admin):
    engineer = await auth_client("network_engineer")
    dataset = "/api/v1/retention/collector_telemetry"
    assert (await engineer.put(dataset, json={"retention_days": 30})).status_code == 403
    old = datetime.now(timezone.utc) - timedelta(days=400)
    async with AsyncSessionLocal() as s:
        report = NetworkDiagnosticReport(title="fixture", interface_name="fixture0", summary_headline="fixture")
        s.add(report)
        await s.flush()
        unlinked = NetworkTelemetrySnapshot(interface_name="fixture0", rssi_dbm=-80.0, collected_at=old,
                                            vantage_point="fixture_retention", data_provenance="instrumented_linux_telemetry")
        linked = NetworkTelemetrySnapshot(interface_name="fixture0", rssi_dbm=-81.0, collected_at=old, report_id=report.id,
                                          vantage_point="fixture_retention", data_provenance="instrumented_linux_telemetry")
        s.add_all([unlinked, linked])
        await s.commit()
        unlinked_id, linked_id = unlinked.id, linked.id
    try:
        assert (await admin.put(dataset, json={"retention_days": 30})).status_code == 200
        preview = (await admin.get(f"{dataset}/preview")).json()
        assert preview["enabled"] and preview["eligible_count"] >= 1 and preview["protected_count"] >= 1
        assert (await admin.post(f"{dataset}/apply", json={"confirm": False, "expected_count": preview["eligible_count"]})).status_code == 400
        assert (await admin.post(f"{dataset}/apply", json={"confirm": True, "expected_count": preview["eligible_count"] + 1})).status_code == 409
        applied = await admin.post(f"{dataset}/apply", json={"confirm": True, "expected_count": preview["eligible_count"]})
        assert applied.status_code == 200 and applied.json()["deleted"] == preview["eligible_count"]
        async with AsyncSessionLocal() as s:
            assert await s.get(NetworkTelemetrySnapshot, unlinked_id) is None
            assert await s.get(NetworkTelemetrySnapshot, linked_id) is not None
            agg = (await s.execute(select(TelemetryDailyAggregate).where(
                TelemetryDailyAggregate.vantage_point == "fixture_retention"))).scalars().all()
            assert agg and min(a.metrics["rssi_dbm"]["min"] for a in agg) <= -80.0
            assert (await s.execute(select(AuditLog).where(AuditLog.action == "retention.applied"))).scalars().first()
    finally:
        async with AsyncSessionLocal() as s:
            policy = await s.get(DataRetentionPolicy, "collector_telemetry")
            if policy:
                policy.retention_days = None
                await s.commit()


@pytest.mark.asyncio
async def test_retention_disabled_by_default_and_unknown_dataset(admin):
    assert (await admin.get("/api/v1/retention/not_a_dataset/preview")).status_code == 404
    policies = (await admin.get("/api/v1/retention")).json()
    assert {p["dataset"] for p in policies} >= {"collector_telemetry"}


# --- Collector agent payload mapping -----------------------------------------------------

def test_agent_build_submission_never_invents_values():
    import importlib.util
    from pathlib import Path
    path = Path(__file__).resolve().parents[3] / "packages" / "collector" / "airgrid_collector.py"
    spec = importlib.util.spec_from_file_location("airgrid_collector_agent", path)
    agent = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(agent)
    failed = agent.build_submission({"error": "No wireless network interface detected", "interface_name": "none"})
    assert failed["collection_status"] == "failed" and "rssi_dbm" not in failed
    partial = agent.build_submission({"interface_name": "wlx0", "ssid": None, "bssid": "not-a-mac"})
    assert partial["collection_status"] == "partial" and partial["connection_state"] == "disconnected"
    assert "bssid" not in partial and "rssi_dbm" not in partial
    full = agent.build_submission({"interface_name": "wlx0", "rssi_dbm": -55.0, "bssid": "02:00:00:00:00:01", "band": "5 GHz"})
    assert full["collection_status"] == "collected" and full["rssi_dbm"] == -55.0


# --- Instrument evidence placed on calibrated survey locations (Phase 05 integration) -------

async def calibrated_survey(scope, calibrated=True):
    from airgrid.models.all_models import FloorPlanAsset, SurveySession
    async with AsyncSessionLocal() as s:
        s.add(FloorPlanAsset(floor_id=scope.floor, file_path="data/test_plans/fixture.png", file_format="png",
                             pixel_width=1000, pixel_height=600, scale_pixels_per_meter=20.0, is_calibrated=calibrated))
        session = SurveySession(floor_id=scope.floor, building_id=scope.building, campus_id=scope.campus,
                                session_name="Fixture instrument walk")
        s.add(session)
        await s.commit()
        return session.id


@pytest.mark.asyncio
async def test_operator_places_collector_snapshot_as_instrument_point(client, auth_client, registered):
    survey_id = await calibrated_survey(registered.scope)
    body, headers = signed(registered.id, registered.secret, reading())
    snapshot_id = (await client.post(INGEST, content=body, headers=headers)).json()["snapshot_id"]
    engineer, viewer = await auth_client("network_engineer"), await auth_client("viewer")
    placeable = (await viewer.get(f"/api/v1/surveys/{survey_id}/placeable-snapshots")).json()
    assert snapshot_id in [p["id"] for p in placeable]
    url = f"/api/v1/surveys/{survey_id}/measurements/from-snapshot"
    placement = {"telemetry_snapshot_id": snapshot_id, "position_x": 250, "position_y": 300}
    assert (await viewer.post(url, json=placement)).status_code == 403
    res = await engineer.post(url, json=placement)
    assert res.status_code == 201, res.text
    point = res.json()
    assert point["data_provenance"] == "field_instrument_verified"
    assert point["measurement_source"] == "registered_collector"
    assert point["source_telemetry_snapshot_id"] == snapshot_id
    assert point["rssi_dbm"] == -61.0 and point["network_label"] == "Fixture-Net"
    assert point["normalized_x"] == 0.25 and point["normalized_y"] == 0.5

    assert (await engineer.post(url, json={**placement, "position_x": 10})).status_code == 409  # one snapshot, one point
    assert snapshot_id not in [p["id"] for p in (await viewer.get(f"/api/v1/surveys/{survey_id}/placeable-snapshots")).json()]
    manual = {"floor_id": str(registered.scope.floor), "position_x": 250, "position_y": 300, "rssi_dbm": -40,
              "network_label": "Fixture-Net"}
    assert (await engineer.post(f"/api/v1/surveys/{survey_id}/measurements", json=manual)).status_code == 409

    readiness = (await engineer.get(f"/api/v1/ml/readiness?floor_id={registered.scope.floor}&network_label=Fixture-Net")).json()
    assert readiness["summary"]["genuine_measurements"] == 1  # counted; manual entries never are

    # Retention must not delete a snapshot that backs a survey point.
    async with AsyncSessionLocal() as s:
        from airgrid.services.telemetry_history import _eligible_filter
        far_future = datetime.now(timezone.utc) + timedelta(days=1)
        ids = (await s.execute(select(NetworkTelemetrySnapshot.id).where(_eligible_filter(far_future)))).scalars().all()
        assert uuid.UUID(snapshot_id) not in ids


@pytest.mark.asyncio
async def test_placement_rejects_unsafe_evidence(client, auth_client, registered):
    engineer = await auth_client("network_engineer")
    survey_id = await calibrated_survey(registered.scope)
    url = f"/api/v1/surveys/{survey_id}/measurements/from-snapshot"

    async def stored(**fields):
        async with AsyncSessionLocal() as s:
            values = {"interface_name": "fixture0", "ssid": "Fixture-Net", "rssi_dbm": -66.0,
                      "vantage_point": "registered_collector", "data_provenance": "instrumented_linux_telemetry",
                      "collected_at": datetime.now(timezone.utc), **fields}
            snap = NetworkTelemetrySnapshot(**values)
            s.add(snap)
            await s.commit()
            return str(snap.id)

    other = await make_floor()
    cases = {
        "stale": await stored(collected_at=datetime.now(timezone.utc) - timedelta(minutes=30)),
        "other_floor": await stored(floor_id=other.floor),
        "operator_reported": await stored(data_provenance="operator_reported", vantage_point="operator_supplied"),
        "no_network": await stored(ssid=None),
        "failed": await stored(collection_status="failed", rssi_dbm=None),
    }
    for name, snapshot_id in cases.items():
        res = await engineer.post(url, json={"telemetry_snapshot_id": snapshot_id, "position_x": 100, "position_y": 100})
        assert res.status_code == 422, name

    uncalibrated_scope = await make_floor()
    uncalibrated = await calibrated_survey(uncalibrated_scope, calibrated=False)
    res = await engineer.post(f"/api/v1/surveys/{uncalibrated}/measurements/from-snapshot",
                              json={"telemetry_snapshot_id": await stored(), "position_x": 1, "position_y": 1})
    assert res.status_code == 422 and "calibrated" in res.json()["detail"]


@pytest.mark.asyncio
async def test_concurrent_snapshot_claim_loses_with_conflict(client, auth_client, registered, monkeypatch):
    from airgrid.services.diagnostic_service import diagnostic_service
    body, headers = signed(registered.id, registered.secret, reading())
    snapshot_id = uuid.UUID((await client.post(INGEST, content=body, headers=headers)).json()["snapshot_id"])
    original = diagnostic_service._load_unreported_snapshot

    async def racing_load(db, req):
        snapshot = await original(db, req)
        async with AsyncSessionLocal() as other:  # another request claims it after our check
            report = NetworkDiagnosticReport(title="concurrent", interface_name="fixture0", summary_headline="x")
            other.add(report)
            await other.flush()
            (await other.get(NetworkTelemetrySnapshot, snapshot_id)).report_id = report.id
            await other.commit()
        return snapshot

    monkeypatch.setattr(diagnostic_service, "_load_unreported_snapshot", racing_load)
    engineer = await auth_client("network_engineer")
    res = await engineer.post("/api/v1/diagnostics/analyze", json={"telemetry_snapshot_id": str(snapshot_id), "operator_consent": True})
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_failed_signatures_do_not_consume_collector_quota(client, admin, registered, monkeypatch):
    monkeypatch.setattr(collector_service, "ingest_limiter", LoginRateLimiter(max_attempts=1, window_seconds=60))
    monkeypatch.setattr(collector_service, "failure_limiter", LoginRateLimiter(max_attempts=2, window_seconds=60))
    codes = []
    for _ in range(3):
        body, headers = signed(registered.id, "f" * 64, reading())
        codes.append((await client.post(INGEST, content=body, headers=headers)).status_code)
    assert codes == [401, 401, 429]  # flood gate trips before any DB access
    # Replays/revocations by key holders (403/409) never count; other addresses are unaffected.
    other = (await admin.post("/api/v1/collectors", json={"name": "Remote collector"})).json()
    transport = ASGITransport(app=app, client=("198.51.100.20", 40000))
    async with AsyncClient(transport=transport, base_url="https://testserver") as remote:
        body, headers = signed(other["collector"]["id"], other["secret"], reading())
        assert (await remote.post(INGEST, content=body, headers=headers)).status_code == 201
    async with AsyncSessionLocal() as s:
        collector = await s.get(NetworkCollector, uuid.UUID(registered.id))
        # Unauthenticated attempts bump the visible counter but never overwrite the last real status.
        assert collector.rejected_count == 2 and collector.last_submission_status is None


@pytest.mark.asyncio
async def test_failed_attempts_do_not_spend_accepted_quota(client, registered, monkeypatch):
    monkeypatch.setattr(collector_service, "ingest_limiter", LoginRateLimiter(max_attempts=1, window_seconds=60))
    monkeypatch.setattr(collector_service, "failure_limiter", LoginRateLimiter(max_attempts=50, window_seconds=60))
    for _ in range(3):
        body, headers = signed(registered.id, "e" * 64, reading())
        assert (await client.post(INGEST, content=body, headers=headers)).status_code == 401
    body, headers = signed(registered.id, registered.secret, reading())
    assert (await client.post(INGEST, content=body, headers=headers)).status_code == 201


def test_default_secret_key_fails_closed_outside_testing(monkeypatch):
    from fastapi import HTTPException
    from airgrid.core.config import Settings, settings
    monkeypatch.setattr(settings, "AIRGRID_ENV", "production")
    monkeypatch.setattr(settings, "AIRGRID_SECRET_KEY", Settings.model_fields["AIRGRID_SECRET_KEY"].default)
    with pytest.raises(HTTPException) as exc:
        collector_service.derive_secret(uuid.uuid4(), "salt")
    assert exc.value.status_code == 503
    monkeypatch.setattr(settings, "AIRGRID_SECRET_KEY", "short")
    with pytest.raises(HTTPException):
        collector_service.derive_secret(uuid.uuid4(), "salt")
    monkeypatch.setattr(settings, "AIRGRID_SECRET_KEY", "x" * 48)
    assert len(collector_service.derive_secret(uuid.uuid4(), "salt")) == 64
