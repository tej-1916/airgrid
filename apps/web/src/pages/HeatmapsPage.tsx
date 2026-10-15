import React from 'react';
import { MapPin, Layers } from 'lucide-react';
import { PhaseNotice } from '../components/common/PhaseNotice';
import { StatusBadge } from '../components/common/StatusBadge';

export const HeatmapsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <PhaseNotice
        pageTitle="05. Wi-Fi Heatmap Studio"
        phase00Scope="Canvas layout, RF layer toggles, and coordinate scale controls established."
        nextPhaseMilestone="Phase 02 will integrate interactive SVG floor plan canvas with active RSSI gradient rendering."
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Layer Controls Panel */}
        <div className="p-4 rounded-xl border border-navy-800 bg-navy-900/40 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">RF Display Layers</h3>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>

          <div className="space-y-2 text-xs">
            <label className="flex items-center justify-between p-2 rounded-lg bg-navy-950 border border-navy-850 text-slate-300">
              <span>RSSI Signal Heatmap</span>
              <input type="checkbox" defaultChecked disabled className="rounded bg-navy-800" />
            </label>
            <label className="flex items-center justify-between p-2 rounded-lg bg-navy-950 border border-navy-850 text-slate-300">
              <span>Access Point Markers</span>
              <input type="checkbox" defaultChecked disabled className="rounded bg-navy-800" />
            </label>
            <label className="flex items-center justify-between p-2 rounded-lg bg-navy-950 border border-navy-850 text-slate-300">
              <span>Dead Zone Boundary Mask</span>
              <input type="checkbox" disabled className="rounded bg-navy-800" />
            </label>
            <label className="flex items-center justify-between p-2 rounded-lg bg-navy-950 border border-navy-850 text-slate-300">
              <span>ML Predicted Attenuation</span>
              <input type="checkbox" disabled className="rounded bg-navy-800" />
            </label>
          </div>

          <div className="pt-2 border-t border-navy-800 space-y-2">
            <div className="text-[11px] font-semibold text-slate-400">Signal Thresholds (dBm)</div>
            <div className="flex items-center justify-between text-xs font-mono text-slate-300">
              <span className="text-emerald-400">&gt; -65 (Excellent)</span>
              <span className="text-amber-400">-75 to -65 (Fair)</span>
              <span className="text-rose-400">&lt; -80 (Dead Zone)</span>
            </div>
          </div>
        </div>

        {/* Heatmap Canvas Placeholder */}
        <div className="lg:col-span-3 p-6 rounded-xl border border-dashed border-navy-700 bg-navy-950/60 flex flex-col items-center justify-center min-h-[420px] text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-electric-cyan/10 border border-electric-cyan/30 flex items-center justify-center text-electric-cyan-bright">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">2D Heatmap Canvas (Awaiting Survey Data)</h3>
            <p className="text-xs text-slate-400 max-w-md mt-1">
              Phase 02 will render high-resolution raster/SVG floor plans with multi-frequency (2.4 / 5 / 6 GHz)
              spatial interpolation grids.
            </p>
          </div>
          <StatusBadge status="Canvas Shell Ready" variant="phase00" />
        </div>
      </div>
    </div>
  );
};
