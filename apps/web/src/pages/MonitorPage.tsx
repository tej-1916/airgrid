import { Activity, Wifi, Zap } from 'lucide-react';
import { PhaseNotice } from '../components/common/PhaseNotice';

export const MonitorPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <PhaseNotice
        pageTitle="08. Live Network Monitor"
        phase00Scope="Real-time telemetry event card layouts and streaming placeholder established."
        nextPhaseMilestone="Phase 02 will connect backend WebSocket streams for active AP telemetry and channel utilization."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-navy-800 bg-navy-900/40">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Live Telemetry Channel</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-sm font-semibold text-white">WebSocket Ingestion</div>
          <div className="text-[11px] text-slate-500 font-mono mt-1">Status: Ready for Phase 02</div>
        </div>

        <div className="p-4 rounded-xl border border-navy-800 bg-navy-900/40">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Airspace Frequency Bands</span>
            <Wifi className="w-4 h-4 text-electric-cyan" />
          </div>
          <div className="text-sm font-semibold text-white">2.4 GHz / 5 GHz / 6 GHz</div>
          <div className="text-[11px] text-slate-500 font-mono mt-1">Multi-band RF Schema Active</div>
        </div>

        <div className="p-4 rounded-xl border border-navy-800 bg-navy-900/40">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Active Polling Interval</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-sm font-semibold text-white">5,000 ms (Configurable)</div>
          <div className="text-[11px] text-slate-500 font-mono mt-1">Low-overhead Beacon Mode</div>
        </div>
      </div>

      <div className="p-8 rounded-xl border border-dashed border-navy-700 bg-navy-950/40 text-center space-y-3">
        <div className="w-10 h-10 rounded-lg bg-navy-800 text-slate-400 flex items-center justify-center mx-auto">
          <Activity className="w-5 h-5 text-electric-cyan" />
        </div>
        <h3 className="text-sm font-semibold text-white">Live RF Stream Streamer (Standby)</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Real-time time-series telemetry charts showing dynamic client counts, noise floors, and packet error rates
          will be hydrated via live WebSockets in Phase 02.
        </p>
      </div>
    </div>
  );
};
