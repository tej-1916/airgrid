# AirGrid AI Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Overview
Build a production-quality, authenticated, network-intelligent AirGrid AI Copilot using the existing FreeLLM API integration on `http://127.0.0.1:3001/v1`. The system includes multi-turn chat persistence in PostgreSQL, real model discovery and selection, streaming and non-streaming responses, evidence-grounded Wi-Fi and speed-test context with privacy sanitization, and a full UI workspace plus contextual slide-over drawer in AirGrid's copper-orange and warm off-white design language.

---

## File Structure & Responsibilities

### Backend (`apps/api`)
- `src/airgrid/models/all_models.py`:
  - Define `AIChatConversation` and `AIChatMessage` models.
- `migrations/versions/0013_ai_copilot_conversations.py`:
  - Alembic migration for `ai_chat_conversations` and `ai_chat_messages` tables with appropriate indexes and cascade foreign keys.
- `src/airgrid/schemas/copilot.py`:
  - Pydantic models for conversation creation, updates, messages, streaming events, and model selections.
- `src/airgrid/services/copilot_service.py`:
  - Grounded network intelligence context retrieval (Wi-Fi telemetry, signal strength, speed tests, surveys, diagnostics, analysis records).
  - Privacy and security sanitization (redacting BSSIDs, MACs, internal IPs, credentials).
  - Multi-turn conversation management and prompt construction with anti-injection protections.
- `src/airgrid/services/ai_gateway.py`:
  - Add streaming support (`generate_stream`) with Server-Sent Events from OpenAI-compatible `/chat/completions`.
- `src/airgrid/api/v1/endpoints/copilot.py`:
  - Authenticated REST & SSE endpoints for conversations, messages, streaming, model selection, renaming, and deletion.
- `src/airgrid/api/v1/router.py`:
  - Mount copilot router under `/ai/copilot`.
- `tests/test_copilot.py`:
  - Unit and integration tests covering CRUD, tenant isolation, context sanitization, prompt injection defense, and gateway streaming.

### Frontend (`apps/web`)
- `src/types/copilot.ts`:
  - TypeScript interfaces for conversations, messages, citations, streaming chunks, and model configurations.
- `src/services/copilotService.ts`:
  - Client API service for conversations, message sending, SSE streaming reader, renaming, and deleting.
- `src/components/copilot/MarkdownView.tsx`:
  - Clean markdown and code block renderer with syntax styling, copy-code button, and inline evidence badges.
- `src/components/copilot/ChatConversation.tsx`:
  - Message bubble list, streaming typewriter display, actual model execution badges, citation cards, stop generation, and regenerate button.
- `src/components/copilot/ConversationList.tsx`:
  - Conversation history sidebar/drawer with new chat creation, inline renaming, and deletion.
- `src/components/copilot/CopilotWorkspace.tsx`:
  - Full AI Copilot workspace page with model selector, gateway status pill, suggested prompts, and input controls.
- `src/components/copilot/CopilotDrawer.tsx`:
  - Global contextual slide-over drawer accessible from any AirGrid page (e.g. Dashboard, Heatmaps, Diagnostics).
- `src/pages/AICopilotPage.tsx`:
  - Standalone AI Copilot page routed at `/ai-copilot`.
- `src/router.tsx`:
  - Register `/ai-copilot` and update navigation.
- `src/components/layout/Header.tsx` & `Sidebar.tsx`:
  - Add Copilot navigation item with badge and header quick-action button.

### Verification & Automated Testing
- `docs/verification/verify_copilot.cjs`:
  - Playwright end-to-end verification script testing gateway connectivity, real model selection, multi-turn chat, markdown rendering, contextual drawer, and mobile responsiveness with screenshots.

---

## Tasks

### Task 1: Environment Alignment and Database Persistence
- [ ] Align root `.env` AI settings with `apps/api/.env` (`AIRGRID_AI_API_BASE_URL=http://127.0.0.1:3001/v1`, `AIRGRID_AI_DEFAULT_MODEL=auto`).
- [ ] Add `AIChatConversation` and `AIChatMessage` models to `apps/api/src/airgrid/models/all_models.py`.
- [ ] Create Alembic migration `0013_ai_copilot_conversations.py` and apply it to PostgreSQL.
- [ ] Verify database schema and foreign key constraints via test.

### Task 2: Network Intelligence & Privacy Sanitization Service
- [ ] Create `apps/api/src/airgrid/services/copilot_service.py`.
- [ ] Implement sanitized network context assembly:
  - Wi-Fi telemetry and RSSI stats.
  - Speed-test history (download/upload/ping/jitter).
  - Survey sessions, floor plans, and signal strength.
  - Diagnostic reports and findings.
  - Redaction of BSSIDs, MACs, internal IPs, and credentials.
  - Provenance tags: `[MEASURED]`, `[INTERPOLATED_ESTIMATE]`, `[SYNTHETIC_DEMO]`, `[AI_RECOMMENDATION]`.
- [ ] Add system prompt builder with anti-injection boundaries and bounded token windows.

### Task 3: AI Gateway Streaming & Multi-Turn Support
- [ ] Extend `AIGatewayService` in `apps/api/src/airgrid/services/ai_gateway.py` with `generate_chat_stream(...)`.
- [ ] Support multi-turn message histories formatted for OpenAI-compatible `/chat/completions`.
- [ ] Add cancellation/timeout handling and fallback to standard completion if streaming encounters gateway issues.

### Task 4: Copilot API Endpoints & Schemas
- [ ] Define schemas in `apps/api/src/airgrid/schemas/copilot.py`.
- [ ] Implement endpoints in `apps/api/src/airgrid/api/v1/endpoints/copilot.py`:
  - `GET /api/v1/ai/copilot/conversations` (scoped to authenticated user)
  - `POST /api/v1/ai/copilot/conversations`
  - `GET /api/v1/ai/copilot/conversations/{id}`
  - `PATCH /api/v1/ai/copilot/conversations/{id}`
  - `DELETE /api/v1/ai/copilot/conversations/{id}`
  - `POST /api/v1/ai/copilot/conversations/{id}/messages`
  - `POST /api/v1/ai/copilot/conversations/{id}/messages/stream` (SSE text/event-stream)
  - `POST /api/v1/ai/copilot/conversations/{id}/messages/{message_id}/regenerate`
- [ ] Register router in `apps/api/src/airgrid/api/v1/router.py`.

### Task 5: Backend Automated Tests
- [ ] Create `apps/api/tests/test_copilot.py` covering:
  - Conversation CRUD & user tenant isolation.
  - Sanitization of network telemetry (no raw MACs or IPs leaked).
  - Multi-turn messaging & model identity verification.
  - Prompt-injection resistance.
  - Streaming and non-streaming responses.
  - Safe synthetic test query with FreeLLM API gateway.
- [ ] Run full pytest suite to ensure 0 regressions.

### Task 6: Frontend Services and Markdown/Code Renderer
- [ ] Create `apps/web/src/types/copilot.ts`.
- [ ] Create `apps/web/src/services/copilotService.ts` with SSE reader and abort controller.
- [ ] Create `apps/web/src/components/copilot/MarkdownView.tsx` with formatted code blocks, copy button, and citation links.

### Task 7: Frontend Workspace & Interactive Components
- [ ] Create `apps/web/src/components/copilot/ConversationList.tsx` (conversation history, rename, delete).
- [ ] Create `apps/web/src/components/copilot/ChatConversation.tsx` (chat bubbles, streaming cursor, actual model badges, citations, copy/regenerate, stop generation).
- [ ] Create `apps/web/src/components/copilot/CopilotWorkspace.tsx` (full page with model selector, connection status, starter prompts, input bar).
- [ ] Create `apps/web/src/components/copilot/CopilotDrawer.tsx` (slide-over contextual drawer).
- [ ] Create `apps/web/src/pages/AICopilotPage.tsx` and register in `apps/web/src/router.tsx`.
- [ ] Add Copilot entry to `Sidebar.tsx` and header toggle to `Header.tsx` and `AppShell.tsx`.

### Task 8: Verification & Evidence Capture
- [ ] Run `npm run build` in `apps/web` to guarantee TypeScript type-safety.
- [ ] Create Playwright verification script `docs/verification/verify_copilot.cjs`.
- [ ] Execute Playwright verification:
  - Login as network engineer.
  - Verify gateway status and model selector with 300+ models.
  - Ask starter questions ("What does -70 dBm mean?", "Explain my latest speed test.").
  - Verify model identity badge, citations, copy button, rename, delete.
  - Open contextual drawer on Dashboard.
  - Capture desktop and mobile screenshots.
- [ ] Verify all tests pass, commit reviewed changes, and deliver final report.
