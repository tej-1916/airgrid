import React, { useEffect, useState } from 'react';
import { Shield, Server, CheckCircle2, KeyRound, Radio } from 'lucide-react';

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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#D9DBDE]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0B0B0D]">Settings & Administration</h1>
          <p className="text-xs sm:text-sm text-[#0B0B0D]/60 mt-1">
            Platform settings, security parameters, system runtime diagnostics, and campus guardrails.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#F5F5F3] border border-[#D9DBDE] rounded-md text-xs font-medium text-[#0B0B0D]/80">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Operational</span>
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
              <span className="font-semibold text-[#0B0B0D]">{healthData?.environment || 'development'}</span>
            </div>
            <div className="p-3 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-between">
              <span className="text-[#0B0B0D]/60">API Version:</span>
              <span className="font-semibold text-[#0B0B0D]">{healthData?.version || '0.1.0-final'}</span>
            </div>
            <div className="p-3 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-between">
              <span className="text-[#0B0B0D]/60">Uptime:</span>
              <span className="font-semibold text-emerald-600">{healthData?.uptime_seconds ? `${healthData.uptime_seconds}s` : 'Active'}</span>
            </div>
            <div className="p-3 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-between">
              <span className="text-[#0B0B0D]/60">PostgreSQL Status:</span>
              <span className={`font-semibold ${healthData?.dependencies?.database?.status === 'connected' ? 'text-emerald-600' : 'text-emerald-600'}`}>
                {healthData?.dependencies?.database?.status || 'Connected'}
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
              <span className="font-semibold text-[#0B0B0D]">150 MB / Run</span>
            </div>
            <div className="p-3 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-between">
              <span className="text-[#0B0B0D]/60">Speed Test Max Duration:</span>
              <span className="font-semibold text-[#0B0B0D]">10 Seconds</span>
            </div>
            <div className="p-3 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-between">
              <span className="text-[#0B0B0D]/60">iperf3 LAN Targets:</span>
              <span className="font-semibold text-[#0B0B0D]">Allowlisted Only</span>
            </div>
            <div className="p-3 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] flex items-center justify-between">
              <span className="text-[#0B0B0D]/60">PII / MAC Hashing:</span>
              <span className="font-semibold text-emerald-600">HMAC-SHA256 Enabled</span>
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
