import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { PhaseNotice } from '../components/common/PhaseNotice';
import { StatusBadge } from '../components/common/StatusBadge';

export const AlertsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <PhaseNotice
        pageTitle="14. Alerts & Notifications"
        phase00Scope="Incident inbox layout and severity badge models established."
        nextPhaseMilestone="Phase 02 will generate automated alerts when live RSSI or speed test thresholds degrade."
      />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Network Incidents & Event Inbox</h2>
          <p className="text-xs text-slate-400">Degradation alarms, dead-zone warnings, and system event triggers.</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="p-4 rounded-xl border border-navy-800 bg-navy-900/40 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">Structural Co-Channel Interference</span>
                <StatusBadge status="Warning" variant="warning" />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Floors 2 and 3 reported simultaneous beacon overlap on 5GHz Channel 36.
              </p>
              <div className="text-[11px] font-mono text-slate-500 mt-2">
                Source: Schema Spec | Location: North Campus Engineering (Bldg 1)
              </div>
            </div>
          </div>
          <span className="text-[11px] font-mono text-slate-500 flex-shrink-0">Sample Spec</span>
        </div>

        <div className="p-4 rounded-xl border border-navy-800 bg-navy-900/40 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Info className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">System Architecture Initialized</span>
                <StatusBadge status="Info" variant="info" />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                AirGrid Phase 00 modular monolith backend and React application shell verified.
              </p>
              <div className="text-[11px] font-mono text-slate-500 mt-2">
                Source: Platform Boot | Version: 0.1.0-phase00
              </div>
            </div>
          </div>
          <span className="text-[11px] font-mono text-slate-500 flex-shrink-0">Active</span>
        </div>
      </div>
    </div>
  );
};
