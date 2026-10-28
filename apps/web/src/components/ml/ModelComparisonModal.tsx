import React from 'react';
import { X, Award } from 'lucide-react';
import { MLModel } from '../../types/ml';

interface ModelComparisonModalProps {
  model: MLModel | null;
  onClose: () => void;
}

export const ModelComparisonModal: React.FC<ModelComparisonModalProps> = ({
  model,
  onClose,
}) => {
  if (!model) return null;

  const ev = model.evaluation;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl border border-[#D9DBDE] shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#D9DBDE] bg-[#F5F5F3]">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-[#0B0B0D]">{model.model_name}</h3>
              {model.is_current_champion && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                  Active Champion
                </span>
              )}
            </div>
            <p className="text-xs text-[#737373] mt-0.5">
              Algorithm: {model.algorithm} • Validation: {model.validation_strategy}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#737373] hover:text-[#0B0B0D] hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Verdict Banner */}
          {ev?.ml_vs_idw_verdict && (
            <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 text-xs text-amber-950 flex items-start gap-3">
              <Award className="w-5 h-5 text-[#BE6B37] flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-sm block mb-1">Baseline Comparison Verdict</span>
                <p className="leading-relaxed">{ev.ml_vs_idw_verdict}</p>
              </div>
            </div>
          )}

          {/* Side-by-Side Baselines Table */}
          {ev && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-[#0B0B0D] uppercase tracking-wider">
                Cross-Validation Benchmark Comparison
              </h4>
              <div className="rounded-xl border border-[#D9DBDE] overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#F5F5F3] border-b border-[#D9DBDE] text-[#0B0B0D] font-semibold">
                    <tr>
                      <th className="py-2.5 px-3.5">Metric</th>
                      <th className="py-2.5 px-3 font-mono text-[#BE6B37]">ML Model</th>
                      <th className="py-2.5 px-3 font-mono">Phase 04 IDW</th>
                      <th className="py-2.5 px-3 font-mono">Mean Baseline</th>
                      <th className="py-2.5 px-3 font-mono text-emerald-700">ML vs IDW Delta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D9DBDE] bg-white font-mono">
                    <tr>
                      <td className="py-2.5 px-3.5 font-sans font-medium text-[#0B0B0D]">RMSE (dBm)</td>
                      <td className="py-2.5 px-3 font-bold text-[#BE6B37]">{ev.rmse_db.toFixed(2)} dBm</td>
                      <td className="py-2.5 px-3 text-[#737373]">
                        {ev.baseline_idw_rmse_db !== null && ev.baseline_idw_rmse_db !== undefined
                          ? `${ev.baseline_idw_rmse_db.toFixed(2)} dBm`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-[#737373]">{ev.baseline_mean_rmse_db.toFixed(2)} dBm</td>
                      <td className="py-2.5 px-3 font-bold text-emerald-700">
                        {ev.baseline_idw_rmse_db !== null && ev.baseline_idw_rmse_db !== undefined
                          ? `${(ev.baseline_idw_rmse_db - ev.rmse_db > 0 ? '-' : '+')}${Math.abs(
                              ev.baseline_idw_rmse_db - ev.rmse_db
                            ).toFixed(2)} dBm`
                          : '—'}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3.5 font-sans font-medium text-[#0B0B0D]">MAE (dBm)</td>
                      <td className="py-2.5 px-3 font-bold text-[#BE6B37]">{ev.mae_db.toFixed(2)} dBm</td>
                      <td className="py-2.5 px-3 text-[#737373]">
                        {ev.baseline_idw_mae_db !== null && ev.baseline_idw_mae_db !== undefined
                          ? `${ev.baseline_idw_mae_db.toFixed(2)} dBm`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-[#737373]">{ev.baseline_mean_mae_db.toFixed(2)} dBm</td>
                      <td className="py-2.5 px-3 font-bold text-emerald-700">
                        {ev.baseline_idw_mae_db !== null && ev.baseline_idw_mae_db !== undefined
                          ? `${(ev.baseline_idw_mae_db - ev.mae_db > 0 ? '-' : '+')}${Math.abs(
                              ev.baseline_idw_mae_db - ev.mae_db
                            ).toFixed(2)} dBm`
                          : '—'}
                      </td>
                    </tr>
                    {model.r2_score !== null && model.r2_score !== undefined && (
                      <tr>
                        <td className="py-2.5 px-3.5 font-sans font-medium text-[#0B0B0D]">R² Score</td>
                        <td className="py-2.5 px-3 font-bold text-[#BE6B37]">{model.r2_score.toFixed(4)}</td>
                        <td className="py-2.5 px-3 text-[#737373]">—</td>
                        <td className="py-2.5 px-3 text-[#737373]">0.0000</td>
                        <td className="py-2.5 px-3 font-bold text-emerald-700">+{model.r2_score.toFixed(4)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Residuals Distribution Percentiles */}
          {ev?.residuals_distribution && Object.keys(ev.residuals_distribution).length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-[#0B0B0D] uppercase tracking-wider">
                Residual Errors Distribution (True - Predicted dBm)
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
                <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE]">
                  <div className="text-[10px] font-sans text-[#737373] uppercase">Mean Error</div>
                  <div className="text-base font-bold text-[#0B0B0D] mt-0.5">
                    {ev.residuals_distribution.mean.toFixed(2)} dBm
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE]">
                  <div className="text-[10px] font-sans text-[#737373] uppercase">Std Deviation (σ)</div>
                  <div className="text-base font-bold text-[#0B0B0D] mt-0.5">
                    {ev.residuals_distribution.std.toFixed(2)} dBm
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE]">
                  <div className="text-[10px] font-sans text-[#737373] uppercase">Median (P50)</div>
                  <div className="text-base font-bold text-[#0B0B0D] mt-0.5">
                    {ev.residuals_distribution.p50.toFixed(2)} dBm
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE]">
                  <div className="text-[10px] font-sans text-[#737373] uppercase">IQR (P25 - P75)</div>
                  <div className="text-base font-bold text-[#0B0B0D] mt-0.5">
                    [{ev.residuals_distribution.p25.toFixed(1)}, {ev.residuals_distribution.p75.toFixed(1)}]
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Metadata Specs */}
          <div className="p-4 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] space-y-2 text-xs">
            <h5 className="font-semibold text-[#0B0B0D]">Model Artifact Specifications</h5>
            <div className="grid grid-cols-2 gap-2 text-[#737373]">
              <div>
                <strong>Evaluated Observations:</strong> {model.training_sample_count} points
              </div>
              <div>
                <strong>Validation Strategy:</strong> {model.validation_strategy}
              </div>
              <div className="col-span-2 truncate">
                <strong>Hyperparameters:</strong> {JSON.stringify(model.hyperparameters)}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#D9DBDE] bg-[#F5F5F3] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white border border-[#D9DBDE] text-[#0B0B0D] font-semibold text-xs hover:bg-slate-100 transition-colors"
          >
            Close Benchmark
          </button>
        </div>
      </div>
    </div>
  );
};
