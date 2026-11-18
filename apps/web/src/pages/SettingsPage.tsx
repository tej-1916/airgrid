import React, { useEffect, useState } from 'react';
import { Shield, Server, CheckCircle2, AlertTriangle, KeyRound, Radio } from 'lucide-react';
import { apiRequest } from '../services/api';

export const SettingsPage: React.FC = () => {
  const [healthData, setHealthData] = useState<any>(null);
  const [healthError, setHealthError] = useState(false);
  const [limits, setLimits] = useState<{ max_mb: number; duration_seconds: number } | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/v1/health')
      .then((res) => { if (!res.ok) throw new Error(String(res.status)); return res.json(); })
      .then((data) => { if (active) setHealthData(data); })
      .catch(() => { if (active) setHealthError(true); });
    apiRequest<{ max_mb: number; duration_seconds: number }>('/api/v1/speed-tests/config')
      .then((cfg) => { if (active) setLimits(cfg); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const unavailable = 'Unavailable';
  const dbStatus: string | undefined = healthData?.dependencies?.database?.status;
  const healthy = healthData?.status === 'healthy';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#D9DBDE]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0B0B0D]">Settings & Administration</h1>
          <p className="text-xs sm:text-sm text-[#0B0B0D]/60 mt-1">
            Platform settings, security parameters, system runtime diagnostics, and campus guardrails.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#F5F5F3] border border-[#D9DBDE] rounded-md text-xs font-medium text-[#0B0B0D]/80">
          {healthy ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
          <span>{healthError ? 'Status unavailable' : !healthData ? 'Checking…' : healthy ? 'Operational' : 'Degraded'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Core System Configuration */}
        <div className="p-5 rounded-xl border border-[#D9DBDE] bg-white space-y-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-[#BE6B37]" />
            <h2 className="text-sm font-semibold text-[#0B0B0D]">System Runtime & Diagnostics</h2>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="p-3 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-between">
              <span className="text-[#0B0B0D]/60">Environment:</span>
              <span className="font-semibold text-[#0B0B0D]">{healthData?.environment ?? unavailable}</span>
            </div>
            <div className="p-3 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-between">
              <span className="text-[#0B0B0D]/60">API Version:</span>
              <span className="font-semibold text-[#0B0B0D]">{healthData?.version ?? unavailable}</span>
            </div>
            <div className="p-3 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-between">
              <span className="text-[#0B0B0D]/60">Uptime:</span>
              <span className="font-semibold text-[#0B0B0D]">{healthData?.uptime_seconds != null ? `${Math.round(healthData.uptime_seconds)}s` : unavailable}</span>
            </div>
            <div className="p-3 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-between">
              <span className="text-[#0B0B0D]/60">PostgreSQL Status:</span>
              <span className={`font-semibold ${dbStatus === 'connected' ? 'text-emerald-600' : 'text-amber-600'}`}>
                {dbStatus ?? unavailable}
              </span>
            </div>
          </div>
        </div>

        {/* Security & Measurement Guardrails */}
        <div className="p-5 rounded-xl border border-[#D9DBDE] bg-white space-y-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-[#0B0B0D]">Network Measurement Guardrails</h2>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="p-3 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-between">
              <span className="text-[#0B0B0D]/60">Speed Test Max Traffic:</span>
              <span className="font-semibold text-[#0B0B0D]">{limits ? `${limits.max_mb} MB / Run` : unavailable}</span>
            </div>
            <div className="p-3 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-between">
              <span className="text-[#0B0B0D]/60">Speed Test Max Duration:</span>
              <span className="font-semibold text-[#0B0B0D]">{limits ? `${limits.duration_seconds} Seconds` : unavailable}</span>
            </div>
            <div className="p-3 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-between">
              <span className="text-[#0B0B0D]/60">iperf3 LAN Targets:</span>
              <span className="font-semibold text-[#0B0B0D]">Allowlisted Only</span>
            </div>
          </div>
        </div>

        {/* Access Control & Governance */}
        <div className="p-5 rounded-xl border border-[#D9DBDE] bg-white space-y-4 shadow-sm">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#BE6B37]" />
            <h2 className="text-sm font-semibold text-[#0B0B0D]">Campus Access Control (RBAC)</h2>
          </div>
          <p className="text-xs text-[#0B0B0D]/70 leading-relaxed">
            Campus-level authorization is enforced on all API routes. Non-admin users require an explicit Campus Membership entry to view buildings, floor plans, signal measurements, and operational plans.
          </p>
          <div className="p-3 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] text-xs space-y-1">
            <div className="flex justify-between text-[#0B0B0D]/80">
              <span className="font-medium">Administrator</span>
              <span>Global unrestricted access</span>
            </div>
            <div className="flex justify-between text-[#0B0B0D]/80">
              <span className="font-medium">Network Engineer</span>
              <span>Scoped to assigned campuses</span>
            </div>
            <div className="flex justify-between text-[#0B0B0D]/80">
              <span className="font-medium">Viewer</span>
              <span>Read-only on assigned campuses</span>
            </div>
          </div>
        </div>

        {/* Collector Telemetry Governance */}
        <div className="p-5 rounded-xl border border-[#D9DBDE] bg-white space-y-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-[#0B0B0D]">Collector Telemetry Governance</h2>
          </div>
          <p className="text-xs text-[#0B0B0D]/70 leading-relaxed">
            Linux collector endpoints require signed HMAC-SHA256 tokens with a ±300s timestamp window. Secret keys are displayed once at creation and never stored in plaintext or logged.
          </p>
          <div className="p-3 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] text-xs space-y-1">
            <div className="flex justify-between text-[#0B0B0D]/80">
              <span className="font-medium">Replay Protection</span>
              <span className="text-emerald-600 font-medium">Enforced (300s window)</span>
            </div>
            <div className="flex justify-between text-[#0B0B0D]/80">
              <span className="font-medium">Rate Limiting</span>
              <span className="text-emerald-600 font-medium">Enforced per collector</span>
            </div>
            <div className="flex justify-between text-[#0B0B0D]/80">
              <span className="font-medium">Hardware Scans</span>
              <span className="text-emerald-600 font-medium">Operator-Initiated Only</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
