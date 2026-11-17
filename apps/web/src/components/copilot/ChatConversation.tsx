import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  User,
  Copy,
  Check,
  RotateCcw,
  Square,
  AlertCircle,
  Clock,
  Cpu,
  BookmarkCheck,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { ChatMessage } from '../../types/copilot';
import { MarkdownView } from './MarkdownView';

interface ChatConversationProps {
  messages: ChatMessage[];
  streamingContent?: string;
  streamingModel?: string;
  isStreaming: boolean;
  onStop: () => void;
  onRegenerate: (messageId: string) => void;
}

export const ChatConversation: React.FC<ChatConversationProps> = ({
  messages,
  streamingContent,
  streamingModel,
  isStreaming,
  onStop,
  onRegenerate,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedCitations, setExpandedCitations] = useState<Record<string, boolean>>({});

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleCitations = (id: string) => {
    setExpandedCitations((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      {messages.map((msg, index) => {
        const isUser = msg.role === 'user';
        const isLastAssistant = !isUser && index === messages.length - 1;

        if (isUser) {
          return (
            <div key={msg.id || index} className="flex justify-end gap-3 max-w-3xl ml-auto">
              <div className="space-y-1 max-w-[85%]">
                <div className="p-4 rounded-2xl bg-[#0B0B0D] text-white shadow-xs">
                  <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                </div>
                <div className="flex items-center justify-end gap-1.5 text-[10px] text-neutral-400 font-mono pr-1">
                  <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-[#ECECE8] flex items-center justify-center text-neutral-600 flex-shrink-0 mt-0.5 border border-[#D9DBDE]">
                <User className="w-4 h-4" />
              </div>
            </div>
          );
        }

        // Assistant Message Card
        return (
          <div key={msg.id || index} className="flex justify-start gap-3 max-w-4xl mr-auto">
            <div className="w-8 h-8 rounded-xl bg-[#BE6B37] flex items-center justify-center text-white flex-shrink-0 mt-0.5 shadow-xs shadow-[#BE6B37]/30">
              <Sparkles className="w-4 h-4" />
            </div>

            <div className="flex-1 space-y-2 min-w-0">
              {/* Header Badges */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#0B0B0D]">AirGrid Copilot</span>
                  {msg.model_used && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[#ECECE8] text-neutral-700 border border-[#D9DBDE]">
                      <Cpu className="w-3 h-3 text-[#BE6B37]" />
                      <span>{msg.model_used}</span>
                    </span>
                  )}
                  {msg.duration_ms && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-neutral-400">
                      <Clock className="w-2.5 h-2.5" />
                      <span>{msg.duration_ms} ms</span>
                    </span>
                  )}
                </div>

                {/* Actions: Copy & Regenerate */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleCopy(msg.content, msg.id)}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] text-neutral-500 hover:text-[#0B0B0D] hover:bg-[#F5F5F3] rounded-lg transition-colors border border-transparent hover:border-[#D9DBDE]"
                    title="Copy message"
                  >
                    {copiedId === msg.id ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span className="text-emerald-600 font-medium">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                  {isLastAssistant && !isStreaming && (
                    <button
                      onClick={() => onRegenerate(msg.id)}
                      className="flex items-center gap-1 px-2 py-1 text-[11px] text-neutral-500 hover:text-[#BE6B37] hover:bg-[#BE6B37]/10 rounded-lg transition-colors"
                      title="Regenerate response"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Regenerate</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Message Content Card */}
              <div
                className={`p-4 sm:p-5 rounded-2xl bg-white border shadow-xs ${
                  msg.status === 'error' ? 'border-red-200 bg-red-50/20' : 'border-[#D9DBDE]'
                }`}
              >
                {msg.status === 'error' && (
                  <div className="flex items-center gap-2 p-2.5 mb-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{msg.error_message || 'A network or model execution error occurred.'}</span>
                  </div>
                )}
                <MarkdownView content={msg.content} />
              </div>

              {/* Citations / Grounded Evidence Drawer */}
              {msg.citations && msg.citations.length > 0 && (
                <div className="rounded-xl border border-[#D9DBDE] bg-neutral-50 overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => toggleCitations(msg.id)}
                    className="w-full flex items-center justify-between p-2.5 text-left text-neutral-700 hover:bg-neutral-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <BookmarkCheck className="w-3.5 h-3.5 text-[#BE6B37]" />
                      <span className="font-semibold text-xs text-[#0B0B0D]">
                        Grounded Citations & Evidence ({msg.citations.length})
                      </span>
                    </div>
                    {expandedCitations[msg.id] ? (
                      <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                    )}
                  </button>

                  {expandedCitations[msg.id] && (
                    <div className="p-3 pt-0 grid gap-2 sm:grid-cols-2 border-t border-[#D9DBDE]/70 bg-white">
                      {msg.citations.map((cite, ci) => (
                        <div
                          key={ci}
                          className="p-2 rounded-lg border border-[#D9DBDE] bg-[#F5F5F3]/50 space-y-1 text-[11px]"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-[#0B0B0D] truncate">{cite.label}</span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                                cite.provenance === 'MEASURED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {cite.provenance}
                            </span>
                          </div>
                          <p className="text-neutral-600 font-mono text-[10px]">
                            {cite.metric}: <strong className="text-neutral-900">{cite.value}</strong> {cite.unit}
                          </p>
                          <p className="text-[9px] text-neutral-400 font-mono truncate">{cite.source_id}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* In-Flight Streaming Message */}
      {isStreaming && (
        <div className="flex justify-start gap-3 max-w-4xl mr-auto">
          <div className="w-8 h-8 rounded-xl bg-[#BE6B37] flex items-center justify-center text-white flex-shrink-0 mt-0.5 shadow-xs shadow-[#BE6B37]/30">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>

          <div className="flex-1 space-y-2 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#0B0B0D]">AirGrid Copilot</span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-[#BE6B37]/15 text-[#BE6B37] border border-[#BE6B37]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#BE6B37] animate-ping" />
                  <span>Streaming response ({streamingModel || 'auto'})</span>
                </span>
              </div>
              <button
                onClick={onStop}
                className="flex items-center gap-1.5 px-3 py-1 bg-neutral-900 text-white rounded-lg text-xs font-medium hover:bg-neutral-800 transition-colors shadow-xs"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Stop Generating</span>
              </button>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#D9DBDE] shadow-xs">
              <MarkdownView content={streamingContent || ''} />
              <span className="inline-block w-2 h-4 ml-1 bg-[#BE6B37] animate-pulse align-middle" />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
