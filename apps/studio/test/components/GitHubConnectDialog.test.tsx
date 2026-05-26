// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T057 — GitHubConnectDialog component tests.
 * Drives the device-flow client through the GitHubProvider state, asserting:
 *   - the user code + verification URI render
 *   - on success it calls onConnected with the token
 *   - onCancel fires when Cancel is clicked
 *
 * The dialog is now a thin view of GitHubProvider state; tests mock the
 * github-auth service module (same pattern as GitHubProvider.test.tsx)
 * and wrap the dialog in a real <GitHubProvider>.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';

// Mock github-store: a shared in-memory store so saveGlobalGitHub → loadGlobalGitHubToken
// round-trips the token the way the real IDB would.
const store = { token: null as string | null };
vi.mock('../../src/services/github-store.js', () => ({
  loadGlobalGitHub: vi.fn(async () => (store.token ? { token: store.token } : null)),
  loadGlobalGitHubToken: vi.fn(async () => store.token),
  saveGlobalGitHub: vi.fn(async (t: string) => { store.token = t; }),
  clearGlobalGitHub: vi.fn(async () => { store.token = null; })
}));

const mockInit = vi.fn();
const mockPoll = vi.fn();
const mockUser = vi.fn(async () => ({ kind: 'ok' as const, login: 'octocat', avatarUrl: 'https://x/a.png' }));

vi.mock('../../src/services/github-auth.js', () => ({
  initDeviceFlow: (...args: unknown[]) => mockInit(...args),
  pollDeviceFlow: (...args: unknown[]) => mockPoll(...args),
  fetchGitHubUser: (...args: unknown[]) => mockUser(...args)
}));

import { GitHubProvider } from '../../src/shell/providers/GitHubProvider.js';
import { GitHubConnectDialog } from '../../src/components/GitHubConnectDialog.js';

const AUTH_BASE = 'https://www.daikonic.dev/rune-studio/api/github-auth';

beforeEach(() => {
  store.token = null;
  vi.clearAllMocks();
  // Fix 3: GitHubProvider now clamps poll interval to >= 5000ms; use fake timers.
  // shouldAdvanceTime: true so @testing-library/react's waitFor polling also works.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockUser.mockResolvedValue({ kind: 'ok' as const, login: 'octocat', avatarUrl: 'https://x/a.png' });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

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
      <GitHubProvider>
        <GitHubConnectDialog authBase={AUTH_BASE} onConnected={() => {}} onCancel={() => {}} />
      </GitHubProvider>
    );
    await waitFor(() => expect(screen.getByText(/WXYZ-1234/)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /github\.com\/login\/device/i })).toBeInTheDocument();
    // Fix 4: the no-op "check now" button is replaced with static informational copy.
    expect(screen.queryByRole('button', { name: /check now/i })).toBeNull();
    expect(screen.getByTestId('github-auth-checking')).toBeInTheDocument();
  });

  it('calls onConnected with the access token on poll success', async () => {
    mockInit.mockResolvedValueOnce({
      kind: 'ok',
      deviceCode: 'devcode',
      userCode: 'CODE-OK',
      verificationUri: 'https://github.com/login/device',
      intervalSec: 0,
      expiresInSec: 900
    });
    mockPoll.mockResolvedValueOnce({ kind: 'ok', accessToken: 'gho_winner', scope: 'repo' });

    const onConnected = vi.fn();
    render(
      <GitHubProvider>
        <GitHubConnectDialog authBase={AUTH_BASE} onConnected={onConnected} onCancel={() => {}} />
      </GitHubProvider>
    );
    // Fix 3: advance past the clamped 5 s poll interval so the timer fires.
    await act(async () => { await vi.advanceTimersByTimeAsync(5001); });
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
      <GitHubProvider>
        <GitHubConnectDialog authBase={AUTH_BASE} onConnected={() => {}} onCancel={onCancel} />
      </GitHubProvider>
    );
    await waitFor(() => screen.getByText(/^C$/));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Fix 6: shows explicit error + Reconnect when connected but token is null', async () => {
    // Provider hydrates to 'connected' from IDB, but IDB token read returns null.
    // Simulate: IDB has a record but loadGlobalGitHubToken returns null (store corrupt).
    mockInit.mockResolvedValueOnce({
      kind: 'ok',
      deviceCode: 'devcode',
      userCode: 'ABCD',
      verificationUri: 'https://github.com/login/device',
      intervalSec: 0,
      expiresInSec: 900
    });
    mockPoll.mockResolvedValueOnce({ kind: 'ok', accessToken: 'gho_tok', scope: 'repo' });

    // After connect() runs, the store has a token; but override loadGlobalGitHubToken
    // to return null for this test to simulate the "connected but null token" case.
    const { loadGlobalGitHubToken } = await import('../../src/services/github-store.js');
    const mockedLoadToken = vi.mocked(loadGlobalGitHubToken);
    // First call (from GitHubProvider hydration mount) returns null → disconnected start.
    // connect() runs the device flow, polls → ok, saves token to store.
    // onConnected effect then calls loadGlobalGitHubToken → return null to trigger Fix 6.
    mockedLoadToken.mockResolvedValue(null);

    const onConnected = vi.fn();
    render(
      <GitHubProvider>
        <GitHubConnectDialog authBase={AUTH_BASE} onConnected={onConnected} onCancel={() => {}} />
      </GitHubProvider>
    );

    // Advance past the clamped poll interval.
    await act(async () => { await vi.advanceTimersByTimeAsync(5001); });

    // Dialog should surface the "could not retrieve token" error, not call onConnected.
    await waitFor(() => {
      expect(screen.getByTestId('github-token-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('github-token-error')).toHaveTextContent(/Could not retrieve the GitHub token/i);
    expect(onConnected).not.toHaveBeenCalled();
    // Recovery: Reconnect button is shown.
    expect(screen.getByRole('button', { name: /Reconnect/i })).toBeInTheDocument();

    // Restore the mock so subsequent tests get the store value.
    mockedLoadToken.mockImplementation(async () => store.token);
  });
});

// silence "unused" warning for `act` if this file ends up trimming it later
void act;
