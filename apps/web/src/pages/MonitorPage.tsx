import React, { useEffect, useState } from 'react';
import {
  Activity,
  Wifi,
  Radio,
  ArrowRightLeft,
  Gauge,
  RefreshCw,
  ArrowDownUp,
} from 'lucide-react';
import { apiRequest } from '../services/api';

interface TrendSeriesItem {
  snapshot_id: string;
  collected_at: string;
  collector_id: string | null;
  report_id: string | null;
  vantage_point: string;
  data_provenance: string;
  collection_status: string;
  connection_state: string;
  ssid: string | null;
  bssid: string | null;
  band: string | null;
  channel: number | null;
  rssi_dbm: number | null;
  rx_bitrate_mbps: number | null;
  tx_bitrate_mbps: number | null;
  gateway_rtt_avg_ms: number | null;
  gateway_loss_pct: number | null;
}

interface TransitionItem {
  at: string;
  source: string;
  kind: 'roam' | 'state_change';
  from: string;
  to: string;
  snapshot_id: string;
}

interface SpeedTestItem {
  id: string;
  executed_at: string;
  vantage_point: string;
  data_provenance: string;
  download_mbps: number | null;
  upload_mbps: number | null;
  latency_ms: number | null;
  jitter_ms: number | null;
  packet_loss_pct: number | null;
}

interface TrendsData {
  // Mirrors GET /api/v1/diagnostics/trends (only fields this page reads).
  truncated: boolean;
  series: TrendSeriesItem[];
  transitions: TransitionItem[];
  speed_tests: SpeedTestItem[];
}

export const MonitorPage: React.FC = () => {
  const [days, setDays] = useState<number>(7);
  const [trends, setTrends] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'observations' | 'transitions' | 'speed_tests'>('observations');

  const fetchTrends = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<TrendsData>(`/api/v1/diagnostics/trends?days=${days}&include_operator_reported=true`);
      setTrends(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load telemetry trends.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrends();
  }, [days]);

  // Derived summaries
  const validRssi = trends?.series.filter((s) => s.rssi_dbm !== null).map((s) => s.rssi_dbm!) || [];
  const medianRssi =
    validRssi.length > 0
      ? validRssi.sort((a, b) => a - b)[Math.floor(validRssi.length / 2)]
      : null;

  const validRtt = trends?.series.filter((s) => s.gateway_rtt_avg_ms !== null).map((s) => s.gateway_rtt_avg_ms!) || [];
  const avgRtt =
    validRtt.length > 0
      ? (validRtt.reduce((sum, v) => sum + v, 0) / validRtt.length).toFixed(1)
      : null;

  const roamCount = trends?.transitions.filter((t) => t.kind === 'roam').length || 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#D9DBDE]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#BE6B37]">Telemetry Analytics</span>
            <span className="text-xs bg-[#E5E7EB] text-neutral-700 px-2 py-0.5 rounded-full font-mono">Real Network Intelligence</span>
          </div>
          <h1 className="text-2xl font-bold mt-1 text-[#0B0B0D]">Network Monitor (recorded history)</h1>
          <p className="text-sm text-neutral-600 mt-1">
            Persisted time-series telemetry, gateway first-hop latency, BSSID roams, and speed test metrics.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-white border border-[#D9DBDE] rounded-xl p-1 text-xs">
            {[
              { label: '24 Hours', value: 1 },
              { label: '7 Days', value: 7 },
              { label: '30 Days', value: 30 },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDays(opt.value)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  days === opt.value
                    ? 'bg-[#BE6B37] text-white shadow-xs'
                    : 'text-neutral-600 hover:text-[#0B0B0D]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            onClick={fetchTrends}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#D9DBDE] rounded-xl text-xs font-medium text-[#0B0B0D] hover:bg-neutral-50 transition-colors shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#BE6B37]' : 'text-neutral-600'}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900">
          {error}
        </div>
      )}

      {/* Metric Scoreboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-[#D9DBDE] shadow-sm">
          <div className="flex items-center justify-between text-xs text-neutral-500 font-medium mb-1">
            <span>Recorded Snapshots</span>
            <Activity className="w-4 h-4 text-[#BE6B37]" />
          </div>
          <div className="text-2xl font-bold text-[#0B0B0D] mt-1 font-mono">
            {trends?.series.length ?? 0}{trends?.truncated ? '+' : ''}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">
            Window: Past {days} {days === 1 ? 'day' : 'days'}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-[#D9DBDE] shadow-sm">
          <div className="flex items-center justify-between text-xs text-neutral-500 font-medium mb-1">
            <span>Median RSSI</span>
            <Wifi className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-[#0B0B0D] mt-1 font-mono">
            {medianRssi !== null ? `${medianRssi} dBm` : '—'}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">
            {medianRssi !== null
              ? medianRssi >= -67
                ? 'Strong signal coverage'
                : medianRssi >= -75
                ? 'Acceptable coverage'
                : 'Weak coverage area'
              : 'No RF measurements'}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-[#D9DBDE] shadow-sm">
          <div className="flex items-center justify-between text-xs text-neutral-500 font-medium mb-1">
            <span>Avg Gateway RTT</span>
            <Gauge className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-[#0B0B0D] mt-1 font-mono">
            {avgRtt !== null ? `${avgRtt} ms` : '—'}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">First-hop local airlink latency</div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-[#D9DBDE] shadow-sm">
          <div className="flex items-center justify-between text-xs text-neutral-500 font-medium mb-1">
            <span>BSSID Roams Detected</span>
            <ArrowRightLeft className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-[#0B0B0D] mt-1 font-mono">
            {roamCount}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">Client handover transitions</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 bg-[#E5E7EB]/60 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('observations')}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'observations'
              ? 'bg-white text-[#0B0B0D] shadow-sm'
              : 'text-neutral-600 hover:text-[#0B0B0D]'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>Telemetry Series ({trends?.series.length ?? 0})</span>
        </button>
        <button
          onClick={() => setActiveTab('transitions')}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'transitions'
              ? 'bg-white text-[#0B0B0D] shadow-sm'
              : 'text-neutral-600 hover:text-[#0B0B0D]'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          <span>Transitions & Roams ({trends?.transitions.length ?? 0})</span>
        </button>
        <button
          onClick={() => setActiveTab('speed_tests')}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'speed_tests'
              ? 'bg-white text-[#0B0B0D] shadow-sm'
              : 'text-neutral-600 hover:text-[#0B0B0D]'
          }`}
        >
          <ArrowDownUp className="w-4 h-4" />
          <span>Speed Test Records ({trends?.speed_tests.length ?? 0})</span>
        </button>
      </div>

      {/* Main Table Views */}
      {loading ? (
        <div className="p-12 text-center text-sm text-neutral-500">Loading time-series trends…</div>
      ) : activeTab === 'observations' ? (
        !trends || trends.series.length === 0 ? (
          <div className="p-12 rounded-2xl bg-white border border-[#D9DBDE] text-center space-y-3">
            <Radio className="w-10 h-10 text-neutral-400 mx-auto" />
            <h3 className="text-base font-semibold text-[#0B0B0D]">No Telemetry Observations</h3>
            <p className="text-xs text-neutral-500 max-w-md mx-auto">
              No network telemetry observations were recorded during this window. Collect a live snapshot in Network Diagnostics or run an authenticated Linux collector.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#D9DBDE] bg-white overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-600 font-semibold border-b border-[#D9DBDE]">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">SSID / BSSID</th>
                  <th className="py-3 px-4">Band & Channel</th>
                  <th className="py-3 px-4">RSSI</th>
                  <th className="py-3 px-4">Link Bitrates (Rx/Tx)</th>
                  <th className="py-3 px-4">Gateway RTT</th>
                  <th className="py-3 px-4">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] font-mono text-[11px]">
                {trends.series.map((row) => (
                  <tr key={row.snapshot_id} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="py-3 px-4 text-neutral-600">
                      {new Date(row.collected_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-sans font-semibold text-[#0B0B0D]">{row.ssid || 'Hidden'}</div>
                      <div className="text-[10px] text-neutral-500">{row.bssid || '—'}</div>
                    </td>
                    <td className="py-3 px-4 text-neutral-700">
                      {row.band || '—'} · Ch {row.channel ?? '—'}
                    </td>
                    <td className="py-3 px-4">
                      {row.rssi_dbm !== null ? (
                        <span
                          className={`font-semibold ${
                            row.rssi_dbm >= -67
                              ? 'text-emerald-700'
                              : row.rssi_dbm >= -75
                              ? 'text-amber-700'
                              : 'text-red-700'
                          }`}
                        >
                          {row.rssi_dbm} dBm
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-4 text-neutral-600">
                      {row.rx_bitrate_mbps ? `${row.rx_bitrate_mbps} Mbps` : '—'} /{' '}
                      {row.tx_bitrate_mbps ? `${row.tx_bitrate_mbps} Mbps` : '—'}
                    </td>
                    <td className="py-3 px-4 text-neutral-700">
                      {row.gateway_rtt_avg_ms !== null ? `${row.gateway_rtt_avg_ms} ms` : '—'}
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 text-neutral-700">
                        {row.connection_state}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : activeTab === 'transitions' ? (
        !trends || trends.transitions.length === 0 ? (
          <div className="p-12 rounded-2xl bg-white border border-[#D9DBDE] text-center space-y-3">
            <ArrowRightLeft className="w-10 h-10 text-neutral-400 mx-auto" />
            <h3 className="text-base font-semibold text-[#0B0B0D]">No Roams or State Changes</h3>
            <p className="text-xs text-neutral-500 max-w-md mx-auto">
              No AP transitions, roaming handoffs, or connection drops recorded for this period.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#D9DBDE] bg-white overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-600 font-semibold border-b border-[#D9DBDE]">
                <tr>
                  <th className="py-3 px-4">Event Time</th>
                  <th className="py-3 px-4">Event Kind</th>
                  <th className="py-3 px-4">Source Probe</th>
                  <th className="py-3 px-4">Previous State</th>
                  <th className="py-3 px-4">Transitioned To</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] font-mono text-[11px]">
                {trends.transitions.map((t, idx) => (
                  <tr key={idx} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="py-3 px-4 text-neutral-600">
                      {new Date(t.at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          t.kind === 'roam'
                            ? 'bg-purple-50 text-purple-800 border border-purple-200'
                            : 'bg-neutral-100 text-neutral-700 border border-neutral-200'
                        }`}
                      >
                        {t.kind === 'roam' ? 'BSSID Roam' : 'State Change'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-neutral-800 truncate max-w-xs">{t.source}</td>
                    <td className="py-3 px-4 text-neutral-600">{t.from}</td>
                    <td className="py-3 px-4 font-semibold text-[#0B0B0D]">{t.to}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        !trends || trends.speed_tests.length === 0 ? (
          <div className="p-12 rounded-2xl bg-white border border-[#D9DBDE] text-center space-y-3">
            <ArrowDownUp className="w-10 h-10 text-neutral-400 mx-auto" />
            <h3 className="text-base font-semibold text-[#0B0B0D]">No Speed Test Records</h3>
            <p className="text-xs text-neutral-500 max-w-md mx-auto">
              Run an internet speed benchmark from the Speed Test tool to persist WAN throughput and jitter trends.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#D9DBDE] bg-white overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-600 font-semibold border-b border-[#D9DBDE]">
                <tr>
                  <th className="py-3 px-4">Executed At</th>
                  <th className="py-3 px-4">Download Throughput</th>
                  <th className="py-3 px-4">Upload Throughput</th>
                  <th className="py-3 px-4">Latency (RTT)</th>
                  <th className="py-3 px-4">Jitter</th>
                  <th className="py-3 px-4">Packet Loss</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] font-mono text-[11px]">
                {trends.speed_tests.map((st) => (
                  <tr key={st.id} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="py-3 px-4 text-neutral-600">
                      {new Date(st.executed_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-semibold text-emerald-700">
                      {st.download_mbps !== null ? `${st.download_mbps} Mbps` : '—'}
                    </td>
                    <td className="py-3 px-4 font-semibold text-blue-700">
                      {st.upload_mbps !== null ? `${st.upload_mbps} Mbps` : '—'}
                    </td>
                    <td className="py-3 px-4 text-neutral-800">
                      {st.latency_ms !== null ? `${st.latency_ms} ms` : '—'}
                    </td>
                    <td className="py-3 px-4 text-neutral-600">
                      {st.jitter_ms !== null ? `${st.jitter_ms} ms` : '—'}
                    </td>
                    <td className="py-3 px-4 text-neutral-600">
                      {st.packet_loss_pct !== null ? `${st.packet_loss_pct}%` : '0%'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
};
