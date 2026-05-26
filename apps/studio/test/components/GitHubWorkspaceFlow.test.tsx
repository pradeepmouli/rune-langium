// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T032e — GitHubWorkspaceFlow happy-path + URL parsing.
 *
 * Verifies the auth → URL form → clone → onCreated transition.
 * The `createWorkspace` prop is injected so the test doesn't need a
 * real OPFS root or a real git clone.
 *
 * The auth dialog is now a thin view of GitHubProvider state; tests
 * wrap in a real <GitHubProvider> with github-store and github-auth
 * mocked (same pattern as GitHubProvider.test.tsx).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

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
import { GitHubWorkspaceFlow } from '../../src/components/GitHubWorkspaceFlow.js';

const AUTH_BASE = 'https://www.daikonic.dev/rune-studio/api/github-auth';

beforeEach(() => {
  store.token = null;
  vi.clearAllMocks();
  // Fix 3: GitHubProvider now clamps poll interval to >= 5000ms; use fake timers.
  // shouldAdvanceTime: true so @testing-library/react's waitFor polling also works.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockInit.mockResolvedValue({
    kind: 'ok',
    deviceCode: 'devcode',
    userCode: 'ABCD-1234',
    verificationUri: 'https://github.com/login/device',
    intervalSec: 0,
    expiresInSec: 900
  });
  mockPoll.mockResolvedValue({ kind: 'ok', accessToken: 'gho_test', scope: 'repo' });
  mockUser.mockResolvedValue({ kind: 'ok' as const, login: 'octocat', avatarUrl: 'https://x/a.png' });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

/** Helper: advance fake timers past the 5 s poll interval so the device-flow
 * poll fires and the provider transitions to 'connected'. */
async function advancePoll(): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(5001); });
}

describe('GitHubWorkspaceFlow (T032e / FR-012)', () => {
  it('after auth, surfaces a repo-URL form (transitions auth → url)', async () => {
    const createWorkspace = vi.fn();
    render(
      <GitHubProvider>
        <GitHubWorkspaceFlow
          authBase={AUTH_BASE}
          onCreated={() => {}}
          onCancel={() => {}}
          createWorkspace={createWorkspace}
        />
      </GitHubProvider>
    );
    // Fix 3: advance past the clamped 5 s poll interval so the provider
    // transitions to 'connected', which fires onConnected in the dialog,
    // which causes the flow to show the repo-URL form.
    await advancePoll();
    await waitFor(() => {
      expect(screen.getByTestId('github-repo-form')).toBeInTheDocument();
    });
    expect(screen.getByTestId('repo-url-input')).toBeInTheDocument();
  });

  it('Clone button is disabled until a parseable repo URL is typed', async () => {
    const createWorkspace = vi.fn();
    render(
      <GitHubProvider>
        <GitHubWorkspaceFlow
          authBase={AUTH_BASE}
          onCreated={() => {}}
          onCancel={() => {}}
          createWorkspace={createWorkspace}
        />
      </GitHubProvider>
    );
    await advancePoll();
    await waitFor(() => screen.getByTestId('github-repo-form'));

    const cloneBtn = screen.getByRole('button', { name: /^Clone$/ });
    expect(cloneBtn).toBeDisabled();

    fireEvent.change(screen.getByTestId('repo-url-input'), {
      target: { value: 'pradeepmouli/rune-langium' }
    });
    expect(cloneBtn).not.toBeDisabled();
  });

  it('Clone calls createWorkspace with the parsed canonical URL + token', async () => {
    const createWorkspace = vi
      .fn<
        (input: {
          name: string;
          repoUrl: string;
          branch: string;
          user: string;
          token: string;
        }) => Promise<{ id: string }>
      >()
      .mockResolvedValue({ id: 'NEW_WS_ID' });
    const onCreated = vi.fn();

    render(
      <GitHubProvider>
        <GitHubWorkspaceFlow
          authBase={AUTH_BASE}
          onCreated={onCreated}
          onCancel={() => {}}
          createWorkspace={createWorkspace}
        />
      </GitHubProvider>
    );
    await advancePoll();
    await waitFor(() => screen.getByTestId('github-repo-form'));

    fireEvent.change(screen.getByTestId('repo-url-input'), {
      target: { value: 'https://github.com/pradeepmouli/rune-langium' }
    });
    fireEvent.click(screen.getByRole('button', { name: /^Clone$/ }));

    await waitFor(() => {
      expect(createWorkspace).toHaveBeenCalledOnce();
    });
    expect(createWorkspace).toHaveBeenCalledWith({
      name: 'pradeepmouli/rune-langium',
      repoUrl: 'https://github.com/pradeepmouli/rune-langium.git',
      branch: 'main',
      user: 'pradeepmouli',
      token: 'gho_test'
    });
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith('NEW_WS_ID');
    });
  });

  it('shows an inline error banner when createWorkspace throws', async () => {
    const createWorkspace = vi
      .fn<
        (input: {
          name: string;
          repoUrl: string;
          branch: string;
          user: string;
          token: string;
        }) => Promise<{ id: string }>
      >()
      .mockRejectedValue(new Error('clone failed: 404'));

    render(
      <GitHubProvider>
        <GitHubWorkspaceFlow
          authBase={AUTH_BASE}
          onCreated={() => {}}
          onCancel={() => {}}
          createWorkspace={createWorkspace}
        />
      </GitHubProvider>
    );
    await advancePoll();
    await waitFor(() => screen.getByTestId('github-repo-form'));

    fireEvent.change(screen.getByTestId('repo-url-input'), {
      target: { value: 'pradeepmouli/missing' }
    });
    fireEvent.click(screen.getByRole('button', { name: /^Clone$/ }));

    await waitFor(() => {
      expect(screen.getByTestId('github-clone-error')).toBeInTheDocument();
    });
    // Friendly copy: a "404" surfaces as a user-facing "Repository not found"
    // headline; the raw text is no longer leaked into the banner.
    expect(screen.getByTestId('github-clone-error')).toHaveTextContent(/repository not found/i);
  });
});
