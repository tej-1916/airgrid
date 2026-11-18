import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(), get length() { return m.size; } };
}
let localStorage: ReturnType<typeof memoryStorage>;
beforeEach(() => { localStorage = memoryStorage(); vi.stubGlobal('localStorage', localStorage); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules(); });

describe('copilotService', () => {
  it('purges the legacy localStorage conversation cache and never rewrites it', async () => {
    localStorage.setItem('airgrid_copilot_chat_sessions_v1', JSON.stringify([{ id: 'x', messages: [{ content: 'quoted campus data' }] }]));
    const fetchMock = vi.fn().mockImplementation(async () => json(200, { id: 'c1', messages: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const { copilotService } = await import('./copilotService');
    expect(localStorage.getItem('airgrid_copilot_chat_sessions_v1')).toBeNull();
    await copilotService.getConversation('c1');
    expect(localStorage.getItem('airgrid_copilot_chat_sessions_v1')).toBeNull();
  });

  it.each([401, 403, 404, 500])('surfaces HTTP %i instead of inventing a local conversation', async (status) => {
    const fetchMock = vi.fn().mockImplementation(async () => json(status, { detail: 'denied' }));
    vi.stubGlobal('fetch', fetchMock);
    const { copilotService } = await import('./copilotService');
    await expect(copilotService.getConversation('c1')).rejects.toThrow('denied');
    await expect(copilotService.createConversation('t')).rejects.toThrow('denied');
    expect(localStorage.length).toBe(0);
  });

  it('regenerate failure does not re-post the question through another endpoint', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json(403, { detail: 'Forbidden: You do not have access to this campus.' }));
    vi.stubGlobal('fetch', fetchMock);
    const { copilotService } = await import('./copilotService');
    await expect(copilotService.regenerateMessage('c1', 'm1')).rejects.toThrow('Forbidden');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/regenerate');
  });
});
