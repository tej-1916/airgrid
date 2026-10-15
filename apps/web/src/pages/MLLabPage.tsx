import React from 'react';
import { Play } from 'lucide-react';
import { PhaseNotice } from '../components/common/PhaseNotice';
import { StatusBadge } from '../components/common/StatusBadge';

export const MLLabPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <PhaseNotice
        pageTitle="11. ML Prediction Lab"
        phase00Scope="ML training pipeline specifications and model artifact evaluation shells established."
        nextPhaseMilestone="Phase 03 will ingest actual survey dataset matrices and train Random Forest / ITU Path-Loss regressors."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-navy-800 bg-navy-900/40">
          <div className="text-xs text-slate-400 mb-1">Active Champion Model</div>
          <div className="text-sm font-semibold text-white font-mono">itu_indoor_pathloss_v1</div>
          <div className="text-[11px] text-slate-500 mt-1">Physics-Grounded Free-Space Attenuation</div>
        </div>

        <div className="p-4 rounded-xl border border-navy-800 bg-navy-900/40">
          <div className="text-xs text-slate-400 mb-1">ML Technology Stack</div>
          <div className="text-sm font-semibold text-white">scikit-learn / NumPy / SciPy</div>
          <div className="text-[11px] text-slate-500 mt-1">Local Joblib Artifact Storage</div>
        </div>

        <div className="p-4 rounded-xl border border-navy-800 bg-navy-900/40">
          <div className="text-xs text-slate-400 mb-1">Target Evaluation Metric</div>
          <div className="text-sm font-semibold text-white font-mono">RMSE &lt; 4.5 dBm</div>
          <div className="text-[11px] text-slate-500 mt-1">K-Fold Spatial Cross Validation</div>
        </div>
      </div>

      <div className="p-5 rounded-xl border border-navy-800 bg-navy-900/40 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">RF Path-Loss Model Evaluation Registry</h3>
          <button
            disabled
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-800 text-slate-500 border border-navy-700 text-xs cursor-not-allowed"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Retrain Pipeline (Phase 03)</span>
          </button>
        </div>

        <div className="rounded-lg border border-navy-800 overflow-hidden text-xs">
          <table className="w-full text-left">
            <thead className="bg-navy-950 text-slate-400 font-semibold border-b border-navy-800">
              <tr>
                <th className="py-2.5 px-3">Algorithm</th>
                <th className="py-2.5 px-3">Version</th>
                <th className="py-2.5 px-3">RMSE (dBm)</th>
                <th className="py-2.5 px-3">MAE (dBm)</th>
                <th className="py-2.5 px-3">R² Score</th>
                <th className="py-2.5 px-3">Artifact Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-850 font-mono text-slate-300">
              <tr>
                <td className="py-2.5 px-3 font-sans font-medium text-white">ITU-R P.1238 Indoor Model</td>
                <td className="py-2.5 px-3">v1.0.0</td>
                <td className="py-2.5 px-3">--</td>
                <td className="py-2.5 px-3">--</td>
                <td className="py-2.5 px-3">--</td>
                <td className="py-2.5 px-3 font-sans">
                  <StatusBadge status="Baseline Spec" variant="info" />
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-sans font-medium text-white">Random Forest Spatial Regressor</td>
                <td className="py-2.5 px-3">v1.0.0-draft</td>
                <td className="py-2.5 px-3">--</td>
                <td className="py-2.5 px-3">--</td>
                <td className="py-2.5 px-3">--</td>
                <td className="py-2.5 px-3 font-sans">
                  <StatusBadge status="Awaiting Dataset" variant="phase00" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
