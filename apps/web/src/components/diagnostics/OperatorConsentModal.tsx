import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  Server,
  Activity,
  AlertTriangle,
  Play,
} from 'lucide-react';
import { diagnosticsService } from '../../services/diagnosticsService';
import { InterfaceListResponse, CollectTelemetryParams } from '../../types/diagnostics';

interface OperatorConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartCollection: (params: CollectTelemetryParams) => Promise<void>;
  campusId?: string;
  buildingId?: string;
  floorId?: string;
}

export const OperatorConsentModal: React.FC<OperatorConsentModalProps> = ({
  isOpen,
  onClose,
  onStartCollection,
  campusId,
  buildingId,
  floorId,
}) => {
  const [interfacesData, setInterfacesData] = useState<InterfaceListResponse | null>(null);
  const [selectedIface, setSelectedIface] = useState<string>('');
  const [hasConsent, setHasConsent] = useState<boolean>(false);
  const [includePing, setIncludePing] = useState<boolean>(false);
  const [pingCount, setPingCount] = useState<number>(3);
  const [iperfTarget, setIperfTarget] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setHasConsent(false);
      setIncludePing(false);
      setErrorMsg(null);
      diagnosticsService
        .getInterfaces()
        .then((res) => {
          setInterfacesData(res);
          if (res.discovered_wireless_interface) {
            setSelectedIface(res.discovered_wireless_interface);
          } else if (res.interfaces.length > 0) {
            setSelectedIface(res.interfaces[0].name);
          }
        })
        .catch((err) => {
          setErrorMsg(err.message || 'Failed to detect local interfaces.');
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasConsent) {
      setErrorMsg('Explicit operator consent is required to collect local telemetry.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      await onStartCollection({
        interface_name: selectedIface || undefined,
        campus_id: campusId || undefined,
        building_id: buildingId || undefined,
        floor_id: floorId || undefined,
        include_gateway_ping: includePing,
        ping_count: pingCount,
        iperf_target_host: iperfTarget.trim() || undefined,
        operator_consent: true,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to collect telemetry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl border border-[#D9DBDE] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#D9DBDE] bg-[#F5F5F3]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#BE6B37]/10 border border-[#BE6B37]/20 flex items-center justify-center text-[#BE6B37]">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0B0B0D]">Collect Live Network Telemetry</h3>
              <p className="text-xs text-[#737373]">Collects from the backend server, which may differ from this browser device.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#737373] hover:text-[#0B0B0D] hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Interface Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0B0B0D] flex items-center justify-between">
              <span>Target Network Interface</span>
              {interfacesData?.discovered_wireless_interface && (
                <span className="text-[10px] text-emerald-700 font-normal">
                  Auto-detected Wi-Fi: <strong>{interfacesData.discovered_wireless_interface}</strong>
                </span>
              )}
            </label>
            <div className="relative">
              <select
                value={selectedIface}
                onChange={(e) => setSelectedIface(e.target.value)}
                className="w-full text-xs bg-[#F5F5F3] border border-[#D9DBDE] rounded-xl px-3.5 py-2.5 text-[#0B0B0D] focus:outline-none focus:ring-1 focus:ring-[#BE6B37]"
              >
                {interfacesData?.interfaces.map((iface) => (
                  <option key={iface.name} value={iface.name}>
                    {iface.name} ({iface.type}) {iface.is_connected ? '• Connected' : '• Down'}
                    {iface.is_wireless ? ' [Wireless]' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Probing Options */}
          <div className="p-4 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-3">
            <div className="text-xs font-semibold text-[#0B0B0D] flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[#BE6B37]" />
              <span>Bounded Probing Safeguards</span>
            </div>

            {/* Gateway Ping Toggle */}
            <div className="flex items-center justify-between text-xs">
              <div>
                <span className="font-medium text-[#0B0B0D]">Ping Default Gateway</span>
                <p className="text-[11px] text-[#737373]">
                  Measures local airlink RTT ({interfacesData?.default_gateway || 'Router'})
                </p>
              </div>
              <input
                type="checkbox"
                checked={includePing}
                onChange={(e) => setIncludePing(e.target.checked)}
                className="w-4 h-4 accent-[#BE6B37] rounded"
              />
            </div>

            {includePing && (
              <div className="flex items-center justify-between text-xs pt-1 pl-2 border-l-2 border-[#BE6B37]">
                <span className="text-[#737373]">Packet Probe Count (max 5)</span>
                <select
                  value={pingCount}
                  onChange={(e) => setPingCount(Number(e.target.value))}
                  className="text-xs bg-white border border-[#D9DBDE] rounded-lg px-2 py-1 text-[#0B0B0D]"
                >
                  <option value={1}>1 probe</option>
                  <option value={3}>3 probes</option>
                  <option value={5}>5 probes</option>
                </select>
              </div>
            )}

            {/* Optional iperf3 LAN Target */}
            <div className="space-y-1.5 pt-2 border-t border-[#D9DBDE]">
              <label className="text-xs font-medium text-[#0B0B0D] flex items-center gap-1">
                <Server className="w-3 h-3 text-[#737373]" />
                <span>Designated LAN iperf3 Endpoint (Optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 172.16.0.100 or iperf.local"
                value={iperfTarget}
                onChange={(e) => setIperfTarget(e.target.value)}
                className="w-full text-xs bg-white border border-[#D9DBDE] rounded-lg px-3 py-1.5 text-[#0B0B0D] placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#BE6B37]"
              />
              <p className="text-[10px] text-[#737373]">
                Leave empty to skip LAN throughput test. Only test endpoints under your administrative control.
              </p>
            </div>
          </div>

          {/* Explicit Operator Consent Box */}
          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-950 space-y-2">
            <div className="flex items-start gap-2.5">
              <input
                type="checkbox"
                id="consent-checkbox"
                checked={hasConsent}
                onChange={(e) => setHasConsent(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-[#BE6B37] rounded cursor-pointer"
              />
              <label htmlFor="consent-checkbox" className="cursor-pointer font-medium leading-relaxed">
                I authorize read-only wireless telemetry collection on this system.
              </label>
            </div>
            <p className="text-[10px] text-amber-800 pl-6.5">
              AirGrid enforces strict privacy: zero packet captures, zero foreign network scans, and no credential extraction.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-medium text-[#737373] hover:text-[#0B0B0D] hover:bg-[#F5F5F3] border border-transparent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !hasConsent}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#BE6B37] hover:bg-[#A3592A] disabled:opacity-50 text-white text-xs font-semibold shadow-sm transition-all"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{loading ? 'Collecting Telemetry...' : 'Start Telemetry Collection'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
