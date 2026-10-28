import React from 'react';
import {
  CheckCircle2,
  XCircle,
  ShieldAlert,
  ShieldCheck,
  Info,
  Radio,
} from 'lucide-react';
import { MLDatasetReadiness } from '../../types/ml';

interface DatasetReadinessCardProps {
  readiness: MLDatasetReadiness | null;
  loading: boolean;
  selectedNetwork: string;
  onSelectNetwork: (net: string) => void;
}

export const DatasetReadinessCard: React.FC<DatasetReadinessCardProps> = ({
  readiness,
  loading,
  selectedNetwork,
  onSelectNetwork,
}) => {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-[#D9DBDE] p-6 shadow-sm animate-pulse space-y-4">
        <div className="h-6 w-48 bg-slate-200 rounded"></div>
        <div className="h-4 w-72 bg-slate-100 rounded"></div>
        <div className="h-24 bg-slate-50 rounded-xl"></div>
      </div>
    );
  }

  if (!readiness) {
    return null;
  }

  const { is_ready, headline, guidance, requirements_checklist, available_networks } = readiness;

  return (
    <div className="bg-white rounded-2xl border border-[#D9DBDE] p-6 shadow-sm space-y-5">
      {/* Header & Status Pill */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-[#0B0B0D]">Dataset Readiness & Integrity</h3>
            {is_ready ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5" />
                Ready to Train
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                <ShieldAlert className="w-3.5 h-3.5" />
                Insufficient Field Data
              </span>
            )}
          </div>
          <p className="text-xs text-[#737373] mt-1">{headline}</p>
        </div>

        {/* Network Selector */}
        {available_networks.length > 0 && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Radio className="w-4 h-4 text-[#BE6B37]" />
            <select
              value={selectedNetwork}
              onChange={(e) => onSelectNetwork(e.target.value)}
              className="text-xs font-medium bg-[#F5F5F3] border border-[#D9DBDE] rounded-lg px-2.5 py-1.5 text-[#0B0B0D] focus:outline-none focus:ring-1 focus:ring-[#BE6B37]"
            >
              <option value="">All Networks (Unfiltered)</option>
              {available_networks.map((net) => (
                <option key={net} value={net}>
                  SSID: {net}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Scientific Integrity Guidance Box */}
      <div
        className={`p-4 rounded-xl text-xs leading-relaxed flex items-start gap-3 border ${
          is_ready
            ? 'bg-emerald-50/60 border-emerald-200/80 text-emerald-900'
            : 'bg-amber-50/70 border-amber-200/90 text-amber-900'
        }`}
      >
        <Info className={`w-4 h-4 flex-shrink-0 mt-0.5 ${is_ready ? 'text-emerald-600' : 'text-amber-700'}`} />
        <div>
          <span className="font-semibold">{guidance}</span>
          <p className="mt-1 text-[11px] opacity-90">
            <strong>Scientific Integrity Rule:</strong> AirGrid enforces strict data provenance filtering. Synthetic or
            controlled test imports are strictly excluded from production models, preventing ungrounded generalization
            claims.
          </p>
        </div>
      </div>

      {/* Actual counts by source: only instrument-verified points are training-eligible */}
      {(() => {
        const total = Number(readiness.summary?.total_measurements ?? 0);
        const instrument = Number(readiness.summary?.genuine_measurements ?? 0);
        const imports = Number(readiness.summary?.test_import_measurements ?? 0);
        const other = Math.max(0, total - instrument - imports);
        return (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 text-[11px]" aria-label="Measurement counts by source">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">Instrument-verified (eligible): <strong>{instrument}</strong></span>
              <span className="rounded-full border border-[#D9DBDE] bg-[#F5F5F3] px-2.5 py-1 text-[#525252]">Operator-reported / other (excluded): <strong>{other}</strong></span>
              <span className="rounded-full border border-[#D9DBDE] bg-[#F5F5F3] px-2.5 py-1 text-[#525252]">Controlled test imports (excluded): <strong>{imports}</strong></span>
            </div>
            <p className="text-[11px] text-[#737373]">
              Instrument-verified points are created only by placing a fresh observation from a registered collector (or the
              consented backend host) on a calibrated floor plan in the Survey Studio. Manual entries, imports, IDW estimates
              and model predictions never become training data.
            </p>
          </div>
        );
      })()}

      {/* Structured Checklist Table */}
      <div className="overflow-hidden rounded-xl border border-[#D9DBDE]">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#F5F5F3] border-b border-[#D9DBDE] text-[#0B0B0D] font-semibold">
            <tr>
              <th className="py-2.5 px-3.5">Integrity Requirement</th>
              <th className="py-2.5 px-3 text-center">Status</th>
              <th className="py-2.5 px-3">Current Observed</th>
              <th className="py-2.5 px-3">Required Target</th>
              <th className="py-2.5 px-3 hidden md:table-cell">Scientific Rationale</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D9DBDE] bg-white">
            {requirements_checklist.map((item, idx) => (
              <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                <td className="py-2.5 px-3.5 font-medium text-[#0B0B0D]">{item.requirement}</td>
                <td className="py-2.5 px-3 text-center">
                  {item.met ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Met
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-rose-600 font-semibold text-[11px]">
                      <XCircle className="w-3.5 h-3.5" /> Unmet
                    </span>
                  )}
                </td>
                <td className="py-2.5 px-3 font-mono text-[#0B0B0D]">{String(item.current)}</td>
                <td className="py-2.5 px-3 font-mono text-[#737373]">{String(item.target)}</td>
                <td className="py-2.5 px-3 text-[#737373] hidden md:table-cell text-[11px]">{item.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
