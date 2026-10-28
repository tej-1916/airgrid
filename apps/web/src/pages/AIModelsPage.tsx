import React, { useEffect, useState } from 'react';
import { PhaseNotice } from '../components/common/PhaseNotice';
import { StatusBadge } from '../components/common/StatusBadge';

export const AIModelsPage: React.FC = () => {
  const [gatewayConfig, setGatewayConfig] = useState<any>(null);

  useEffect(() => {
    fetch('/api/v1/ai/status')
      .then((res) => res.json())
      .then((data) => setGatewayConfig(data))
      .catch(() => setGatewayConfig(null));
  }, []);

  return (
    <div className="space-y-6">
      <PhaseNotice
        pageTitle="10. AI Model Control Center"
        phase00Scope="AI provider registry, model routing policies, and fallback telemetry views established."
        nextPhaseMilestone="Phase 06 will enable hot-swapping active LLM endpoints (Ollama, Groq, OpenAI) from the UI."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-navy-800 bg-navy-900/40">
          <div className="text-xs text-slate-400 mb-1">Configured Provider Adapter</div>
          <div className="text-sm font-semibold text-white font-mono">
            {gatewayConfig?.provider || 'openai_compatible'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Provider-Independent Architecture</div>
        </div>

        <div className="p-4 rounded-xl border border-navy-800 bg-navy-900/40">
          <div className="text-xs text-slate-400 mb-1">Default Target Model</div>
          <div className="text-sm font-semibold text-white font-mono">
            {gatewayConfig?.default_model || 'llama-3.3-70b-versatile'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">High-Reasoning Diagnostic Model</div>
        </div>

        <div className="p-4 rounded-xl border border-navy-800 bg-navy-900/40">
          <div className="text-xs text-slate-400 mb-1">Provider Credentials</div>
          <div className="text-sm font-semibold text-white">
            {gatewayConfig?.is_configured ? (
              <span className="text-emerald-400">Configured in Server .env</span>
            ) : (
              <span className="text-amber-400">Unconfigured (Safe Phase 00 Mode)</span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">No API keys in client bundles</div>
        </div>
      </div>

      <div className="p-5 rounded-xl border border-navy-800 bg-navy-900/40 space-y-3">
        <h3 className="text-sm font-semibold text-white">Configured Model Endpoints</h3>
        <div className="rounded-lg border border-navy-800 overflow-hidden text-xs">
          <table className="w-full text-left">
            <thead className="bg-navy-950 text-slate-400 font-semibold border-b border-navy-800">
              <tr>
                <th className="py-2.5 px-3">Model Tag</th>
                <th className="py-2.5 px-3">Provider Type</th>
                <th className="py-2.5 px-3">Role / Capability</th>
                <th className="py-2.5 px-3">Verification Policy</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-850 font-mono text-slate-300">
              <tr>
                <td className="py-2.5 px-3 font-medium text-white">llama-3.3-70b-versatile</td>
                <td className="py-2.5 px-3 text-slate-400">OpenAI-Compatible / Groq</td>
                <td className="py-2.5 px-3 font-sans">Primary RF Root-Cause Diagnostician</td>
                <td className="py-2.5 px-3 font-sans text-emerald-400">Strict Header Audit</td>
                <td className="py-2.5 px-3">
                  <StatusBadge status="Ready" variant="healthy" />
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-medium text-white">llama-3.1-8b-instant</td>
                <td className="py-2.5 px-3 text-slate-400">Local Ollama / vLLM</td>
                <td className="py-2.5 px-3 font-sans">Real-time Telemetry Summarizer</td>
                <td className="py-2.5 px-3 font-sans text-emerald-400">Strict Header Audit</td>
                <td className="py-2.5 px-3">
                  <StatusBadge status="Ready" variant="healthy" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
