import React, { useEffect, useState } from 'react';
import { Cpu, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw, KeyRound, Radio } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface GatewayStatus {
  is_configured: boolean;
  provider: string;
  endpoint: string;
  default_model: string;
  active_model: string;
  available_models: string[];
  last_health_check: {
    status: string;
    error?: string;
    detail?: string;
    latency_ms?: number;
    model?: string;
    discovered_models?: string[];
    discovered_count?: number;
    timestamp?: string;
  } | null;
  last_success: string | null;
  last_failure: string | null;
  response_latency_ms: number | null;
  execution_identity: string;
  privacy_status: string;
  default_mode: string;
  retry_limit: number;
  max_completion_tokens: number;
}

export const AIModelsPage: React.FC = () => {
  const { user } = useAuth();
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [customModel, setCustomModel] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const canManage = user?.role === 'administrator' || user?.role === 'network_engineer';

  const loadStatus = async () => {
    try {
      const data = await apiRequest<GatewayStatus>('/api/v1/ai/status');
      setStatus(data);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load AI Gateway status.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleTestConnection = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const health = await apiRequest<{ status: string; detail?: string; error?: string; latency_ms?: number; discovered_count?: number }>(
        '/api/v1/ai/health',
        { method: 'POST' }
      );
      if (health.status === 'available') {
        setMessage({
          type: 'success',
          text: `Provider connected successfully (${health.latency_ms ?? 0} ms). ${health.discovered_count ? `${health.discovered_count} model(s) discovered.` : ''}`,
        });
      } else {
        setMessage({
          type: 'error',
          text: `Provider check reported: ${health.status}. ${health.detail || health.error || ''}`,
        });
      }
      await loadStatus();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Health check failed.' });
    } finally {
      setTesting(false);
    }
  };

  const handleSelectModel = async (modelId: string) => {
    if (!modelId.trim()) return;
    setSelecting(true);
    setMessage(null);
    try {
      await apiRequest('/api/v1/ai/select-model', {
        method: 'POST',
        body: JSON.stringify({ model: modelId.trim() }),
      });
      setMessage({ type: 'success', text: `Active model switched to: ${modelId.trim()}` });
      setCustomModel('');
      await loadStatus();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Model selection failed.' });
    } finally {
      setSelecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-neutral-500 gap-2">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span>Loading AI Gateway status…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-[#0B0B0D]">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#BE6B37]">Intelligence Integration</span>
            <span className="text-xs bg-[#E5E7EB] text-neutral-700 px-2 py-0.5 rounded-full font-mono">OpenAI-Compatible</span>
          </div>
          <h1 className="text-2xl font-bold mt-1 text-[#0B0B0D]">AI Gateway & FreeLLMAPI Control</h1>
          <p className="text-sm text-neutral-600 mt-1">
            Configure external AI transport, inspect endpoint status, discover available models, and audit privacy boundaries.
          </p>
        </div>

        <button
          onClick={handleTestConnection}
          disabled={testing || !canManage || !status?.is_configured}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#BE6B37] text-white rounded-lg text-sm font-medium hover:bg-[#A85B2D] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${testing ? 'animate-spin' : ''}`} />
          <span>{testing ? 'Probing Provider…' : 'Test Connection'}</span>
        </button>
      </div>

      {message && (
        <div
          role="alert"
          className={`p-4 rounded-xl text-sm border flex items-start gap-3 ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : message.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-900'
              : 'bg-blue-50 border-blue-200 text-blue-900'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          )}
          <div>{message.text}</div>
        </div>
      )}

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-[#D9DBDE] shadow-sm">
          <div className="flex items-center justify-between text-xs text-neutral-500 font-medium mb-1">
            <span>Gateway State</span>
            <Radio className="w-4 h-4 text-[#BE6B37]" />
          </div>
          <div className="text-base font-bold text-[#0B0B0D] mt-1">
            {status?.is_configured ? (
              <span className="text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Configured
              </span>
            ) : (
              <span className="text-amber-700 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> Unconfigured
              </span>
            )}
          </div>
          <div className="text-xs text-neutral-500 mt-2 truncate font-mono">
            {status?.endpoint || 'No endpoint configured'}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-[#D9DBDE] shadow-sm">
          <div className="flex items-center justify-between text-xs text-neutral-500 font-medium mb-1">
            <span>Active Model</span>
            <Cpu className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-base font-bold text-[#0B0B0D] mt-1 font-mono truncate" title={status?.active_model || 'None'}>
            {status?.active_model || 'Not configured'}
          </div>
          <div className="text-xs text-neutral-500 mt-2">
            Default: <span className="font-mono">{status?.default_model || 'None'}</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-[#D9DBDE] shadow-sm">
          <div className="flex items-center justify-between text-xs text-neutral-500 font-medium mb-1">
            <span>Last Health Check</span>
            <RefreshCw className="w-4 h-4 text-neutral-400" />
          </div>
          <div className="text-base font-bold text-[#0B0B0D] mt-1">
            {status?.last_health_check ? (
              <span className="capitalize">{status.last_health_check.status}</span>
            ) : (
              <span className="text-neutral-500">Pending probe</span>
            )}
          </div>
          <div className="text-xs text-neutral-500 mt-2">
            {status?.response_latency_ms !== null && status?.response_latency_ms !== undefined
              ? `Latency: ${status.response_latency_ms} ms`
              : 'Latency not recorded'}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-[#D9DBDE] shadow-sm">
          <div className="flex items-center justify-between text-xs text-neutral-500 font-medium mb-1">
            <span>Data Boundary</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-base font-bold text-emerald-800 mt-1">Strict Consent Gate</div>
          <div className="text-xs text-neutral-500 mt-2">Local deterministic default</div>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Model Selection & Discovery */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white border border-[#D9DBDE] rounded-2xl p-6 shadow-sm space-y-4" aria-label="Model discovery">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#0B0B0D]">Available Provider Models</h2>
                <p className="text-xs text-neutral-600 mt-0.5">
                  Models discovered dynamically from the provider endpoint via OpenAI-compatible <code className="bg-[#F5F5F3] px-1.5 py-0.5 rounded">/models</code>.
                </p>
              </div>
              <span className="text-xs font-mono bg-[#F5F5F3] px-2.5 py-1 rounded-full text-neutral-700">
                {status?.available_models?.length ?? 0} found
              </span>
            </div>

            {status?.available_models && status.available_models.length > 0 ? (
              <div className="divide-y divide-[#E5E7EB] border border-[#D9DBDE] rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                {status.available_models.map((modelId) => {
                  const isActive = status.active_model === modelId;
                  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-neutral-500 gap-2">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span>Loading AI Gateway status…</span>
      </div>
    );
  }

  return (
                    <div key={modelId} className="flex items-center justify-between p-3.5 hover:bg-[#F9FAFB] transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Cpu className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-[#BE6B37]' : 'text-neutral-400'}`} />
                        <span className={`text-sm font-mono truncate ${isActive ? 'font-bold text-[#0B0B0D]' : 'text-neutral-700'}`}>
                          {modelId}
                        </span>
                        {isActive && (
                          <span className="text-[10px] bg-[#BE6B37]/10 text-[#BE6B37] font-semibold px-2 py-0.5 rounded-full uppercase">
                            Active
                          </span>
                        )}
                      </div>
                      {!isActive && canManage && (
                        <button
                          onClick={() => handleSelectModel(modelId)}
                          disabled={selecting}
                          className="px-3 py-1 text-xs border border-[#D9DBDE] rounded-lg hover:bg-white text-neutral-700 font-medium transition-colors"
                        >
                          Select
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center bg-[#F5F5F3] rounded-xl border border-dashed border-[#D9DBDE]">
                <Cpu className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-neutral-700">No discovered models listed yet</p>
                <p className="text-xs text-neutral-500 mt-1 max-w-md mx-auto">
                  Click "Test Connection" above to perform a live probe to the configured endpoint and discover available models.
                </p>
              </div>
            )}

            {/* Custom / Configured Model Selection Input */}
            {canManage && (
              <div className="pt-2 border-t border-[#E5E7EB]">
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Manually Switch Model Identifier
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    placeholder="e.g. llama-3.3-70b-versatile, gpt-4o-mini, mistral..."
                    className="flex-1 px-3 py-2 border border-[#D9DBDE] rounded-lg text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-[#BE6B37]"
                  />
                  <button
                    onClick={() => handleSelectModel(customModel)}
                    disabled={!customModel.trim() || selecting}
                    className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm font-medium disabled:opacity-40"
                  >
                    Set Model
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Execution Telemetry & Security Audit */}
          <section className="bg-white border border-[#D9DBDE] rounded-2xl p-6 shadow-sm space-y-4" aria-label="Gateway status details">
            <h2 className="text-lg font-semibold text-[#0B0B0D]">Transport Configuration & Safeguards</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="p-3.5 bg-[#F5F5F3] rounded-xl space-y-1">
                <span className="text-xs text-neutral-500 font-medium">Provider Protocol</span>
                <p className="font-mono text-neutral-900">OpenAI Compatible REST</p>
                <p className="text-xs text-neutral-500">Supports Ollama, FreeLLMAPI, vLLM, Groq, DeepSeek</p>
              </div>

              <div className="p-3.5 bg-[#F5F5F3] rounded-xl space-y-1">
                <span className="text-xs text-neutral-500 font-medium">Model Identity Verification</span>
                <p className="text-neutral-900 font-medium">Self-Reported Only</p>
                <p className="text-xs text-neutral-500">Provider header claims are recorded without independent attestation</p>
              </div>

              <div className="p-3.5 bg-[#F5F5F3] rounded-xl space-y-1">
                <span className="text-xs text-neutral-500 font-medium">Rate Limits & Concurrency</span>
                <p className="font-mono text-neutral-900">10 req / min per process</p>
                <p className="text-xs text-neutral-500">Max tokens: 1024, zero retries on error</p>
              </div>

              <div className="p-3.5 bg-[#F5F5F3] rounded-xl space-y-1">
                <span className="text-xs text-neutral-500 font-medium">Last Successful Execution</span>
                <p className="font-mono text-neutral-900 text-xs">
                  {status?.last_success ? new Date(status.last_success).toLocaleString() : 'None recorded'}
                </p>
                <p className="text-xs text-neutral-500">
                  Last failure: {status?.last_failure || 'None'}
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Setup Guidance & Privacy Notice */}
        <div className="space-y-6">
          <section className="bg-white border border-[#D9DBDE] rounded-2xl p-6 shadow-sm space-y-4" aria-label="Setup guide">
            <div className="flex items-center gap-2 text-neutral-900 font-semibold">
              <KeyRound className="w-5 h-5 text-[#BE6B37]" />
              <span>Connecting FreeLLMAPI</span>
            </div>

            <p className="text-xs text-neutral-600 leading-relaxed">
              AirGrid connects to FreeLLMAPI or any OpenAI-compatible provider via server-side environment variables. API credentials are never logged or delivered to the browser.
            </p>

            <div className="p-3 bg-[#0B0B0D] text-neutral-200 rounded-xl font-mono text-xs space-y-1 overflow-x-auto">
              <p className="text-neutral-500"># In your AirGrid .env file:</p>
              <p>AIRGRID_AI_ENABLED=true</p>
              <p>AIRGRID_AI_PROVIDER=openai_compatible</p>
              <p>AIRGRID_AI_API_BASE_URL=&lt;provider_url&gt;</p>
              <p>AIRGRID_AI_API_KEY=&lt;optional_key&gt;</p>
              <p>AIRGRID_AI_DEFAULT_MODEL=&lt;model_id&gt;</p>
            </div>

            <div className="text-xs text-neutral-600 space-y-1.5 border-t border-[#E5E7EB] pt-3">
              <p>• <strong>Loopback:</strong> HTTP endpoints allowed on 127.0.0.1 without credentials.</p>
              <p>• <strong>Remote:</strong> HTTPS and credentials are required to protect data in flight.</p>
              <p>• <strong>Cost:</strong> AirGrid uses free/open inference; no paid APIs required.</p>
            </div>
          </section>

          <section className="bg-white border border-[#D9DBDE] rounded-2xl p-6 shadow-sm space-y-3" aria-label="Privacy guarantee">
            <div className="flex items-center gap-2 text-neutral-900 font-semibold">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <span>Privacy & Telemetry Isolation</span>
            </div>

            <p className="text-xs text-neutral-600 leading-relaxed">
              {status?.privacy_status ||
                'Explicit operator consent required per request. Network names, addresses, device names and plans excluded.'}
            </p>

            <ul className="text-xs text-neutral-600 space-y-1 list-disc pl-4">
              <li>No Wi-Fi credentials or passwords ever captured.</li>
              <li>SSIDs, BSSIDs, and MACs redacted before transport.</li>
              <li>Deterministic findings remain authoritative.</li>
              <li>Ungrounded model hallucination is rejected.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
};
