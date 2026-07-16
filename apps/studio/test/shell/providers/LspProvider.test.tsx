// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useState } from 'react';

// Captures the mount-time onStateChange listener so tests can simulate the
// transport re-emitting 'connected' (what happens for real when reconnect()
// succeeds) without a second component mount.
let transportStateCb: ((state: { mode: string; status: string }) => void) | null = null;

const connect = vi.fn().mockResolvedValue(undefined);
const reconnect = vi.fn().mockImplementation(async () => {
  // Mirrors production: a successful reconnect() also causes the underlying
  // transport to transition back to 'connected', re-firing the still-subscribed
  // mount-time onStateChange listener.
  transportStateCb?.({ mode: 'direct', status: 'connected' });
});
const syncWorkspaceFiles = vi.fn();
const dispose = vi.fn();
vi.mock('../../../src/services/lsp-client.js', () => ({
  createLspClientService: () => ({ connect, reconnect, syncWorkspaceFiles, dispose })
}));
vi.mock('../../../src/services/transport-provider.js', () => ({
  createTransportProvider: () => ({
    // Simulate a transport that immediately reports itself connected, like the real
    // provider does once its underlying connection opens.
    onStateChange: (cb: (state: { mode: string; status: string }) => void) => {
      transportStateCb = cb;
      cb({ mode: 'direct', status: 'connected' });
      return () => {};
    },
    dispose: () => {}
  })
}));
// Ensure the connect path runs (config.lspEnabled must be truthy).
vi.mock('../../../src/config.js', () => ({ config: { lspEnabled: true }, studioConfig: {} }));

import { LspProvider } from '../../../src/shell/providers/LspProvider.js';
import { useLsp } from '../../../src/shell/providers/lsp-context.js';
import { WorkspaceStateContext, type WorkspaceState } from '../../../src/shell/providers/workspace-context.js';
import { useActivityStore } from '../../../src/store/activity-store.js';

function wsState(files: WorkspaceState['files']): WorkspaceState {
  return {
    workspaceId: 'w',
    workspaceKind: 'browser-only',
    workspaceName: 'w',
    fileCount: files.length,
    files,
    models: [],
    parsedModels: [],
    deferredExports: [],
    parseErrors: new Map()
  };
}
function LspProbe() {
  const { lspClient } = useLsp();
  return <span data-testid="c">{lspClient ? 'client' : 'none'}</span>;
}

beforeEach(() => {
  connect.mockClear();
  reconnect.mockClear();
  syncWorkspaceFiles.mockClear();
});

describe('LspProvider', () => {
  it('creates one client, connects once, exposes it, and re-syncs docs on file change (no reconnect)', () => {
    function Host() {
      const [files, setFiles] = useState<WorkspaceState['files']>([]);
      return (
        <WorkspaceStateContext.Provider value={wsState(files)}>
          <button
            onClick={() => setFiles([{ name: 'a.rosetta', path: 'a.rosetta', content: 'namespace a', dirty: false }])}
          >
            add
          </button>
          <LspProvider>
            <LspProbe />
          </LspProvider>
        </WorkspaceStateContext.Provider>
      );
    }
    render(<Host />);
    expect(connect).toHaveBeenCalledTimes(1);
    act(() => screen.getByText('add').click());
    expect(syncWorkspaceFiles).toHaveBeenCalled(); // doc-set re-sync on file change
    expect(reconnect).not.toHaveBeenCalled(); // switch is NOT a reconnect
  });

  it('connect success publishes an activity entry with op-log opId and durationMs', async () => {
    useActivityStore.setState({ entries: [] });
    function Host() {
      return (
        <WorkspaceStateContext.Provider value={wsState([])}>
          <LspProvider>
            <LspProbe />
          </LspProvider>
        </WorkspaceStateContext.Provider>
      );
    }
    await act(async () => {
      render(<Host />);
    });

    const lspEntries = useActivityStore.getState().entries.filter((e) => e.tag === 'lsp');
    expect(lspEntries.length).toBeGreaterThan(0);
    const connectedEntry = lspEntries.find((e) => e.msg === 'connected');
    expect(connectedEntry?.opId).toBeDefined();
    expect(connectedEntry?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reconnect() does not re-fire the mount-time connect logging as a duplicate "connected" entry', async () => {
    useActivityStore.setState({ entries: [] });
    function ReconnectProbe() {
      const { reconnect } = useLsp();
      return (
        <button type="button" onClick={() => reconnect()}>
          reconnect
        </button>
      );
    }
    function Host() {
      return (
        <WorkspaceStateContext.Provider value={wsState([])}>
          <LspProvider>
            <ReconnectProbe />
          </LspProvider>
        </WorkspaceStateContext.Provider>
      );
    }
    await act(async () => {
      render(<Host />);
    });

    const connectedAfterMount = useActivityStore
      .getState()
      .entries.filter((e) => e.tag === 'lsp' && e.msg === 'connected');
    expect(connectedAfterMount).toHaveLength(1);

    await act(async () => {
      screen.getByText('reconnect').click();
    });

    // The transport re-emits 'connected' as a side effect of reconnect() (see the
    // mock above) — the mount-time listener must NOT log a second 'connected'
    // entry for it; only the reconnect callback's own 'reconnected' entry should
    // appear.
    const connectedAfterReconnect = useActivityStore
      .getState()
      .entries.filter((e) => e.tag === 'lsp' && e.msg === 'connected');
    expect(connectedAfterReconnect).toHaveLength(1);

    const reconnectedEntries = useActivityStore
      .getState()
      .entries.filter((e) => e.tag === 'lsp' && e.msg === 'reconnected');
    expect(reconnectedEntries).toHaveLength(1);
  });

  it('throws when useLsp is used outside the provider', () => {
    function Bare() {
      useLsp();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/within an LspProvider/);
  });
});
