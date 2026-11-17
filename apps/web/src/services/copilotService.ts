import { apiRequest } from './api';
import { Conversation, ConversationSummary, ChatMessage, GatewayStatus, Citation } from '../types/copilot';

export interface StreamError extends Error {
  code?: string;
  recoverable?: boolean;
  messageId?: string;
  partialContent?: string;
  model?: string;
}

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
      onError: (error: StreamError) => void;
    },
    signal?: AbortSignal,
    options?: { model?: string; includeNetworkContext?: boolean; retry?: boolean }
  ): () => void {
    // Aborting the fetch closes the SSE connection; the server then closes the upstream provider request.
    const controller = new AbortController();
    signal?.addEventListener('abort', () => controller.abort());
    let cancelled = false;
    // Exactly one terminal callback (done/error) is ever delivered.
    let finished = false;
    const fail = (message: string, extra: Partial<StreamError> = {}) => {
      if (finished || cancelled) return;
      finished = true;
      callbacks.onError(Object.assign(new Error(message), extra));
    };

    (async () => {
      try {
        const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'text/event-stream' });
        const csrfToken = getCsrfTokenFromCookie();
        if (csrfToken) headers.set('X-CSRF-Token', csrfToken);

        // No silent fallback to other endpoints: re-posting would save the user message twice.
        const response = await fetch(`/api/v1/ai/copilot/conversations/${conversationId}/messages/stream`, {
          method: 'POST',
          credentials: 'include',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            content,
            model: options?.model,
            include_network_context: options?.includeNetworkContext ?? true,
            retry: options?.retry ?? false,
          }),
        });

        if (!response.ok || !response.body) {
          let detail = '';
          try {
            const body = await response.json();
            detail = typeof body?.detail === 'string' ? body.detail : '';
          } catch {
            // non-JSON error body
          }
          const unreachable = response.status >= 502 && response.status <= 504;
          fail(
            detail ||
              (unreachable
                ? 'The AirGrid API is not reachable. Check that the backend is running, then retry.'
                : `The server rejected the request (HTTP ${response.status}).`),
            { code: `http_${response.status}`, recoverable: response.status >= 500 }
          );
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        while (!cancelled && !finished) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            let event: any;
            try {
              event = JSON.parse(trimmed.slice(6));
            } catch {
              continue;
            }
            if (event.type === 'chunk') {
              callbacks.onChunk(event.content || '', event.model);
            } else if (event.type === 'done') {
              finished = true;
              callbacks.onDone(event);
              return;
            } else if (event.type === 'error') {
              fail(event.error || 'The AI provider failed.', {
                code: event.code,
                recoverable: event.recoverable !== false,
                messageId: event.message_id,
                partialContent: event.content,
                model: event.model,
              });
              return;
            }
          }
        }
        fail('The connection was interrupted before the response finished.', { code: 'interrupted', recoverable: true });
      } catch (err: any) {
        if (cancelled || err?.name === 'AbortError') return;
        fail(
          err instanceof TypeError
            ? 'Cannot reach the AirGrid API. Check that the backend is running, then retry.'
            : String(err?.message || err),
          { code: 'network', recoverable: true }
        );
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  },
};
