import React, { useEffect, useState } from 'react';
import { Shield, Server } from 'lucide-react';
import { PhaseNotice } from '../components/common/PhaseNotice';

export const SettingsPage: React.FC = () => {
  const [healthData, setHealthData] = useState<any>(null);

  useEffect(() => {
    fetch('/api/v1/health')
      .then((res) => res.json())
      .then((data) => setHealthData(data))
      .catch(() => setHealthData(null));
  }, []);

  return (
    <div className="space-y-6">
      <PhaseNotice
        pageTitle="16. Settings & Administration"
        phase00Scope="Platform settings, security parameters, and live system diagnostics established."
        nextPhaseMilestone="Phase 01 will enable user management, RBAC policy edits, and database backup exports."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Core System Configuration */}
        <div className="p-5 rounded-xl border border-navy-800 bg-navy-900/40 space-y-4">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-electric-cyan" />
            <h3 className="text-sm font-semibold text-white">System Runtime & Diagnostics</h3>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-navy-950 border border-navy-850 flex items-center justify-between">
              <span className="text-slate-400">Environment:</span>
              <span className="text-white">{healthData?.environment || 'development'}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-navy-950 border border-navy-850 flex items-center justify-between">
              <span className="text-slate-400">API Version:</span>
              <span className="text-white">{healthData?.version || '0.1.0-phase00'}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-navy-950 border border-navy-850 flex items-center justify-between">
              <span className="text-slate-400">Uptime:</span>
              <span className="text-emerald-400">{healthData?.uptime_seconds ? `${healthData.uptime_seconds}s` : 'Active'}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-navy-950 border border-navy-850 flex items-center justify-between">
              <span className="text-slate-400">PostgreSQL Status:</span>
              <span className={healthData?.dependencies?.database?.status === 'connected' ? 'text-emerald-400' : 'text-amber-400'}>
                {healthData?.dependencies?.database?.status || 'Engine Initialized'}
              </span>
            </div>
          </div>
        </div>

        {/* Security & Measurement Guardrails */}
        <div className="p-5 rounded-xl border border-navy-800 bg-navy-900/40 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Network Measurement Guardrails</h3>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-navy-950 border border-navy-850 flex items-center justify-between">
              <span className="text-slate-400">Speed Test Max Traffic:</span>
              <span className="text-white">150 MB / Run</span>
            </div>
            <div className="p-2.5 rounded-lg bg-navy-950 border border-navy-850 flex items-center justify-between">
              <span className="text-slate-400">Speed Test Max Duration:</span>
              <span className="text-white">10 Seconds</span>
            </div>
            <div className="p-2.5 rounded-lg bg-navy-950 border border-navy-850 flex items-center justify-between">
              <span className="text-slate-400">iperf3 LAN Targets:</span>
              <span className="text-white">Allowlisted Only</span>
            </div>
            <div className="p-2.5 rounded-lg bg-navy-950 border border-navy-850 flex items-center justify-between">
              <span className="text-slate-400">PII / MAC Hashing:</span>
              <span className="text-emerald-400">HMAC-SHA256 Enabled</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
