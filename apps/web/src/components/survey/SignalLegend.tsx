import React from 'react';
import { Info } from 'lucide-react';

interface SignalLegendProps {
  compact?: boolean;
}

export const getSignalColor = (rssi: number): { hex: string; label: string; textClass: string; bgClass: string; borderClass: string } => {
  if (rssi >= -50) {
    return {
      hex: '#10B981',
      label: 'Strong (≥ -50 dBm)',
      textClass: 'text-emerald-700',
      bgClass: 'bg-emerald-50',
      borderClass: 'border-emerald-200',
    };
  } else if (rssi >= -67) {
    return {
      hex: '#0D9488',
      label: 'Good (-50 to -67 dBm)',
      textClass: 'text-teal-700',
      bgClass: 'bg-teal-50',
      borderClass: 'border-teal-200',
    };
  } else if (rssi >= -75) {
    return {
      hex: '#D97706',
      label: 'Moderate (-67 to -75 dBm)',
      textClass: 'text-amber-700',
      bgClass: 'bg-amber-50',
      borderClass: 'border-amber-200',
    };
  } else {
    return {
      hex: '#E11D48',
      label: 'Weak (< -75 dBm)',
      textClass: 'text-rose-700',
      bgClass: 'bg-rose-50',
      borderClass: 'border-rose-200',
    };
  }
};

export const SignalLegend: React.FC<SignalLegendProps> = ({ compact = false }) => {
  if (compact) {
    return (
      <div className="flex items-center gap-3 text-[11px] font-medium text-[#737373]">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs" />
          <span>&gt; -50 (Strong)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-500 shadow-xs" />
          <span>-50 to -67 (Good)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-xs" />
          <span>-67 to -75 (Fair)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-xs" />
          <span>&lt; -75 (Weak)</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 rounded-xl bg-white border border-[#D9DBDE] shadow-xs space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-[#0B0B0D] uppercase tracking-wider">
          RF Signal Scale (dBm)
        </h4>
        <span className="text-[10px] font-mono text-[#737373]">Plausible: -100 to -20</span>
      </div>

      {/* Continuous Gradient Bar */}
      <div className="relative h-2.5 rounded-full overflow-hidden bg-gradient-to-r from-rose-500 via-amber-400 via-teal-400 to-emerald-500 shadow-inner" />

      {/* Axis markers */}
      <div className="flex items-center justify-between text-[10px] font-mono text-[#737373] px-0.5">
        <span>-90</span>
        <span>-75</span>
        <span>-67</span>
        <span>-50</span>
        <span>-30</span>
      </div>

      {/* Band classifications */}
      <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
        <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-emerald-50 border border-emerald-200/60 text-emerald-800">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="font-semibold">&gt; -50 dBm</span>
          <span className="text-[10px] text-emerald-600 ml-auto">Strong</span>
        </div>
        <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-teal-50 border border-teal-200/60 text-teal-800">
          <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
          <span className="font-semibold">-50 to -67</span>
          <span className="text-[10px] text-teal-600 ml-auto">Good</span>
        </div>
        <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-amber-50 border border-amber-200/60 text-amber-800">
          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
          <span className="font-semibold">-67 to -75</span>
          <span className="text-[10px] text-amber-600 ml-auto">Moderate</span>
        </div>
        <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-rose-50 border border-rose-200/60 text-rose-800">
          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
          <span className="font-semibold">&lt; -75 dBm</span>
          <span className="text-[10px] text-rose-600 ml-auto">Weak</span>
        </div>
      </div>

      {/* Unknown / Spatial Mask Indicator */}
      <div className="flex items-center justify-between p-2 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] text-[11px] text-[#737373]">
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded border border-dashed border-[#737373] bg-transparent" />
          <span className="font-semibold text-[#0B0B0D]">Unknown / Unmeasured Area</span>
        </div>
        <span className="text-[10px] font-mono">Masked (&gt;18m / outside perimeter)</span>
      </div>

      <div className="flex items-start gap-1.5 pt-1 text-[10px] text-[#737373] border-t border-[#D9DBDE]/50">
        <Info className="w-3.5 h-3.5 text-[#BE6B37] shrink-0 mt-0.5" />
        <p className="leading-tight">
          Physical radio signal strength. Areas outside survey boundaries are marked unknown to avoid speculative extrapolation.
        </p>
      </div>
    </div>
  );
};
