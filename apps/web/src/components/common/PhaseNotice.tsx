import React from 'react';
import { Layers, CheckCircle2 } from 'lucide-react';

interface PhaseNoticeProps {
  pageTitle: string;
  phase00Scope: string;
  nextPhaseMilestone: string;
}

export const PhaseNotice: React.FC<PhaseNoticeProps> = ({
  pageTitle,
  phase00Scope,
  nextPhaseMilestone,
}) => {
  return (
    <div className="mb-6 p-4 rounded-xl border border-navy-700 bg-navy-900/60 backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-electric-cyan/10 border border-electric-cyan/20 flex items-center justify-center text-electric-cyan-bright">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white">{pageTitle}</h2>
              <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded bg-electric-cyan/20 text-electric-cyan-bright border border-electric-cyan/40">
                Phase 00 Foundation
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{phase00Scope}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 bg-navy-850 px-3 py-1.5 rounded-lg border border-navy-800">
          <CheckCircle2 className="w-3.5 h-3.5 text-electric-cyan-bright flex-shrink-0" />
          <span>Next: <span className="text-slate-300 font-medium">{nextPhaseMilestone}</span></span>
        </div>
      </div>
    </div>
  );
};
