/**
 * LSP client service tests (T016).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLspClientService } from '../../src/services/lsp-client.js';

// Mock transport provider
vi.mock('../../src/services/transport-provider.js', () => ({
  createTransportProvider: vi.fn()
}));

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
