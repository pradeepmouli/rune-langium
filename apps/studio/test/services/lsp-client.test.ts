/**
 * LSP client service tests (T016).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLspClientService } from '../../src/services/lsp-client.js';

// Mock transport provider
vi.mock('../../src/services/transport-provider.js', () => ({
  createTransportProvider: vi.fn()
}));

// Mock @codemirror/lsp-client to capture didOpen/didClose/notification calls
const {
  mockDidOpen,
  mockDidClose,
  mockNotification,
  mockLspDisconnect,
  mockLspConnect,
  mockPlugin
} = vi.hoisted(() => ({
  mockDidOpen: vi.fn(),
  mockDidClose: vi.fn(),
  mockNotification: vi.fn(),
  mockLspDisconnect: vi.fn(),
  mockLspConnect: vi.fn(),
  mockPlugin: vi.fn().mockReturnValue([])
}));

vi.mock('@codemirror/lsp-client', () => {
  class MockWorkspace {
    client: unknown;
    files: unknown[] = [];
    constructor(client: unknown) {
      this.client = client;
    }
    getFile() {
      return null;
    }
    syncFiles() {
      return [];
    }
    openFile() {}
    closeFile() {}
    connected() {}
    disconnected() {}
    displayFile() {
      return Promise.resolve(null);
    }
    requestFile() {
      return Promise.resolve(null);
    }
    updateFile() {}
  }
  class MockLSPClient {
    didOpen = mockDidOpen;
    didClose = mockDidClose;
    notification = mockNotification;
    disconnect = mockLspDisconnect;
    connect = mockLspConnect;
    plugin = mockPlugin;
    workspace: MockWorkspace;
    constructor(opts: any) {
      if (opts?.workspace) {
        this.workspace = opts.workspace(this);
      } else {
        this.workspace = new MockWorkspace(this);
      }
    }
  }
  return {
    LSPClient: MockLSPClient,
    Workspace: MockWorkspace,
    LSPPlugin: { get: vi.fn().mockReturnValue(null) },
    languageServerExtensions: vi.fn().mockReturnValue([])
  };
});

import { createTransportProvider } from '../../src/services/transport-provider.js';

const mockCreateProvider = vi.mocked(createTransportProvider);

function makeFakeTransport() {
  return {
    send: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn()
  };
}

function makeFakeProvider(transport = makeFakeTransport()) {
  return {
    getTransport: vi.fn().mockResolvedValue(transport),
    getState: vi.fn().mockReturnValue({ mode: 'websocket', status: 'connected' }),
    reconnect: vi.fn().mockResolvedValue(transport),
    onStateChange: vi.fn().mockReturnValue(() => {}),
    dispose: vi.fn()
  };
}

describe('createLspClientService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns expected API shape', () => {
    const provider = makeFakeProvider();
    mockCreateProvider.mockReturnValue(provider as never);

    const service = createLspClientService();
    expect(typeof service.connect).toBe('function');
    expect(typeof service.disconnect).toBe('function');
    expect(typeof service.getPlugin).toBe('function');
    expect(typeof service.isInitialized).toBe('function');
    expect(typeof service.onDiagnostics).toBe('function');
    expect(typeof service.reconnect).toBe('function');
    expect(typeof service.dispose).toBe('function');
  });

  it('starts as not initialized', () => {
    const provider = makeFakeProvider();
    mockCreateProvider.mockReturnValue(provider as never);

    const service = createLspClientService();
    expect(service.isInitialized()).toBe(false);
  });

  it('connects via transport provider', async () => {
    const transport = makeFakeTransport();
    const provider = makeFakeProvider(transport);
    mockCreateProvider.mockReturnValue(provider as never);

    const service = createLspClientService();
    await service.connect();

    expect(provider.getTransport).toHaveBeenCalled();
  });

  it('is initialized after connect', async () => {
    const transport = makeFakeTransport();
    const provider = makeFakeProvider(transport);
    mockCreateProvider.mockReturnValue(provider as never);

    const service = createLspClientService();
    await service.connect();

    expect(service.isInitialized()).toBe(true);
  });

  it('returns null plugin before connect', () => {
    const provider = makeFakeProvider();
    mockCreateProvider.mockReturnValue(provider as never);

    const service = createLspClientService();
    expect(service.getPlugin('file:///test.rosetta')).toBeNull();
  });

  it('returns non-null plugin after connect', async () => {
    const transport = makeFakeTransport();
    const provider = makeFakeProvider(transport);
    mockCreateProvider.mockReturnValue(provider as never);

    const service = createLspClientService();
    await service.connect();

    const plugin = service.getPlugin('file:///test.rosetta');
    expect(plugin).not.toBeNull();
  });

  it('onDiagnostics returns unsubscribe function', () => {
    const provider = makeFakeProvider();
    mockCreateProvider.mockReturnValue(provider as never);

    const service = createLspClientService();
    const unsub = service.onDiagnostics(vi.fn());
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('disconnect cleans up', async () => {
    const transport = makeFakeTransport();
    const provider = makeFakeProvider(transport);
    mockCreateProvider.mockReturnValue(provider as never);

    const service = createLspClientService();
    await service.connect();
    await service.disconnect();

    expect(service.isInitialized()).toBe(false);
  });

  it('dispose cleans up everything', async () => {
    const transport = makeFakeTransport();
    const provider = makeFakeProvider(transport);
    mockCreateProvider.mockReturnValue(provider as never);

    const service = createLspClientService();
    await service.connect();
    service.dispose();

    expect(service.isInitialized()).toBe(false);
    expect(provider.dispose).toHaveBeenCalled();
  });

  it('accepts external transport provider', async () => {
    const transport = makeFakeTransport();
    const provider = makeFakeProvider(transport);

    const service = createLspClientService({ transportProvider: provider as never });
    await service.connect();

    expect(service.isInitialized()).toBe(true);
    expect(mockCreateProvider).not.toHaveBeenCalled();
  });
});

describe('syncWorkspaceFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function createConnectedService() {
    const transport = makeFakeTransport();
    const provider = makeFakeProvider(transport);
    mockCreateProvider.mockReturnValue(provider as never);
    const service = createLspClientService();
    await service.connect();
    // Clear mocks from connect phase
    mockDidOpen.mockClear();
    mockDidClose.mockClear();
    mockNotification.mockClear();
    return service;
  }

  it('sends didOpen for new files', async () => {
    const service = await createConnectedService();

    service.syncWorkspaceFiles([{ path: 'foo.rosetta', content: 'namespace foo' }]);

    expect(mockDidOpen).toHaveBeenCalledOnce();
    expect(mockDidOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'file:///workspace/foo.rosetta',
        languageId: 'rosetta',
        version: 0
      })
    );
  });

  it('sends didChange for modified files', async () => {
    const service = await createConnectedService();

    // First sync — opens the file
    service.syncWorkspaceFiles([{ path: 'foo.rosetta', content: 'namespace foo' }]);
    vi.runAllTimers();
    mockDidOpen.mockClear();
    mockNotification.mockClear();

    // Second sync — same path, different content
    service.syncWorkspaceFiles([{ path: 'foo.rosetta', content: 'namespace bar' }]);
    vi.runAllTimers();

    expect(mockDidOpen).not.toHaveBeenCalled();
    expect(mockNotification).toHaveBeenCalledWith('textDocument/didChange', {
      textDocument: { uri: 'file:///workspace/foo.rosetta', version: 1 },
      contentChanges: [{ text: 'namespace bar' }]
    });
  });

  it('sends didClose for removed files', async () => {
    const service = await createConnectedService();

    // Open a file
    service.syncWorkspaceFiles([{ path: 'foo.rosetta', content: 'namespace foo' }]);
    vi.runAllTimers();
    mockDidOpen.mockClear();

    // Sync with empty list — file is removed
    service.syncWorkspaceFiles([]);
    vi.runAllTimers();

    expect(mockDidClose).toHaveBeenCalledWith('file:///workspace/foo.rosetta');
  });

  it('increments version numbers on subsequent changes', async () => {
    const service = await createConnectedService();

    service.syncWorkspaceFiles([{ path: 'a.rosetta', content: 'v1' }]);
    vi.runAllTimers();
    service.syncWorkspaceFiles([{ path: 'a.rosetta', content: 'v2' }]);
    vi.runAllTimers();
    service.syncWorkspaceFiles([{ path: 'a.rosetta', content: 'v3' }]);
    vi.runAllTimers();

    // v1→v2 is version 1, v2→v3 is version 2
    const changeCalls = mockNotification.mock.calls.filter(
      (c) => c[0] === 'textDocument/didChange'
    );
    // Filter to only the target URI changes (exclude refresh notifications)
    const targetChanges = changeCalls.filter(
      (c) => c[1].textDocument.uri === 'file:///workspace/a.rosetta'
    );
    expect(targetChanges[0][1].textDocument.version).toBe(1);
    expect(targetChanges[1][1].textDocument.version).toBe(2);
  });

  it('handles batch of multiple new files', async () => {
    const service = await createConnectedService();

    service.syncWorkspaceFiles([
      { path: 'a.rosetta', content: 'namespace a' },
      { path: 'b.rosetta', content: 'namespace b' },
      { path: 'c.rosetta', content: 'namespace c' }
    ]);
    vi.runAllTimers();

    expect(mockDidOpen).toHaveBeenCalledTimes(3);
  });

  it('does not send notifications when not connected', () => {
    const provider = makeFakeProvider();
    mockCreateProvider.mockReturnValue(provider as never);
    const service = createLspClientService();

    // Not connected — should still track files internally without errors
    service.syncWorkspaceFiles([{ path: 'foo.rosetta', content: 'namespace foo' }]);

    expect(mockDidOpen).not.toHaveBeenCalled();
    expect(mockNotification).not.toHaveBeenCalled();
  });

  it('refreshes unchanged files when new files are added', async () => {
    const service = await createConnectedService();

    // First sync — one file
    service.syncWorkspaceFiles([{ path: 'a.rosetta', content: 'namespace a' }]);
    mockDidOpen.mockClear();
    mockNotification.mockClear();

    // Second sync — add a new file alongside existing
    service.syncWorkspaceFiles([
      { path: 'a.rosetta', content: 'namespace a' },
      { path: 'b.rosetta', content: 'namespace b' }
    ]);

    // Flush debounced refresh
    vi.runAllTimers();

    // b.rosetta should be opened
    expect(mockDidOpen).toHaveBeenCalledOnce();

    // a.rosetta should get a refresh notification (unchanged content, bumped version)
    const changeCalls = mockNotification.mock.calls.filter(
      (c) => c[0] === 'textDocument/didChange'
    );
    const refreshForA = changeCalls.find(
      (c) => c[1].textDocument.uri === 'file:///workspace/a.rosetta'
    );
    expect(refreshForA).toBeTruthy();
  });

  it('refreshes ALL unchanged files and skips changed files when new files added', async () => {
    const service = await createConnectedService();

    // First sync — three files
    service.syncWorkspaceFiles([
      { path: 'a.rosetta', content: 'namespace a' },
      { path: 'b.rosetta', content: 'namespace b' },
      { path: 'c.rosetta', content: 'namespace c' }
    ]);
    vi.runAllTimers();
    mockDidOpen.mockClear();
    mockNotification.mockClear();

    // Second sync — add new file d, modify b, keep a and c unchanged
    service.syncWorkspaceFiles([
      { path: 'a.rosetta', content: 'namespace a' },
      { path: 'b.rosetta', content: 'namespace b_modified' },
      { path: 'c.rosetta', content: 'namespace c' },
      { path: 'd.rosetta', content: 'namespace d' }
    ]);

    // Flush debounced refresh
    vi.runAllTimers();

    // d.rosetta should be opened
    expect(mockDidOpen).toHaveBeenCalledOnce();

    const changeCalls = mockNotification.mock.calls.filter(
      (c) => c[0] === 'textDocument/didChange'
    );

    // b.rosetta should get exactly ONE change (content modification), not a second refresh
    const changesForB = changeCalls.filter(
      (c) => c[1].textDocument.uri === 'file:///workspace/b.rosetta'
    );
    expect(changesForB).toHaveLength(1);
    expect(changesForB[0][1].contentChanges[0].text).toBe('namespace b_modified');

    // a.rosetta and c.rosetta should BOTH get refresh notifications (unchanged files)
    const refreshForA = changeCalls.filter(
      (c) => c[1].textDocument.uri === 'file:///workspace/a.rosetta'
    );
    const refreshForC = changeCalls.filter(
      (c) => c[1].textDocument.uri === 'file:///workspace/c.rosetta'
    );
    expect(refreshForA).toHaveLength(1);
    expect(refreshForC).toHaveLength(1);

    // Refresh notifications send same content (no-op change)
    expect(refreshForA[0][1].contentChanges[0].text).toBe('namespace a');
    expect(refreshForC[0][1].contentChanges[0].text).toBe('namespace c');

    // Total: 1 content change (b) + 2 refreshes (a, c) = 3 didChange notifications
    expect(changeCalls).toHaveLength(3);
  });

  it('does not change anything when files are identical', async () => {
    const service = await createConnectedService();

    service.syncWorkspaceFiles([{ path: 'a.rosetta', content: 'namespace a' }]);
    vi.runAllTimers();
    mockDidOpen.mockClear();
    mockNotification.mockClear();

    // Same files, same content, no additions
    service.syncWorkspaceFiles([{ path: 'a.rosetta', content: 'namespace a' }]);
    vi.runAllTimers();

    // No new opens, no changes, no closes (no new files added so no refresh either)
    expect(mockDidOpen).not.toHaveBeenCalled();
    expect(mockNotification).not.toHaveBeenCalled();
    expect(mockDidClose).not.toHaveBeenCalled();
  });
});
