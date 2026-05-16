// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * StatusBar — always-visible bottom rail. Reports workspace name, git
 * status (for git-backed workspaces), LSP connection state, and a quick
 * toggle for telemetry.
 */

import type React from 'react';
import type { SyncState } from '../services/git-backing.js';

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
    <footer aria-label="Studio status bar" data-testid="status-bar" className="studio-statusbar">
      <div className="studio-statusbar__left">
        <span data-testid="status-workspace">⟢ {workspaceName}</span>
        <span className="studio-statusbar__sep" />
        {gitState && (
          <>
            <span data-testid="status-git">{SYNC_LABEL[gitState]}</span>
            <span className="studio-statusbar__sep" />
          </>
        )}
        <span className="studio-statusbar__lsp" data-testid="status-lsp">
          <span className={`studio-statusbar__dot ${lspState === 'connected' ? 'is-ok' : ''}`} />
          lsp · {lspState}
        </span>
      </div>
      <div className="studio-statusbar__right">
        {/* Static placeholders — real values require editor state that doesn't exist yet. */}
        <span>utf-8</span>
        <span>spaces: 2</span>
        <span>rosetta</span>
        <span className="studio-statusbar__sep" />
        <button
          type="button"
          className="studio-statusbar__btn"
          onClick={onToggleTelemetry}
          aria-pressed={telemetryEnabled}
          aria-label={`Telemetry ${telemetryEnabled ? 'enabled' : 'disabled'}`}
        >
          {telemetryEnabled ? '◉' : '○'} diagnostics
        </button>
      </div>
    </footer>
  );
}
