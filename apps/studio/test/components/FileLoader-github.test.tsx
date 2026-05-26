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
 * The auth dialog is now a thin view of GithubProvider state; tests
 * wrap FileLoader in a <GithubProvider> with github-auth mocked.
 *
 * Task 8 (seed per-workspace token): a second describe block covers the
 * "already connected" path where FileLoader reads the global token from
 * the IDB store (via loadGlobalGithubToken) instead of showing the
 * device-flow dialog.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Shared in-memory store for github-store mock — mirrors the pattern in
// GitHubWorkspaceFlow.test.tsx so each describe block can control the token.
const githubStore = { token: null as string | null, identity: undefined as { login: string; avatarUrl: string } | undefined };

vi.mock('../../src/services/github-store.js', () => ({
  loadGlobalGithub: vi.fn(async () => (githubStore.token ? { token: githubStore.token, identity: githubStore.identity } : null)),
  loadGlobalGithubToken: vi.fn(async () => githubStore.token),
  saveGlobalGithub: vi.fn(async (t: string, identity?: { login: string; avatarUrl: string }) => {
    githubStore.token = t;
    githubStore.identity = identity;
  }),
  clearGlobalGithub: vi.fn(async () => { githubStore.token = null; githubStore.identity = undefined; })
}));

const mockInit = vi.fn();
const mockPoll = vi.fn(async () => ({ kind: 'pending' as const }));
const mockUser = vi.fn(async () => ({ kind: 'ok' as const, login: 'octocat', avatarUrl: 'https://x/a.png' }));

vi.mock('../../src/services/github-auth.js', () => ({
  initDeviceFlow: (...args: unknown[]) => mockInit(...args),
  pollDeviceFlow: (...args: unknown[]) => mockPoll(...args),
  fetchGitHubUser: (...args: unknown[]) => mockUser(...args)
}));

import { GithubProvider } from '../../src/shell/providers/GithubProvider.js';
import { FileLoader } from '../../src/components/FileLoader.js';

const stubCreateGitBacked = async () => ({ id: 'STUB' });

describe('FileLoader — Open from GitHub affordance (T031 / FR-012)', () => {
  beforeEach(() => {
    // Disconnected by default for these tests.
    githubStore.token = null;
    githubStore.identity = undefined;
    vi.clearAllMocks();
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
  afterEach(() => vi.clearAllMocks());

  it('hides the GitHub CTA when createGitBackedWorkspace is not provided', () => {
    render(
      <GithubProvider>
        <FileLoader onFilesLoaded={() => {}} />
      </GithubProvider>
    );
    expect(screen.queryByRole('button', { name: /Open from GitHub/i })).toBeNull();
  });

  it('renders an Open from GitHub button when createGitBackedWorkspace is provided', () => {
    render(
      <GithubProvider>
        <FileLoader onFilesLoaded={() => {}} createGitBackedWorkspace={stubCreateGitBacked} />
      </GithubProvider>
    );
    const btn = screen.getByRole('button', { name: /Open from GitHub/i });
    expect(btn).toBeInTheDocument();
  });

  it('opens the GitHubConnectDialog when the button is clicked', () => {
    render(
      <GithubProvider>
        <FileLoader onFilesLoaded={() => {}} createGitBackedWorkspace={stubCreateGitBacked} />
      </GithubProvider>
    );
    expect(screen.queryByTestId('github-connect-dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Open from GitHub/i }));
    expect(screen.getByTestId('github-connect-dialog')).toBeInTheDocument();
  });

  it('hides the dialog when Cancel is clicked', async () => {
    render(
      <GithubProvider>
        <FileLoader onFilesLoaded={() => {}} createGitBackedWorkspace={stubCreateGitBacked} />
      </GithubProvider>
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
// Task 8: seed per-workspace token from the global connection (T032e / §4)
// ---------------------------------------------------------------------------
describe('FileLoader — global-token seeding (Task 8 / §4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Pre-seed IDB so GithubProvider's mount effect hydrates to 'connected'.
    githubStore.token = 'global-tok';
    githubStore.identity = { login: 'octocat', avatarUrl: 'https://x/a.png' };
    // Device-flow mocks should NOT be called in the connected path.
    mockInit.mockRejectedValue(new Error('initDeviceFlow should not be called when already connected'));
    mockPoll.mockRejectedValue(new Error('pollDeviceFlow should not be called when already connected'));
  });
  afterEach(() => {
    vi.clearAllMocks();
    githubStore.token = null;
    githubStore.identity = undefined;
  });

  it('skips device-flow and opens the repo-URL form directly when globally connected', async () => {
    const createWorkspace = vi.fn<
      (input: { name: string; repoUrl: string; branch: string; user: string; token: string }) => Promise<{ id: string }>
    >().mockResolvedValue({ id: 'GIT_WS_ID' });

    render(
      <GithubProvider>
        <FileLoader
          onFilesLoaded={() => {}}
          createGitBackedWorkspace={createWorkspace}
        />
      </GithubProvider>
    );

    // Wait for GithubProvider to hydrate to 'connected' (it reads IDB on mount).
    // The button click is async (reads loadGlobalGithubToken), so we click and
    // then wait for the repo-URL form to appear.
    const btn = await screen.findByRole('button', { name: /Open from GitHub/i });
    fireEvent.click(btn);

    // Repo-URL form should appear without any device-flow dialog.
    await waitFor(() => {
      expect(screen.getByTestId('github-repo-form')).toBeInTheDocument();
    });

    // device-flow MUST NOT have been initiated.
    expect(mockInit).not.toHaveBeenCalled();

    // Enter a repo URL and clone; createWorkspace should receive the global token.
    fireEvent.change(screen.getByTestId('repo-url-input'), {
      target: { value: 'https://github.com/octocat/Hello-World' }
    });
    fireEvent.click(screen.getByRole('button', { name: /^Clone$/ }));

    await waitFor(() => {
      expect(createWorkspace).toHaveBeenCalledOnce();
    });
    expect(createWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'global-tok' })
    );
  });
});
