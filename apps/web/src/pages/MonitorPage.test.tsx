import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MonitorPage } from './MonitorPage';
import { apiRequest } from '../services/api';

vi.mock('../services/api', () => ({ apiRequest: vi.fn() }));

const row = (i: number, rssi: number) => ({
  snapshot_id: `s${i}`, collected_at: '2026-11-18T10:00:00Z', collector_id: null, report_id: null, vantage_point: 'client',
  data_provenance: 'MEASURED', collection_status: 'completed', connection_state: 'connected', ssid: 'SYN', bssid: null, band: '5',
  channel: 36, rssi_dbm: rssi, rx_bitrate_mbps: null, tx_bitrate_mbps: null, gateway_rtt_avg_ms: 4, gateway_loss_pct: 0,
});

describe('MonitorPage', () => {
  it('reports the real observation count from the trends response (regression: KPI was always 0)', async () => {
    // Shape of GET /diagnostics/trends: no top-level snapshot_count.
    vi.mocked(apiRequest).mockResolvedValue({ series: [row(1, -60), row(2, -64), row(3, -70)], transitions: [], speed_tests: [], truncated: false,
      window: {}, filters: {}, freshness: {}, availability: {} });
    render(<MonitorPage />);
    expect(await screen.findByText('Recorded Snapshots')).toBeInTheDocument();
    const kpi = screen.getByText('Recorded Snapshots').closest('div')!.parentElement!;
    expect(kpi).toHaveTextContent('3');
    expect(kpi).not.toHaveTextContent(/^Recorded Snapshots\s*0/);
  });

  it('shows an honest empty state, not zeros dressed as data, when nothing is recorded', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ series: [], transitions: [], speed_tests: [], truncated: false });
    render(<MonitorPage />);
    expect((await screen.findAllByText('—')).length).toBeGreaterThan(0);
  });
});
