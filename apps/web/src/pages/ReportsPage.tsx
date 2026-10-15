import React from 'react';
import { Download, FileText } from 'lucide-react';
import { PhaseNotice } from '../components/common/PhaseNotice';
import { StatusBadge } from '../components/common/StatusBadge';

export const ReportsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <PhaseNotice
        pageTitle="15. Analytics & Reports"
        phase00Scope="Executive report container and SLA compliance document layouts established."
        nextPhaseMilestone="Phase 03 will generate downloadable PDF Wi-Fi audit summaries with heatmaps and AI recommendations."
      />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Campus SLA & Coverage Reports</h2>
          <p className="text-xs text-slate-400">Weekly executive audits, dead-zone reconciliations, and capacity forecasts.</p>
        </div>

        <button
          disabled
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-navy-800 text-slate-500 border border-navy-700 text-xs cursor-not-allowed"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export PDF (Phase 03)</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-xl border border-navy-800 bg-navy-900/40 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Weekly Wi-Fi Quality Executive Summary</h3>
              <p className="text-[11px] text-slate-400">Automated Monday n8n digest template</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Consolidates 95th percentile download speeds, floor-level dead-zone percentages, and rogue AP detections across all registered campuses.
          </p>
          <div className="pt-2 flex items-center justify-between text-xs font-mono text-slate-500 border-t border-navy-850">
            <span>Cadence: Weekly (Cron)</span>
            <StatusBadge status="Template Ready" variant="info" />
          </div>
        </div>

        <div className="p-5 rounded-xl border border-navy-800 bg-navy-900/40 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">RF Path-Loss Model Validation Report</h3>
              <p className="text-[11px] text-slate-400">Engineering validation document</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Details empirical RSSI test validation against predicted attenuation matrices, wall material loss coefficients, and cross-validation errors.
          </p>
          <div className="pt-2 flex items-center justify-between text-xs font-mono text-slate-500 border-t border-navy-850">
            <span>Trigger: Post-Training</span>
            <StatusBadge status="Template Ready" variant="info" />
          </div>
        </div>
      </div>
    </div>
  );
};
