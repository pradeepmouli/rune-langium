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
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GitHubConnectDialog } from '../../src/components/GitHubConnectDialog.js';

const AUTH_BASE = 'https://www.daikonic.dev/rune-studio/api/github-auth';

describe('GitHubConnectDialog error-category copy (T032b / EC-6)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function mockInitWith(status: number, body: Record<string, unknown> = {}): void {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
      })
    );
  }

  it('502 github_misconfigured → user-facing "not yet available" copy', async () => {
    mockInitWith(502, { error: 'github_misconfigured' });
    render(<GitHubConnectDialog authBase={AUTH_BASE} onConnected={() => {}} onCancel={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/GitHub authorisation is not yet available/i)).toBeInTheDocument();
    });
    // Raw status MUST NOT leak to end users.
    expect(screen.queryByText(/HTTP 502/i)).not.toBeInTheDocument();
  });

  it('503 github_unavailable → user-facing "appears to be down" copy', async () => {
    mockInitWith(503, { error: 'github_unavailable' });
    render(<GitHubConnectDialog authBase={AUTH_BASE} onConnected={() => {}} onCancel={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/GitHub appears to be down/i)).toBeInTheDocument();
    });
  });

  it('403 origin_not_allowed → user-facing "Studio configuration error" copy', async () => {
    mockInitWith(403, { error: 'origin_not_allowed' });
    render(<GitHubConnectDialog authBase={AUTH_BASE} onConnected={() => {}} onCancel={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/Studio configuration error/i)).toBeInTheDocument();
    });
  });

  it('falls back to "Connection failed" copy on uncategorised failure', async () => {
    mockInitWith(500, { error: 'something_unexpected' });
    render(<GitHubConnectDialog authBase={AUTH_BASE} onConnected={() => {}} onCancel={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/Connection failed/i)).toBeInTheDocument();
    });
  });
});
