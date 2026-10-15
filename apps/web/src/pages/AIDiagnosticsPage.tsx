import React, { useState } from 'react';
import { Bot, Send, ShieldCheck } from 'lucide-react';
import { PhaseNotice } from '../components/common/PhaseNotice';
import { StatusBadge } from '../components/common/StatusBadge';

export const AIDiagnosticsPage: React.FC = () => {
  const [prompt, setPrompt] = useState(
    'Analyze RF degradation on Floor 2: RSSI dropped to -82 dBm near room 204.'
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleRunDiagnostic = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/v1/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'diagnostic',
          prompt: prompt,
          requested_model: 'llama-3.3-70b-versatile',
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setResult({
        status: 'error',
        error_message: err.message || 'Failed to reach AI Gateway API',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PhaseNotice
        pageTitle="09. AI Diagnostics Studio"
        phase00Scope="Interactive AI Gateway invocation console with verified model auditing established."
        nextPhaseMilestone="Phase 03 will wire active LLM keys, retrieval-augmented grounding from telemetry, and automated remediation prompts."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Diagnostic Query Panel */}
        <div className="lg:col-span-2 p-5 rounded-xl border border-navy-800 bg-navy-900/40 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Bot className="w-4 h-4 text-electric-cyan" />
              <span>Network Problem Diagnosis Prompt</span>
            </h3>
            <span className="text-[11px] font-mono text-slate-400">Target Model: Llama 3.3 70B</span>
          </div>

          <form onSubmit={handleRunDiagnostic} className="space-y-3">
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full bg-navy-950 border border-navy-700 rounded-lg p-3 text-xs text-slate-200 font-mono focus:outline-none focus:border-electric-cyan"
              placeholder="Describe network issue, co-channel symptoms, or RSSI drop..."
            />

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Category: <span className="text-slate-300 font-mono">diagnostic</span>
              </span>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-electric-cyan text-void font-semibold text-xs hover:bg-electric-cyan-bright transition-all disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{loading ? 'Evaluating Gateway...' : 'Execute Gateway Test'}</span>
              </button>
            </div>
          </form>

          {/* Real AI Gateway Response Container */}
          {result && (
            <div className="pt-4 border-t border-navy-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Gateway Execution Record</span>
                <StatusBadge
                  status={result.status.toUpperCase()}
                  variant={result.status === 'success' ? 'healthy' : 'warning'}
                />
              </div>

              <div className="p-3 rounded-lg bg-navy-950 border border-navy-850 font-mono text-xs space-y-2">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Requested Model:</span>
                  <span className="text-white">{result.requested_model}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Verified Executing Model:</span>
                  <span className={result.is_verified_execution ? 'text-emerald-400' : 'text-amber-400'}>
                    {result.verified_model || 'Unverified (Provider concealed or offline)'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Fallback Detected:</span>
                  <span className={result.fallback_detected ? 'text-rose-400' : 'text-slate-300'}>
                    {result.fallback_detected ? 'YES (Model downgraded)' : 'NO'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Gateway Status Message:</span>
                  <span className="text-electric-cyan-bright">{result.output_text || result.error_message}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Model Provenance Sidebar */}
        <div className="p-5 rounded-xl border border-navy-800 bg-navy-900/40 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Model Truthfulness</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            AirGrid never assumes the model responding is the model requested. Commercial API routers
            frequently degrade to smaller quantized checkpoints during peak traffic.
          </p>
          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded-lg bg-navy-950 border border-navy-850">
              <div className="font-semibold text-white">Server-Side Secret Isolation</div>
              <p className="text-[11px] text-slate-400 mt-0.5">API keys remain exclusively on the FastAPI host.</p>
            </div>
            <div className="p-2.5 rounded-lg bg-navy-950 border border-navy-850">
              <div className="font-semibold text-white">Execution Audit Logging</div>
              <p className="text-[11px] text-slate-400 mt-0.5">Every prompt logs duration, tokens, and model flags in PostgreSQL.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
