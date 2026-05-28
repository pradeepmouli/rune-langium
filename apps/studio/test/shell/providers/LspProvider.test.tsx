// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useState } from 'react';

const connect = vi.fn().mockResolvedValue(undefined);
const reconnect = vi.fn().mockResolvedValue(undefined);
const syncWorkspaceFiles = vi.fn();
const dispose = vi.fn();
vi.mock('../../../src/services/lsp-client.js', () => ({
  createLspClientService: () => ({ connect, reconnect, syncWorkspaceFiles, dispose })
}));
vi.mock('../../../src/services/transport-provider.js', () => ({
  createTransportProvider: () => ({ onStateChange: () => () => {}, dispose: () => {} })
}));
// Ensure the connect path runs (config.lspEnabled must be truthy).
vi.mock('../../../src/config.js', () => ({ config: { lspEnabled: true }, studioConfig: {} }));

import { LspProvider } from '../../../src/shell/providers/LspProvider.js';
import { useLsp } from '../../../src/shell/providers/lsp-context.js';
import { WorkspaceStateContext, type WorkspaceState } from '../../../src/shell/providers/workspace-context.js';

function wsState(files: WorkspaceState['files']): WorkspaceState {
  return { workspaceId: 'w', workspaceKind: 'browser-only', workspaceName: 'w', fileCount: files.length,
    files, models: [], parsedModels: [], deferredExports: [], parseErrors: new Map() };
}
function LspProbe() { const { lspClient } = useLsp(); return <span data-testid="c">{lspClient ? 'client' : 'none'}</span>; }

beforeEach(() => { connect.mockClear(); reconnect.mockClear(); syncWorkspaceFiles.mockClear(); });

describe('LspProvider', () => {
  it('creates one client, connects once, exposes it, and re-syncs docs on file change (no reconnect)', () => {
    function Host() {
      const [files, setFiles] = useState<WorkspaceState['files']>([]);
      return (
        <WorkspaceStateContext.Provider value={wsState(files)}>
          <button onClick={() => setFiles([{ name: 'a.rosetta', path: 'a.rosetta', content: 'namespace a', dirty: false }])}>add</button>
          <LspProvider><LspProbe /></LspProvider>
        </WorkspaceStateContext.Provider>
      );
    }
    render(<Host />);
    expect(connect).toHaveBeenCalledTimes(1);
    act(() => screen.getByText('add').click());
    expect(syncWorkspaceFiles).toHaveBeenCalled();   // doc-set re-sync on file change
    expect(reconnect).not.toHaveBeenCalled();        // switch is NOT a reconnect
  });

  it('throws when useLsp is used outside the provider', () => {
    function Bare() { useLsp(); return null; }
    expect(() => render(<Bare />)).toThrow(/within an LspProvider/);
  });
});
