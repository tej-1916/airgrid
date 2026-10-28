"""Grounded questions, comparisons, gateway grounding checks and Analyst history (isolated fixtures only)."""
import json
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from airgrid.core.database import AsyncSessionLocal
from airgrid.models.all_models import (
    AnalysisRecord, Building, Campus, DataRetentionPolicy, Floor, MLEvaluation, MLModel, NetworkTelemetrySnapshot,
)
from airgrid.services.analyst_evidence import (
    GatewayAnswer, classify, compare_groups, compare_sessions, grounded, persistence,
)

NOW = datetime.now(timezone.utc)


# --- Pure logic ------------------------------------------------------------------------------

@pytest.mark.parametrize("question,intent", [
    ("Why does this Wi-Fi connection appear weak?", "weak_signal"),
    ("Did our connection improve compared with yesterday?", "improvement"),
    ("Is latency changing?", "latency"),
    ("Where do we need additional measurements?", "measurement_gaps"),
    ("What do these survey results mean?", "survey"),
    ("Does the ML model outperform IDW?", "ml_vs_idw"),
    ("What is the capital of France?", None),
])
def test_classify_supported_questions(question, intent):
    assert classify(question) == intent


def test_compare_groups_requires_samples_and_thresholds():
    assert compare_groups([-70, -71], [-60, -61, -62], "rssi_dbm")["status"] == "insufficient"
    assert compare_groups([-70, -71, -72], [-69, -70, -71], "rssi_dbm")["status"] == "no_clear_change"
    changed = compare_groups([-80, -80, -81], [-65, -66, -64], "rssi_dbm")
    assert changed["status"] == "changed" and changed["delta"] == 15
    assert compare_groups([100, 100, 100], [110, 110, 110], "download_mbps")["status"] == "no_clear_change"  # < 20 %


def test_persistence_classes():
    day1, day2 = NOW - timedelta(days=1), NOW
    assert persistence([])["class"] == "no_data"
    assert persistence([(day1, -60.0)] * 5)["class"] == "none_observed"
    assert persistence([(day1, -80.0)] * 3 + [(day2, -80.0)] * 3)["class"] == "persistent"
    assert persistence([(day2, -80.0)] * 6)["class"] == "intermittent_or_insufficient"  # one day only
    assert persistence([(day1, -80.0)] + [(day2, -60.0)] * 9)["class"] == "transient"


def test_gateway_grounding_rejects_unknown_ids_and_invented_numbers():
    local = {"answer": "Latest RSSI -78 dBm; 80% of 5 samples weak.",
             "citations": [{"source_id": "snapshot:a", "value": -78.0}, {"source_id": "snapshot:b", "value": -77.0}]}
    ok = GatewayAnswer(answer="Signal was -78 dBm and 80% of 5 samples were weak.", citations=["snapshot:a"])
    assert grounded(ok, local, "why weak?")
    assert not grounded(GatewayAnswer(answer="Signal was -78 dBm.", citations=["snapshot:zzz"]), local, "q")
    assert not grounded(GatewayAnswer(answer="Adding an AP gains 12 dB.", citations=["snapshot:a"]), local, "q")
    assert not grounded(GatewayAnswer(answer="ok", citations=["snapshot:a", "snapshot:a"]), local, "q")


def _point(session, x, y, rssi, provenance="field_instrument_verified", source="registered_collector"):
    return SimpleNamespace(id=uuid.uuid4(), survey_session_id=session.id, network_label="Fixture", data_provenance=provenance,
                           measurement_source=source, observed_at=NOW, rssi_dbm=rssi, normalized_x=x, normalized_y=y)


def test_session_comparison_pairs_cells_and_flags_method_changes():
    floor = uuid.uuid4()
    before = SimpleNamespace(id=uuid.uuid4(), floor_id=floor, session_name="before")
    after = SimpleNamespace(id=uuid.uuid4(), floor_id=floor, session_name="after")
    a = [_point(before, x, .1, -80) for x in (.05, .3, .6)] + [_point(before, .9, .9, -70)]
    b = [_point(after, x, .1, -70, provenance="operator_reported", source="manual_observation") for x in (.05, .3, .6)]
    result = compare_sessions(before, after, a, b, "Fixture")
    assert result["kind"] == "observed" and result["paired_cells"] == 3
    assert result["improved_cells"] == 3 and result["median_cell_delta_db"] == 10
    assert result["cells_only_before"] == 1
    assert any("different measurement methods" in c for c in result["caveats"])
    elsewhere = SimpleNamespace(id=uuid.uuid4(), floor_id=uuid.uuid4(), session_name="other floor")
    with pytest.raises(HTTPException):
        compare_sessions(before, elsewhere, a, b, "Fixture")
    # Network identity is case-sensitive: nothing qualifies for another label.
    assert compare_sessions(before, after, a, b, "fixture")["paired_cells"] == 0


# --- Endpoints ----------------------------------------------------------------------------------

async def scoped_floor():
    async with AsyncSessionLocal() as s:
        campus = Campus(name="Analyst Fixture", code=f"AN-{uuid.uuid4().hex[:8]}")
        s.add(campus)
        await s.flush()
        building = Building(campus_id=campus.id, name="Analyst Hall", building_code="AH")
        s.add(building)
        await s.flush()
        floor = Floor(building_id=building.id, floor_number=2, name="Analyst floor")
        s.add(floor)
        await s.commit()
        return floor.id


async def add_snapshots(floor_id, rows):
    async with AsyncSessionLocal() as s:
        for collected_at, rssi in rows:
            s.add(NetworkTelemetrySnapshot(floor_id=floor_id, interface_name="fixture0", ssid="Private-SSID-Name",
                                           bssid="02:00:00:00:00:aa", rssi_dbm=rssi, band="2.4 GHz", collected_at=collected_at,
                                           vantage_point="backend_server", data_provenance="instrumented_linux_telemetry"))
        await s.commit()


@pytest.mark.asyncio
async def test_weak_signal_answer_cites_records_and_is_saved(auth_client):
    floor = await scoped_floor()
    await add_snapshots(floor, [(NOW - timedelta(days=1, hours=i), -80.0) for i in range(3)] +
                        [(NOW - timedelta(hours=i + 1), -79.0) for i in range(3)])
    engineer, viewer = await auth_client("network_engineer"), await auth_client("viewer")
    body = {"question": "Why does this Wi-Fi connection appear weak?", "floor_id": str(floor)}
    assert (await viewer.post("/api/v1/analyst/ask", json=body)).status_code == 403
    res = await engineer.post("/api/v1/analyst/ask", json=body)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["intent"] == "weak_signal" and data["outcome"] == "answered" and data["mode"] == "deterministic"
    assert data["details"]["persistence"]["class"] == "persistent"
    assert len(data["citations"]) == 6 and all(c["source_id"].startswith("snapshot:") for c in data["citations"])
    assert any("cause cannot be established" in m for m in data["missing_evidence"])
    record = (await viewer.get(f"/api/v1/analyst/history/{data['history_id']}")).json()
    assert record["kind"] == "question" and record["evidence_count"] == 6
    assert record["freshness"]["newest"] and record["operator"] == engineer.user.email


@pytest.mark.asyncio
async def test_improvement_answer_compares_same_source_windows(auth_client):
    floor = await scoped_floor()
    await add_snapshots(floor, [(NOW - timedelta(hours=30 + i), -80.0) for i in range(3)] +
                        [(NOW - timedelta(hours=2 + i), -65.0) for i in range(3)])
    engineer = await auth_client("network_engineer")
    data = (await engineer.post("/api/v1/analyst/ask", json={
        "question": "Did our connection improve compared with yesterday?", "floor_id": str(floor)})).json()
    rssi = next(c for c in data["details"]["comparisons"] if c["metric"] == "rssi_dbm")
    assert rssi["status"] == "changed" and rssi["delta"] == 15 and rssi["source"] == "vantage:backend_server"


@pytest.mark.asyncio
async def test_missing_evidence_and_unsupported_questions(auth_client):
    floor = await scoped_floor()
    engineer = await auth_client("network_engineer")
    empty = (await engineer.post("/api/v1/analyst/ask", json={"question": "Is latency changing?", "floor_id": str(floor)})).json()
    assert empty["outcome"] == "insufficient_evidence" and empty["citations"] == [] and empty["missing_evidence"]
    off_topic = (await engineer.post("/api/v1/analyst/ask", json={"question": "What is the capital of France?"})).json()
    assert off_topic["intent"] is None and "AirGrid answers questions about" in off_topic["missing_evidence"][0]
    gaps = (await engineer.post("/api/v1/analyst/ask", json={"question": "Where do we need more measurements?"})).json()
    assert "Select a floor" in gaps["missing_evidence"][0]


@pytest.mark.asyncio
async def test_ml_vs_idw_answer_reports_small_evaluations_honestly(auth_client):
    floor = await scoped_floor()
    async with AsyncSessionLocal() as s:
        model = MLModel(floor_id=floor, network_label="Fixture", model_name="Fixture KNN", model_version="v1",
                        algorithm="k_neighbors", artifact_path="data/models/none.joblib", is_current_champion=True)
        s.add(model)
        await s.flush()
        s.add(MLEvaluation(model_id=model.id, mae_db=3.1, rmse_db=4.2, baseline_mean_mae_db=6.0, baseline_mean_rmse_db=7.0,
                           baseline_idw_mae_db=3.5, baseline_idw_rmse_db=4.8, evaluation_sample_count=12,
                           spatial_coverage_pct=40.0, validation_method="session_holdout"))
        await s.commit()
    engineer = await auth_client("network_engineer")
    data = (await engineer.post("/api/v1/analyst/ask", json={"question": "Does the ML model outperform IDW?",
                                                             "floor_id": str(floor), "network_label": "Fixture"})).json()
    assert "4.20 dB vs IDW 4.80 dB on 12" in data["answer"]
    assert any("does not establish" in m for m in data["missing_evidence"])


@pytest.mark.asyncio
async def test_gateway_requires_consent_and_ungrounded_output_falls_back(auth_client, monkeypatch):
    floor = await scoped_floor()
    await add_snapshots(floor, [(NOW - timedelta(hours=1), -82.0)])
    engineer = await auth_client("network_engineer")
    body = {"question": "Why is the signal weak?", "floor_id": str(floor), "use_gateway": True}
    generate = AsyncMock(return_value=SimpleNamespace(status="success", verified_model="fixture-model",
                                                      output_text=json.dumps({"answer": "Move the AP 3 m to gain 9 dB.",
                                                                              "citations": ["snapshot:unknown"]})))
    monkeypatch.setattr("airgrid.services.analyst_evidence.ai_gateway.generate", generate)
    assert (await engineer.post("/api/v1/analyst/ask", json=body)).status_code == 400
    generate.assert_not_called()

    data = (await engineer.post("/api/v1/analyst/ask", json={**body, "allow_external": True})).json()
    assert data["gateway_status"] == "rejected_ungrounded" and data["mode"] == "deterministic"
    assert data["answer"] == data["local_answer"]
    prompt = generate.call_args.args[0].prompt
    assert "Private-SSID-Name" not in prompt and "02:00:00:00:00:aa" not in prompt

    cited = data["citations"][0]["source_id"]
    generate.return_value = SimpleNamespace(status="success", verified_model="fixture-model",
                                            output_text=json.dumps({"answer": "The newest sample was -82 dBm.", "citations": [cited]}))
    good = (await engineer.post("/api/v1/analyst/ask", json={**body, "allow_external": True})).json()
    assert good["mode"] == "gateway_assisted" and good["provider_reported_model"] == "fixture-model"
    record = (await engineer.get(f"/api/v1/analyst/history/{good['history_id']}")).json()
    assert record["model_identity"] == "fixture-model" and record["mode"] == "gateway_assisted"


@pytest.mark.asyncio
async def test_unconfigured_gateway_never_fabricates_success(auth_client):
    floor = await scoped_floor()
    await add_snapshots(floor, [(NOW - timedelta(hours=1), -82.0)])
    engineer = await auth_client("network_engineer")
    data = (await engineer.post("/api/v1/analyst/ask", json={"question": "Why is the signal weak?", "floor_id": str(floor),
                                                             "use_gateway": True, "allow_external": True})).json()
    assert data["gateway_status"] == "unconfigured" and data["mode"] == "deterministic" and data["provider_reported_model"] is None


@pytest.mark.asyncio
async def test_preview_shows_payload_without_sending_or_saving(auth_client, monkeypatch):
    floor = await scoped_floor()
    await add_snapshots(floor, [(NOW - timedelta(hours=1), -70.0)])
    generate = AsyncMock()
    monkeypatch.setattr("airgrid.services.analyst_evidence.ai_gateway.generate", generate)
    engineer = await auth_client("network_engineer")
    async with AsyncSessionLocal() as s:
        before = (await s.execute(select(func.count(AnalysisRecord.id)))).scalar_one()
    res = (await engineer.post("/api/v1/analyst/ask/preview", json={"question": "Why is the signal weak?", "floor_id": str(floor)})).json()
    assert res["would_send"] and "Private-SSID-Name" not in res["prompt"] and res["evidence_count"] == 1
    generate.assert_not_called()
    async with AsyncSessionLocal() as s:
        assert (await s.execute(select(func.count(AnalysisRecord.id)))).scalar_one() == before


@pytest.mark.asyncio
async def test_compare_endpoint_validates_windows_and_metric(auth_client):
    floor = await scoped_floor()
    await add_snapshots(floor, [(NOW - timedelta(hours=10 + i), -70.0) for i in range(3)] +
                        [(NOW - timedelta(hours=1 + i / 10), -60.0) for i in range(3)])
    engineer = await auth_client("network_engineer")
    windows = {"earlier_start": (NOW - timedelta(hours=20)).isoformat(), "earlier_end": (NOW - timedelta(hours=5)).isoformat(),
               "later_start": (NOW - timedelta(hours=5)).isoformat(), "later_end": NOW.isoformat()}
    ok = (await engineer.post("/api/v1/analyst/compare", json={"metric": "rssi_dbm", "floor_id": str(floor), **windows})).json()
    assert ok["comparisons"][0]["delta"] == 10 and ok["history_id"]
    assert (await engineer.post("/api/v1/analyst/compare", json={"metric": "made_up", **windows})).status_code == 422
    swapped = {**windows, "earlier_start": windows["later_start"], "later_start": windows["earlier_start"]}
    assert (await engineer.post("/api/v1/analyst/compare", json={"metric": "rssi_dbm", **swapped})).status_code == 422


@pytest.mark.asyncio
async def test_history_delete_is_admin_only_and_retention_covers_history(auth_client):
    engineer, admin = await auth_client("network_engineer"), await auth_client("administrator")
    record_id = (await engineer.post("/api/v1/analyst/ask", json={"question": "Is latency changing?"})).json()["history_id"]
    assert (await engineer.delete(f"/api/v1/analyst/history/{record_id}")).status_code == 403
    assert (await admin.delete(f"/api/v1/analyst/history/{record_id}")).status_code == 200
    assert (await admin.get(f"/api/v1/analyst/history/{record_id}")).status_code == 404

    async with AsyncSessionLocal() as s:
        old = AnalysisRecord(kind="question", mode="deterministic", outcome="answered", scope={}, evidence_refs=[],
                             freshness={}, result={}, created_at=NOW - timedelta(days=400))
        s.add(old)
        await s.commit()
        old_id = old.id
    dataset = "/api/v1/retention/analysis_records"
    try:
        assert (await admin.put(dataset, json={"retention_days": 365})).status_code == 200
        preview = (await admin.get(f"{dataset}/preview")).json()
        assert preview["eligible_count"] >= 1
        applied = (await admin.post(f"{dataset}/apply", json={"confirm": True, "expected_count": preview["eligible_count"]})).json()
        assert applied["deleted"] == preview["eligible_count"]
        async with AsyncSessionLocal() as s:
            assert await s.get(AnalysisRecord, old_id) is None
    finally:
        async with AsyncSessionLocal() as s:
            policy = await s.get(DataRetentionPolicy, "analysis_records")
            if policy:
                policy.retention_days = None
                await s.commit()


@pytest.mark.asyncio
async def test_report_analysis_is_recorded(auth_client, monkeypatch):
    from airgrid.schemas.diagnostics import DiagnosticReportResponse, TelemetrySnapshotResponse
    report_id = uuid.uuid4()
    report = DiagnosticReportResponse(
        id=report_id, title="fixture", device_name="fixture", interface_name="fixture0", vantage_point="backend_server",
        data_provenance="instrumented_linux_telemetry", status="analyzed", summary_headline="x", overall_score=90,
        findings_count=0, critical_count=0, warning_count=0, good_count=0, created_at=NOW, updated_at=NOW,
        telemetry=TelemetrySnapshotResponse(interface_name="fixture0", rssi_dbm=-60.0))
    monkeypatch.setattr("airgrid.services.analyst_service.diagnostic_service.get_report_by_id", AsyncMock(return_value=report))
    engineer = await auth_client("network_engineer")
    data = (await engineer.post("/api/v1/analyst/analyze", json={"report_id": str(report_id)})).json()
    record = (await engineer.get(f"/api/v1/analyst/history/{data['history_id']}")).json()
    assert record["kind"] == "report_analysis" and record["scope"]["report_id"] == str(report_id)
    assert record["evidence_refs"] == [e["source_id"] for e in data["evidence"]]
