"""Authorization regression tests: cross-campus isolation and owner-only access for campus-less records.

All data is synthetic. Two isolated campuses (A, B) plus an unassigned viewer and an administrator.
Rule under test: when ownership cannot be established the request is denied; administrators keep access.
"""
import uuid
from datetime import datetime, timezone

import pytest

from airgrid.core.database import AsyncSessionLocal
from airgrid.core.security import hash_password
from airgrid.models.all_models import (
    AnalysisRecord, AuditLog, Building, Campus, CampusMembership, Floor, InternetSpeedTest, MLModel,
    NetworkCollector, NetworkDiagnosticReport, NetworkTelemetrySnapshot, SurveySession, User,
)

PW = "AuthzPass2026!"
NOW = lambda: datetime.now(timezone.utc)  # noqa: E731


def _user(tag, role):
    return User(id=uuid.uuid4(), email=f"{tag}-{uuid.uuid4().hex[:6]}@airgrid.test", hashed_password=hash_password(PW),
                full_name=tag, role=role, is_active=True)


def _report(title, campus_id, user_id):
    return NetworkDiagnosticReport(id=uuid.uuid4(), title=title, campus_id=campus_id, user_id=user_id, interface_name="wlan0",
                                   summary_headline="synthetic", overall_score=50, findings_count=0, critical_count=0,
                                   warning_count=0, good_count=0, status="completed", vantage_point="client", data_provenance="MEASURED")


def _snap(campus_id, user_id, rssi):
    return NetworkTelemetrySnapshot(id=uuid.uuid4(), campus_id=campus_id, user_id=user_id, interface_name="wlan0", rssi_dbm=rssi,
                                    vantage_point="client", data_provenance="MEASURED", raw_details={}, collected_at=NOW(),
                                    collection_status="completed")


def _speed(campus_id, user_id, down):
    return InternetSpeedTest(id=uuid.uuid4(), campus_id=campus_id, user_id=user_id, vantage_point="browser", provider_engine="cloudflare",
                             status="completed", data_provenance="MEASURED", download_mbps=down, upload_mbps=1.0, latency_ms=10.0,
                             jitter_ms=1.0, executed_at=NOW())


@pytest.fixture
async def world():
    async with AsyncSessionLocal() as s:
        ca = Campus(id=uuid.uuid4(), name=f"Authz A {uuid.uuid4().hex[:5]}", code=f"AZA-{uuid.uuid4().hex[:5]}", status="active")
        cb = Campus(id=uuid.uuid4(), name=f"Authz B {uuid.uuid4().hex[:5]}", code=f"AZB-{uuid.uuid4().hex[:5]}", status="active")
        alpha, beta, gamma, admin = _user("alpha", "network_engineer"), _user("beta", "network_engineer"), _user("gamma", "viewer"), _user("admin", "administrator")
        s.add_all([ca, cb, alpha, beta, gamma, admin])
        await s.flush()
        s.add_all([CampusMembership(campus_id=ca.id, user_id=alpha.id), CampusMembership(campus_id=cb.id, user_id=beta.id)])
        bld = Building(id=uuid.uuid4(), campus_id=cb.id, name="Beta Hall", building_code=f"BH-{uuid.uuid4().hex[:4]}", status="active", floors_count=1)
        s.add(bld)
        await s.flush()
        floor_b = Floor(id=uuid.uuid4(), building_id=bld.id, floor_number=1, name="L1", status="active", dimensions_width_m=40.0, dimensions_height_m=30.0)
        s.add(floor_b)
        await s.flush()
        sb1 = SurveySession(id=uuid.uuid4(), campus_id=cb.id, floor_id=floor_b.id, session_name="B-one", started_at=NOW(), status="completed")
        sb2 = SurveySession(id=uuid.uuid4(), campus_id=cb.id, floor_id=floor_b.id, session_name="B-two", started_at=NOW(), status="completed")
        model_b = MLModel(id=uuid.uuid4(), floor_id=floor_b.id, network_label="SYN", model_name="synthetic-b", model_version="1",
                          algorithm="random_forest", artifact_path="synthetic/none.joblib")
        coll_b = NetworkCollector(id=uuid.uuid4(), name="syn-coll-b", campus_id=cb.id, secret_salt="x" * 16)
        coll_null = NetworkCollector(id=uuid.uuid4(), name="syn-coll-null", campus_id=None, secret_salt="y" * 16)
        rep_null, rep_b = _report("Null-campus owned by alpha", None, alpha.id), _report("Campus B report", cb.id, beta.id)
        snap_null, snap_b = _snap(None, alpha.id, -61.0), _snap(cb.id, beta.id, -83.0)
        st_null, st_b, st_a = _speed(None, alpha.id, 31.0), _speed(cb.id, beta.id, 77.7), _speed(ca.id, alpha.id, 55.5)
        rec_alpha = AnalysisRecord(id=uuid.uuid4(), kind="question", question="alpha q", scope={}, evidence_refs=[], freshness={}, mode="deterministic",
                                   outcome="answered", result={}, user_id=alpha.id)
        rec_beta = AnalysisRecord(id=uuid.uuid4(), kind="question", question="beta q", scope={}, evidence_refs=[], freshness={}, mode="deterministic",
                                  outcome="answered", result={}, user_id=beta.id)
        s.add_all([sb1, sb2, model_b, coll_b, coll_null, rep_null, rep_b, snap_null, snap_b, st_null, st_b, st_a, rec_alpha, rec_beta])
        await s.commit()
    return dict(alpha=alpha, beta=beta, gamma=gamma, admin=admin, ca=ca, cb=cb, floor_b=floor_b, sb1=sb1, sb2=sb2, model_b=model_b,
                coll_b=coll_b, coll_null=coll_null, rep_null=rep_null, rep_b=rep_b, snap_null=snap_null, snap_b=snap_b,
                st_null=st_null, st_b=st_b, st_a=st_a, rec_alpha=rec_alpha, rec_beta=rec_beta)


async def login(client, user):
    r = await client.post("/api/v1/auth/login", json={"email": user.email, "password": PW})
    assert r.status_code == 200, r.text
    return {"X-CSRF-Token": r.json()["csrf_token"], "Cookie": f"airgrid_session={r.cookies['airgrid_session']}"}


@pytest.mark.asyncio
async def test_diagnostics_campusless_records_are_owner_only(client, world):
    w = world
    ha, hb, hadm = await login(client, w["alpha"]), await login(client, w["beta"]), await login(client, w["admin"])
    rep, snap = f"/api/v1/diagnostics/reports/{w['rep_null'].id}", f"/api/v1/diagnostics/snapshots/{w['snap_null'].id}"
    assert (await client.get(rep, headers=ha)).status_code == 200            # owner
    assert (await client.get(snap, headers=ha)).status_code == 200
    for url in (rep, snap):
        r = await client.get(url, headers=hb)                                # other user, other campus
        assert r.status_code == 403 and "Null-campus" not in r.text
    assert (await client.delete(rep, headers=hb)).status_code == 403
    assert (await client.get(rep, headers=hadm)).status_code == 200          # admin keeps access
    assert (await client.get(f"/api/v1/diagnostics/reports/{w['rep_b'].id}", headers=ha)).status_code == 403
    assert (await client.delete(rep, headers=ha)).status_code == 200         # owner may delete
    async with AsyncSessionLocal() as s:
        assert await s.get(NetworkDiagnosticReport, w["rep_b"].id) is not None


@pytest.mark.asyncio
async def test_survey_compare_requires_access_to_both_sessions(client, world):
    w = world
    ha, hb, hadm = await login(client, w["alpha"]), await login(client, w["beta"]), await login(client, w["admin"])
    url = f"/api/v1/surveys/compare?session1={w['sb1'].id}&session2={w['sb2'].id}"
    r = await client.get(url, headers=ha)
    assert r.status_code == 403 and "B-one" not in r.text
    assert (await client.get(url, headers=hb)).status_code == 200
    assert (await client.get(url, headers=hadm)).status_code == 200


@pytest.mark.asyncio
async def test_ml_model_endpoints_enforce_floor_campus_access(client, world):
    w = world
    ha, hb, hadm = await login(client, w["alpha"]), await login(client, w["beta"]), await login(client, w["admin"])
    mid = w["model_b"].id
    assert (await client.get(f"/api/v1/ml/models/{mid}/prediction-map", headers=ha)).status_code == 403
    assert (await client.post(f"/api/v1/ml/models/{mid}/champion", headers=ha)).status_code == 403
    assert (await client.delete(f"/api/v1/ml/models/{mid}", headers=ha)).status_code == 403
    async with AsyncSessionLocal() as s:  # nothing changed by the denied calls
        m = await s.get(MLModel, mid)
        assert m is not None and m.is_current_champion is False
    assert (await client.get(f"/api/v1/ml/models/{mid}/prediction-map", headers=hb)).status_code != 403
    # model listing without a floor filter must not leak other campuses' models
    assert str(mid) not in (await client.get("/api/v1/ml/models", headers=ha)).text
    assert str(mid) in (await client.get("/api/v1/ml/models", headers=hb)).text
    assert str(mid) in (await client.get("/api/v1/ml/models", headers=hadm)).text
    assert (await client.post(f"/api/v1/ml/models/{mid}/champion", headers=hb)).status_code == 200
    assert (await client.delete(f"/api/v1/ml/models/{mid}", headers=hb)).status_code == 204


@pytest.mark.asyncio
async def test_analysis_history_is_owner_scoped(client, world):
    w = world
    ha, hadm = await login(client, w["alpha"]), await login(client, w["admin"])
    listing = (await client.get("/api/v1/analyst/history", headers=ha)).text
    assert str(w["rec_alpha"].id) in listing and str(w["rec_beta"].id) not in listing
    other = await client.get(f"/api/v1/analyst/history/{w['rec_beta'].id}", headers=ha)
    assert other.status_code == 404 and "beta q" not in other.text
    assert (await client.get(f"/api/v1/analyst/history/{w['rec_alpha'].id}", headers=ha)).status_code == 200
    adm = (await client.get("/api/v1/analyst/history?limit=200", headers=hadm)).text
    assert str(w["rec_alpha"].id) in adm and str(w["rec_beta"].id) in adm


@pytest.mark.asyncio
async def test_analyst_evidence_is_campus_scoped(client, world):
    w = world
    ha = await login(client, w["alpha"])
    ask = lambda body: client.post("/api/v1/analyst/ask", json=body, headers=ha)  # noqa: E731
    assert (await ask({"question": "why is the signal weak", "floor_id": str(w["floor_b"].id)})).status_code == 403
    assert (await client.post("/api/v1/analyst/analyze", json={"report_id": str(w["rep_b"].id)}, headers=ha)).status_code in (403, 404)
    r = await ask({"question": "why is the signal weak", "days": 30})                      # no floor: scope = alpha's campuses only
    assert r.status_code == 200 and str(w["snap_b"].id) not in r.text
    r = await client.post("/api/v1/analyst/compare", headers=ha, json={
        "metric": "rssi_dbm", "earlier_start": "2020-01-01T00:00:00Z", "earlier_end": "2020-01-02T00:00:00Z",
        "later_start": "2020-01-02T00:00:00Z", "later_end": "2099-01-01T00:00:00Z"})
    assert r.status_code == 200 and str(w["snap_b"].id) not in r.text
    assert (await ask({"question": "why is the signal weak", "collector_id": str(w["coll_b"].id)})).status_code == 403


@pytest.mark.asyncio
async def test_collector_observations_deny_unestablished_or_foreign_campus(client, world):
    w = world
    ha, hb, hadm = await login(client, w["alpha"]), await login(client, w["beta"]), await login(client, w["admin"])
    assert (await client.get(f"/api/v1/collectors/{w['coll_b'].id}/observations", headers=ha)).status_code == 403
    assert (await client.get(f"/api/v1/collectors/{w['coll_null'].id}/observations", headers=ha)).status_code == 403
    assert (await client.get(f"/api/v1/collectors/{w['coll_null'].id}/observations", headers=hadm)).status_code == 200
    assert (await client.get(f"/api/v1/collectors/{w['coll_b'].id}/observations", headers=hb)).status_code == 200


@pytest.mark.asyncio
async def test_speed_tests_are_scoped_to_campus_or_owner(client, world):
    w = world
    ha, hb, hadm = await login(client, w["alpha"]), await login(client, w["beta"]), await login(client, w["admin"])
    assert (await client.get(f"/api/v1/speed-tests/{w['st_b'].id}", headers=ha)).status_code == 403
    assert (await client.get(f"/api/v1/speed-tests/{w['st_a'].id}", headers=ha)).status_code == 200
    assert (await client.get(f"/api/v1/speed-tests/{w['st_null'].id}", headers=ha)).status_code == 200   # owner of campus-less test
    assert (await client.get(f"/api/v1/speed-tests/{w['st_null'].id}", headers=hb)).status_code == 403
    assert (await client.get(f"/api/v1/speed-tests/{w['st_b'].id}", headers=hadm)).status_code == 200
    listing = (await client.get("/api/v1/speed-tests?limit=100", headers=ha)).text
    assert str(w["st_a"].id) in listing and str(w["st_null"].id) in listing and str(w["st_b"].id) not in listing
    assert str(w["st_null"].id) not in (await client.get("/api/v1/speed-tests?limit=100", headers=hb)).text
    stats = (await client.get("/api/v1/speed-tests/stats/summary", headers=ha)).text
    assert "77.7" not in stats


@pytest.mark.asyncio
async def test_dashboard_is_campus_and_owner_scoped(client, world):
    w = world
    mark_a, mark_b = f"authz.mark.{uuid.uuid4().hex[:8]}", f"authz.mark.{uuid.uuid4().hex[:8]}"
    async with AsyncSessionLocal() as s:
        s.add_all([AuditLog(actor_id=w["alpha"].id, action=mark_a, resource_type="synthetic", payload={}),
                   AuditLog(actor_id=w["beta"].id, action=mark_b, resource_type="synthetic", payload={})])
        await s.commit()
    ha, hg, hadm = await login(client, w["alpha"]), await login(client, w["gamma"]), await login(client, w["admin"])
    # inventory lists only the caller's campuses
    inv = (await client.get("/api/v1/dashboard/inventory", headers=ha)).text
    sees_own, sees_foreign = w["ca"].name in inv, w["cb"].name in inv
    assert sees_own and not sees_foreign, "inventory must list only member campuses"
    assert (await client.get("/api/v1/dashboard/inventory", headers=hg)).json()["total"] == 0
    admin_inv = (await client.get("/api/v1/dashboard/inventory", headers=hadm)).text
    assert bool(w["cb"].name in admin_inv), "administrator sees every campus"
    # summary: explicit foreign campus is denied; aggregate covers only member campuses
    assert (await client.get(f"/api/v1/dashboard/summary?campus_id={w['cb'].id}", headers=ha)).status_code == 403
    assert (await client.get("/api/v1/dashboard/summary", headers=ha)).json()["total_campuses"] == 1
    assert (await client.get("/api/v1/dashboard/summary", headers=hg)).json()["total_campuses"] == 0
    assert (await client.get("/api/v1/dashboard/summary", headers=hadm)).json()["total_campuses"] >= 2
    # activity: users see only their own audit events; administrators see all
    feed_a = (await client.get("/api/v1/dashboard/activity?limit=100", headers=ha)).text
    own_seen, foreign_seen = mark_a in feed_a, mark_b in feed_a
    assert own_seen and not foreign_seen, "activity must be limited to the caller's own events"
    feed_g = (await client.get("/api/v1/dashboard/activity?limit=100", headers=hg)).text
    assert not bool(mark_a in feed_g)
    feed_adm = (await client.get("/api/v1/dashboard/activity?limit=100", headers=hadm)).text
    both = (mark_a in feed_adm, mark_b in feed_adm)
    assert both == (True, True)
