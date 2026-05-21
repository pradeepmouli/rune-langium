// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * SyncStatusBadge — compact topbar chip for the live git-sync state.
 *
 * - idle:    subtle "Synced" indicator
 * - syncing (committing/fetching/merging/pushing): spinner + "Syncing…"
 * - offline:  muted "Offline — will retry"
 * - blocked:  amber warning with Keep mine / Take remote resolve buttons
 *
 * Props are passed in (not subscribed internally) so the parent can own
 * the subscription lifetime and the badge remains a pure rendering leaf.
 */

import type { ReactElement } from 'react';
import type { SyncStatus } from '@rune-langium/git-sync-engine';
import { Spinner } from '@rune-langium/design-system/ui/spinner';
import { Button } from '@rune-langium/design-system/ui/button';
import { Check, WifiOff, AlertTriangle } from 'lucide-react';

const SYNCING_PHASES = new Set(['committing', 'fetching', 'merging', 'pushing']);

export interface SyncStatusBadgeProps {
  status: SyncStatus;
  onResolve: (choice: 'keepMine' | 'takeRemote') => void;
}

export function SyncStatusBadge({ status, onResolve }: SyncStatusBadgeProps): ReactElement {
  const { phase } = status;

  if (SYNCING_PHASES.has(phase)) {
    return (
      <span
        data-testid="sync-status"
        data-phase={phase}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      >
        <Spinner className="size-3" />
        Syncing…
      </span>
    );
  }

  if (phase === 'offline') {
    return (
      <span
        data-testid="sync-status"
        data-phase={phase}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      >
        <WifiOff className="size-3" />
        Offline — will retry
      </span>
    );
  }

  if (phase === 'blocked') {
    return (
      <span
        data-testid="sync-status"
        data-phase={phase}
        className="inline-flex items-center gap-1.5 text-xs text-amber-500"
      >
        <AlertTriangle className="size-3 shrink-0" />
        <span>Couldn&apos;t sync — remote changed</span>
        <Button
          type="button"
          variant="outline"
          size="xs"
          data-testid="sync-resolve-keep-mine"
          onClick={() => onResolve('keepMine')}
          className="h-5 px-1.5 text-[10px]"
        >
          Keep mine
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          data-testid="sync-resolve-take-remote"
          onClick={() => onResolve('takeRemote')}
          className="h-5 px-1.5 text-[10px]"
        >
          Take remote
        </Button>
      </span>
    );
  }

  // idle — quiet success indicator
  return (
    <span
      data-testid="sync-status"
      data-phase={phase}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
    >
      <Check className="size-3 text-success" />
      Synced
    </span>
  );
}
