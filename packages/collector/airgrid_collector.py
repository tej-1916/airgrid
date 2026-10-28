#!/usr/bin/env python3
"""Operator-invoked CLI using the same bounded collector as the API.

Run with the backend virtual environment. No collection occurs without both
host configuration and --collect. Ping additionally requires --ping.
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'apps' / 'api' / 'src'))
from airgrid.core.config import settings
from airgrid.services.telemetry_collector import TelemetryCollector


def main(argv=None):
    parser = argparse.ArgumentParser(description='AirGrid opt-in Linux collector; uses backend dependencies')
    parser.add_argument('--collect', action='store_true', help='Explicitly authorize this one read-only collection')
    parser.add_argument('--interface', '-i', help='Connected wireless interface; discovered when omitted')
    parser.add_argument('--ping', action='store_true', help='Additionally authorize up to 3 gateway ICMP probes')
    parser.add_argument('--json', action='store_true', help='Output JSON (also the default)')
    args = parser.parse_args(argv)
    if not args.collect or not settings.AIRGRID_COLLECTOR_ENABLED:
        print(json.dumps({'status': 'disabled', 'detail': 'Enable AIRGRID_COLLECTOR_ENABLED on the authorized host and pass --collect.'}))
        return 2
    collector = TelemetryCollector()
    data = collector.collect_wireless_telemetry(args.interface)
    data.update(collected_at=datetime.now(timezone.utc).isoformat(), vantage_point='authorized_collector_host',
                data_provenance='instrumented_linux_telemetry')
    if args.ping:
        data['gateway_ping'] = collector.ping_gateway(count=3).model_dump()
    print(json.dumps(data, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
