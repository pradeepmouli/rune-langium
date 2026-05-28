// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { App } from '../../src/App.js';
import { saveWorkspace, _resetForTests, type WorkspaceRecord } from '../../src/workspace/persistence.js';
import { createOpfsRoot, type OpfsRoot } from '../setup/opfs-mock.js';
import { saveWorkspaceFiles, setWorkspaceFilesDeps } from '../../src/workspace/workspace-files.js';

const { parseWorkspaceFilesMock, showToastSpy, setCuratedFilesSpy } = vi.hoisted(() => ({
  parseWorkspaceFilesMock: vi.fn(),
  showToastSpy: vi.fn(),
  setCuratedFilesSpy: vi.fn()
}));

vi.mock('../../src/services/workspace.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/workspace.js')>();
  return {
    ...actual,
    parseWorkspaceFiles: parseWorkspaceFilesMock
  };
});

vi.mock('../../src/components/ModelLoader.js', () => ({
  ModelLoader: () => null
}));

vi.mock('../../src/shell/ExplorePerspective.js', async () => {
  const { useWorkspace } = await import('../../src/shell/providers/workspace-context.js');
  const { useWorkspaceActions } = await import('../../src/shell/perspectives/workspace-actions-context.js');
  return {
    ExplorePerspective: () => {
      const { files, models, parsedModels, parseErrors } = useWorkspace();
      const { onFilesChange } = useWorkspaceActions();
      return (
        <div data-testid="explore-workbench">
          <span data-testid="model-count">{models.length}</span>
          <span data-testid="parsed-count">{parsedModels.length}</span>
          <span data-testid="error-count">{parseErrors.size}</span>
          <button
            type="button"
            onClick={() =>
              onFilesChange(
                files.map((file) =>
                  file.path === 'trade.rosetta'
                    ? {
                        ...file,
                        content: 'namespace restored.project\n\ntype Trade\n  tradeDate date (1..1)\n',
                        dirty: true
                      }
                    : file
                )
              )
            }
          >
            break
          </button>
        </div>
      );
    }
  };
});

vi.mock('../../src/store/model-store.js', () => {
  const state = {
    models: new Map(),
    load: vi.fn(),
    unload: vi.fn(),
    setCuratedFiles: setCuratedFilesSpy
  };
  const useStore = ((selector: (value: typeof state) => unknown) => selector(state)) as unknown as {
    (selector: (value: typeof state) => unknown): unknown;
    getState: () => typeof state;
  };
  useStore.getState = () => state;
  return { useModelStore: useStore };
});

vi.mock('../../src/services/transport-provider.js', () => ({
  createTransportProvider: () => ({
    onStateChange: () => () => {},
    dispose: () => {}
  })
}));

vi.mock('../../src/services/lsp-client.js', () => ({
  createLspClientService: () => ({
    connect: vi.fn().mockResolvedValue(undefined),
    reconnect: vi.fn().mockResolvedValue(undefined),
    syncWorkspaceFiles: vi.fn(),
    dispose: vi.fn()
  })
}));

vi.mock('../../src/components/StudioToastProvider.js', () => ({
  StudioToastProvider: ({ children }: { children?: ReactNode }) => children,
  useStudioToast: () => ({ showToast: showToastSpy })
}));

function makeWorkspace(id: string, name: string): WorkspaceRecord {
  const now = new Date().toISOString();
  return {
    id,
    name,
    kind: 'browser-only',
    createdAt: now,
    lastOpenedAt: now,
    layout: { version: 1, writtenBy: '0', dockview: null },
    tabs: [],
    activeTabPath: null,
    curatedModels: [],
    schemaVersion: 1
  };
}

class MockWorker {
  readonly postMessage = vi.fn();
  readonly addEventListener = vi.fn();
  readonly removeEventListener = vi.fn();
  readonly terminate = vi.fn();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(async () => {
  parseWorkspaceFilesMock.mockReset();
  showToastSpy.mockReset();
  setCuratedFilesSpy.mockReset();
  vi.stubGlobal('Worker', MockWorker);
  const opfsRoot: OpfsRoot = createOpfsRoot();
  setWorkspaceFilesDeps({
    getOpfsRoot: async () => opfsRoot as unknown as FileSystemDirectoryHandle
  });
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: {
      getDirectory: vi.fn().mockResolvedValue(opfsRoot as unknown as FileSystemDirectoryHandle)
    }
  });
  await _resetForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('rune-studio');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  document.body.removeAttribute('data-workspace-active');
});

afterEach(() => {
  setWorkspaceFilesDeps({
    getOpfsRoot: async () => {
      throw new Error('test opfs root not configured');
    }
  });
  vi.useRealTimers();
  vi.unstubAllGlobals();
  cleanup();
});

describe('App parse recovery', () => {
  it('keeps the last valid semantic model when an edit-time parse fails', async () => {
    parseWorkspaceFilesMock
      .mockResolvedValueOnce({
        models: [{ name: 'restored.project' }],
        parsedModels: [{ filePath: 'trade.rosetta', model: { name: 'restored.project' } }],
        errors: new Map(),
        parseMode: 'router'
      })
      .mockResolvedValueOnce({
        models: [],
        parsedModels: [],
        errors: new Map([['trade.rosetta', ['Expected ":" after type declaration']]]),
        parseMode: 'router'
      });

    await saveWorkspace(makeWorkspace('ws-parse-errors', 'Parse Recovery'));
    await saveWorkspaceFiles('ws-parse-errors', [
      {
        name: 'trade.rosetta',
        path: 'trade.rosetta',
        content: 'namespace restored.project\n\ntype Trade:\n  tradeDate date (1..1)\n',
        dirty: false
      }
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('model-count').textContent).toBe('1');
      expect(screen.getByTestId('parsed-count').textContent).toBe('1');
      expect(screen.getByTestId('error-count').textContent).toBe('0');
    });

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'break' }));
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByTestId('model-count').textContent).toBe('1');
    expect(screen.getByTestId('parsed-count').textContent).toBe('1');
    expect(screen.getByTestId('error-count').textContent).toBe('1');
  });

  it('ignores stale edit-time parse results that resolve after newer content', async () => {
    const staleInvalid = deferred<{
      models: [];
      parsedModels: [];
      errors: Map<string, string[]>;
      parseMode: 'router';
    }>();
    const latestValid = deferred<{
      models: Array<{ name: string }>;
      parsedModels: Array<{ filePath: string; model: { name: string } }>;
      errors: Map<string, string[]>;
      parseMode: 'router';
    }>();
    parseWorkspaceFilesMock
      .mockResolvedValueOnce({
        models: [{ name: 'restored.project' }],
        parsedModels: [{ filePath: 'trade.rosetta', model: { name: 'restored.project' } }],
        errors: new Map(),
        parseMode: 'router'
      })
      .mockReturnValueOnce(staleInvalid.promise)
      .mockReturnValueOnce(latestValid.promise);

    await saveWorkspace(makeWorkspace('ws-parse-race', 'Parse Race'));
    await saveWorkspaceFiles('ws-parse-race', [
      {
        name: 'trade.rosetta',
        path: 'trade.rosetta',
        content: 'namespace restored.project\n\ntype Trade:\n  tradeDate date (1..1)\n',
        dirty: false
      }
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('model-count').textContent).toBe('1');
      expect(screen.getByTestId('error-count').textContent).toBe('0');
    });

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'break' }));
      await vi.advanceTimersByTimeAsync(500);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'break' }));
      await vi.advanceTimersByTimeAsync(500);
    });

    latestValid.resolve({
      models: [{ name: 'restored.project' }],
      parsedModels: [{ filePath: 'trade.rosetta', model: { name: 'restored.project' } }],
      errors: new Map(),
      parseMode: 'router'
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('error-count').textContent).toBe('0');

    staleInvalid.resolve({
      models: [],
      parsedModels: [],
      errors: new Map([['trade.rosetta', ['Expected ":" after type declaration']]]),
      parseMode: 'router'
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId('model-count').textContent).toBe('1');
    expect(screen.getByTestId('parsed-count').textContent).toBe('1');
    expect(screen.getByTestId('error-count').textContent).toBe('0');
  });
});
