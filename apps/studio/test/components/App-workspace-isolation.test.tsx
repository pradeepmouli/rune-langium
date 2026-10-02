// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEditorStore } from '@rune-langium/visual-editor';
import { App } from '../../src/App.js';
import { useModelStore } from '../../src/store/model-store.js';
import { usePreviewStore } from '../../src/store/preview-store.js';
import { useCodegenStore } from '../../src/store/codegen-store.js';
import { getModelSource } from '../../src/services/model-registry.js';
import type { LoadedModel } from '../../src/types/model-types.js';
import { _resetForTests, listRecents, loadWorkspace, saveWorkspace } from '../../src/workspace/persistence.js';
import * as persistence from '../../src/workspace/persistence.js';
import { loadWorkspaceFiles, saveWorkspaceFiles, setWorkspaceFilesDeps } from '../../src/workspace/workspace-files.js';
import * as workspaceFiles from '../../src/workspace/workspace-files.js';
import { createOpfsRoot } from '../setup/opfs-mock.js';

const { parseMock } = vi.hoisted(() => ({ parseMock: vi.fn() }));
vi.mock('../../src/services/workspace.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/workspace.js')>()),
  parseWorkspaceFiles: parseMock
}));
vi.mock('../../src/services/transport-provider.js', () => ({
  createTransportProvider: () => ({ onStateChange: () => () => {}, dispose: () => {} })
}));
vi.mock('../../src/services/lsp-client.js', () => ({
  createLspClientService: () => ({
    connect: vi.fn().mockResolvedValue(undefined),
    syncWorkspaceFiles: vi.fn(),
    syncWorkspaceModels: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn()
  })
}));
vi.mock('../../src/components/StudioToastProvider.js', () => ({
  StudioToastProvider: ({ children }: { children?: ReactNode }) => children,
  useStudioToast: () => ({ showToast: vi.fn(), showLoadingToast: vi.fn(() => 'loading'), dismissToast: vi.fn() })
}));
vi.mock('../../src/shell/ExplorePerspective.js', async () => {
  const { useWorkspace } = await import('../../src/shell/providers/workspace-context.js');
  const { useWorkspaceActions } = await import('../../src/shell/perspectives/workspace-actions-context.js');
  return {
    ExplorePerspective: () => {
      const { files, deferredExports } = useWorkspace();
      const { onCreateWorkspace } = useWorkspaceActions();
      return (
        <div>
          <span data-testid="files">{files.map((file) => file.path).join(',')}</span>
          <span data-testid="deferred">{deferredExports.map((entry) => entry.namespace).join(',')}</span>
          <button onClick={onCreateWorkspace}>Create workspace</button>
        </div>
      );
    }
  };
});

const sourceFiles = [{ name: 'trade.rosetta', path: 'trade.rosetta', content: 'namespace project.a\n', dirty: false }];
const blankFiles = [{ name: 'blank.rosetta', path: 'blank.rosetta', content: 'namespace example\n', dirty: false }];
const emptyParse = () => ({ models: [], parsedModels: [], errors: new Map(), deferredExports: [] });

beforeEach(async () => {
  parseMock.mockReset().mockImplementation(async () => emptyParse());
  useModelStore.setState({ models: new Map(), loading: new Map(), errors: new Map() });
  useEditorStore.getState().loadDeferredExports([]);
  useEditorStore.getState().loadModels([]);
  usePreviewStore.getState().resetPreviewState();
  useCodegenStore.getState().resetCodegenState();
  const opfsRoot = createOpfsRoot();
  setWorkspaceFilesDeps({ getOpfsRoot: async () => opfsRoot as unknown as FileSystemDirectoryHandle });
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { getDirectory: vi.fn().mockResolvedValue(opfsRoot) }
  });
  await _resetForTests();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('rune-studio');
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
  const now = new Date().toISOString();
  await saveWorkspace({
    id: 'ws-a',
    name: 'Source project',
    kind: 'browser-only',
    createdAt: now,
    lastOpenedAt: now,
    layout: { version: 1, writtenBy: 'test', dockview: null },
    tabs: [],
    activeTabPath: null,
    curatedModels: [],
    schemaVersion: 1
  });
  await saveWorkspaceFiles('ws-a', sourceFiles);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete window.__runeStudioTestApi;
  useModelStore.setState({ models: new Map(), loading: new Map(), errors: new Map() });
  setWorkspaceFilesDeps({
    getOpfsRoot: async () => {
      throw new Error('test ended');
    }
  });
});

async function openSourceWorkspace() {
  render(<App />);
  await waitFor(() => expect(screen.getByTestId('files')).toHaveTextContent('trade.rosetta'));
  const cdm: LoadedModel = {
    source: getModelSource('cdm')!,
    commitHash: 'latest',
    loadedAt: Date.now(),
    files: [{ path: 'event-common-type.rosetta', content: 'namespace cdm.event.common\n' }]
  };
  const custom: LoadedModel = {
    source: {
      id: 'custom',
      name: 'Custom',
      repoUrl: 'https://example.com/model.git',
      ref: 'main',
      paths: ['*.rosetta']
    },
    commitHash: 'test',
    loadedAt: Date.now(),
    files: [{ path: 'copied.rosetta', content: 'namespace copied.cdm\n' }]
  };
  await act(async () =>
    useModelStore.setState({
      models: new Map([
        ['cdm', cdm],
        ['custom', custom]
      ])
    })
  );
  await waitFor(() => expect(screen.getByTestId('files')).toHaveTextContent('[custom]/copied.rosetta'));
  await waitFor(async () =>
    expect((await loadWorkspace('ws-a'))?.curatedModels?.map((b) => b.modelId)).toEqual(['cdm'])
  );
}

describe('workspace isolation', () => {
  it('launcher loads only the new files and preserves the previous workspace on disk', async () => {
    await openSourceWorkspace();
    await act(async () => window.__runeStudioTestApi!.loadFiles!(blankFiles));
    expect(useModelStore.getState().models.size).toBe(0);
    expect(screen.getByTestId('files')).toHaveTextContent('blank.rosetta');
    expect(screen.getByTestId('files')).not.toHaveTextContent('trade.rosetta');
    expect(screen.getByTestId('files')).not.toHaveTextContent('[cdm]');
    expect(screen.getByTestId('files')).not.toHaveTextContent('[custom]');
    expect(await loadWorkspaceFiles('ws-a')).toEqual(sourceFiles);
    const created = (await listRecents()).find((workspace) => workspace.id !== 'ws-a')!;
    expect((await loadWorkspace(created.id))?.curatedModels).toEqual([]);
    expect(await loadWorkspaceFiles(created.id)).toEqual(blankFiles);
  });

  it('New workspace clears files, model bindings, selection and previews before returning to the launcher', async () => {
    await openSourceWorkspace();
    const deferred = [
      { filePath: '[cdm]/event.rosetta', namespace: 'cdm.event.common', exports: [{ type: 'Data', name: 'SpinOff' }] }
    ];
    useEditorStore.getState().loadDeferredExports(deferred);
    useEditorStore.getState().loadModels([]);
    useEditorStore.getState().selectNode('cdm.event.common.SpinOff#Data');
    usePreviewStore.setState({ selectedTargetId: 'cdm.event.common.SpinOff' });
    useCodegenStore.getState().setCodePreviewTarget('typescript');
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'New blank workspace' })).toBeVisible());
    expect(screen.queryByRole('button', { name: /Workspace menu/ })).not.toBeInTheDocument();
    expect(useModelStore.getState().models.size).toBe(0);
    expect(useEditorStore.getState().nodes).toEqual([]);
    expect(useEditorStore.getState().selectedNodeId).toBeNull();
    expect(usePreviewStore.getState().selectedTargetId).toBeUndefined();
    expect(useCodegenStore.getState().codePreviewTarget).toBe('zod');
    expect(await loadWorkspaceFiles('ws-a')).toEqual(sourceFiles);
  });

  it('Close workspace returns to the launcher without erasing the saved files', async () => {
    await openSourceWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Workspace menu — Source project' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Close Source project and return to start page' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'New blank workspace' })).toBeVisible());
    expect(useModelStore.getState().models.size).toBe(0);
    expect(await loadWorkspaceFiles('ws-a')).toEqual(sourceFiles);
    expect((await loadWorkspace('ws-a'))?.curatedModels?.map((binding) => binding.modelId)).toEqual(['cdm']);
  });

  it('opening an empty workspace clears the previous source and models', async () => {
    await openSourceWorkspace();
    const previous = (await loadWorkspace('ws-a'))!;
    await saveWorkspace({ ...previous, id: 'ws-empty', name: 'Empty', curatedModels: [] });
    await act(async () => window.__runeStudioTestApi!.switchWorkspace!('ws-empty'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'New blank workspace' })).toBeVisible());
    expect(screen.queryByRole('button', { name: /Workspace menu/ })).not.toBeInTheDocument();
    expect(useModelStore.getState().models.size).toBe(0);
    expect(await loadWorkspaceFiles('ws-a')).toEqual(sourceFiles);
  });

  it('a superseded restore cannot hide the newer workspace', async () => {
    await openSourceWorkspace();
    const previous = (await loadWorkspace('ws-a'))!;
    await saveWorkspace({ ...previous, id: 'ws-slow', name: 'Slow', curatedModels: [] });
    await saveWorkspace({ ...previous, id: 'ws-new', name: 'New', curatedModels: [] });
    await saveWorkspaceFiles('ws-new', blankFiles);
    let finishRestore!: (files: typeof sourceFiles) => void;
    vi.spyOn(workspaceFiles, 'loadWorkspaceFiles').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRestore = resolve;
        })
    );
    let oldSwitch!: Promise<void>;
    await act(async () => {
      oldSwitch = window.__runeStudioTestApi!.switchWorkspace!('ws-slow');
    });
    await waitFor(() => expect(finishRestore).toBeTypeOf('function'));
    await act(async () => window.__runeStudioTestApi!.switchWorkspace!('ws-new'));
    await act(async () => {
      finishRestore(sourceFiles);
      await oldSwitch;
    });
    expect(screen.getByTestId('files')).toHaveTextContent('blank.rosetta');
    expect(screen.getByRole('button', { name: 'Workspace menu — New' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'New blank workspace' })).not.toBeInTheDocument();
  });

  it('an import that supersedes a restore leaves the restoring screen', async () => {
    await openSourceWorkspace();
    const previous = (await loadWorkspace('ws-a'))!;
    await saveWorkspace({ ...previous, id: 'ws-slow', name: 'Slow', curatedModels: [] });
    let finishRestore!: (files: typeof sourceFiles) => void;
    vi.spyOn(workspaceFiles, 'loadWorkspaceFiles').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRestore = resolve;
        })
    );
    let oldSwitch!: Promise<void>;
    await act(async () => {
      oldSwitch = window.__runeStudioTestApi!.switchWorkspace!('ws-slow');
    });
    await waitFor(() => expect(screen.getByText('Restoring workspace…')).toBeVisible());
    await act(async () => window.__runeStudioTestApi!.loadFiles!(blankFiles));
    expect(screen.getByTestId('files')).toHaveTextContent('blank.rosetta');
    expect(screen.queryByText('Restoring workspace…')).not.toBeInTheDocument();
    await act(async () => {
      finishRestore(sourceFiles);
      await oldSwitch;
    });
    expect(screen.getByTestId('files')).toHaveTextContent('blank.rosetta');
    expect(screen.queryByText('Restoring workspace…')).not.toBeInTheDocument();
  });

  it('removes an empty record created by a superseded launcher import', async () => {
    await openSourceWorkspace();
    const saveRecord = persistence.saveWorkspace;
    let finishCreation!: () => void;
    let abandonedId!: string;
    vi.spyOn(persistence, 'saveWorkspace').mockImplementationOnce(async (workspace) => {
      await saveRecord(workspace);
      abandonedId = workspace.id;
      await new Promise<void>((resolve) => {
        finishCreation = resolve;
      });
    });
    let oldImport!: Promise<void>;
    await act(async () => {
      oldImport = window.__runeStudioTestApi!.loadFiles!(sourceFiles);
    });
    await waitFor(() => expect(finishCreation).toBeTypeOf('function'));
    await act(async () => window.__runeStudioTestApi!.loadFiles!(blankFiles));
    await act(async () => {
      finishCreation();
      await oldImport;
    });
    expect(await loadWorkspace(abandonedId)).toBeUndefined();
    expect(await loadWorkspaceFiles(abandonedId)).toEqual([]);
    expect(await listRecents()).toHaveLength(2);
    expect(screen.getByTestId('files')).toHaveTextContent('blank.rosetta');
    expect(await loadWorkspaceFiles('ws-a')).toEqual(sourceFiles);
  });

  it('ignores a model parse from the previous workspace that finishes after a new workspace loads', async () => {
    await openSourceWorkspace();
    let finishOldParse!: (value: ReturnType<typeof emptyParse>) => void;
    parseMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOldParse = resolve;
        })
    );
    await act(async () => {
      const current = useModelStore.getState().models;
      useModelStore.setState({
        models: new Map([...current].map(([id, model]) => [id, { ...model, loadedAt: model.loadedAt + 1 }]))
      });
    });
    await waitFor(() => expect(finishOldParse).toBeTypeOf('function'));
    await act(async () => window.__runeStudioTestApi!.loadFiles!(blankFiles));
    await act(async () =>
      finishOldParse({
        ...emptyParse(),
        deferredExports: [{ filePath: '[cdm]/old.rosetta', namespace: 'cdm.old', exports: [] }]
      })
    );
    expect(screen.getByTestId('deferred')).toBeEmptyDOMElement();
    expect(screen.getByTestId('files')).not.toHaveTextContent('[cdm]');
    expect(useModelStore.getState().models.size).toBe(0);
  });
});
