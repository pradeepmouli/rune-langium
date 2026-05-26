// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// github-store: make hydration inert (no IDB, no network)
vi.mock('../../../src/services/github-store.js', () => ({
  loadGlobalGitHub: vi.fn(async () => null),
  saveGlobalGitHub: vi.fn(async () => undefined),
  clearGlobalGitHub: vi.fn(async () => undefined)
}));

// LSP dependencies
vi.mock('../../../src/services/lsp-client.js', () => ({
  createLspClientService: () => ({
    connect: vi.fn().mockResolvedValue(undefined),
    reconnect: vi.fn().mockResolvedValue(undefined),
    syncWorkspaceFiles: vi.fn(),
    dispose: vi.fn()
  })
}));
vi.mock('../../../src/services/transport-provider.js', () => ({
  createTransportProvider: () => ({ onStateChange: () => () => {}, dispose: () => {} })
}));
vi.mock('../../../src/config.js', () => ({ config: { lspEnabled: true }, studioConfig: {} }));

import { StudioProviders } from '../../../src/shell/providers/StudioProviders.js';
import { useGitHub } from '../../../src/shell/providers/github-context.js';
import type { WorkspaceState } from '../../../src/shell/providers/workspace-context.js';
import type { WorkspaceActions } from '../../../src/shell/perspectives/workspace-actions-context.js';

const noopActions: WorkspaceActions = {
  files: [],
  onFilesLoaded: () => {},
  createGitBackedWorkspace: () => {},
  onGitHubWorkspaceCreated: () => {},
  onOpenWorkspace: () => {},
  onCreateWorkspace: () => {},
  onDeleteWorkspace: () => {}
};

function stateFor(id: string): WorkspaceState {
  return {
    workspaceId: id,
    workspaceKind: 'browser-only',
    workspaceName: id,
    fileCount: 0,
    files: [],
    models: [],
    parsedModels: [],
    deferredExports: []
  };
}

function GitHubStatusProbe() {
  const g = useGitHub();
  return <span data-testid="github-status">{g.status}</span>;
}

describe('StudioProviders', () => {
  it('mounts GitHubProvider: useGitHub() is reachable and starts disconnected', async () => {
    // Codegen worker seam
    window.__runeStudioTestApi = {
      createCodegenWorker: () => {
        const listeners: Record<string, Function[]> = {};
        return {
          postMessage: () => {},
          addEventListener: (t: string, cb: Function) => { (listeners[t] ||= []).push(cb); },
          removeEventListener: (t: string, cb: Function) => { listeners[t] = (listeners[t] ?? []).filter((f) => f !== cb); },
          terminate: () => {}
        } as unknown as Worker;
      }
    };

    render(
      <StudioProviders state={stateFor('ws-test')} actions={noopActions}>
        <GitHubStatusProbe />
      </StudioProviders>
    );

    // GitHubProvider hydrates: loadGlobalGitHub() returns null → disconnected
    await waitFor(() => {
      expect(screen.getByTestId('github-status').textContent).toBe('disconnected');
    });
  });
});
