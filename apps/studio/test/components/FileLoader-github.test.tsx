// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T031 — start-page Open-from-GitHub affordance (FR-012, US5).
 *
 * The empty-state row has three secondary buttons by default (Select
 * Files / Select Folder / New). The "Open from GitHub repository…" CTA
 * is only added when the parent threads in `createGitBackedWorkspace`,
 * because clicking it requires the full clone path. App.tsx hasn't
 * wired that yet (T032 deferred); these tests pin both halves of that
 * contract: hidden-by-default, visible-when-wired.
 *
 * The auth dialog is now a thin view of GitHubProvider state; tests
 * wrap FileLoader in a <GitHubProvider> with github-auth mocked.
 *
 * Task 8 (seed per-workspace token): a second describe block covers the
 * "already connected" path where FileLoader reads the global token from
 * the IDB store (via loadGlobalGitHubToken) instead of showing the
 * device-flow dialog.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Shared in-memory store for github-store mock — mirrors the pattern in
// GitHubWorkspaceFlow.test.tsx so each describe block can control the token.
const githubStore = { token: null as string | null, identity: undefined as { login: string; avatarUrl: string } | undefined };

vi.mock('../../src/services/github-store.js', () => ({
  loadGlobalGitHub: vi.fn(async () => (githubStore.token ? { token: githubStore.token, identity: githubStore.identity } : null)),
  loadGlobalGitHubToken: vi.fn(async () => githubStore.token),
  saveGlobalGitHub: vi.fn(async (t: string, identity?: { login: string; avatarUrl: string }) => {
    githubStore.token = t;
    githubStore.identity = identity;
  }),
  clearGlobalGitHub: vi.fn(async () => { githubStore.token = null; githubStore.identity = undefined; })
}));

const mockInit = vi.fn();
const mockPoll = vi.fn(async () => ({ kind: 'pending' as const }));
const mockUser = vi.fn(async () => ({ kind: 'ok' as const, login: 'octocat', avatarUrl: 'https://x/a.png' }));

vi.mock('../../src/services/github-auth.js', () => ({
  initDeviceFlow: (...args: unknown[]) => mockInit(...args),
  pollDeviceFlow: (...args: unknown[]) => mockPoll(...args),
  fetchGitHubUser: (...args: unknown[]) => mockUser(...args)
}));

import { GitHubProvider } from '../../src/shell/providers/GitHubProvider.js';
import { FileLoader } from '../../src/components/FileLoader.js';

const stubCreateGitBacked = async () => ({ id: 'STUB' });

describe('FileLoader — Open from GitHub affordance (T031 / FR-012)', () => {
  beforeEach(() => {
    // Disconnected by default for these tests.
    githubStore.token = null;
    githubStore.identity = undefined;
    vi.clearAllMocks();
    // Fix 3: GitHubProvider now clamps poll interval to >= 5000ms; use fake timers.
    // shouldAdvanceTime: true so @testing-library/react's waitFor polling also works.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // initDeviceFlow returns a pending-style device flow by default;
    // poll stays pending so the dialog doesn't auto-close during tests.
    mockInit.mockResolvedValue({
      kind: 'ok',
      deviceCode: 'test-code',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      intervalSec: 60,
      expiresInSec: 900
    });
    mockPoll.mockResolvedValue({ kind: 'pending' as const });
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('hides the GitHub CTA when createGitBackedWorkspace is not provided', () => {
    render(
      <GitHubProvider>
        <FileLoader onFilesLoaded={() => {}} />
      </GitHubProvider>
    );
    expect(screen.queryByRole('button', { name: /Open from GitHub/i })).toBeNull();
  });

  it('renders an Open from GitHub button when createGitBackedWorkspace is provided', () => {
    render(
      <GitHubProvider>
        <FileLoader onFilesLoaded={() => {}} createGitBackedWorkspace={stubCreateGitBacked} />
      </GitHubProvider>
    );
    const btn = screen.getByRole('button', { name: /Open from GitHub/i });
    expect(btn).toBeInTheDocument();
  });

  it('opens the GitHubConnectDialog when the button is clicked', () => {
    render(
      <GitHubProvider>
        <FileLoader onFilesLoaded={() => {}} createGitBackedWorkspace={stubCreateGitBacked} />
      </GitHubProvider>
    );
    expect(screen.queryByTestId('github-connect-dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Open from GitHub/i }));
    expect(screen.getByTestId('github-connect-dialog')).toBeInTheDocument();
  });

  it('hides the dialog when Cancel is clicked', async () => {
    render(
      <GitHubProvider>
        <FileLoader onFilesLoaded={() => {}} createGitBackedWorkspace={stubCreateGitBacked} />
      </GitHubProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /Open from GitHub/i }));
    // Wait until the dialog moved past the synchronous 'init' phase to
    // surface the Cancel button (init fires connect() which triggers
    // device-flow init; once deviceFlow is set, Cancel appears).
    const cancelBtn = await screen.findByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);
    expect(screen.queryByTestId('github-connect-dialog')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Task 8: lazy token from IDB at clone time (Fix 1: token never in FileLoader state)
// ---------------------------------------------------------------------------
describe('FileLoader — lazy IDB token at clone time (Fix 1 / Task 8 / §4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Fix 3: use fake timers (consistent with top-level describe).
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Pre-seed IDB so GitHubProvider's mount effect hydrates to 'connected'.
    githubStore.token = 'global-tok';
    githubStore.identity = { login: 'octocat', avatarUrl: 'https://x/a.png' };
    // Device-flow mocks should NOT be called in the connected path.
    mockInit.mockRejectedValue(new Error('initDeviceFlow should not be called when already connected'));
    mockPoll.mockRejectedValue(new Error('pollDeviceFlow should not be called when already connected'));
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    githubStore.token = null;
    githubStore.identity = undefined;
  });

  it('skips device-flow and opens the repo-URL form directly when globally connected', async () => {
    const createWorkspace = vi.fn<
      (input: { name: string; repoUrl: string; branch: string; user: string; token: string }) => Promise<{ id: string }>
    >().mockResolvedValue({ id: 'GIT_WS_ID' });

    render(
      <GitHubProvider>
        <FileLoader
          onFilesLoaded={() => {}}
          createGitBackedWorkspace={createWorkspace}
        />
      </GitHubProvider>
    );

    // Wait for GitHubProvider to hydrate to 'connected' (it reads IDB on mount).
    // Fix 1: clicking the button now passes skipAuth={true} to GitHubWorkspaceFlow
    // (a boolean, not the token) — the flow opens directly to the repo-URL form.
    const btn = await screen.findByRole('button', { name: /Open from GitHub/i });
    fireEvent.click(btn);

    // Repo-URL form should appear without any device-flow dialog.
    await waitFor(() => {
      expect(screen.getByTestId('github-repo-form')).toBeInTheDocument();
    });

    // device-flow MUST NOT have been initiated (token never read before this point).
    expect(mockInit).not.toHaveBeenCalled();

    // Enter a repo URL and clone; GitHubWorkspaceFlow reads the token lazily from
    // IDB at clone time (loadGlobalGitHubToken()) — never from FileLoader state.
    fireEvent.change(screen.getByTestId('repo-url-input'), {
      target: { value: 'https://github.com/octocat/Hello-World' }
    });
    fireEvent.click(screen.getByRole('button', { name: /^Clone$/ }));

    await waitFor(() => {
      expect(createWorkspace).toHaveBeenCalledOnce();
    });
    // Assert the global token was passed (read from IDB at clone, not from state).
    expect(createWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'global-tok' })
    );
  });
});
