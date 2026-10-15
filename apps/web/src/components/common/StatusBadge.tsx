import React from 'react';

export type StatusVariant = 'active' | 'degraded' | 'offline' | 'healthy' | 'warning' | 'info' | 'phase00';

interface StatusBadgeProps {
  status: string;
  variant?: StatusVariant;
  pulse?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, variant = 'info', pulse = false }) => {
  const getColors = () => {
    switch (variant) {
      case 'active':
      case 'healthy':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'warning':
      case 'degraded':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'offline':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'phase00':
        return 'bg-electric-cyan/10 text-electric-cyan-bright border-electric-cyan/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const getDotColor = () => {
    switch (variant) {
      case 'active':
      case 'healthy':
        return 'bg-emerald-400';
      case 'warning':
      case 'degraded':
        return 'bg-amber-400';
      case 'offline':
        return 'bg-rose-400';
      case 'phase00':
        return 'bg-electric-cyan';
      default:
        return 'bg-slate-400';
    }
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${getColors()}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${getDotColor()} ${pulse ? 'animate-pulse' : ''}`} />
      {status}
    </span>
  );
};
