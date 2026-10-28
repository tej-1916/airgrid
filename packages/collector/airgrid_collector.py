#!/usr/bin/env python3
"""Operator-invoked CLI using the same bounded collector as the API.

Run with the backend virtual environment. No collection occurs without both
host configuration and --collect. Ping additionally requires --ping.
--submit signs the single observation and sends it to a registered-collector
endpoint; there is no background loop or schedule.
"""
import argparse
import json
import os
import re
import secrets
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'apps' / 'api' / 'src'))
from airgrid.core.config import settings
from airgrid.schemas.collectors import MAC_PATTERN, CollectorSubmission
from airgrid.services.collector_service import sign_submission
from airgrid.services.telemetry_collector import TelemetryCollector

SOFTWARE = 'airgrid-collector/1'
LINK_FIELDS = ('ssid', 'rssi_dbm', 'signal_quality_pct', 'frequency_mhz', 'channel', 'channel_width_mhz',
               'band', 'rx_bitrate_mbps', 'tx_bitrate_mbps', 'security_protocol')


def build_submission(raw, ping=None, now=None):
    """Map raw collector output onto the signed submission schema; never fills missing values."""
    now = now or datetime.now(timezone.utc)
    if 'error' in raw and raw.get('rssi_dbm') is None:
        return {'schema_version': 1, 'collected_at': now.isoformat(), 'collection_status': 'failed',
                'error': str(raw['error'])[:255], 'collector_software': SOFTWARE}
    bssid = raw.get('bssid') if raw.get('bssid') and re.fullmatch(MAC_PATTERN, raw['bssid']) else None
    payload = {'schema_version': 1, 'collected_at': now.isoformat(),
               'collection_status': 'collected' if raw.get('rssi_dbm') is not None else 'partial',
               'interface_name': raw.get('interface_name'),
               'connection_state': 'connected' if bssid else 'disconnected',
               'bssid': bssid, 'collector_software': SOFTWARE,
               **{k: raw.get(k) for k in LINK_FIELDS}}
    if ping is not None and ping.status == 'completed' and ping.transmitted and ping.loss_pct is not None:
        payload['gateway_ping'] = {k: getattr(ping, k) for k in
                                   ('transmitted', 'received', 'loss_pct', 'rtt_min_ms', 'rtt_avg_ms', 'rtt_max_ms', 'rtt_mdev_ms')}
    # Validate locally so a malformed reading fails here, not as a rejected submission.
    return json.loads(CollectorSubmission.model_validate(payload).model_dump_json(exclude_none=True))


def load_credentials(path):
    if path:
        p = Path(path)
        if p.stat().st_mode & 0o077:
            raise SystemExit(f'Refusing credentials file {p}: permissions must be 0600.')
        data = json.loads(p.read_text())
        return data['collector_id'], data['secret']
    cid, secret = os.environ.get('AIRGRID_COLLECTOR_ID'), os.environ.get('AIRGRID_COLLECTOR_SECRET')
    if not cid or not secret:
        raise SystemExit('Provide --credentials FILE or AIRGRID_COLLECTOR_ID/AIRGRID_COLLECTOR_SECRET.')
    return cid, secret


def submit(api_url, collector_id, secret, payload):
    body = json.dumps(payload, separators=(',', ':')).encode()
    timestamp, nonce = int(time.time()), secrets.token_urlsafe(24)
    request = urllib.request.Request(
        api_url.rstrip('/') + '/api/v1/collectors/ingest', data=body, method='POST',
        headers={'Content-Type': 'application/json', 'X-AirGrid-Collector': collector_id,
                 'X-AirGrid-Timestamp': str(timestamp), 'X-AirGrid-Nonce': nonce,
                 'X-AirGrid-Signature': sign_submission(secret, collector_id, timestamp, nonce, body)})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read() or b'{}')


def main(argv=None):
    parser = argparse.ArgumentParser(description='AirGrid opt-in Linux collector; uses backend dependencies')
    parser.add_argument('--collect', action='store_true', help='Explicitly authorize this one read-only collection')
    parser.add_argument('--interface', '-i', help='Connected wireless interface; discovered when omitted')
    parser.add_argument('--ping', action='store_true', help='Additionally authorize up to 3 gateway ICMP probes')
    parser.add_argument('--json', action='store_true', help='Output JSON (also the default)')
    parser.add_argument('--submit', action='store_true', help='Sign and send this observation to AirGrid')
    parser.add_argument('--api-url', default='http://127.0.0.1:8000', help='AirGrid API base URL (HTTPS when remote)')
    parser.add_argument('--credentials', help='0600 JSON file with collector_id and secret')
    args = parser.parse_args(argv)
    if not args.collect or not settings.AIRGRID_COLLECTOR_ENABLED:
        print(json.dumps({'status': 'disabled', 'detail': 'Enable AIRGRID_COLLECTOR_ENABLED on the authorized host and pass --collect.'}))
        return 2
    print('AirGrid will read: connected-interface link status (RSSI, frequency, band, channel, bitrate, SSID/BSSID)'
          + ('; up to 3 ICMP probes to the default gateway' if args.ping else '') + '. No scans, captures or credentials.',
          file=sys.stderr)
    collector = TelemetryCollector()
    data = collector.collect_wireless_telemetry(args.interface)
    ping = collector.ping_gateway(count=3) if args.ping else None
    if args.submit:
        collector_id, secret = load_credentials(args.credentials)
        status, result = submit(args.api_url, collector_id, secret, build_submission(data, ping))
        print(json.dumps({'http_status': status, **result}, indent=2))
        return 0 if status == 201 else 1
    data.update(collected_at=datetime.now(timezone.utc).isoformat(), vantage_point='authorized_collector_host',
                data_provenance='instrumented_linux_telemetry')
    if ping is not None:
        data['gateway_ping'] = ping.model_dump()
    print(json.dumps(data, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
