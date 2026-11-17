import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Conversation, ConversationSummary, GatewayStatus } from '../types/copilot';
import { copilotService } from '../services/copilotService';
import { ConversationList } from '../components/copilot/ConversationList';
import { CopilotWorkspace } from '../components/copilot/CopilotWorkspace';

export const AICopilotPage: React.FC = () => {
  const navState = useLocation().state as { floorId?: string; prompt?: string } | null;
  const [focusFloorId, setFocusFloorId] = useState<string | null>(navState?.floorId ?? null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>(['auto']);
  const [selectedModel, setSelectedModel] = useState<string>('auto');
  const [loading, setLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingModel, setStreamingModel] = useState('');
  const [abortFn, setAbortFn] = useState<(() => void) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState<{ content: string; options?: { model?: string; includeNetworkContext?: boolean; floorId?: string } } | null>(null);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [status, convList] = await Promise.all([
        copilotService.getGatewayStatus().catch(() => null),
        copilotService.listConversations(50).catch(() => ({ conversations: [], total: 0 })),
      ]);

      if (status) {
        setGatewayStatus(status);
        const models = ['auto', ...(status.available_models || [])];
        const uniqueModels = Array.from(new Set(models));
        setAvailableModels(uniqueModels);
        if (status.active_model) {
          setSelectedModel(status.active_model);
        }
      }

      setConversations(convList.conversations);

      if (convList.conversations.length > 0) {
        const firstId = convList.conversations[0].id;
        setActiveId(firstId);
        const fullConv = await copilotService.getConversation(firstId);
        setActiveConversation(fullConv);
      } else {
        // Create initial conversation
        const newConv = await copilotService.createConversation('AirGrid Copilot Chat', selectedModel);
        setActiveId(newConv.id);
        setActiveConversation(newConv);
        setConversations([
          {
            id: newConv.id,
            title: newConv.title,
            model: newConv.model,
            campus_id: newConv.campus_id,
            created_at: newConv.created_at,
            updated_at: newConv.updated_at,
            message_count: 0,
          },
        ]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load Copilot workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const handleSelectConversation = async (id: string) => {
    if (id === activeId) return;
    if (isStreaming && abortFn) {
      abortFn();
      setIsStreaming(false);
    }
    setActiveId(id);
    try {
      const fullConv = await copilotService.getConversation(id);
      setActiveConversation(fullConv);
      if (fullConv.model) {
        setSelectedModel(fullConv.model);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load conversation.');
    }
  };

  const handleNewConversation = async () => {
    if (isStreaming && abortFn) {
      abortFn();
      setIsStreaming(false);
    }
    try {
      const newConv = await copilotService.createConversation('New Conversation', selectedModel);
      setConversations((prev) => [
        {
          id: newConv.id,
          title: newConv.title,
          model: newConv.model,
          campus_id: newConv.campus_id,
          created_at: newConv.created_at,
          updated_at: newConv.updated_at,
          message_count: 0,
        },
        ...prev,
      ]);
      setActiveId(newConv.id);
      setActiveConversation(newConv);
    } catch (err: any) {
      setError(err.message || 'Failed to create conversation.');
    }
  };

  const handleRename = async (id: string, newTitle: string) => {
    try {
      const updated = await copilotService.updateConversation(id, { title: newTitle });
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c))
      );
      if (activeConversation && activeConversation.id === id) {
        setActiveConversation((prev) => (prev ? { ...prev, title: updated.title } : prev));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to rename conversation.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await copilotService.deleteConversation(id);
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);

      if (activeId === id) {
        if (remaining.length > 0) {
          handleSelectConversation(remaining[0].id);
        } else {
          setActiveId(null);
          setActiveConversation(null);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete conversation.');
    }
  };

  const handleRefreshGateway = async () => {
    try {
      await copilotService.checkGatewayHealth();
      const status = await copilotService.getGatewayStatus();
      setGatewayStatus(status);
      const models = ['auto', ...(status.available_models || [])];
      setAvailableModels(Array.from(new Set(models)));
    } catch (err: any) {
      setError(err.message || 'Failed to probe gateway.');
    }
  };

  const handleSelectModel = async (model: string) => {
    setSelectedModel(model);
    if (activeId) {
      try {
        await copilotService.updateConversation(activeId, { model });
        setConversations((prev) =>
          prev.map((c) => (c.id === activeId ? { ...c, model } : c))
        );
        setActiveConversation((prev) => (prev ? { ...prev, model } : prev));
      } catch {
        // silently handled
      }
    }
  };

  const handleSendMessage = async (
    content: string,
    options?: { model?: string; includeNetworkContext?: boolean; floorId?: string },
    retry = false
  ) => {
    if (!activeId) return;
    setError(null);
    setRetryable(null);

    if (retry) {
      // Server re-runs the stored user message and deletes the failed reply: drop it locally too.
      setActiveConversation((prev) =>
        prev
          ? {
              ...prev,
              messages: prev.messages.filter(
                (m, i) => !(i === prev.messages.length - 1 && m.role === 'assistant' && m.status === 'error')
              ),
            }
          : prev
      );
    } else {
      // Optimistically add user message to conversation
      const optimisticUserMsg = {
        id: `temp-${Date.now()}`,
        conversation_id: activeId,
        role: 'user' as const,
        content,
        status: 'completed' as const,
        created_at: new Date().toISOString(),
      };
      setActiveConversation((prev) =>
        prev ? { ...prev, messages: [...prev.messages, optimisticUserMsg] } : prev
      );
    }

    setIsStreaming(true);
    setStreamingContent('');
    setStreamingModel(selectedModel);

    let accumulated = '';
    let executingModel = selectedModel;

    const stop = copilotService.streamMessage(
      activeId,
      content,
      {
        onChunk: (piece, model) => {
          accumulated += piece;
          setStreamingContent(accumulated);
          if (model) {
            executingModel = model;
            setStreamingModel(model);
          }
        },
        onDone: (doneData) => {
          setIsStreaming(false);
          setStreamingContent('');
          setAbortFn(null);

          const finalAssistantMsg = {
            id: doneData.message_id || `asst-${Date.now()}`,
            conversation_id: activeId,
            role: 'assistant' as const,
            content: doneData.content || accumulated,
            model_used: doneData.model || executingModel,
            duration_ms: doneData.duration_ms,
            citations: doneData.citations,
            status: 'completed' as const,
            created_at: new Date().toISOString(),
          };

          setActiveConversation((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              messages: [...prev.messages, finalAssistantMsg],
            };
          });

          // Refresh conversation list preview
          setConversations((prev) =>
            prev.map((c) =>
              c.id === activeId
                ? {
                    ...c,
                    message_count: c.message_count + (retry ? 1 : 2),
                    last_message_preview: (doneData.content || accumulated).slice(0, 60),
                    updated_at: new Date().toISOString(),
                  }
                : c
            )
          );
        },
        onError: (err) => {
          setIsStreaming(false);
          setStreamingContent('');
          setAbortFn(null);
          setError(err.message);
          if (err.recoverable) setRetryable({ content, options });
          // Mirror the error row the server saved so the failed turn stays visible (and reopens identically).
          if (err.messageId) {
            setActiveConversation((prev) =>
              prev
                ? {
                    ...prev,
                    messages: [
                      ...prev.messages,
                      {
                        id: err.messageId as string,
                        conversation_id: activeId,
                        role: 'assistant' as const,
                        content: err.partialContent || 'The AI provider did not return a response. You can retry.',
                        model_used: err.model,
                        status: 'error' as const,
                        error_message: err.message,
                        created_at: new Date().toISOString(),
                      },
                    ],
                  }
                : prev
            );
          }
        },
      },
      undefined,
      { ...options, retry, floorId: options?.floorId ?? focusFloorId ?? undefined }
    );

    setAbortFn(() => stop);
  };

  const handleStopStreaming = () => {
    if (abortFn) {
      abortFn();
      setAbortFn(null);
    }
    setIsStreaming(false);
  };

  const handleRegenerate = async (messageId: string) => {
    if (!activeId) return;
    try {
      const regenerated = await copilotService.regenerateMessage(activeId, messageId);
      setActiveConversation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((m) => (m.id === messageId ? regenerated : m)),
        };
      });
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate response.');
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] rounded-2xl border border-[#D9DBDE] bg-white overflow-hidden shadow-xs">
      {error && (
        <div className="p-2.5 bg-red-50 border-b border-red-200 text-red-800 text-xs flex items-center justify-between px-4">
          <span>{error}</span>
          <span className="flex gap-3">
            {retryable && !isStreaming && (
              <button
                onClick={() => handleSendMessage(retryable.content, retryable.options, true)}
                className="font-bold underline text-[11px]"
              >
                Retry
              </button>
            )}
            <button onClick={() => setError(null)} className="font-bold underline text-[11px]">
              Dismiss
            </button>
          </span>
        </div>
      )}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Sidebar: Conversations */}
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          onRename={handleRename}
          onDelete={handleDelete}
          loading={loading}
        />

        {/* Main Workspace Area */}
        <CopilotWorkspace
          activeConversation={activeConversation}
          onSendMessage={handleSendMessage}
          onStopStreaming={handleStopStreaming}
          onRegenerate={handleRegenerate}
          streamingContent={streamingContent}
          streamingModel={streamingModel}
          isStreaming={isStreaming}
          gatewayStatus={gatewayStatus}
          onRefreshGateway={handleRefreshGateway}
          selectedModel={selectedModel}
          onSelectModel={handleSelectModel}
          availableModels={availableModels}
          initialPrompt={navState?.prompt}
          focusFloor={focusFloorId !== null}
          onClearFocus={() => setFocusFloorId(null)}
        />
      </div>
    </div>
  );
};
