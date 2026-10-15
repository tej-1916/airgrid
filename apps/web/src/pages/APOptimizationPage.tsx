import React from 'react';
import { Sliders, Sparkles } from 'lucide-react';
import { PhaseNotice } from '../components/common/PhaseNotice';
import { StatusBadge } from '../components/common/StatusBadge';

export const APOptimizationPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <PhaseNotice
        pageTitle="12. AP Optimization Studio"
        phase00Scope="Simulation parameter controls and placement optimization workspace established."
        nextPhaseMilestone="Phase 03 will integrate heuristic Monte Carlo AP coordinate generators and channel assignment solvers."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Simulation Controls */}
        <div className="p-5 rounded-xl border border-navy-800 bg-navy-900/40 space-y-4">
          <h3 className="text-sm font-semibold text-white">Simulation Parameters</h3>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 font-medium">Target Floor</label>
              <select disabled className="w-full mt-1 bg-navy-950 border border-navy-800 rounded-lg p-2 text-slate-300">
                <option>North Campus - CS Labs (Floor 2)</option>
              </select>
            </div>

            <div>
              <label className="text-slate-400 font-medium">AP Hardware Budget</label>
              <input type="number" defaultValue={4} disabled className="w-full mt-1 bg-navy-950 border border-navy-800 rounded-lg p-2 text-slate-300" />
            </div>

            <div>
              <label className="text-slate-400 font-medium">Target Minimum Coverage RSSI</label>
              <div className="text-slate-200 font-mono mt-1">-67 dBm (Voice/Video Tier)</div>
            </div>

            <button
              disabled
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-navy-800 text-slate-500 font-semibold text-xs cursor-not-allowed mt-2"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Run Optimization Engine (Phase 03)</span>
            </button>
          </div>
        </div>

        {/* Output Workspace Placeholder */}
        <div className="lg:col-span-2 p-8 rounded-xl border border-dashed border-navy-700 bg-navy-950/40 text-center flex flex-col items-center justify-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-electric-blue/10 border border-electric-blue/30 flex items-center justify-center text-electric-blue-bright">
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Algorithmic AP Placement Output</h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              Simulations will project optimized (X, Y) coordinates, channel plans, and dead-zone reductions on the floor canvas in Phase 03.
            </p>
          </div>
          <StatusBadge status="Simulation Shell Ready" variant="phase00" />
        </div>
      </div>
    </div>
  );
};
