import React from 'react';
import {
  Wifi,
  Radio,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  Server,
  Zap,
  Globe,
  Clock,
  Laptop,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { TelemetrySnapshot, LiveConnectionStatus } from '../../types/diagnostics';

export interface TelemetryLiveCardProps {
  liveConnection?: LiveConnectionStatus | null;
  telemetry: TelemetrySnapshot | null;
  loadingLive?: boolean;
  loading?: boolean;
  onCheckLiveLink?: () => void;
  onRefresh?: () => void;
  onCollectNew: () => void;
}

export const TelemetryLiveCard: React.FC<TelemetryLiveCardProps> = ({
  liveConnection,
  telemetry,
  loadingLive = false,
  loading = false,
  onCheckLiveLink,
  onRefresh,
  onCollectNew,
}) => {
  // Loading skeleton
  if (loading && !telemetry && !liveConnection) {
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

  // Determine signal styles helper
  const getSignalMeta = (rssi: number | null) => {
    let color = 'text-emerald-600';
    let bg = 'bg-emerald-50 border-emerald-200';
    let label = 'Strong';
    if (rssi !== null) {
      if (rssi < -82) {
        color = 'text-rose-600';
        bg = 'bg-rose-50 border-rose-200';
        label = 'Severe Drop';
      } else if (rssi < -75) {
        color = 'text-amber-600';
        bg = 'bg-amber-50 border-amber-200';
        label = 'Weak';
      } else if (rssi < -65) {
        color = 'text-emerald-700';
        bg = 'bg-emerald-50 border-emerald-200';
        label = 'Adequate';
      }
    }
    const pct = rssi !== null ? Math.max(0, Math.min(100, Math.round(((rssi - (-90)) / 60) * 100))) : 0;
    return { color, bg, label, pct };
  };

  const isNetworkMismatch = Boolean(
    liveConnection?.is_connected &&
    liveConnection.ssid &&
    telemetry?.ssid &&
    liveConnection.ssid.toLowerCase() !== telemetry.ssid.toLowerCase()
  );

  return (
    <div className="space-y-4">
      {/* ======================================================== */}
      {/* 1. CURRENT CONNECTED NETWORK (REAL-TIME HARDWARE PROBE)  */}
      {/* ======================================================== */}
      <div className="bg-white rounded-2xl border border-[#D9DBDE] p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#D9DBDE]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-center text-[#BE6B37] flex-shrink-0">
              <Wifi className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#737373]">
                  Current Connected Network
                </span>
                {liveConnection?.is_connected ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                    <span>Live Active Link</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-[#737373] border border-slate-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                    <span>Disconnected</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F5F5F3] text-[#0B0B0D] border border-[#D9DBDE]">
                  {liveConnection?.freshness_label || 'Fresh (<2m)'}
                </span>
              </div>
              <h3 className="text-lg font-bold text-[#0B0B0D] mt-0.5">
                {liveConnection?.is_connected ? (liveConnection.ssid || 'Connected (Hidden SSID)') : 'No Active Wi-Fi Connection'}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#F5F5F3] text-[#737373] border border-[#D9DBDE]">
              <Laptop className="w-3.5 h-3.5 text-[#BE6B37]" />
              <span>Host: <strong className="text-[#0B0B0D]">{liveConnection?.hostname || 'backend'}</strong></span>
            </span>
            {onCheckLiveLink && (
              <button
                onClick={onCheckLiveLink}
                disabled={loadingLive}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#0B0B0D] bg-white hover:bg-[#F5F5F3] border border-[#D9DBDE] transition-colors disabled:opacity-50"
                title="Re-check current connected Wi-Fi link status on the host"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#BE6B37] ${loadingLive ? 'animate-spin' : ''}`} />
                <span>{loadingLive ? 'Checking...' : 'Re-check Link'}</span>
              </button>
            )}
          </div>
        </div>

        {liveConnection?.is_connected ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Live RSSI */}
            {(() => {
              const meta = getSignalMeta(liveConnection.rssi_dbm);
              return (
                <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-1">
                  <div className="text-[10px] font-medium text-[#737373] uppercase tracking-wider flex items-center justify-between">
                    <span>Signal (RSSI)</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${meta.bg} ${meta.color}`}>
                      {meta.label}
                    </span>
                  </div>
                  <div className={`text-lg font-bold font-mono ${meta.color}`}>
                    {liveConnection.rssi_dbm !== null ? `${liveConnection.rssi_dbm.toFixed(1)} dBm` : '—'}
                  </div>
                  <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${meta.pct}%` }}
                      className={`h-full rounded-full transition-all ${
                        meta.pct > 60 ? 'bg-emerald-500' : meta.pct > 30 ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                    />
                  </div>
                </div>
              );
            })()}

            {/* Live Band & Frequency */}
            <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-1">
              <div className="text-[10px] font-medium text-[#737373] uppercase tracking-wider">Band & Channel</div>
              <div className="text-lg font-bold font-mono text-[#0B0B0D]">
                {liveConnection.band || 'N/A'}
              </div>
              <div className="text-[10px] text-[#737373] truncate">
                {liveConnection.frequency_mhz ? `${liveConnection.frequency_mhz} MHz • Ch ${liveConnection.channel ?? '—'}` : 'Auto'}
                {liveConnection.channel_width_mhz && ` (${liveConnection.channel_width_mhz} MHz)`}
              </div>
            </div>

            {/* Live Downlink PHY */}
            <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-1">
              <div className="text-[10px] font-medium text-[#737373] uppercase tracking-wider flex items-center gap-1">
                <ArrowDownRight className="w-3 h-3 text-emerald-600" />
                <span>Downlink PHY</span>
              </div>
              <div className="text-lg font-bold font-mono text-[#0B0B0D]">
                {liveConnection.rx_bitrate_mbps !== null ? `${liveConnection.rx_bitrate_mbps.toFixed(1)} Mbps` : '—'}
              </div>
              <div className="text-[10px] text-[#737373]">Live link RX rate</div>
            </div>

            {/* Live Uplink PHY */}
            <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-1">
              <div className="text-[10px] font-medium text-[#737373] uppercase tracking-wider flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3 text-emerald-600" />
                <span>Uplink PHY</span>
              </div>
              <div className="text-lg font-bold font-mono text-[#0B0B0D]">
                {liveConnection.tx_bitrate_mbps !== null ? `${liveConnection.tx_bitrate_mbps.toFixed(1)} Mbps` : '—'}
              </div>
              <div className="text-[10px] text-[#737373]">Live link TX rate</div>
            </div>

            {/* Interface & BSSID */}
            <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-1">
              <div className="text-[10px] font-medium text-[#737373] uppercase tracking-wider">Interface & AP</div>
              <div className="text-sm font-bold font-mono text-[#0B0B0D] truncate">
                {liveConnection.interface_name || 'wlan'}
              </div>
              <div className="text-[10px] text-[#737373] font-mono truncate" title={liveConnection.bssid || ''}>
                {liveConnection.bssid || 'BSSID: N/A'}
              </div>
            </div>

            {/* IP & Gateway */}
            <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-1">
              <div className="text-[10px] font-medium text-[#737373] uppercase tracking-wider">IP / Gateway</div>
              <div className="text-xs font-bold font-mono text-[#0B0B0D] truncate" title={liveConnection.ip_address || ''}>
                {liveConnection.ip_address || 'DHCP unassigned'}
              </div>
              <div className="text-[10px] text-[#737373] font-mono truncate">
                GW: {liveConnection.default_gateway || 'None'}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-[#737373] flex items-center justify-between">
            <span>Current Wi-Fi status unavailable. No active wireless connection detected on the host.</span>
            <button
              onClick={onCollectNew}
              className="px-3 py-1.5 rounded-lg bg-[#BE6B37] text-white text-xs font-semibold hover:bg-[#A3592A] transition-colors"
            >
              Collect Network Data
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between text-[11px] text-[#737373] pt-1">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Hardware inspection: non-scanning read-only probe of active interface</span>
          </div>
          <div className="font-mono text-[10px] text-slate-500">
            Source: {liveConnection?.data_provenance || 'live_system_probe'} • Vantage: host_local
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. NETWORK MISMATCH WARNING BANNER                       */}
      {/* ======================================================== */}
      {isNetworkMismatch && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800 flex-shrink-0 mt-0.5">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                Network Mismatch Warning
              </h4>
              <p className="text-xs text-amber-800 mt-0.5">
                Host is currently connected to <strong className="font-semibold text-black">{liveConnection?.ssid}</strong>, but the saved diagnostic observation below is from <strong className="font-semibold text-black">{telemetry?.ssid}</strong> ({telemetry?.freshness_label || 'historical'}).
                The diagnostic findings below describe <em>{telemetry?.ssid}</em>, not your active network.
              </p>
            </div>
          </div>
          <button
            onClick={onCollectNew}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#BE6B37] hover:bg-[#A3592A] text-white text-xs font-semibold shadow-xs transition-all whitespace-nowrap self-start sm:self-auto"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Audit {liveConnection?.ssid}</span>
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. LAST RECORDED OBSERVATION / DIAGNOSTIC SNAPSHOT       */}
      {/* ======================================================== */}
      {telemetry ? (
        <div className="bg-white rounded-2xl border border-[#D9DBDE] p-4 sm:p-6 shadow-sm space-y-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#D9DBDE]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-center text-[#BE6B37] flex-shrink-0">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#737373]">
                    Last Recorded Observation
                  </span>
                  {/* Freshness Badge */}
                  {telemetry.freshness === 'fresh' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                      <span>{telemetry.freshness_label || 'Fresh (<2m)'}</span>
                    </span>
                  ) : telemetry.freshness === 'aging' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                      <span>{telemetry.freshness_label || 'Aging (2-5m)'}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                      <span>{telemetry.freshness_label || 'Stale (>5m)'}</span>
                    </span>
                  )}

                  {telemetry.security_protocol && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-[#0B0B0D] border border-slate-200">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      {telemetry.security_protocol}
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-[#0B0B0D] mt-0.5">
                  {telemetry.ssid || 'Historical Network Observation'}
                </h3>
              </div>
            </div>

            {/* Vantage & Provenance */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#F5F5F3] text-[#737373] border border-[#D9DBDE]">
                <Laptop className="w-3.5 h-3.5 text-[#BE6B37]" />
                <span>Vantage: <strong className="text-[#0B0B0D]">{telemetry.vantage_point || 'operator_supplied'}</strong></span>
              </span>
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  className="p-2 rounded-xl text-[#737373] hover:text-[#0B0B0D] hover:bg-[#F5F5F3] border border-[#D9DBDE] transition-colors"
                  title="Collect New Observation"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Stale Warning Notice */}
          {telemetry.freshness === 'stale' && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <span>
                  <strong>Stale Observation Notice:</strong> Captured on{' '}
                  {new Date(telemetry.collected_at).toLocaleString()} ({telemetry.freshness_label || 'Stale'}). Network conditions may have changed since this snapshot was recorded.
                </span>
              </div>
              <button
                onClick={onCollectNew}
                className="text-xs font-semibold text-[#BE6B37] hover:underline whitespace-nowrap self-start sm:self-auto"
              >
                Update Reading →
              </button>
            </div>
          )}

          {/* Snapshot Metrics Grid */}
          {(() => {
            const meta = getSignalMeta(telemetry.rssi_dbm);
            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* Signal RSSI */}
                <div className="p-3.5 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-1.5">
                  <div className="text-[11px] font-medium text-[#737373] uppercase tracking-wider flex items-center justify-between">
                    <span>Signal Strength</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${meta.bg} ${meta.color}`}>
                      {meta.label}
                    </span>
                  </div>
                  <div className={`text-xl font-bold font-mono ${meta.color}`}>
                    {telemetry.rssi_dbm !== null ? `${telemetry.rssi_dbm.toFixed(1)} dBm` : 'Unavailable'}
                  </div>
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${meta.pct}%` }}
                      className={`h-full rounded-full transition-all ${
                        meta.pct > 60 ? 'bg-emerald-500' : meta.pct > 30 ? 'bg-amber-500' : 'bg-rose-500'
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
                  <div className="text-[10px] text-[#737373]">Recorded RX link speed</div>
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
                  <div className="text-[10px] text-[#737373]">Recorded TX link speed</div>
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

                {/* Internet WAN Speed Test */}
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
                      ? `WAN RTT: ${telemetry.internet_latency_ms.toFixed(1)} ms`
                      : 'Speed Test WAN Benchmark'}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Footer Provenance Note & Timestamp */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-[#737373] pt-1">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>Collected at {new Date(telemetry.collected_at).toLocaleTimeString()} ({new Date(telemetry.collected_at).toLocaleDateString()})</span>
            </div>
            <div className="mt-1 sm:mt-0 font-mono text-[10px] text-slate-500">
              Source: {telemetry.data_provenance} • Vantage: {telemetry.vantage_point}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#D9DBDE] p-8 shadow-sm text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-center mx-auto text-[#BE6B37]">
            <Radio className="w-7 h-7" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-base font-bold text-[#0B0B0D]">No Diagnostic Observation Recorded Yet</h3>
            <p className="text-xs text-[#737373]">
              Collect real-time signal strength (RSSI), channel spectrum, link bitrates, and gateway latency
              from the authorized backend server to save a diagnostic snapshot.
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
      )}
    </div>
  );
};
