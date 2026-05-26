// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T032b — GitHub Connect dialog error-category copy (EC-6 from spec.md).
 *
 * The github-auth Worker returns categorised status codes; the dialog
 * MUST surface a distinct user-facing message for each, NOT bubble
 * the raw `HTTP 502` string.
 *
 *   - 502 github_misconfigured  → "GitHub authorisation is not yet
 *                                  available — please come back later."
 *   - 503 github_unavailable    → "GitHub appears to be down — please
 *                                  retry shortly."
 *   - 403 origin_not_allowed    → "Studio configuration error — contact
 *                                  support."
 *   - any other failure         → existing fallback "Connection failed"
 *
 * The dialog now delegates to GitHubProvider; tests wrap in a real
 * <GitHubProvider> with github-store and github-auth mocked so the
 * provider's init error surfaces as the dialog's error phase.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Mock github-store (no-op IDB). Error paths never reach onConnected so the
// token round-trip does not need to work; loadGlobalGitHubToken just returns null.
vi.mock('../../src/services/github-store.js', () => ({
  loadGlobalGitHub: vi.fn(async () => null),
  loadGlobalGitHubToken: vi.fn(async () => null),
  saveGlobalGitHub: vi.fn(async () => {}),
  clearGlobalGitHub: vi.fn(async () => {})
}));

const mockInit = vi.fn();
const mockPoll = vi.fn(async () => ({ kind: 'pending' as const }));
const mockUser = vi.fn(async () => ({ kind: 'ok' as const, login: 'octocat', avatarUrl: 'https://x/a.png' }));

vi.mock('../../src/services/github-auth.js', () => ({
  initDeviceFlow: (...args: unknown[]) => mockInit(...args),
  pollDeviceFlow: (...args: unknown[]) => mockPoll(...args),
  fetchGitHubUser: (...args: unknown[]) => mockUser(...args)
}));

import type { GitHubAuthErrorCategory } from '../../src/services/github-auth.js';
import { GitHubProvider } from '../../src/shell/providers/GitHubProvider.js';
import { GitHubConnectDialog } from '../../src/components/GitHubConnectDialog.js';

const AUTH_BASE = 'https://www.daikonic.dev/rune-studio/api/github-auth';

describe('GitHubConnectDialog error-category copy (T032b / EC-6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPoll.mockResolvedValue({ kind: 'pending' as const });
    mockUser.mockResolvedValue({ kind: 'ok' as const, login: 'octocat', avatarUrl: 'https://x/a.png' });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  function mockInitWithError(category: GitHubAuthErrorCategory, reason: string): void {
    mockInit.mockResolvedValueOnce({ kind: 'error' as const, reason, category });
  }

  it('502 github_misconfigured → user-facing "not yet available" copy', async () => {
    mockInitWithError('misconfigured', 'HTTP 502');
    render(
      <GitHubProvider>
        <GitHubConnectDialog authBase={AUTH_BASE} onConnected={() => {}} onCancel={() => {}} />
      </GitHubProvider>
    );
    await waitFor(() => {
      expect(screen.getByText(/GitHub authorisation is not yet available/i)).toBeInTheDocument();
    });
    // Raw status MUST NOT leak to end users.
    expect(screen.queryByText(/HTTP 502/i)).not.toBeInTheDocument();
  });

  it('503 github_unavailable → user-facing "appears to be down" copy', async () => {
    mockInitWithError('unavailable', 'HTTP 503');
    render(
      <GitHubProvider>
        <GitHubConnectDialog authBase={AUTH_BASE} onConnected={() => {}} onCancel={() => {}} />
      </GitHubProvider>
    );
    await waitFor(() => {
      expect(screen.getByText(/GitHub appears to be down/i)).toBeInTheDocument();
    });
  });

  it('403 origin_not_allowed → user-facing "Studio configuration error" copy', async () => {
    mockInitWithError('origin_blocked', 'HTTP 403');
    render(
      <GitHubProvider>
        <GitHubConnectDialog authBase={AUTH_BASE} onConnected={() => {}} onCancel={() => {}} />
      </GitHubProvider>
    );
    await waitFor(() => {
      expect(screen.getByText(/Studio configuration error/i)).toBeInTheDocument();
    });
  });

  it('falls back to "Connection failed" copy on uncategorised failure', async () => {
    mockInitWithError('unknown', 'HTTP 500');
    render(
      <GitHubProvider>
        <GitHubConnectDialog authBase={AUTH_BASE} onConnected={() => {}} onCancel={() => {}} />
      </GitHubProvider>
    );
    await waitFor(() => {
      expect(screen.getByText(/Connection failed/i)).toBeInTheDocument();
    });
  });
});
