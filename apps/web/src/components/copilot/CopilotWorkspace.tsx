import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Send,
  RefreshCw,
  Cpu,
  ShieldCheck,
  Zap,
  ArrowRight,
  Database,
} from 'lucide-react';
import { Conversation, GatewayStatus } from '../../types/copilot';
import { ChatConversation } from './ChatConversation';

interface CopilotWorkspaceProps {
  activeConversation: Conversation | null;
  onSendMessage: (content: string, options?: { model?: string; includeNetworkContext?: boolean }) => Promise<void>;
  onStopStreaming: () => void;
  onRegenerate: (messageId: string) => Promise<void>;
  streamingContent?: string;
  streamingModel?: string;
  isStreaming: boolean;
  gatewayStatus: GatewayStatus | null;
  onRefreshGateway: () => Promise<void>;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  availableModels: string[];
}

const SUGGESTIONS = [
  {
    title: 'Wi-Fi Latency & Slowness',
    prompt: 'Why is my Wi-Fi slow?',
    desc: 'Analyzes RF signal, packet loss, and link throughput.',
  },
  {
    title: 'Explain Speed Test',
    prompt: 'Explain my latest speed test.',
    desc: 'Interprets download, upload, ping, and bufferbloat metrics.',
  },
  {
    title: 'Weak Coverage Zones',
    prompt: 'Which surveyed areas have weak Wi-Fi coverage?',
    desc: 'Pinpoints physical survey locations with RSSI below -75 dBm.',
  },
  {
    title: 'RF Signal Physics',
    prompt: 'What does -70 dBm mean?',
    desc: 'Explains signal decibel levels and roaming thresholds.',
  },
  {
    title: 'Compare Measurements',
    prompt: 'Compare my recent network measurements.',
    desc: 'Examines telemetry snapshots and trend shifts over time.',
  },
  {
    title: 'RF Optimization',
    prompt: 'What improvements should I consider?',
    desc: 'Recommends channel width, power tuning, and AP adjustments.',
  },
];

export const CopilotWorkspace: React.FC<CopilotWorkspaceProps> = ({
  activeConversation,
  onSendMessage,
  onStopStreaming,
  onRegenerate,
  streamingContent,
  streamingModel,
  isStreaming,
  gatewayStatus,
  onRefreshGateway,
  selectedModel,
  onSelectModel,
  availableModels,
}) => {
  const [input, setInput] = useState('');
  const [includeContext, setIncludeContext] = useState(true);
  const [probing, setProbing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const messages = activeConversation?.messages || [];

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    const text = input.trim();
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    await onSendMessage(text, { model: selectedModel, includeNetworkContext: includeContext });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSelectSuggestion = (prompt: string) => {
    setInput(prompt);
    textareaRef.current?.focus();
  };

  const handleProbeGateway = async () => {
    setProbing(true);
    try {
      await onRefreshGateway();
    } finally {
      setProbing(false);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F5F5F3] overflow-hidden">
      {/* Workspace Top Header */}
      <header className="p-3.5 sm:px-6 bg-white border-b border-[#D9DBDE] flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#BE6B37] flex items-center justify-center text-white flex-shrink-0 shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-[#0B0B0D] truncate">
                {activeConversation?.title || 'AirGrid AI Copilot'}
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.2 rounded-full font-semibold bg-[#BE6B37]/15 text-[#BE6B37] border border-[#BE6B37]/30">
                LIVE COPILOT
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 truncate">
              Grounding in real Wi-Fi telemetry, survey heatmaps & diagnostic evidence
            </p>
          </div>
        </div>

        {/* Model Selector & Gateway Status */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Model Selector */}
          <div className="flex items-center gap-1.5 bg-[#F5F5F3] border border-[#D9DBDE] rounded-xl px-2.5 py-1 text-xs">
            <Cpu className="w-3.5 h-3.5 text-[#BE6B37]" />
            <select
              value={selectedModel}
              onChange={(e) => onSelectModel(e.target.value)}
              className="bg-transparent text-xs font-semibold text-[#0B0B0D] focus:outline-none cursor-pointer max-w-[150px] sm:max-w-[200px] truncate"
            >
              <option value="auto">auto (FreeLLM Router)</option>
              {availableModels
                .filter((m) => m !== 'auto')
                .map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
            </select>
          </div>

          {/* Connection Status Pill */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border ${
              gatewayStatus?.is_configured
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                gatewayStatus?.is_configured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span className="font-mono text-[11px]">
              {gatewayStatus?.is_configured
                ? `Gateway Ready (${gatewayStatus.available_models?.length || 0} models)`
                : 'Unconfigured'}
            </span>
            <button
              onClick={handleProbeGateway}
              disabled={probing}
              className="p-0.5 text-neutral-400 hover:text-neutral-700 ml-0.5"
              title="Test Gateway Connection"
            >
              <RefreshCw className={`w-3 h-3 ${probing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Body */}
      {messages.length === 0 && !isStreaming ? (
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex flex-col items-center justify-center max-w-4xl mx-auto w-full space-y-8">
          {/* Welcome Card */}
          <div className="text-center space-y-3 max-w-xl">
            <div className="w-14 h-14 rounded-2xl bg-[#BE6B37]/15 border border-[#BE6B37]/30 text-[#BE6B37] flex items-center justify-center mx-auto shadow-sm">
              <Sparkles className="w-7 h-7" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#0B0B0D]">
              AirGrid Wi-Fi Intelligence Copilot
            </h2>
            <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
              Ask deep questions about campus Wi-Fi telemetry, survey coverage heatmaps, speed test results, and RF
              interference. Answers are grounded in real AirGrid observations.
            </p>
          </div>

          {/* Suggested Starter Questions */}
          <div className="w-full space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              <Zap className="w-3.5 h-3.5 text-[#BE6B37]" />
              <span>Recommended Wi-Fi Diagnostics & Inquiries</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SUGGESTIONS.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectSuggestion(item.prompt)}
                  className="p-4 rounded-2xl bg-white border border-[#D9DBDE] hover:border-[#BE6B37] hover:shadow-xs transition-all text-left group flex flex-col justify-between space-y-2"
                >
                  <div>
                    <h3 className="text-xs font-bold text-[#0B0B0D] group-hover:text-[#BE6B37] transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-[11px] font-medium text-neutral-800 mt-1 italic">
                      "{item.prompt}"
                    </p>
                    <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">{item.desc}</p>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-[#BE6B37] pt-1">
                    <span>Ask prompt</span>
                    <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Security & Provenance Banner */}
          <div className="w-full p-4 rounded-2xl bg-white border border-[#D9DBDE] flex items-start gap-3 text-xs text-neutral-600">
            <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold text-[#0B0B0D]">Privacy & Grounding Safeguards Active</p>
              <p className="text-[11px] leading-relaxed">
                Raw MAC addresses, BSSIDs, private IPs, and credentials are automatically redacted before model transmission.
                Physical measurements are tagged with <span className="font-mono text-emerald-700 font-bold">[MEASURED]</span>.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <ChatConversation
          messages={messages}
          streamingContent={streamingContent}
          streamingModel={streamingModel}
          isStreaming={isStreaming}
          onStop={onStopStreaming}
          onRegenerate={onRegenerate}
        />
      )}

      {/* Bottom Chat Input Bar */}
      <footer className="p-3 sm:p-4 bg-white border-t border-[#D9DBDE]">
        <div className="max-w-4xl mx-auto space-y-2">
          {/* Options Row */}
          <div className="flex items-center justify-between text-xs text-neutral-500 px-1">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeContext}
                onChange={(e) => setIncludeContext(e.target.checked)}
                className="rounded border-[#D9DBDE] text-[#BE6B37] focus:ring-[#BE6B37]"
              />
              <Database className="w-3.5 h-3.5 text-[#BE6B37]" />
              <span className="text-[11px] font-medium text-neutral-700">
                Include campus network telemetry & speed tests in context
              </span>
            </label>

            <span className="text-[10px] text-neutral-400 hidden sm:inline font-mono">
              Press Enter to send · Shift+Enter for new line
            </span>
          </div>

          {/* Input Box */}
          <div className="relative flex items-end gap-2 bg-[#F5F5F3] border border-[#D9DBDE] rounded-2xl p-2 focus-within:border-[#BE6B37] focus-within:ring-1 focus-within:ring-[#BE6B37] transition-all">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask AirGrid AI Copilot about signal strength, speed tests, or coverage..."
              className="flex-1 max-h-36 bg-transparent text-xs sm:text-sm text-[#0B0B0D] placeholder-neutral-400 focus:outline-none resize-none px-2 py-1 leading-relaxed"
            />

            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="w-8 h-8 rounded-xl bg-[#BE6B37] hover:bg-[#A85B2D] text-white flex items-center justify-center flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-xs"
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
