import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  Radio,
  Gauge,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

interface SpeedTestConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  connectedSsid?: string | null;
  interfaceName?: string | null;
  rxBitrateMbps?: number | null;
  txBitrateMbps?: number | null;
  signalDbm?: number | null;
  frequencyMhz?: number | null;
  targetProvider: string;
  maxMb?: number;
  durationSeconds?: number;
  scopeLabel?: string;
}

export const SpeedTestConsentModal: React.FC<SpeedTestConsentModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  connectedSsid,
  interfaceName,
  rxBitrateMbps,
  txBitrateMbps,
  signalDbm,
  frequencyMhz,
  targetProvider,
  maxMb = 150,
  durationSeconds = 10,
  scopeLabel = 'Standalone Audit',
}) => {
  const [hasConsent, setHasConsent] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setHasConsent(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-[#D9DBDE] shadow-xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#ECECE8] flex items-center justify-between bg-[#F5F5F3]/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#BE6B37]/10 text-[#BE6B37]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#0B0B0D]">Operator Speed Test Authorization</h2>
              <p className="text-[11px] text-[#737373]">Pre-flight network confirmation and safety verification</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#737373] hover:text-[#0B0B0D] hover:bg-[#ECECE8] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto text-xs text-[#0B0B0D]">
          {/* Active Network Link Card */}
          <div className="p-3.5 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#737373] flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-[#BE6B37]" />
                Active Wi-Fi Link (Host Local)
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                Connected
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div>
                <span className="text-[#737373] block text-[10px]">Connected SSID</span>
                <span className="font-bold text-[#0B0B0D]">{connectedSsid || 'Unknown / Not Detected'}</span>
              </div>
              <div>
                <span className="text-[#737373] block text-[10px]">Interface</span>
                <span className="font-mono text-[#0B0B0D]">{interfaceName || 'wlp0s20f3'}</span>
              </div>
              <div>
                <span className="text-[#737373] block text-[10px]">Negotiated PHY Rate</span>
                <span className="font-semibold text-[#0B0B0D]">
                  {rxBitrateMbps ? `${rxBitrateMbps} Mbps RX / ${txBitrateMbps || '—'} Mbps TX` : '—'}
                </span>
              </div>
              <div>
                <span className="text-[#737373] block text-[10px]">Signal / Frequency</span>
                <span className="font-semibold text-[#0B0B0D]">
                  {signalDbm ? `${signalDbm} dBm` : '—'} {frequencyMhz ? `(${frequencyMhz} MHz)` : ''}
                </span>
              </div>
            </div>
            <p className="text-[10px] text-[#737373] italic pt-1 border-t border-[#D9DBDE]/60">
              * Note: The negotiated PHY rate above represents local radio modulation speed, not measured WAN internet throughput.
            </p>
          </div>

          {/* Test Parameters & Scope */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl bg-white border border-[#D9DBDE] space-y-1">
              <span className="text-[10px] font-semibold text-[#737373] block">TARGET PROVIDER</span>
              <span className="font-bold text-[#0B0B0D] text-xs flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5 text-[#BE6B37]" />
                {targetProvider === 'cloudflare' ? 'Cloudflare Edge SDK' : targetProvider}
              </span>
              <span className="text-[10px] text-[#737373] block">HTTP/2 Direct Probes</span>
            </div>
            <div className="p-3 rounded-xl bg-white border border-[#D9DBDE] space-y-1">
              <span className="text-[10px] font-semibold text-[#737373] block">PERSISTENCE SCOPE</span>
              <span className="font-bold text-[#0B0B0D] text-xs truncate block">{scopeLabel}</span>
              <span className="text-[10px] text-emerald-700 block">Isolated Audit Record</span>
            </div>
          </div>

          {/* Transfer & Duration Bounds */}
          <div className="p-3 rounded-xl bg-white border border-[#D9DBDE] space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#737373]">
              Safety Bounds & Traffic Volume
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE]">
                <span className="text-[10px] text-[#737373] block">Est. Data Transfer</span>
                <span className="font-bold text-[#0B0B0D] text-xs">~13–16 MB</span>
              </div>
              <div className="p-2 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE]">
                <span className="text-[10px] text-[#737373] block">Host Data Limit</span>
                <span className="font-bold text-[#0B0B0D] text-xs">{maxMb} MB Max</span>
              </div>
              <div className="p-2 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE]">
                <span className="text-[10px] text-[#737373] block">Duration Cap</span>
                <span className="font-bold text-[#0B0B0D] text-xs">~{durationSeconds}s</span>
              </div>
            </div>
            <div className="text-[10px] text-[#737373] space-y-1">
              <p>• <strong>Latency Phase:</strong> 8 HTTP/2 unloaded ping packets.</p>
              <p>• <strong>Download Phase:</strong> Stepped chunks (250 KB x2, 1 MB x2, 4 MB x2 = 10.5 MB payload).</p>
              <p>• <strong>Upload Phase:</strong> Stepped chunks (250 KB x2, 1 MB x2 = 2.5 MB payload).</p>
            </div>
          </div>

          {/* Network Authorization Notice */}
          <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-900 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Network Operator Authorization</span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-800">
              Active speed testing generates real internet traffic over the connected wireless link. If you are connected to a shared, enterprise, or institutional network, ensure active bandwidth testing is permitted by network policy.
            </p>
          </div>

          {/* Operator Confirmation Checkbox */}
          <label className="flex items-start gap-2.5 p-3 rounded-xl border border-[#D9DBDE] bg-[#F5F5F3]/50 cursor-pointer hover:bg-[#ECECE8]/40 transition-colors">
            <input
              type="checkbox"
              checked={hasConsent}
              onChange={(e) => setHasConsent(e.target.checked)}
              className="rounded border-[#D9DBDE] text-[#BE6B37] focus:ring-[#BE6B37] w-4 h-4 mt-0.5 cursor-pointer"
            />
            <span className="text-xs text-[#0B0B0D] font-medium leading-relaxed">
              I confirm that active speed testing is authorized on network <strong>'{connectedSsid || 'current network'}'</strong> and approve transferring up to ~16 MB of test traffic.
            </span>
          </label>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-[#ECECE8] flex items-center justify-end gap-2.5 bg-[#F5F5F3]/30">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-[#737373] hover:text-[#0B0B0D] hover:bg-[#ECECE8] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (hasConsent) onConfirm();
            }}
            disabled={!hasConsent}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#BE6B37] text-white text-xs font-semibold hover:bg-[#9A5226] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Authorize & Start Test</span>
          </button>
        </div>
      </div>
    </div>
  );
};
