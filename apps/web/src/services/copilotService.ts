import { apiRequest } from './api';
import { Conversation, ConversationSummary, ChatMessage, GatewayStatus } from '../types/copilot';

export interface StreamError extends Error {
  code?: string;
  recoverable?: boolean;
  messageId?: string;
  partialContent?: string;
  model?: string;
}

// Earlier builds cached conversations in localStorage as an offline fallback. That cache survived logout and let one
// user's answers (which may quote campus data) appear to the next user of the browser, so it is purged, never read.
try { localStorage.removeItem('airgrid_copilot_chat_sessions_v1'); } catch { /* storage unavailable */ }

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)airgrid_csrf=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export const copilotService = {
  // Server is the only source of truth: errors (401/403/404/5xx) propagate to the UI instead of being masked.
  listConversations(limit = 50): Promise<{ conversations: ConversationSummary[]; total: number }> {
    return apiRequest(`/api/v1/ai/copilot/conversations?limit=${limit}`);
  },

  createConversation(title?: string, model?: string, campusId?: string): Promise<Conversation> {
    return apiRequest('/api/v1/ai/copilot/conversations', {
      method: 'POST',
      body: JSON.stringify({ title, model, campus_id: campusId || undefined }),
    });
  },

  getConversation(id: string): Promise<Conversation> {
    return apiRequest(`/api/v1/ai/copilot/conversations/${id}`);
  },

  updateConversation(id: string, updates: { title?: string; model?: string }): Promise<Conversation> {
    return apiRequest(`/api/v1/ai/copilot/conversations/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
  },

  deleteConversation(id: string): Promise<{ ok: boolean }> {
    return apiRequest(`/api/v1/ai/copilot/conversations/${id}`, { method: 'DELETE' });
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

  // No fallback to another endpoint: re-posting the question would duplicate the stored user message.
  regenerateMessage(conversationId: string, messageId: string): Promise<ChatMessage> {
    return apiRequest(`/api/v1/ai/copilot/conversations/${conversationId}/messages/${messageId}/regenerate`, { method: 'POST' });
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
    options?: { model?: string; includeNetworkContext?: boolean; retry?: boolean; floorId?: string }
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
          floor_id: options?.floorId,
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
