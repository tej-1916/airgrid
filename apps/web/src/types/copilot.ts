export interface Citation {
  source_id: string;
  kind: string;
  label: string;
  metric: string;
  value: string | number;
  unit: string;
  provenance: 'MEASURED' | 'INTERPOLATED_ESTIMATE' | 'SYNTHETIC_DEMO' | 'AI_RECOMMENDATION' | 'MODEL_PREDICTION';
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model_used?: string | null;
  tokens_prompt?: number | null;
  tokens_completion?: number | null;
  duration_ms?: number | null;
  citations?: Citation[] | null;
  status: 'completed' | 'streaming' | 'error' | 'cancelled';
  error_message?: string | null;
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  model: string;
  campus_id?: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_preview?: string | null;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  model: string;
  campus_id?: string | null;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

export interface GatewayStatus {
  is_configured: boolean;
  provider: string;
  endpoint: string;
  default_model: string;
  active_model: string;
  available_models: string[];
  last_health_check?: {
    status: string;
    error?: string;
    detail?: string;
    latency_ms?: number;
    model?: string;
    discovered_models?: string[];
    discovered_count?: number;
    timestamp?: string;
  } | null;
  last_success?: string | null;
  last_failure?: string | null;
  response_latency_ms?: number | null;
  execution_identity?: string;
  privacy_status?: string;
}
