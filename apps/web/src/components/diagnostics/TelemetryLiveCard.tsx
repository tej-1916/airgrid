import React from 'react';
import {
  Wifi,
  Radio,
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  Server,
  Zap,
  Globe,
  Clock,
  Laptop,
} from 'lucide-react';
import { TelemetrySnapshot } from '../../types/diagnostics';

interface TelemetryLiveCardProps {
  telemetry: TelemetrySnapshot | null;
  loading: boolean;
  onRefresh: () => void;
  onCollectNew: () => void;
}

export const TelemetryLiveCard: React.FC<TelemetryLiveCardProps> = ({
  telemetry,
  loading,
  onRefresh,
  onCollectNew,
}) => {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-[#D9DBDE] p-6 shadow-sm animate-pulse space-y-4">
        <div className="h-6 w-48 bg-slate-200 rounded"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-slate-100 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  if (!telemetry) {
    return (
      <div className="bg-white rounded-2xl border border-[#D9DBDE] p-8 shadow-sm text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-center mx-auto text-[#BE6B37]">
          <Radio className="w-7 h-7" />
        </div>
        <div className="max-w-md mx-auto space-y-1.5">
          <h3 className="text-base font-bold text-[#0B0B0D]">No Local Telemetry Collected Yet</h3>
          <p className="text-xs text-[#737373]">
            Collect real-time signal strength (RSSI), channel spectrum, link bitrates, and gateway latency
            from the authorized backend server, which may be a different device from this browser.
          </p>
        </div>
        <button
          onClick={onCollectNew}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#BE6B37] hover:bg-[#A3592A] text-white text-xs font-semibold shadow-sm transition-all"
        >
          <Zap className="w-4 h-4" />
          <span>Collect Network Data</span>
        </button>
      </div>
    );
  }

  const rssi = telemetry.rssi_dbm;
  let signalColor = 'text-emerald-600';
  let signalBg = 'bg-emerald-50 border-emerald-200';
  let signalLabel = 'Strong';
  if (rssi !== null) {
    if (rssi < -82) {
      signalColor = 'text-rose-600';
      signalBg = 'bg-rose-50 border-rose-200';
      signalLabel = 'Severe Drop';
    } else if (rssi < -75) {
      signalColor = 'text-amber-600';
      signalBg = 'bg-amber-50 border-amber-200';
      signalLabel = 'Weak';
    } else if (rssi < -65) {
      signalColor = 'text-emerald-700';
      signalBg = 'bg-emerald-50 border-emerald-200';
      signalLabel = 'Adequate';
    }
  }

  // Calculate approximate percentage for visual bar (-90 to -30 dBm)
  const rssiPct = rssi !== null ? Math.max(0, Math.min(100, Math.round(((rssi - (-90)) / 60) * 100))) : 0;

  return (
    <div className="bg-white rounded-2xl border border-[#D9DBDE] p-4 sm:p-6 shadow-sm space-y-5">
      {/* Top Bar: Connection & Provenance */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#D9DBDE]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-center text-[#BE6B37] flex-shrink-0">
            <Wifi className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-[#0B0B0D]">
                {telemetry.ssid || 'Ad-Hoc / Disconnected'}
              </h3>
              {telemetry.security_protocol && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-[#0B0B0D] border border-slate-200">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  {telemetry.security_protocol}
                </span>
              )}
            </div>
            <p className="text-xs text-[#737373] mt-0.5 flex flex-wrap items-center gap-2">
              <span>BSSID: <strong className="font-mono text-[#0B0B0D]">{telemetry.bssid || 'N/A'}</strong></span>
              <span>•</span>
              <span>Interface: <strong className="font-mono text-[#0B0B0D]">{telemetry.interface_name}</strong></span>
            </p>
          </div>
        </div>

        {/* Provenance Badge & Actions */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#F5F5F3] text-[#737373] border border-[#D9DBDE]">
            <Laptop className="w-3.5 h-3.5 text-[#BE6B37]" />
            <span>Vantage: <strong className="text-[#0B0B0D]">{telemetry.vantage_point}</strong></span>
          </span>
          <button
            onClick={onRefresh}
            className="p-2 rounded-xl text-[#737373] hover:text-[#0B0B0D] hover:bg-[#F5F5F3] border border-[#D9DBDE] transition-colors"
            title="Refresh Readings"
          >
            <Activity className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Telemetry Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Signal RSSI */}
        <div className="p-3.5 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-1.5">
          <div className="text-[11px] font-medium text-[#737373] uppercase tracking-wider flex items-center justify-between">
            <span>Signal Strength</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${signalBg} ${signalColor}`}>
              {signalLabel}
            </span>
          </div>
          <div className={`text-xl font-bold font-mono ${signalColor}`}>
            {rssi !== null ? `${rssi.toFixed(1)} dBm` : 'Unavailable'}
          </div>
          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
            <div
              style={{ width: `${rssiPct}%` }}
              className={`h-full rounded-full transition-all ${
                rssiPct > 60 ? 'bg-emerald-500' : rssiPct > 30 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
            />
          </div>
        </div>

        {/* Frequency & Band */}
        <div className="p-3.5 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-1.5">
          <div className="text-[11px] font-medium text-[#737373] uppercase tracking-wider">Channel & Band</div>
          <div className="text-xl font-bold font-mono text-[#0B0B0D]">
            {telemetry.band || 'N/A'}
          </div>
          <div className="text-[10px] text-[#737373]">
            {telemetry.frequency_mhz ? `${telemetry.frequency_mhz} MHz • Ch ${telemetry.channel ?? '—'}` : 'Missing spectrum'}
            {telemetry.channel_width_mhz && ` (${telemetry.channel_width_mhz} MHz)`}
          </div>
        </div>

        {/* Downlink PHY Bitrate */}
        <div className="p-3.5 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-1.5">
          <div className="text-[11px] font-medium text-[#737373] uppercase tracking-wider flex items-center gap-1">
            <ArrowDownRight className="w-3 h-3 text-emerald-600" />
            <span>Downlink PHY</span>
          </div>
          <div className="text-xl font-bold font-mono text-[#0B0B0D]">
            {telemetry.rx_bitrate_mbps !== null ? `${telemetry.rx_bitrate_mbps.toFixed(1)} Mbps` : '—'}
          </div>
          <div className="text-[10px] text-[#737373]">Negotiated RX link speed</div>
        </div>

        {/* Uplink PHY Bitrate */}
        <div className="p-3.5 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-1.5">
          <div className="text-[11px] font-medium text-[#737373] uppercase tracking-wider flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3 text-emerald-600" />
            <span>Uplink PHY</span>
          </div>
          <div className="text-xl font-bold font-mono text-[#0B0B0D]">
            {telemetry.tx_bitrate_mbps !== null ? `${telemetry.tx_bitrate_mbps.toFixed(1)} Mbps` : '—'}
          </div>
          <div className="text-[10px] text-[#737373]">Negotiated TX link speed</div>
        </div>

        {/* Gateway First-Hop Latency */}
        <div className="p-3.5 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-1.5">
          <div className="text-[11px] font-medium text-[#737373] uppercase tracking-wider flex items-center gap-1">
            <Server className="w-3 h-3 text-[#BE6B37]" />
            <span>Gateway RTT</span>
          </div>
          <div className="text-xl font-bold font-mono text-[#0B0B0D]">
            {telemetry.gateway_ping?.rtt_avg_ms !== null && telemetry.gateway_ping?.rtt_avg_ms !== undefined
              ? `${telemetry.gateway_ping.rtt_avg_ms.toFixed(1)} ms`
              : 'Unchecked'}
          </div>
          <div className="text-[10px] text-[#737373]">
            {telemetry.gateway_ping?.status === 'completed' && telemetry.gateway_ping.loss_pct !== null
              ? `${telemetry.gateway_ping.loss_pct}% loss to ${telemetry.gateway_ip}`
              : 'Local router latency'}
          </div>
        </div>

        {/* Internet WAN Speed Test (Phase 03) */}
        <div className="p-3.5 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-1.5">
          <div className="text-[11px] font-medium text-[#737373] uppercase tracking-wider flex items-center gap-1">
            <Globe className="w-3 h-3 text-blue-600" />
            <span>Internet WAN</span>
          </div>
          <div className="text-xl font-bold font-mono text-[#0B0B0D]">
            {telemetry.internet_download_mbps !== null && telemetry.internet_download_mbps !== undefined
              ? `${telemetry.internet_download_mbps.toFixed(1)} Mbps`
              : '—'}
          </div>
          <div className="text-[10px] text-[#737373]">
            {telemetry.internet_latency_ms
              ? `WAN RTT: ${telemetry.internet_latency_ms.toFixed(1)} ms (P03)`
              : 'Phase 03 Speed Test'}
          </div>
        </div>
      </div>

      {/* Footer Provenance Note & Timestamp */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-[#737373] pt-1">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          <span>Collected at {new Date(telemetry.collected_at).toLocaleTimeString()} ({new Date(telemetry.collected_at).toLocaleDateString()})</span>
        </div>
        <div className="mt-1 sm:mt-0 font-mono text-[10px] text-slate-500">
          Source: {telemetry.data_provenance} • Local Machine
        </div>
      </div>
    </div>
  );
};
