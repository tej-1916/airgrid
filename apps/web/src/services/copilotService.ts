import { apiRequest } from './api';
import { Conversation, ConversationSummary, ChatMessage, GatewayStatus, Citation } from '../types/copilot';

const LOCAL_STORAGE_KEY = 'airgrid_copilot_chat_sessions_v1';

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)airgrid_csrf=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function loadLocalConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalConversations(convs: Conversation[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(convs));
  } catch {
    // ignore
  }
}

export const copilotService = {
  async listConversations(limit = 50): Promise<{ conversations: ConversationSummary[]; total: number }> {
    try {
      return await apiRequest<{ conversations: ConversationSummary[]; total: number }>(
        `/api/v1/ai/copilot/conversations?limit=${limit}`
      );
    } catch {
      // Fallback to local storage persistence
      const local = loadLocalConversations();
      const summaries: ConversationSummary[] = local.slice(0, limit).map((c) => ({
        id: c.id,
        title: c.title,
        model: c.model,
        campus_id: c.campus_id,
        created_at: c.created_at,
        updated_at: c.updated_at,
        message_count: c.messages?.length || 0,
        last_message_preview: c.messages?.length ? c.messages[c.messages.length - 1].content.slice(0, 70) : null,
      }));
      return { conversations: summaries, total: local.length };
    }
  },

  async createConversation(title?: string, model?: string, campusId?: string): Promise<Conversation> {
    try {
      return await apiRequest<Conversation>('/api/v1/ai/copilot/conversations', {
        method: 'POST',
        body: JSON.stringify({ title, model, campus_id: campusId || undefined }),
      });
    } catch {
      const local = loadLocalConversations();
      const newConv: Conversation = {
        id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        user_id: 'current_user',
        title: title || 'New Conversation',
        model: model || 'auto',
        campus_id: campusId || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        messages: [],
      };
      local.unshift(newConv);
      saveLocalConversations(local);
      return newConv;
    }
  },

  async getConversation(id: string): Promise<Conversation> {
    try {
      return await apiRequest<Conversation>(`/api/v1/ai/copilot/conversations/${id}`);
    } catch {
      const local = loadLocalConversations();
      const found = local.find((c) => c.id === id);
      if (found) return found;
      // create default if not found
      return this.createConversation('AirGrid Copilot Chat', 'auto');
    }
  },

  async updateConversation(id: string, updates: { title?: string; model?: string }): Promise<Conversation> {
    try {
      return await apiRequest<Conversation>(`/api/v1/ai/copilot/conversations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    } catch {
      const local = loadLocalConversations();
      const idx = local.findIndex((c) => c.id === id);
      if (idx !== -1) {
        if (updates.title) local[idx].title = updates.title;
        if (updates.model) local[idx].model = updates.model;
        local[idx].updated_at = new Date().toISOString();
        saveLocalConversations(local);
        return local[idx];
      }
      throw new Error('Conversation not found');
    }
  },

  async deleteConversation(id: string): Promise<{ ok: boolean }> {
    try {
      return await apiRequest<{ ok: boolean }>(`/api/v1/ai/copilot/conversations/${id}`, {
        method: 'DELETE',
      });
    } catch {
      const local = loadLocalConversations();
      const filtered = local.filter((c) => c.id !== id);
      saveLocalConversations(filtered);
      return { ok: true };
    }
  },

  async getGatewayStatus(): Promise<GatewayStatus> {
    return apiRequest<GatewayStatus>('/api/v1/ai/status');
  },

  async selectModel(modelId: string): Promise<{ ok: boolean; active_model: string }> {
    return apiRequest<{ ok: boolean; active_model: string }>('/api/v1/ai/select-model', {
      method: 'POST',
      body: JSON.stringify({ model: modelId }),
    });
  },

  async checkGatewayHealth(): Promise<{ status: string; latency_ms?: number; discovered_count?: number; detail?: string }> {
    return apiRequest<{ status: string; latency_ms?: number; discovered_count?: number; detail?: string }>(
      '/api/v1/ai/health',
      { method: 'POST' }
    );
  },

  async regenerateMessage(conversationId: string, messageId: string): Promise<ChatMessage> {
    try {
      return await apiRequest<ChatMessage>(
        `/api/v1/ai/copilot/conversations/${conversationId}/messages/${messageId}/regenerate`,
        { method: 'POST' }
      );
    } catch {
      const conv = await this.getConversation(conversationId);
      const userMsgs = conv.messages.filter((m) => m.role === 'user');
      const lastUserContent = userMsgs.length ? userMsgs[userMsgs.length - 1].content : 'Explain network status';
      return this.sendMessage(conversationId, lastUserContent, { model: conv.model, includeNetworkContext: true });
    }
  },

  async sendMessage(
    conversationId: string,
    content: string,
    options?: { model?: string; includeNetworkContext?: boolean }
  ): Promise<ChatMessage> {
    try {
      return await apiRequest<ChatMessage>(`/api/v1/ai/copilot/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content,
          model: options?.model,
          include_network_context: options?.includeNetworkContext ?? true,
        }),
      });
    } catch {
      // Execute through authorized /api/v1/ai/generate endpoint
      const citations: Citation[] = [];
      const cleanContent = content.trim();

      // Gather network evidence if available
      try {
        const askResult = await apiRequest<any>('/api/v1/analyst/ask', {
          method: 'POST',
          body: JSON.stringify({
            question: cleanContent,
            days: 7,
            use_gateway: false,
            allow_external: false,
          }),
        }).catch(() => null);

        if (askResult && askResult.citations) {
          citations.push(...askResult.citations.map((c: any) => ({
            source_id: c.source_id,
            kind: c.kind,
            label: c.metric,
            metric: c.metric,
            value: c.value,
            unit: c.unit,
            provenance: 'MEASURED' as const,
          })));
        }
      } catch {
        // ignore
      }

      const promptPayload = `You are AirGrid AI Copilot, a senior Wi-Fi systems engineer and network intelligence assistant.
User question: "${cleanContent}"

Domain Reference:
- -30 to -50 dBm: Maximum / Exceptional signal.
- -55 to -67 dBm: Excellent / Recommended for VoIP & streaming.
- -70 dBm: Borderline / Fair signal (usable for light browsing, vulnerable to packet loss during roaming).
- -75 to -80 dBm: Poor signal.
- < -85 dBm: Outage / disconnection.
- Latency < 20ms excellent, 20-50ms standard, > 80ms bufferbloat. Jitter > 15ms disrupts voice/video.

Respond in well-structured markdown with bullet points and clear technical reasoning. Distinguish [MEASURED] observations from [AI_RECOMMENDATION].`;

      const genRes = await apiRequest<{
        status: string;
        verified_model: string;
        output_text: string;
        duration_ms: number;
        error_message?: string;
      }>('/api/v1/ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          category: 'diagnostic',
          prompt: promptPayload,
          allow_external: true,
          requested_model: options?.model || 'auto',
        }),
      });

      let responseText = genRes.output_text;
      try {
        if (responseText.trim().startsWith('{')) {
          const parsed = JSON.parse(responseText);
          if (parsed.response) responseText = parsed.response;
          else if (parsed.answer) responseText = parsed.answer;
        }
      } catch {
        // plain text
      }

      const assistantMsg: ChatMessage = {
        id: `msg_asst_${Date.now()}`,
        conversation_id: conversationId,
        role: 'assistant',
        content: responseText || 'No response generated.',
        model_used: genRes.verified_model || options?.model || 'auto',
        duration_ms: genRes.duration_ms,
        citations: citations.length ? citations : null,
        status: genRes.status === 'success' ? 'completed' : 'error',
        error_message: genRes.error_message,
        created_at: new Date().toISOString(),
      };

      // Persist in local storage
      const local = loadLocalConversations();
      const conv = local.find((c) => c.id === conversationId);
      if (conv) {
        conv.messages.push({
          id: `msg_user_${Date.now()}`,
          conversation_id: conversationId,
          role: 'user',
          content: cleanContent,
          status: 'completed',
          created_at: new Date().toISOString(),
        });
        conv.messages.push(assistantMsg);
        conv.updated_at = new Date().toISOString();
        if (conv.title === 'New Conversation' || conv.title === 'AirGrid Copilot Chat') {
          conv.title = cleanContent.slice(0, 45) + (cleanContent.length > 45 ? '...' : '');
        }
        saveLocalConversations(local);
      }

      return assistantMsg;
    }
  },

  streamMessage(
    conversationId: string,
    content: string,
    callbacks: {
      onChunk: (piece: string, model?: string) => void;
      onDone: (data: { message_id?: string; content: string; model?: string; duration_ms?: number; citations?: any[] }) => void;
      onError: (error: Error) => void;
    },
    signal?: AbortSignal,
    options?: { model?: string; includeNetworkContext?: boolean }
  ): () => void {
    let cancelled = false;

    (async () => {
      try {
        // Check if server SSE endpoint is accessible
        const headers = new Headers({
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        });
        const csrfToken = getCsrfTokenFromCookie();
        if (csrfToken) headers.set('X-CSRF-Token', csrfToken);

        const response = await fetch(`/api/v1/ai/copilot/conversations/${conversationId}/messages/stream`, {
          method: 'POST',
          credentials: 'include',
          headers,
          signal,
          body: JSON.stringify({
            content,
            model: options?.model,
            include_network_context: options?.includeNetworkContext ?? true,
          }),
        }).catch(() => null);

        if (response && response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
          const reader = response.body?.getReader();
          if (reader) {
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            while (!cancelled) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data: ')) continue;
                try {
                  const event = JSON.parse(trimmed.slice(6));
                  if (event.type === 'chunk') {
                    callbacks.onChunk(event.content || '', event.model);
                  } else if (event.type === 'done') {
                    callbacks.onDone(event);
                    return;
                  } else if (event.type === 'error') {
                    callbacks.onError(new Error(event.error));
                    return;
                  }
                } catch {
                  // ignore
                }
              }
            }
            return;
          }
        }

        // Fallback: Real inference via /api/v1/ai/generate with typewriter streaming
        if (cancelled) return;
        const resultMsg = await this.sendMessage(conversationId, content, options);

        if (cancelled) return;
        const fullText = resultMsg.content;
        const modelName = resultMsg.model_used || options?.model || 'auto';

        // Deliver words smoothly via typewriter stream
        const tokens = fullText.split(/(\s+)/);
        let delivered = '';
        for (let i = 0; i < tokens.length; i++) {
          if (cancelled) return;
          delivered += tokens[i];
          callbacks.onChunk(tokens[i], modelName);
          await new Promise((resolve) => setTimeout(resolve, 15));
        }

        callbacks.onDone({
          message_id: resultMsg.id,
          content: fullText,
          model: modelName,
          duration_ms: resultMsg.duration_ms || 350,
          citations: resultMsg.citations || [],
        });
      } catch (err: any) {
        if (!cancelled) {
          callbacks.onError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  },
};
