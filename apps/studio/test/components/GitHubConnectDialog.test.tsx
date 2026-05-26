// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T057 — GitHubConnectDialog component tests.
 * Drives the device-flow client through the GithubProvider state, asserting:
 *   - the user code + verification URI render
 *   - on success it calls onConnected with the token
 *   - onCancel fires when Cancel is clicked
 *
 * The dialog is now a thin view of GithubProvider state; tests mock the
 * github-auth service module (same pattern as GithubProvider.test.tsx)
 * and wrap the dialog in a real <GithubProvider>.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';

// Mock github-store: a shared in-memory store so saveGlobalGithub → loadGlobalGithubToken
// round-trips the token the way the real IDB would.
const store = { token: null as string | null };
vi.mock('../../src/services/github-store.js', () => ({
  loadGlobalGithub: vi.fn(async () => (store.token ? { token: store.token } : null)),
  loadGlobalGithubToken: vi.fn(async () => store.token),
  saveGlobalGithub: vi.fn(async (t: string) => { store.token = t; }),
  clearGlobalGithub: vi.fn(async () => { store.token = null; })
}));

const mockInit = vi.fn();
const mockPoll = vi.fn();
const mockUser = vi.fn(async () => ({ kind: 'ok' as const, login: 'octocat', avatarUrl: 'https://x/a.png' }));

vi.mock('../../src/services/github-auth.js', () => ({
  initDeviceFlow: (...args: unknown[]) => mockInit(...args),
  pollDeviceFlow: (...args: unknown[]) => mockPoll(...args),
  fetchGitHubUser: (...args: unknown[]) => mockUser(...args)
}));

import { GithubProvider } from '../../src/shell/providers/GithubProvider.js';
import { GitHubConnectDialog } from '../../src/components/GitHubConnectDialog.js';

const AUTH_BASE = 'https://www.daikonic.dev/rune-studio/api/github-auth';

beforeEach(() => {
  store.token = null;
  vi.clearAllMocks();
  mockUser.mockResolvedValue({ kind: 'ok' as const, login: 'octocat', avatarUrl: 'https://x/a.png' });
});
afterEach(() => vi.clearAllMocks());

describe('GitHubConnectDialog (T057)', () => {
  it('renders the user code + verification URI after init', async () => {
    mockInit.mockResolvedValueOnce({
      kind: 'ok',
      deviceCode: 'devcode',
      userCode: 'WXYZ-1234',
      verificationUri: 'https://github.com/login/device',
      intervalSec: 60,
      expiresInSec: 900
    });
    // Poll stays pending so we can assert the code display.
    mockPoll.mockResolvedValue({ kind: 'pending' });

    render(
      <GithubProvider>
        <GitHubConnectDialog authBase={AUTH_BASE} onConnected={() => {}} onCancel={() => {}} />
      </GithubProvider>
    );
    await waitFor(() => expect(screen.getByText(/WXYZ-1234/)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /github\.com\/login\/device/i })).toBeInTheDocument();
  });

  it('calls onConnected with the access token on poll success', async () => {
    mockInit.mockResolvedValueOnce({
      kind: 'ok',
      deviceCode: 'devcode',
      userCode: 'CODE-OK',
      verificationUri: 'https://github.com/login/device',
      // intervalSec: 0 → provider's setTimeout fires immediately
      intervalSec: 0,
      expiresInSec: 900
    });
    mockPoll.mockResolvedValueOnce({ kind: 'ok', accessToken: 'gho_winner', scope: 'repo' });

    const onConnected = vi.fn();
    render(
      <GithubProvider>
        <GitHubConnectDialog authBase={AUTH_BASE} onConnected={onConnected} onCancel={() => {}} />
      </GithubProvider>
    );
    // Provider polls on its own with intervalSec: 0 (immediate tick).
    await waitFor(() => expect(onConnected).toHaveBeenCalledWith('gho_winner'));
  });

  it('Cancel calls onCancel', async () => {
    mockInit.mockResolvedValueOnce({
      kind: 'ok',
      deviceCode: 'd',
      userCode: 'C',
      verificationUri: 'https://github.com/login/device',
      intervalSec: 60,
      expiresInSec: 900
    });
    mockPoll.mockResolvedValue({ kind: 'pending' });

    const onCancel = vi.fn();
    render(
      <GithubProvider>
        <GitHubConnectDialog authBase={AUTH_BASE} onConnected={() => {}} onCancel={onCancel} />
      </GithubProvider>
    );
    await waitFor(() => screen.getByText(/^C$/));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

// silence "unused" warning for `act` if this file ends up trimming it later
void act;
