// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for StudioToastProvider's loading-toast support: `showLoadingToast`
 * (spinner, no auto-dismiss timeout) and `dismissToast`, alongside the
 * existing `showToast`. Added for the on-demand curated hydration status
 * toast (docs/superpowers/specs/2026-05-25-curated-on-demand-hydration-design.md).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StudioToastProvider, useStudioToast } from '../../src/components/StudioToastProvider.js';

afterEach(() => cleanup());

function LoadingToastHarness() {
  const { showLoadingToast, dismissToast } = useStudioToast();
  return (
    <>
      <button onClick={() => showLoadingToast({ description: 'Loading demo.namespace…' })}>show-loading</button>
      <button
        onClick={() => {
          const id = showLoadingToast({ description: 'Loading demo.namespace…' });
          // Simulate the background process settling immediately.
          dismissToast(id);
        }}
      >
        show-and-dismiss
      </button>
    </>
  );
}

function ShowToastHarness() {
  const { showToast } = useStudioToast();
  return <button onClick={() => showToast({ description: 'Plain notification', variant: 'destructive' })}>show</button>;
}

describe('StudioToastProvider', () => {
  it('showLoadingToast renders a spinner and stays open (no auto-dismiss)', async () => {
    render(
      <StudioToastProvider>
        <LoadingToastHarness />
      </StudioToastProvider>
    );

    screen.getByText('show-loading').click();

    const toast = await screen.findByText('Loading demo.namespace…');
    expect(toast).toBeTruthy();
    const toastRoot = toast.closest('[data-slot="toast"]');
    expect(toastRoot).not.toBeNull();
    expect(toastRoot!.getAttribute('data-variant')).toBe('loading');
    expect(toastRoot!.querySelector('[data-slot="spinner"]')).not.toBeNull();
  });

  it('dismissToast removes a toast by the id showLoadingToast returned', async () => {
    render(
      <StudioToastProvider>
        <LoadingToastHarness />
      </StudioToastProvider>
    );

    screen.getByText('show-and-dismiss').click();

    // The toast was dismissed synchronously after being shown — it should
    // never end up visible to the user.
    expect(screen.queryByText('Loading demo.namespace…')).toBeNull();
  });

  it('showToast (existing behavior) still renders a non-loading toast with no spinner', async () => {
    render(
      <StudioToastProvider>
        <ShowToastHarness />
      </StudioToastProvider>
    );

    screen.getByText('show').click();

    const toast = await screen.findByText('Plain notification');
    const toastRoot = toast.closest('[data-slot="toast"]');
    expect(toastRoot).not.toBeNull();
    expect(toastRoot!.getAttribute('data-variant')).toBe('destructive');
    expect(toastRoot!.querySelector('[data-slot="spinner"]')).toBeNull();
  });
});
