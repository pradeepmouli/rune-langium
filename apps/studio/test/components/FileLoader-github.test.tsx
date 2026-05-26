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
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock github-store (no-op IDB). These tests cancel before the connected
// phase so loadGlobalGithubToken is never called, but the export must exist.
vi.mock('../../src/services/github-store.js', () => ({
  loadGlobalGithub: vi.fn(async () => null),
  loadGlobalGithubToken: vi.fn(async () => null),
  saveGlobalGithub: vi.fn(async () => {}),
  clearGlobalGithub: vi.fn(async () => {})
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
