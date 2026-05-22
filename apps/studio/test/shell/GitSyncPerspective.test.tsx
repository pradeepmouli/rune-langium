// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * GitSyncPerspective tests.
 *
 * These tests cover:
 *  1. Always renders `data-testid="git-perspective"`.
 *  2. Shows the "not connected" empty state when no workspaceId / workspaceKind
 *     is provided (the common test path — no engine running in jsdom).
 *  3. Shows the empty state when workspaceKind is "browser-only".
 *  4. Shows the sync status badge when git-backed and the engine emits state.
 *
 * The engine subscription (`subscribeToEngine`) is mocked so tests never
 * actually touch OPFS / isomorphic-git / IndexedDB.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { GitSyncPerspective } from '../../src/shell/perspectives/screens/GitSyncPerspective.js';

// ---------------------------------------------------------------------------
// Mock the git-sync service so tests don't need a real engine or OPFS.
// ---------------------------------------------------------------------------

type SyncCb = (s: import('@rune-langium/git-sync-engine').SyncStatus) => void;

let capturedSubscriber: SyncCb | null = null;

vi.mock('../../src/services/git-sync.js', () => ({
  subscribeToEngine: vi.fn((_id: string, cb: SyncCb) => {
    capturedSubscriber = cb;
    return () => {
      capturedSubscriber = null;
    };
  }),
  resolveConflict: vi.fn()
}));

// Mock SyncStatusBadge so we can assert its presence without worrying about
// the full Radix / lucide render tree.
vi.mock('../../src/components/SyncStatusBadge.js', () => ({
  SyncStatusBadge: vi.fn((props: { status: { phase: string } }) => (
    <span data-testid="sync-status-badge" data-phase={props.status.phase} />
  ))
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import type { SyncStatus } from '@rune-langium/git-sync-engine';

function makeIdleStatus(): SyncStatus {
  return { phase: 'idle', ahead: 0, behind: 0, lastSyncedSha: null };
}

function emitSync(status: SyncStatus) {
  act(() => {
    capturedSubscriber?.(status);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitSyncPerspective', () => {
  beforeEach(() => {
    capturedSubscriber = null;
  });

  afterEach(() => {
    capturedSubscriber = null;
  });

  it('always renders data-testid="git-perspective"', () => {
    render(<GitSyncPerspective />);
    expect(screen.getByTestId('git-perspective')).toBeTruthy();
  });

  it('shows the "not connected" empty state when no props are provided', () => {
    render(<GitSyncPerspective />);
    expect(screen.getByTestId('git-not-connected')).toBeTruthy();
    // The "Not connected to Git" heading is a single text node in an h2
    expect(screen.getByText(/not connected to git/i)).toBeTruthy();
  });

  it('shows the empty state when workspaceKind is "browser-only"', () => {
    render(<GitSyncPerspective workspaceId="ws-1" workspaceKind="browser-only" />);
    expect(screen.getByTestId('git-not-connected')).toBeTruthy();
  });

  it('shows the empty state when workspaceKind is "folder-backed"', () => {
    render(<GitSyncPerspective workspaceId="ws-1" workspaceKind="folder-backed" />);
    expect(screen.getByTestId('git-not-connected')).toBeTruthy();
  });

  it('shows "Initialising…" immediately after mounting with git-backed workspace (engine not yet emitted)', () => {
    render(<GitSyncPerspective workspaceId="ws-git" workspaceKind="git-backed" />);
    // No status yet — badge is absent, initialising text is present
    expect(screen.queryByTestId('sync-status-badge')).toBeNull();
    expect(screen.getByTestId('git-sync-initialising')).toBeTruthy();
  });

  it('renders SyncStatusBadge once the engine emits idle status', () => {
    render(<GitSyncPerspective workspaceId="ws-git" workspaceKind="git-backed" />);
    emitSync(makeIdleStatus());
    expect(screen.getByTestId('sync-status-badge')).toBeTruthy();
    expect((screen.getByTestId('sync-status-badge') as HTMLElement).dataset['phase']).toBe('idle');
    // Initialising text is gone once status arrives
    expect(screen.queryByTestId('git-sync-initialising')).toBeNull();
  });

  it('renders the ahead/behind summary when commits diverge', () => {
    render(<GitSyncPerspective workspaceId="ws-git" workspaceKind="git-backed" />);
    emitSync({ phase: 'idle', ahead: 3, behind: 1, lastSyncedSha: 'abc123' });
    expect(screen.getByTestId('git-sync-summary')).toBeTruthy();
    expect(screen.getByText(/3/)).toBeTruthy();
    expect(screen.getByText(/1/)).toBeTruthy();
  });

  it('does NOT render the summary when ahead and behind are 0', () => {
    render(<GitSyncPerspective workspaceId="ws-git" workspaceKind="git-backed" />);
    emitSync(makeIdleStatus());
    expect(screen.queryByTestId('git-sync-summary')).toBeNull();
  });

  it('renders conflict paths list when engine reports a merge conflict', () => {
    render(<GitSyncPerspective workspaceId="ws-git" workspaceKind="git-backed" />);
    emitSync({
      phase: 'blocked',
      ahead: 0,
      behind: 0,
      lastSyncedSha: null,
      conflictPaths: ['src/types/Foo.rosetta', 'src/types/Bar.rosetta']
    });
    expect(screen.getByTestId('git-conflict-paths')).toBeTruthy();
    expect(screen.getByText('src/types/Foo.rosetta')).toBeTruthy();
    expect(screen.getByText('src/types/Bar.rosetta')).toBeTruthy();
  });
});
