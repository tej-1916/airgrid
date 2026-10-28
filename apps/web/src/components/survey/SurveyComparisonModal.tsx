import React from 'react';
import { X, GitCompare, TrendingUp, TrendingDown } from 'lucide-react';
import { SurveyComparisonResponse } from '../../types/survey';

interface SurveyComparisonModalProps {
  comparison: SurveyComparisonResponse | null;
  onClose: () => void;
}

export const SurveyComparisonModal: React.FC<SurveyComparisonModalProps> = ({
  comparison,
  onClose,
}) => {
  if (!comparison) return null;

  const { session1, session2, sample_count_delta, avg_rssi_delta_db, min_rssi_delta_db, max_rssi_delta_db } =
    comparison;

  const isRssiImproved = avg_rssi_delta_db !== null && avg_rssi_delta_db > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-xl rounded-2xl bg-white border border-[#D9DBDE] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 px-6 border-b border-[#D9DBDE] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#BE6B37]/10 flex items-center justify-center text-[#BE6B37]">
              <GitCompare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#0B0B0D] tracking-tight">
                Historical Survey Comparison
              </h2>
              <p className="text-xs text-[#737373]">
                Comparing RF observations across two time periods on the same floor
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#737373] hover:text-[#0B0B0D] hover:bg-[#F5F5F3]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Side by side sessions */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-1">
              <span className="text-[10px] font-bold text-[#737373] uppercase tracking-wider">
                Baseline Session
              </span>
              <h4 className="text-xs font-bold text-[#0B0B0D] truncate">
                {session1.session_name}
              </h4>
              <p className="text-[11px] text-[#737373]">
                {session1.measurement_count} observations • {session1.status}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-[#BE6B37]/5 border border-[#BE6B37]/30 space-y-1">
              <span className="text-[10px] font-bold text-[#BE6B37] uppercase tracking-wider">
                Comparison Session
              </span>
              <h4 className="text-xs font-bold text-[#0B0B0D] truncate">
                {session2.session_name}
              </h4>
              <p className="text-[11px] text-[#737373]">
                {session2.measurement_count} observations • {session2.status}
              </p>
            </div>
          </div>

          {/* Delta Statistics Cards */}
          <div className="grid grid-cols-4 gap-2">
            <div className="p-2.5 rounded-xl bg-white border border-[#D9DBDE] text-center space-y-0.5">
              <span className="text-[10px] font-bold text-[#737373] uppercase tracking-wider block">
                Sample Delta
              </span>
              <span className="text-base font-bold font-mono text-[#0B0B0D] block">
                {sample_count_delta > 0 ? `+${sample_count_delta}` : sample_count_delta}
              </span>
              <span className="text-[10px] text-[#737373]">observations</span>
            </div>

            <div className="p-2.5 rounded-xl bg-white border border-[#D9DBDE] text-center space-y-0.5">
              <span className="text-[10px] font-bold text-[#737373] uppercase tracking-wider block">
                Avg Shift
              </span>
              <div className="flex items-center justify-center gap-1">
                {isRssiImproved ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
                )}
                <span
                  className={`text-base font-bold font-mono ${
                    isRssiImproved ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {avg_rssi_delta_db !== null
                    ? `${avg_rssi_delta_db > 0 ? `+${avg_rssi_delta_db}` : avg_rssi_delta_db} dB`
                    : '—'}
                </span>
              </div>
              <span className="text-[10px] text-[#737373]">mean change</span>
            </div>

            <div className="p-2.5 rounded-xl bg-white border border-[#D9DBDE] text-center space-y-0.5">
              <span className="text-[10px] font-bold text-[#737373] uppercase tracking-wider block">
                Min Delta
              </span>
              <span className="text-base font-bold font-mono text-[#0B0B0D] block">
                {min_rssi_delta_db !== null
                  ? `${min_rssi_delta_db > 0 ? `+${min_rssi_delta_db}` : min_rssi_delta_db} dB`
                  : '—'}
              </span>
              <span className="text-[10px] text-[#737373]">floor floor</span>
            </div>

            <div className="p-2.5 rounded-xl bg-white border border-[#D9DBDE] text-center space-y-0.5">
              <span className="text-[10px] font-bold text-[#737373] uppercase tracking-wider block">
                Max Delta
              </span>
              <span className="text-base font-bold font-mono text-[#0B0B0D] block">
                {max_rssi_delta_db !== null
                  ? `${max_rssi_delta_db > 0 ? `+${max_rssi_delta_db}` : max_rssi_delta_db} dB`
                  : '—'}
              </span>
              <span className="text-[10px] text-[#737373]">peak delta</span>
            </div>
          </div>

          {/* Technical Summary */}
          <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] text-xs text-[#0B0B0D] space-y-1">
            <span className="font-semibold block">Comparative Assessment</span>
            <p className="text-[#737373] text-[11px] leading-relaxed">
              {comparison.notes}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 px-6 bg-[#F5F5F3] border-t border-[#D9DBDE] flex justify-end">
          <button
            onClick={onClose}
            className="py-1.5 px-4 rounded-lg bg-[#BE6B37] text-white text-xs font-semibold hover:bg-[#9A5226]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
