from datetime import datetime, timezone
from typing import List, Tuple

from airgrid.schemas.diagnostics import DiagnosticFindingResponse, TelemetrySnapshotResponse


class DiagnosticEngine:
    """Heuristic thresholds describe observed symptoms, never establish a cause."""

    def analyze(self, telemetry: TelemetrySnapshotResponse) -> Tuple[List[DiagnosticFindingResponse], int, str]:
        findings = []
        penalties = 0
        measured = 0

        def add(category, severity, title, evidence, key, value, threshold, unit, next_check, source_time=None):
            findings.append(DiagnosticFindingResponse(
                category=category, severity=severity, title=title,
                description="A single observation cannot establish a persistent fault or its cause.",
                measured_evidence=f"{evidence} Source time: {source_time or telemetry.collected_at.isoformat()}. Source: {telemetry.vantage_point} / {telemetry.data_provenance}.",
                metric_key=key, measured_value=str(value), threshold_value=threshold, unit=unit,
                recommendation=next_check))

        rssi = telemetry.rssi_dbm
        if rssi is None:
            add('signal_strength', 'info', 'Wireless signal unavailable', 'No RSSI observation.',
                'rssi_dbm', 'Unavailable', None, 'dBm', 'Collect an authorized wireless observation before assessing coverage.')
        else:
            measured += 1
            severity = 'critical' if rssi < -82 else 'warning' if rssi < -75 else 'good'
            penalties += 40 if severity == 'critical' else 20 if severity == 'warning' else 0
            add('signal_strength', severity, 'Observed wireless signal', f'RSSI {rssi} dBm.',
                'rssi_dbm', rssi, 'warning < -75; critical < -82', 'dBm',
                'Repeat at the same location and another location; distance, obstacles and device differences are possible explanations.')

        if telemetry.band:
            add('frequency_band', 'info', f'Connected band: {telemetry.band}',
                f'Frequency {telemetry.frequency_mhz}; channel {telemetry.channel}; width {telemetry.channel_width_mhz}. Missing values are unknown.',
                'band', telemetry.band, None, 'band',
                'Band alone does not measure congestion. Compare authorized observations before choosing a band.')

        rates = [r for r in [telemetry.rx_bitrate_mbps, telemetry.tx_bitrate_mbps] if r is not None]
        if rates:
            measured += 1
            rate = max(rates)
            severity = 'warning' if rate < 54 else 'info'
            penalties += 20 if severity == 'warning' else 0
            add('link_rate', severity, 'Observed negotiated PHY rate',
                f'RX {telemetry.rx_bitrate_mbps}; TX {telemetry.tx_bitrate_mbps} Mbps. PHY rate is not application throughput.',
                'rx_bitrate_mbps', rate, 'warning < 54', 'Mbps',
                'Repeat under comparable conditions; hardware, power saving and signal can affect negotiated rate.')

        ping = telemetry.gateway_ping
        if ping and ping.status == 'completed' and ping.transmitted > 0 and ping.loss_pct is not None:
            measured += 1
            if ping.rtt_avg_ms is not None:
                high = ping.rtt_avg_ms > 20
                penalties += 20 if high else 0
                add('gateway_latency', 'warning' if high else 'good', 'Measured gateway latency',
                    f'{ping.received}/{ping.transmitted} responses; average RTT {ping.rtt_avg_ms} ms.',
                    'gateway_rtt_avg_ms', ping.rtt_avg_ms, 'warning > 20', 'ms',
                    'Repeat the bounded gateway check; ICMP scheduling and load can affect results. This does not isolate radio delay.')
            add('packet_loss', 'warning' if ping.loss_pct > 0 else 'good', 'Measured probe packet loss',
                f'{ping.received}/{ping.transmitted} ICMP responses; loss {ping.loss_pct}%.',
                'gateway_loss_pct', ping.loss_pct, 'warning > 0', '%',
                'A small ICMP sample is uncertain; repeat before concluding persistent loss.')
            penalties += 20 if ping.loss_pct > 0 else 0
        elif ping:
            add('gateway_latency', 'info', 'Gateway probe unavailable', f'Probe status {ping.status}; no usable RTT.',
                'gateway_rtt_avg_ms', 'Unavailable', None, 'ms', 'Check tool availability and gateway permission; no packet-loss conclusion is supported.')

        if telemetry.internet_latency_ms is not None:
            measured += 1
            add('internet_performance', 'warning' if telemetry.internet_latency_ms > 100 else 'info',
                'Recorded internet latency', f'Browser speed-test latency {telemetry.internet_latency_ms} ms.',
                'internet_latency_ms', telemetry.internet_latency_ms, 'warning > 100', 'ms',
                'Confirm timestamp and browser device match. Different vantage points cannot establish a WAN or Wi-Fi bottleneck. A missing source time means snapshot time is not the speed-test time.',
                source_time=telemetry.raw_details.get('internet_speed_test_source', {}).get('executed_at') or 'Speed-test time unavailable')

        observed = telemetry.collected_at
        if observed.tzinfo is None:
            observed = observed.replace(tzinfo=timezone.utc)
        stale = (datetime.now(timezone.utc) - observed).total_seconds() > 900
        if stale:
            add('freshness', 'info', 'Historical evidence', 'Observation is older than 15 minutes.',
                'collected_at', observed.isoformat(), '15 minutes', 'time', 'Collect a new observation for any current-state conclusion.')
        score = max(0, 100 - penalties) if measured else 0
        headline = ('Insufficient measurements for a health conclusion.' if not measured else
                    f'Historical observations; heuristic score {score}/100.' if stale else
                    f'Observed symptoms; heuristic score {score}/100. This is not a complete network health assessment.')
        return findings, score, headline


diagnostic_engine = DiagnosticEngine()
