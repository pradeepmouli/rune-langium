// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for LspConnectionBadge (019 Phase 2, Task 2.4).
 *
 * The badge takes a plain TransportState prop + onRetry callback —
 * matching the existing ConnectionStatus contract — so the tests just
 * pass literal state objects.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LspConnectionBadge } from '../../src/components/LspConnectionBadge.js';
import type { TransportState } from '../../src/services/transport-provider.js';

describe('LspConnectionBadge', () => {
  it('renders no error/connecting UI when status is connected', () => {
    const state: TransportState = { mode: 'pages-function', status: 'connected' };
    const { container } = render(<LspConnectionBadge state={state} />);
    // Dev mode may emit a success dot — only assert the error / connecting
    // testids stay absent so production behaviour (silent) is also covered.
    expect(container.querySelector('[data-testid="lsp-badge-error"]')).toBeNull();
    expect(container.querySelector('[data-testid="lsp-badge-connecting"]')).toBeNull();
  });

  it('renders the Connecting indicator with a spinner when status is connecting', () => {
    const state: TransportState = { mode: 'pages-function', status: 'connecting' };
    render(<LspConnectionBadge state={state} />);
    expect(screen.getByTestId('lsp-badge-connecting')).toBeInTheDocument();
    expect(screen.getByText(/connecting/i)).toBeInTheDocument();
  });

  it('renders "Language services unavailable" + a Retry button when status is error', () => {
    const state: TransportState = {
      mode: 'disconnected',
      status: 'error',
      error: new Error('boom')
    };
    render(<LspConnectionBadge state={state} onRetry={vi.fn()} />);
    expect(screen.getByTestId('lsp-badge-error')).toBeInTheDocument();
    expect(screen.getByText(/language services unavailable/i)).toBeInTheDocument();
    expect(screen.getByTestId('lsp-badge-retry')).toBeInTheDocument();
  });

  it('renders the same error UI on plain disconnected (no error object)', () => {
    const state: TransportState = { mode: 'disconnected', status: 'disconnected' };
    render(<LspConnectionBadge state={state} />);
    expect(screen.getByTestId('lsp-badge-error')).toBeInTheDocument();
    expect(screen.getByText(/language services unavailable/i)).toBeInTheDocument();
  });

  it('omits the Retry button when onRetry is not provided', () => {
    const state: TransportState = {
      mode: 'disconnected',
      status: 'error',
      error: new Error('boom')
    };
    const { container } = render(<LspConnectionBadge state={state} />);
    expect(container.querySelector('[data-testid="lsp-badge-retry"]')).toBeNull();
  });

  it('clicking Retry invokes onRetry', () => {
    const onRetry = vi.fn();
    const state: TransportState = {
      mode: 'disconnected',
      status: 'error',
      error: new Error('boom')
    };
    render(<LspConnectionBadge state={state} onRetry={onRetry} />);
    fireEvent.click(screen.getByTestId('lsp-badge-retry'));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
