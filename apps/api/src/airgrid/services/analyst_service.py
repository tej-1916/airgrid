import json
from datetime import datetime, timezone

from fastapi import HTTPException

from airgrid.schemas.ai import AIGenerateRequest
from airgrid.schemas.analyst import AnalystResponse, AnalystSelection, EvidenceItem
from airgrid.services.ai_gateway import ai_gateway
from airgrid.services.diagnostic_engine import diagnostic_engine
from airgrid.services.diagnostic_service import diagnostic_service


class AnalystService:
    async def analyze(self, db, req, user=None):
        report = await diagnostic_service.get_report_by_id(db, req.report_id)
        if not report:
            raise HTTPException(status_code=404, detail='Diagnostic report not found.')
        if user is not None:  # the endpoint always passes the caller
            from airgrid.services.campus_service import require_owned_or_campus_access
            await require_owned_or_campus_access(db, user, report.campus_id, report.user_id)
        telemetry = report.telemetry
        if not telemetry:
            return AnalystResponse(report_id=report.id, summary='No recorded telemetry is available.', evidence=[], findings=[], limitations=['Collect and save an authorized observation.'])
        # Ignore historic prose; recompute evidence rules from stored observations.
        findings, _, summary = diagnostic_engine.analyze(telemetry)
        evidence = []
        for metric, unit in [('rssi_dbm', 'dBm'), ('rx_bitrate_mbps', 'Mbps'), ('tx_bitrate_mbps', 'Mbps'), ('internet_download_mbps', 'Mbps'), ('internet_upload_mbps', 'Mbps'), ('internet_latency_ms', 'ms')]:
            value = getattr(telemetry, metric)
            if value is not None:
                evidence.append(EvidenceItem(source_id=f'{report.id}:{metric}', timestamp=(telemetry.raw_details.get("internet_speed_test_source", {}).get("executed_at") if metric.startswith("internet_") else telemetry.collected_at.isoformat()), metric=metric, value=value, unit=unit))
        if telemetry.gateway_ping and telemetry.gateway_ping.status == 'completed':
            for metric, value, unit in [('gateway_rtt_avg_ms', telemetry.gateway_ping.rtt_avg_ms, 'ms'), ('gateway_loss_pct', telemetry.gateway_ping.loss_pct, '%')]:
                if value is not None:
                    evidence.append(EvidenceItem(source_id=f'{report.id}:{metric}', timestamp=telemetry.collected_at.isoformat(), metric=metric, value=value, unit=unit))
        rows = []
        for i, finding in enumerate(findings):
            rows.append({**finding.model_dump(exclude={'id'}), 'source_id': f'{report.id}:finding:{i}', 'timestamp': telemetry.collected_at.isoformat()})
        limitations = [
            f'Source: {report.data_provenance}; vantage point: {report.vantage_point}. Operator-supplied data is not independently verified.',
            'No AP placement, walls, interference, outage cause or numerical improvement is established by this report.',
            'Browser speed tests and backend wireless observations may describe different devices and times. Missing source timestamps remain unavailable.',
            'Model metadata is provider-reported, not independently attested. No model may execute tools or change network configuration.',
        ]
        try:
            from airgrid.services.telemetry_collector import telemetry_collector
            live_status = telemetry_collector.get_live_connection_status()
            if live_status.get("is_connected") and live_status.get("ssid"):
                curr_ssid = live_status["ssid"]
                if telemetry.ssid and telemetry.ssid.lower() != curr_ssid.lower():
                    limitations.insert(0, f"Network mismatch: Report describes historical network '{telemetry.ssid}', while this host is currently connected to '{curr_ssid}'. Findings may not reflect the active wireless environment.")
        except Exception:
            pass
        result = AnalystResponse(report_id=report.id, summary=summary, evidence=evidence, findings=rows, limitations=limitations)
        if not req.use_gateway:
            return result
        if not req.allow_external:
            raise HTTPException(status_code=400, detail='Explicit consent is required to transmit minimized telemetry to the configured AI Gateway.')
        # No labels, addresses, user text, floor plans, device identifiers or historic finding prose cross this boundary.
        minimized = [{
            'source_id': row['source_id'], 'metric': row['metric_key'],
            'value': row['measured_value'] if row['metric_key'] not in ('collected_at', 'band') else None,
            'severity': row['severity'],
        } for row in rows]
        response = await ai_gateway.generate(AIGenerateRequest(
            prompt='Select the most useful existing finding IDs for operator review. Return only JSON: {"finding_ids": ["existing ID"]}. Do not add fields or observations. Evidence: ' + json.dumps(minimized),
            allow_external=True, max_tokens=512, temperature=0))
        result.gateway_status = response.status
        result.provider_reported_model = response.verified_model
        if response.status == 'success':
            try:
                selection = AnalystSelection.model_validate_json(response.output_text)
                by_id = {row['source_id']: row for row in rows}
                if not selection.finding_ids or len(set(selection.finding_ids)) != len(selection.finding_ids) or any(key not in by_id for key in selection.finding_ids):
                    raise ValueError('Unsupported references')
                selected = set(selection.finding_ids)
                # Keep every deterministic finding visible; provider selection only orders the review.
                result.findings = [by_id[key] for key in selection.finding_ids] + [row for row in rows if row['source_id'] not in selected]
                result.mode = 'gateway_assisted'
            except (ValueError, TypeError):
                result.gateway_status = 'rejected_unsupported_output'
        return result


analyst_service = AnalystService()
