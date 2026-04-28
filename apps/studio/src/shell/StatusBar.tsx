// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * StatusBar — always-visible bottom rail. Reports workspace name, git
 * status (for git-backed workspaces), LSP connection state, and a quick
 * toggle for telemetry.
 */

import type React from 'react';
import type { SyncState } from '../services/git-backing.js';
import { Button } from '@rune-langium/design-system/ui/button';

interface Props {
  workspaceName: string;
  gitState?: SyncState;
  lspState?: 'connected' | 'connecting' | 'disconnected';
  telemetryEnabled: boolean;
  onToggleTelemetry: () => void;
}

const SYNC_LABEL: Record<SyncState, string> = {
  clean: 'in sync',
  ahead: 'unpushed changes',
  behind: 'remote ahead',
  diverged: 'diverged',
  conflict: 'conflict'
};

export function StatusBar({
  workspaceName,
  gitState,
  lspState = 'disconnected',
  telemetryEnabled,
  onToggleTelemetry
}: Props): React.ReactElement {
  return (
    <footer
      role="contentinfo"
      aria-label="Studio status bar"
      data-testid="status-bar"
      className="flex items-center gap-3 px-3 py-1 text-xs text-muted-foreground"
    >
      <span data-testid="status-workspace">{workspaceName}</span>
      {gitState && <span data-testid="status-git">{SYNC_LABEL[gitState]}</span>}
      <span data-testid="status-lsp">{lspState}</span>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={onToggleTelemetry}
        aria-pressed={telemetryEnabled}
        aria-label={`Telemetry ${telemetryEnabled ? 'enabled' : 'disabled'}`}
        className="studio-chrome-button ml-auto"
      >
        {telemetryEnabled ? '◉ Diagnostics' : '○ Diagnostics'}
      </Button>
    </footer>
  );
}
