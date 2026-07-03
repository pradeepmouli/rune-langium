// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * GitSyncPerspective — full-height sidebar screen for git sync state.
 *
 * When the active workspace is git-backed (workspaceKind === 'git-backed'),
 * subscribes to the sync engine for `workspaceId` via `subscribeToEngine` and
 * renders `SyncStatusBadge` plus a contextual summary.
 *
 * When the workspace is NOT git-backed (or workspaceId / workspaceKind are
 * absent), shows an empty state explaining how to connect.
 *
 * `workspaceId` and `workspaceKind` are forwarded by PerspectiveHost from
 * EditorPage props (present-tense wiring — no zustand store needed).
 */

import { useState, useEffect, useCallback } from 'react';
import type { ReactElement } from 'react';
import type { SyncStatus } from '@rune-langium/git-sync-engine';
import type { WorkspaceKind } from '../../../workspace/persistence.js';
import { subscribeToEngine, resolveConflict } from '../../../services/git-sync.js';
import { SyncStatusBadge } from '../../../components/SyncStatusBadge.js';
import { GitBranch } from 'lucide-react';

export interface GitSyncPerspectiveProps {
  /**
   * The active workspace id — must be provided for a git-backed workspace so
   * `subscribeToEngine` can subscribe to the right engine instance.
   * Forwarded by PerspectiveHost from EditorPage.
   */
  workspaceId?: string;
  /**
   * The workspace kind — determines whether to show the sync UI or the
   * "not git-backed" empty state.
   * Forwarded by PerspectiveHost from EditorPage.
   */
  workspaceKind?: WorkspaceKind;
}

function GitNotConnectedEmptyState(): ReactElement {
  return (
    <div
      data-testid="git-not-connected"
      className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center"
    >
      <GitBranch className="size-10 text-muted-foreground/40" aria-hidden="true" />
      <h2 className="text-sm font-semibold text-foreground">Not connected to Git</h2>
      <p className="max-w-[24rem] text-xs text-muted-foreground">
        This workspace isn&apos;t connected to a Git repository. Connect a GitHub repo from <strong>Workspaces</strong>{' '}
        to enable sync.
      </p>
    </div>
  );
}

export function GitSyncPerspective({ workspaceId, workspaceKind }: GitSyncPerspectiveProps): ReactElement {
  const isGitBacked = workspaceKind === 'git-backed' && !!workspaceId;

  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    if (!isGitBacked || !workspaceId) return;
    // Reset immediately on workspace switch so stale status is never shown.
    setSyncStatus(null);
    return subscribeToEngine(workspaceId, setSyncStatus);
  }, [isGitBacked, workspaceId]);

  const handleResolve = useCallback(
    (choice: 'keepMine' | 'takeRemote') => {
      if (workspaceId) resolveConflict(workspaceId, choice);
    },
    [workspaceId]
  );

  return (
    <section data-testid="git-perspective" className="h-full overflow-auto p-6 space-y-6">
      {!isGitBacked ? (
        <GitNotConnectedEmptyState />
      ) : (
        <div className="space-y-4">
          {/* Live sync status badge */}
          <div data-testid="git-sync-status-row" className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground shrink-0">Status</span>
            {syncStatus ? (
              <SyncStatusBadge status={syncStatus} onResolve={handleResolve} />
            ) : (
              <span className="text-xs text-muted-foreground" data-testid="git-sync-initialising">
                Initialising…
              </span>
            )}
          </div>

          {/* Sync summary — ahead / behind counts when available */}
          {syncStatus && (syncStatus.ahead > 0 || syncStatus.behind > 0) && (
            <div
              data-testid="git-sync-summary"
              className="rounded-md border border-border/60 bg-card/50 px-3 py-2 text-xs text-muted-foreground space-y-0.5"
            >
              {syncStatus.ahead > 0 && (
                <p>
                  <span className="font-medium text-foreground">{syncStatus.ahead}</span> local commit
                  {syncStatus.ahead !== 1 ? 's' : ''} ahead of remote
                </p>
              )}
              {syncStatus.behind > 0 && (
                <p>
                  <span className="font-medium text-foreground">{syncStatus.behind}</span> remote commit
                  {syncStatus.behind !== 1 ? 's' : ''} not yet pulled
                </p>
              )}
            </div>
          )}

          {/* Conflict paths — listed when a merge conflict is pending */}
          {syncStatus?.conflictPaths && syncStatus.conflictPaths.length > 0 && (
            <div
              data-testid="git-conflict-paths"
              className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 space-y-1"
            >
              <p className="text-xs font-medium text-amber-500">Conflicting files</p>
              <ul className="space-y-0.5">
                {syncStatus.conflictPaths.map((path) => (
                  <li key={path} className="text-2xs font-mono text-muted-foreground">
                    {path}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
