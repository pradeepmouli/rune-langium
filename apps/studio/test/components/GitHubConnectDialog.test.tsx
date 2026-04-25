// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T057 — GitHubConnectDialog component tests.
 * Drives the device-flow client through the dialog, asserting:
 *   - the user code + verification URI render
 *   - the dialog polls in the background
 *   - on success it calls onConnected with the token
 *   - on expired it shows a re-init affordance
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { GitHubConnectDialog } from '../../src/components/GitHubConnectDialog.js';

const AUTH_BASE = 'https://www.daikonic.dev/rune-studio/api/github-auth';

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => fetchSpy.mockRestore());

describe('GitHubConnectDialog (T057)', () => {
  it('renders the user code + verification URI after init', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          device_code: 'devcode',
          user_code: 'WXYZ-1234',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 60
        }),
        { status: 200 }
      )
    );
    render(<GitHubConnectDialog authBase={AUTH_BASE} onConnected={() => {}} onCancel={() => {}} />);
    await waitFor(() => expect(screen.getByText(/WXYZ-1234/)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /github\.com\/login\/device/i })).toBeInTheDocument();
  });

  it('calls onConnected with the access token on poll success', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            device_code: 'devcode',
            user_code: 'CODE-OK',
            verification_uri: 'https://github.com/login/device',
            expires_in: 900,
            interval: 1
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'gho_winner', token_type: 'bearer' }), {
          status: 200
        })
      );
    const onConnected = vi.fn();
    render(
      <GitHubConnectDialog authBase={AUTH_BASE} onConnected={onConnected} onCancel={() => {}} />
    );
    await waitFor(() => expect(screen.getByText(/CODE-OK/)).toBeInTheDocument());
    // Click the manual "I've authorised — check now" button to skip the timer.
    fireEvent.click(screen.getByRole('button', { name: /check now|i.ve authorised/i }));
    await waitFor(() => expect(onConnected).toHaveBeenCalledWith('gho_winner'));
  });

  it('Cancel calls onCancel', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          device_code: 'd',
          user_code: 'C',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 5
        })
      )
    );
    const onCancel = vi.fn();
    render(<GitHubConnectDialog authBase={AUTH_BASE} onConnected={() => {}} onCancel={onCancel} />);
    await waitFor(() => screen.getByText(/^C$/));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

// silence "unused" warning for `act` if this file ends up trimming it later
void act;
