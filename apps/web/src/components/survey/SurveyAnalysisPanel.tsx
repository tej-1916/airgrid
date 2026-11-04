import React from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Wifi,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  Play,
} from 'lucide-react';
import { SurveySummaryStats, SurveyValidationResponse } from '../../types/survey';
import { SignalLegend, getSignalColor } from './SignalLegend';

interface SurveyAnalysisPanelProps {
  stats: SurveySummaryStats | null;
  validation?: SurveyValidationResponse | null;
  loading?: boolean;
  onRunValidation?: () => void;
  validating?: boolean;
}

export const SurveyAnalysisPanel: React.FC<SurveyAnalysisPanelProps> = ({
  stats,
  validation,
  loading = false,
  onRunValidation,
  validating = false,
}) => {
  if (loading) {
    return (
      <div className="rounded-xl border border-[#D9DBDE] bg-white p-4 animate-pulse space-y-3">
        <div className="h-4 w-32 bg-slate-200 rounded" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-16 bg-slate-100 rounded-lg" />
          <div className="h-16 bg-slate-100 rounded-lg" />
        </div>
      </div>
    );
  }

  const hasData = stats && stats.total_measurements > 0;

  return (
    <div className="rounded-xl border border-[#D9DBDE] bg-white p-4 shadow-xs space-y-4">
      {/* Title */}
      <div className="flex items-center justify-between pb-2 border-b border-[#D9DBDE]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#BE6B37]/10 flex items-center justify-center text-[#BE6B37]">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-[#0B0B0D] uppercase tracking-wider">
              Survey Analysis & Evidence
            </h3>
            <p className="text-[10px] text-[#737373]">
              Calculated exclusively from saved physical observations
            </p>
          </div>
        </div>
      </div>

      {/* Primary Metrics 2x2 Grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Measured Points */}
        <div className="p-2.5 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE]">
          <span className="text-[10px] font-bold text-[#737373] uppercase tracking-wider block">
            Measured Points
          </span>
          <span className="text-lg font-bold font-mono text-[#0B0B0D] mt-0.5 block">
            {stats?.total_measurements ?? 0}
          </span>
          <span className="text-[10px] text-[#737373]">
            {stats?.completed_surveys ?? 0} completed survey{stats?.completed_surveys === 1 ? '' : 's'}
          </span>
        </div>

        {/* Average RSSI */}
        <div className="p-2.5 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE]">
          <span className="text-[10px] font-bold text-[#737373] uppercase tracking-wider block">
            Average Signal
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            {hasData && stats.avg_rssi_dbm !== null ? (
              <>
                <span
                  style={{ color: getSignalColor(stats.avg_rssi_dbm).hex }}
                  className="text-lg font-bold font-mono"
                >
                  {stats.avg_rssi_dbm.toFixed(1)} dBm
                </span>
              </>
            ) : (
              <span className="text-sm font-mono text-[#737373] italic">No samples</span>
            )}
          </div>
          <span className="text-[10px] text-[#737373]">Spatial arithmetic mean</span>
        </div>

        {/* Min RSSI */}
        <div className="p-2.5 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE]">
          <span className="text-[10px] font-bold text-[#737373] uppercase tracking-wider block flex items-center gap-1">
            <TrendingDown className="w-3 h-3 text-rose-600" />
            <span>Minimum (Weakest)</span>
          </span>
          <span className="text-sm font-bold font-mono text-[#0B0B0D] mt-0.5 block">
            {stats?.min_rssi_dbm !== null && stats?.min_rssi_dbm !== undefined
              ? `${stats.min_rssi_dbm} dBm`
              : '—'}
          </span>
        </div>

        {/* Max RSSI */}
        <div className="p-2.5 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE]">
          <span className="text-[10px] font-bold text-[#737373] uppercase tracking-wider block flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-emerald-600" />
            <span>Maximum (Strongest)</span>
          </span>
          <span className="text-sm font-bold font-mono text-[#0B0B0D] mt-0.5 block">
            {stats?.max_rssi_dbm !== null && stats?.max_rssi_dbm !== undefined
              ? `${stats.max_rssi_dbm} dBm`
              : '—'}
          </span>
        </div>
      </div>

      {/* Coverage Availability Bar */}
      <div className="p-3 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-[#0B0B0D]">Measured Coverage Reach</span>
          <span className="font-mono font-bold text-[#BE6B37]">
            {stats?.coverage_availability_pct !== null && stats?.coverage_availability_pct !== undefined
              ? `${stats.coverage_availability_pct.toFixed(0)}%`
              : '0%'}
          </span>
        </div>

        {/* Bar */}
        <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
          <div
            style={{ width: `${Math.min(stats?.coverage_availability_pct || 0, 100)}%` }}
            className="h-full bg-[#BE6B37] rounded-full transition-all duration-300"
          />
        </div>

        <p className="text-[10px] text-[#737373] leading-tight">
          Floor area within 18m radius of at least one genuine observation. Unmeasured areas remain masked.
        </p>
      </div>

      {/* Measurement Source Breakdown */}
      {stats && stats.source_breakdown && Object.keys(stats.source_breakdown).length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-bold text-[#737373] uppercase tracking-wider block">
            Data Source Provenance
          </span>
          <div className="space-y-1">
            {Object.entries(stats.source_breakdown).map(([src, count]) => (
              <div
                key={src}
                className="flex items-center justify-between text-xs p-1.5 rounded-lg bg-white border border-[#D9DBDE]"
              >
                <div className="flex items-center gap-1.5">
                  {src === 'manual_observation' ? (
                    <Wifi className="w-3.5 h-3.5 text-[#BE6B37]" />
                  ) : (
                    <Cpu className="w-3.5 h-3.5 text-teal-600" />
                  )}
                  <span className="capitalize">{src.replace('_', ' ')}</span>
                </div>
                <span className="font-mono font-bold text-[#0B0B0D]">{count} samples</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unmeasured Areas Warning */}
      {stats?.unmeasured_areas_noted && (
        <div className="p-2 rounded-lg bg-amber-50 border border-amber-200/70 text-amber-800 text-[11px] flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
          <p className="leading-tight">
            Areas without measurement evidence are masked out to prevent ungrounded RF extrapolation.
          </p>
        </div>
      )}

      {/* Heatmap Leave-One-Out Cross-Validation (LOOCV Accuracy) */}
      <div className="p-3 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#0B0B0D]">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>LOOCV Model Accuracy</span>
          </div>
          {onRunValidation && (
            <button
              type="button"
              onClick={onRunValidation}
              disabled={validating || !hasData || stats.total_measurements < 3}
              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#BE6B37] text-white hover:bg-[#9A5226] disabled:opacity-40 flex items-center gap-1 transition-colors"
            >
              <Play className="w-2.5 h-2.5" />
              <span>{validating ? 'Evaluating...' : 'Run LOOCV'}</span>
            </button>
          )}
        </div>

        {validation ? (
          <div className="space-y-1.5 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded bg-white border border-[#D9DBDE]">
                <span className="text-[10px] text-[#737373] uppercase font-bold block">Mean Absolute Error</span>
                <span className="text-sm font-bold font-mono text-[#0B0B0D]">
                  {validation.mae_db !== null ? `±${validation.mae_db} dBm` : 'N/A'}
                </span>
              </div>
              <div className="p-2 rounded bg-white border border-[#D9DBDE]">
                <span className="text-[10px] text-[#737373] uppercase font-bold block">Valid Predictions</span>
                <span className="text-sm font-bold font-mono text-[#0B0B0D]">
                  {validation.valid_predictions_count} / {validation.evaluated_samples_count}
                </span>
              </div>
            </div>

            {/* Error distribution buckets */}
            {validation.error_distribution && Object.keys(validation.error_distribution).length > 0 && (
              <div className="p-2 rounded bg-white border border-[#D9DBDE] space-y-1">
                <span className="text-[10px] text-[#737373] uppercase font-bold block">Error Distribution</span>
                <div className="grid grid-cols-4 gap-1 text-[10px] font-mono text-center">
                  <div className="p-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <div>≤2 dB</div>
                    <div className="font-bold">{validation.error_distribution.under_2db || 0}</div>
                  </div>
                  <div className="p-1 rounded bg-teal-50 text-teal-800 border border-teal-200">
                    <div>2-5 dB</div>
                    <div className="font-bold">{validation.error_distribution['2_to_5db'] || 0}</div>
                  </div>
                  <div className="p-1 rounded bg-amber-50 text-amber-800 border border-amber-200">
                    <div>5-10 dB</div>
                    <div className="font-bold">{validation.error_distribution['5_to_10db'] || 0}</div>
                  </div>
                  <div className="p-1 rounded bg-rose-50 text-rose-800 border border-rose-200">
                    <div>&gt;10 dB</div>
                    <div className="font-bold">{validation.error_distribution.over_10db || 0}</div>
                  </div>
                </div>
              </div>
            )}

            {validation.is_sparse_warning && validation.sparse_reasons.length > 0 && (
              <div className="p-2 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] space-y-0.5">
                <span className="font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                  <span>Sparse Sample Notice</span>
                </span>
                <p>{validation.sparse_reasons.join(' ')}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[10px] text-[#737373] leading-tight">
            Leave-one-out cross validation predicts each observation using the remaining survey points to calculate empirical prediction error (MAE dBm).
          </p>
        )}
      </div>

      {/* Signal Legend */}
      <SignalLegend />
    </div>
  );
};
