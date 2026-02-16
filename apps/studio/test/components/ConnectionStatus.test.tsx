/**
 * ConnectionStatus component tests (T013).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConnectionStatus } from '../../src/components/ConnectionStatus.js';
import type { TransportState } from '../../src/services/transport-provider.js';

describe('ConnectionStatus', () => {
  it('shows disconnected state', () => {
    const state: TransportState = { mode: 'disconnected', status: 'disconnected' };
    render(<ConnectionStatus state={state} />);
    expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
  });

  it('shows connecting state', () => {
    const state: TransportState = { mode: 'disconnected', status: 'connecting' };
    render(<ConnectionStatus state={state} />);
    expect(screen.getByText(/connecting/i)).toBeInTheDocument();
  });

  it('shows WebSocket connected', () => {
    const state: TransportState = { mode: 'websocket', status: 'connected' };
    render(<ConnectionStatus state={state} />);
    expect(screen.getByText(/connected/i)).toBeInTheDocument();
    expect(screen.getByText(/websocket/i)).toBeInTheDocument();
  });

  it('shows embedded connected', () => {
    const state: TransportState = { mode: 'embedded', status: 'connected' };
    render(<ConnectionStatus state={state} />);
    expect(screen.getByText(/connected/i)).toBeInTheDocument();
    expect(screen.getByText(/embedded/i)).toBeInTheDocument();
  });

  it('shows error state', () => {
    const state: TransportState = {
      mode: 'disconnected',
      status: 'error',
      error: new Error('Connection refused')
    };
    render(<ConnectionStatus state={state} />);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });

  it('calls onReconnect when retry button is clicked', () => {
    const onReconnect = vi.fn();
    const state: TransportState = {
      mode: 'disconnected',
      status: 'error',
      error: new Error('fail')
    };
    render(<ConnectionStatus state={state} onReconnect={onReconnect} />);

    const button = screen.getByRole('button', { name: /reconnect/i });
    fireEvent.click(button);
    expect(onReconnect).toHaveBeenCalledOnce();
  });

  it('does not show reconnect button when connected', () => {
    const state: TransportState = { mode: 'websocket', status: 'connected' };
    render(<ConnectionStatus state={state} onReconnect={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /reconnect/i })).not.toBeInTheDocument();
  });

  it('does not show reconnect button when onReconnect not provided', () => {
    const state: TransportState = { mode: 'disconnected', status: 'error' };
    render(<ConnectionStatus state={state} />);
    expect(screen.queryByRole('button', { name: /reconnect/i })).not.toBeInTheDocument();
  });
});
