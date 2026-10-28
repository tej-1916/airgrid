"""Safety checks use fixtures only; no host observations or provider traffic."""
import subprocess
from pathlib import Path

import pytest
from fastapi import HTTPException

from airgrid.core.config import settings
from airgrid.schemas.diagnostics import TelemetryCollectionRequest, PingGatewayRequest, AnalyzeDiagnosticsRequest
from airgrid.services.ml_service import MLService
from airgrid.services.telemetry_collector import TelemetryCollector
from airgrid.services.diagnostic_service import diagnostic_service


def test_collection_and_probing_require_explicit_opt_in():
    assert not TelemetryCollectionRequest().operator_consent
    assert not TelemetryCollectionRequest().include_gateway_ping
    assert not PingGatewayRequest().operator_consent
    assert not AnalyzeDiagnosticsRequest().include_gateway_ping


def test_model_path_rejects_sibling_and_symlink(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'AIRGRID_MODEL_STORAGE_DIR', str(tmp_path / 'models'))
    outside = tmp_path / 'models-other'
    outside.mkdir()
    (tmp_path / 'models').mkdir()
    (tmp_path / 'models' / 'escape').symlink_to(outside, target_is_directory=True)
    for path in [outside / 'model.joblib', tmp_path / 'models' / 'escape' / 'model.joblib']:
        with pytest.raises(HTTPException):
            MLService._validate_artifact_path(str(path))


def test_probe_rejects_non_gateway_and_unapproved_iperf(monkeypatch):
    collector = TelemetryCollector()
    monkeypatch.setattr(collector, 'discover_default_route', lambda: ('192.168.1.1', 'fixture0'))
    monkeypatch.setattr(collector, '_run_cmd', lambda *a, **k: pytest.fail('No command should execute'))
    assert collector.ping_gateway('8.8.8.8').status == 'target_not_gateway'
    assert collector.test_iperf('192.168.1.200').status == 'error'
    assert collector.test_iperf('--help').status == 'error'


def test_nmcli_never_rescans_and_parses_current_connection(monkeypatch):
    collector = TelemetryCollector()
    monkeypatch.setattr('os.path.exists', lambda p: True)
    commands = []
    def run(args, timeout=3):
        commands.append(args)
        if args[0] == collector.iw_bin:
            return 0, 'Connected to 00:00:00:00:00:01\nSSID: Fixture\nfreq: 5180\nsignal: -67 dBm\nrx bitrate: 120 MBit/s\ntx bitrate: 90 MBit/s', ''
        return 0, r'yes:00\:00\:00\:00\:00\:01:Fixture:Infra:36:5180 MHz:120 Mbit/s:66:WPA2', ''
    monkeypatch.setattr(collector, '_run_cmd', run)
    result = collector.collect_wireless_telemetry('fixture0')
    assert result['rssi_dbm'] == -67
    assert result['channel'] == 36
    assert result['band'] == '5 GHz'
    nmcli = next(c for c in commands if c[0] == collector.nmcli_bin)
    assert nmcli[-2:] == ['--rescan', 'no']
    assert 'fixture0' in nmcli


def test_command_timeout_and_output_limit(monkeypatch):
    collector = TelemetryCollector()
    # Only a local Python self-check is executed, never network tools.
    import sys
    collector.ip_bin = sys.executable
    code, out, err = collector._run_cmd([sys.executable, '-c', 'print("x" * 70000)'])
    assert code == -1 and not out and 'limit' in err
    code, out, err = collector._run_cmd([sys.executable, '-c', 'import time; time.sleep(1)'], timeout=.01)
    assert code == -1 and not out and 'timed out' in err


@pytest.mark.asyncio
async def test_disabled_collector_never_executes(monkeypatch):
    monkeypatch.setattr(settings, 'AIRGRID_COLLECTOR_ENABLED', False)
    with pytest.raises(HTTPException) as exc:
        await diagnostic_service.collect_telemetry_snapshot(None, TelemetryCollectionRequest(operator_consent=True), None)
    assert exc.value.status_code == 409


def test_idw_support_and_physical_weighting():
    from airgrid.services.survey_service import SurveyService
    samples = [(0, 0, -40), (100, 0, -80), (0, 100, -60)]
    hull = SurveyService._compute_convex_hull([(p[0], p[1]) for p in samples])
    prediction = SurveyService._predict_idw(50, 0, samples, 10, hull)
    distances = [5, 5, (50 ** 2 + 100 ** 2) ** .5 / 10]
    weights = [1 / ((distance + .5) ** 2) for distance in distances]
    assert prediction == pytest.approx(sum(w * p[2] for w, p in zip(weights, samples)) / sum(weights))
    assert SurveyService._predict_idw(500, 500, samples, 10, hull) is None
    assert SurveyService._predict_idw(50, 0, samples, .1, hull) is None


def test_cli_requires_host_enablement_and_explicit_invocation(monkeypatch, capsys):
    import importlib.util
    module_path = Path(__file__).resolve().parents[3] / 'packages' / 'collector' / 'airgrid_collector.py'
    spec = importlib.util.spec_from_file_location('airgrid_fixture_cli', module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(TelemetryCollector, 'collect_wireless_telemetry', lambda *a: pytest.fail('No collection authorized'))
    monkeypatch.setattr(settings, 'AIRGRID_COLLECTOR_ENABLED', False)
    assert module.main(['--collect']) == 2
    monkeypatch.setattr(settings, 'AIRGRID_COLLECTOR_ENABLED', True)
    assert module.main([]) == 2
    assert 'disabled' in capsys.readouterr().out


def test_missing_ping_output_is_not_measured_loss(monkeypatch):
    collector = TelemetryCollector()
    monkeypatch.setattr(collector, 'discover_default_route', lambda: ('192.168.1.1', 'fixture0'))
    monkeypatch.setattr(collector, '_run_cmd', lambda *a, **k: (-1, 'permission denied', ''))
    result = collector.ping_gateway()
    assert result.transmitted == 0 and result.loss_pct is None
    assert result.status == 'probe_unavailable'


@pytest.mark.asyncio
async def test_diagnostic_scope_rejects_wrong_building():
    import uuid
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    request = AnalyzeDiagnosticsRequest(floor_id=uuid.uuid4(), building_id=uuid.uuid4())
    db = SimpleNamespace(get=AsyncMock(return_value=SimpleNamespace(building_id=uuid.uuid4())))
    with pytest.raises(HTTPException) as exc:
        await diagnostic_service._validate_scope(db, request)
    assert exc.value.status_code == 422
