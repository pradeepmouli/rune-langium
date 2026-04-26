// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T031 — start-page Open-from-GitHub affordance (FR-012, US5).
 *
 * The empty-state row has three secondary buttons: Select Files,
 * Select Folder, and (new) "Open from GitHub repository…". The
 * GitHub button mounts the existing GitHubConnectDialog as a modal
 * surface. End-to-end auth + workspace creation lands in T032; this
 * test pins only the affordance shape.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileLoader } from '../../src/components/FileLoader.js';

describe('FileLoader — Open from GitHub affordance (T031 / FR-012)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // The dialog issues a device-init fetch on mount; stub it so the
    // first render doesn't dispatch a real request.
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          device_code: 'test-code',
          user_code: 'ABCD-1234',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 5
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
  });
  afterEach(() => fetchSpy.mockRestore());

  it('renders an Open from GitHub button on the empty-state row', () => {
    render(<FileLoader onFilesLoaded={() => {}} />);
    const btn = screen.getByRole('button', { name: /Open from GitHub/i });
    expect(btn).toBeInTheDocument();
  });

  it('opens the GitHubConnectDialog when the button is clicked', () => {
    render(<FileLoader onFilesLoaded={() => {}} />);
    expect(screen.queryByTestId('github-connect-dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Open from GitHub/i }));
    expect(screen.getByTestId('github-connect-dialog')).toBeInTheDocument();
  });

  it('hides the dialog when Cancel is clicked', async () => {
    render(<FileLoader onFilesLoaded={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Open from GitHub/i }));
    // Wait until the dialog moved past the synchronous 'init' phase to
    // surface the Cancel button.
    const cancelBtn = await screen.findByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);
    expect(screen.queryByTestId('github-connect-dialog')).not.toBeInTheDocument();
  });
});
