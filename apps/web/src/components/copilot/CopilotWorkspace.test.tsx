import type React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CopilotWorkspace } from './CopilotWorkspace';

const base: React.ComponentProps<typeof CopilotWorkspace> = {
  activeConversation: { id: 'c1', title: 't', model: 'auto', created_at: '', updated_at: '', user_id: 'u', messages: [] } as never,
  onSendMessage: vi.fn().mockResolvedValue(undefined),
  onStopStreaming: vi.fn(),
  onRegenerate: vi.fn(),
  isStreaming: false,
  gatewayStatus: null as never,
  onRefreshGateway: vi.fn().mockResolvedValue(undefined),
  selectedModel: 'auto',
  onSelectModel: vi.fn(),
  availableModels: ['auto'],
};

describe('CopilotWorkspace floor context', () => {
  it('prefills the question handed over from the 3D campus and shows the grounding notice', () => {
    render(<CopilotWorkspace {...base} initialPrompt="Explain the Wi-Fi coverage in room GF-2 (Lab)." focusFloor onClearFocus={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveValue('Explain the Wi-Fi coverage in room GF-2 (Lab).');
    expect(screen.getByRole('status')).toHaveTextContent(/grounded in the floor you selected/i);
    expect(screen.getByRole('status')).toHaveTextContent(/Synthetic demo data is labelled/i);
  });

  it('lets the user clear the floor focus', () => {
    const clear = vi.fn();
    render(<CopilotWorkspace {...base} focusFloor onClearFocus={clear} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(clear).toHaveBeenCalledOnce();
  });

  it('shows no grounding notice without a selected floor', () => {
    render(<CopilotWorkspace {...base} />);
    expect(screen.queryByText(/grounded in the floor/i)).not.toBeInTheDocument();
  });

  it('sends the typed question through the send handler', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    render(<CopilotWorkspace {...base} onSendMessage={send} initialPrompt="Which rooms are weak?" focusFloor />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    await waitFor(() => expect(send).toHaveBeenCalledWith('Which rooms are weak?', expect.objectContaining({ includeNetworkContext: true })));
  });
});
