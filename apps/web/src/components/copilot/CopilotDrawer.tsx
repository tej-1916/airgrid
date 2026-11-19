import React, { useEffect, useState } from 'react';
import {
  X,
  Sparkles,
  Maximize2,
  Send,
  Square,
  AlertCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCopilotDrawer } from '../../context/CopilotDrawerContext';
import { copilotService } from '../../services/copilotService';
import { Conversation, ChatMessage } from '../../types/copilot';
import { ChatConversation } from './ChatConversation';

export const CopilotDrawer: React.FC = () => {
  const { isOpen, closeDrawer, prefillQuery } = useCopilotDrawer();
  const navigate = useNavigate();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [selectedModel, setSelectedModel] = useState('auto');
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingModel, setStreamingModel] = useState('');
  const [abortFn, setAbortFn] = useState<(() => void) | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize or fetch latest conversation
  const loadData = async () => {
    try {
      const [statusData, convListData] = await Promise.all([
        copilotService.getGatewayStatus().catch(() => null),
        copilotService.listConversations(10),
      ]);

      if (statusData && statusData.active_model) {
        setSelectedModel(statusData.active_model);
      }

      if (convListData.conversations.length > 0) {
        const fullConv = await copilotService.getConversation(convListData.conversations[0].id);
        setConversation(fullConv);
      } else {
        const newConv = await copilotService.createConversation('Contextual Copilot Chat', 'auto');
        setConversation(newConv);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to initialize Copilot drawer.');
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (prefillQuery && isOpen) {
      setInput(prefillQuery);
    }
  }, [prefillQuery, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    const userText = input.trim();
    setInput('');
    setError(null);

    let activeConv = conversation;
    if (!activeConv) {
      try {
        activeConv = await copilotService.createConversation('Contextual Copilot Chat', selectedModel);
        setConversation(activeConv);
      } catch (err: any) {
        setError(err.message);
        return;
      }
    }

    const optimisticUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: activeConv.id,
      role: 'user',
      content: userText,
      status: 'completed',
      created_at: new Date().toISOString(),
    };

    setConversation((prev) =>
      prev ? { ...prev, messages: [...prev.messages, optimisticUserMsg] } : prev
    );

    setIsStreaming(true);
    setStreamingContent('');
    setStreamingModel(selectedModel);

    let accumulated = '';
    let chosenModel = selectedModel;

    const stop = copilotService.streamMessage(
      activeConv.id,
      userText,
      {
        onChunk: (piece, model) => {
          accumulated += piece;
          setStreamingContent(accumulated);
          if (model) {
            chosenModel = model;
            setStreamingModel(model);
          }
        },
        onDone: (doneData) => {
          setIsStreaming(false);
          setStreamingContent('');
          setAbortFn(null);
          const finalMsg: ChatMessage = {
            id: doneData.message_id || `asst-${Date.now()}`,
            conversation_id: activeConv!.id,
            role: 'assistant',
            content: doneData.content || accumulated,
            model_used: doneData.model || chosenModel,
            duration_ms: doneData.duration_ms,
            citations: doneData.citations,
            status: 'completed',
            created_at: new Date().toISOString(),
          };
          setConversation((prev) =>
            prev ? { ...prev, messages: [...prev.messages, finalMsg] } : prev
          );
        },
        onError: (err) => {
          setIsStreaming(false);
          setStreamingContent('');
          setAbortFn(null);
          setError(err.message);
        },
      },
      undefined,
      { model: selectedModel, includeNetworkContext: true }
    );

    setAbortFn(() => stop);
  };

  const handleStop = () => {
    if (abortFn) {
      abortFn();
      setAbortFn(null);
    }
    setIsStreaming(false);
  };

  const handleRegenerate = async (msgId: string) => {
    if (!conversation) return;
    try {
      const regenerated = await copilotService.regenerateMessage(conversation.id, msgId);
      setConversation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((m) => (m.id === msgId ? regenerated : m)),
        };
      });
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate message.');
    }
  };

  const handleOpenFullWorkspace = () => {
    closeDrawer();
    navigate('/ai-copilot');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-xs transition-opacity"
        onClick={closeDrawer}
      />

      {/* Slide-over Drawer Panel */}
      <div className="relative w-full max-w-lg bg-[#F5F5F3] h-full shadow-2xl flex flex-col border-l border-[#D9DBDE] z-10 animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-3.5 bg-white border-b border-[#D9DBDE] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-[#BE6B37] flex items-center justify-center text-white flex-shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-bold text-[#0B0B0D] truncate">AirGrid Copilot</h2>
              <div className="flex items-center gap-1.5 text-[10px] text-neutral-500 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Contextual Assistant</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleOpenFullWorkspace}
              className="p-1.5 text-neutral-500 hover:text-[#0B0B0D] hover:bg-[#F5F5F3] rounded-lg transition-colors"
              title="Expand to Full AI Workspace"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={closeDrawer}
              className="p-1.5 text-neutral-500 hover:text-[#0B0B0D] hover:bg-[#F5F5F3] rounded-lg transition-colors"
              title="Close Drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-3 bg-red-50 border-b border-red-200 text-red-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-xs font-bold underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto">
          {conversation && conversation.messages.length > 0 ? (
            <ChatConversation
              messages={conversation.messages}
              streamingContent={streamingContent}
              streamingModel={streamingModel}
              isStreaming={isStreaming}
              onStop={handleStop}
              onRegenerate={handleRegenerate}
            />
          ) : (
            <div className="p-6 text-center space-y-3 my-auto">
              <div className="w-10 h-10 rounded-xl bg-[#BE6B37]/15 text-[#BE6B37] flex items-center justify-center mx-auto">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-[#0B0B0D]">Contextual Network Intelligence</h3>
              <p className="text-xs text-neutral-500 max-w-xs mx-auto">
                Ask about coverage, interference, or metrics on this page. AirGrid Copilot inspects recorded observations in real-time.
              </p>
            </div>
          )}
        </div>

        {/* Drawer Bottom Input */}
        <div className="p-3 bg-white border-t border-[#D9DBDE]">
          <div className="relative flex items-end gap-2 bg-[#F5F5F3] border border-[#D9DBDE] rounded-xl p-1.5 focus-within:border-[#BE6B37]">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask Copilot about this view..."
              className="flex-1 max-h-28 bg-transparent text-xs text-[#0B0B0D] placeholder-neutral-400 focus:outline-none resize-none px-2 py-1 leading-relaxed"
            />
            {isStreaming ? (
              <button
                onClick={handleStop}
                className="w-7 h-7 rounded-lg bg-neutral-900 text-white flex items-center justify-center flex-shrink-0"
                title="Stop generation"
              >
                <Square className="w-3 h-3 fill-current" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="w-7 h-7 rounded-lg bg-[#BE6B37] hover:bg-[#A85B2D] text-white flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition-colors shadow-xs"
                title="Send"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
