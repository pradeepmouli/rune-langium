// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import React, { useEffect, useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, waitFor, screen, act } from '@testing-library/react';
import { usePreviewStore } from '../../src/store/preview-store.js';
import { setRuneStudioTestApi } from '../../src/test-api.js';

const { editorStoreState, useEditorStore, useDiagnosticsStore } = vi.hoisted(() => {
  const editorStoreState = {
    nodes: [] as Array<{
      id: string;
      data: { namespace?: string; name?: string; $type?: string };
    }>,
    selectedNodeId: undefined as string | undefined,
    visibility: { expandedNamespaces: new Set<string>(), hiddenNodeIds: new Set<string>() },
    selectNode: vi.fn(),
    toggleNamespace: vi.fn(),
    toggleNodeVisibility: vi.fn(),
    expandAllNamespaces: vi.fn(),
    collapseAllNamespaces: vi.fn(),
    loadModels: vi.fn()
  };

  const useEditorStore = ((selector: (state: typeof editorStoreState) => unknown) =>
    selector(editorStoreState)) as typeof import('@rune-langium/visual-editor').useEditorStore;
  Object.assign(useEditorStore, {
    getState: () => editorStoreState
  });

  const diagnosticsState = { fileDiagnostics: new Map(), totalErrors: 0, totalWarnings: 0 };
  const useDiagnosticsStore = (() =>
    diagnosticsState) as typeof import('../../src/store/diagnostics-store.js').useDiagnosticsStore;
  Object.assign(useDiagnosticsStore, {
    getState: () => diagnosticsState
  });

  return { editorStoreState, useEditorStore, diagnosticsState, useDiagnosticsStore };
});

const { sourceEditorMockState, dockShellMockState } = vi.hoisted(() => ({
  sourceEditorMockState: {
    latestProps: undefined as
      | {
          activeFile?: string;
          onEditorViewCreated?: (filePath: string, view: { id: string }) => void;
        }
      | undefined
  },
  dockShellMockState: {
    latestProps: undefined as
      | {
          focusPanel?: { component: string; nonce: number } | null;
        }
      | undefined
  }
}));

class MockWorker {
  static instances: MockWorker[] = [];
  readonly postMessage = vi.fn();
  readonly listeners = new Map<string, Set<EventListener>>();
  readonly addEventListener = vi.fn((type: string, listener: EventListener) => {
    const handlers = this.listeners.get(type) ?? new Set<EventListener>();
    handlers.add(listener);
    this.listeners.set(type, handlers);
  });
  readonly removeEventListener = vi.fn((type: string, listener: EventListener) => {
    this.listeners.get(type)?.delete(listener);
  });
  readonly terminate = vi.fn();

  constructor(_url: URL, _options?: WorkerOptions) {
    MockWorker.instances.push(this);
  }

  dispatch(type: 'message' | 'error' | 'messageerror', event: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as Event);
    }
  }
}

vi.mock('@rune-langium/visual-editor', () => ({
  RuneTypeGraph: () => React.createElement('div'),
  NamespaceExplorerPanel: () => React.createElement('div'),
  EditorFormPanel: () => React.createElement('div'),
  ExpressionBuilder: () => React.createElement('div'),
  BUILTIN_TYPES: [],
  AST_TYPE_TO_NODE_TYPE: {},
  useEditorStore
}));

vi.mock('../../src/components/SourceEditor.js', () => ({
  SourceEditor: React.forwardRef(
    (
      props: {
        activeFile?: string;
        onEditorViewCreated?: (filePath: string, view: { id: string }) => void;
      },
      ref
    ) => {
      sourceEditorMockState.latestProps = props;
      useImperativeHandle(ref, () => ({
        revealLine: vi.fn(),
        revealPosition: vi.fn()
      }));

      useEffect(() => {
        if (props.activeFile) {
          props.onEditorViewCreated?.(props.activeFile, { id: props.activeFile });
        }
      }, [props.activeFile, props.onEditorViewCreated]);

      return React.createElement('div', {
        'data-testid': 'source-editor-mock',
        'data-active-file': props.activeFile ?? ''
      });
    }
  )
}));

vi.mock('../../src/components/ConnectionStatus.js', () => ({
  ConnectionStatus: () => React.createElement('div')
}));

vi.mock('../../src/components/DiagnosticsPanel.js', () => ({
  DiagnosticsPanel: () => React.createElement('div')
}));

vi.mock('../../src/components/ExportMenu.js', () => ({
  ExportMenu: () => React.createElement('div')
}));

vi.mock('../../src/components/ExportDialog.js', () => ({
  ExportDialog: () => null
}));

vi.mock('@rune-langium/design-system/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement('button', props, children)
}));

vi.mock('@rune-langium/design-system/ui/separator', () => ({
  Separator: () => React.createElement('div')
}));

vi.mock('@rune-langium/design-system/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', {}, children)
}));

vi.mock('lucide-react', () => ({
  Maximize2: () => React.createElement('span'),
  LayoutGrid: () => React.createElement('span'),
  Code2: () => React.createElement('span'),
  Network: () => React.createElement('span'),
  XCircle: () => React.createElement('span')
}));

vi.mock('../../src/components/GraphFilterMenu.js', () => ({
  GraphFilterMenu: () => React.createElement('div')
}));

vi.mock('../../src/shell/DockShell.js', () => ({
  DockShell: ({
    panelComponents,
    focusPanel
  }: {
    panelComponents?: Record<string, React.ComponentType>;
    focusPanel?: { component: string; nonce: number } | null;
  }) => {
    dockShellMockState.latestProps = { focusPanel };
    return React.createElement('div', { 'data-testid': 'dock-shell' }, [
      panelComponents?.['workspace.editor']
        ? React.createElement(panelComponents['workspace.editor'], { key: 'editor' })
        : null,
      panelComponents?.['workspace.visualPreview']
        ? React.createElement(panelComponents['workspace.visualPreview'], { key: 'visual' })
        : null
    ]);
  }
}));

vi.mock('../../src/hooks/useLspDiagnosticsBridge.js', () => ({
  useLspDiagnosticsBridge: () => undefined
}));

vi.mock('../../src/store/diagnostics-store.js', () => ({
  useDiagnosticsStore
}));

vi.mock('../../src/components/CodePreviewPanel.js', () => ({
  CodePreviewPanel: () => React.createElement('div')
}));

vi.mock('../../src/components/FormPreviewPanel.js', () => ({
  FormPreviewPanel: () => React.createElement('div')
}));

vi.mock('../../src/utils/uri.js', () => ({
  pathToUri: (path: string) => `file://${path}`
}));

import { EditorPage } from '../../src/pages/EditorPage.js';

function modelWithType(typeName: string) {
  return {
    name: 'preview.alpha',
    $document: {
      uri: { path: '/preview-alpha.rosetta', toString: () => '/preview-alpha.rosetta' }
    },
    elements: [
      {
        name: typeName,
        $document: {
          uri: { path: '/preview-alpha.rosetta', toString: () => '/preview-alpha.rosetta' }
        },
        $cstNode: {
          range: {
            start: { line: 8, character: 0 },
            end: { line: 12, character: 0 }
          }
        }
      }
    ]
  };
}

describe('EditorPage preview target identity', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', MockWorker);
    MockWorker.instances = [];
    setRuneStudioTestApi(() => undefined);
    usePreviewStore.getState().resetPreviewState();
    editorStoreState.nodes = [];
    editorStoreState.selectedNodeId = undefined;
    vi.clearAllMocks();
    sourceEditorMockState.latestProps = undefined;
    dockShellMockState.latestProps = undefined;
  });

  afterEach(() => {
    setRuneStudioTestApi(() => undefined);
    vi.unstubAllGlobals();
    cleanup();
  });

  it('posts preview:generate using the selected node fully-qualified id when display names collide', async () => {
    editorStoreState.nodes = [
      { id: 'alpha-trade', data: { namespace: 'alpha', name: 'Trade', $type: 'data' } },
      { id: 'beta-trade', data: { namespace: 'beta', name: 'Trade', $type: 'data' } }
    ];
    editorStoreState.selectedNodeId = 'beta-trade';

    render(
      <EditorPage
        models={[]}
        files={[{ path: 'trade.rosetta', content: 'namespace beta', dirty: false }]}
      />
    );

    await waitFor(() => {
      expect(MockWorker.instances).toHaveLength(1);
      expect(MockWorker.instances[0]?.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'preview:generate',
          targetId: 'beta.Trade',
          requestId: expect.any(String)
        })
      );
    });

    expect(usePreviewStore.getState().selectedTargetId).toBe('beta.Trade');
  });

  it('re-generates preview for a renamed target after the previous selection is transiently cleared', async () => {
    editorStoreState.nodes = [
      {
        id: 'preview.alpha::Trade',
        data: { namespace: 'preview.alpha', name: 'Trade', $type: 'data' }
      }
    ];
    editorStoreState.selectedNodeId = 'preview.alpha::Trade';

    const { rerender } = render(
      <EditorPage
        models={[modelWithType('Trade') as never]}
        files={[
          { path: 'preview-alpha.rosetta', content: 'namespace preview.alpha', dirty: false }
        ]}
      />
    );

    await waitFor(() => {
      expect(MockWorker.instances).toHaveLength(1);
      expect(MockWorker.instances[0]?.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'preview:generate',
          targetId: 'preview.alpha.Trade',
          requestId: expect.any(String)
        })
      );
    });

    editorStoreState.nodes = [];
    rerender(
      <EditorPage
        models={[]}
        files={[{ path: 'preview-alpha.rosetta', content: 'namespace preview.alpha', dirty: true }]}
      />
    );

    editorStoreState.nodes = [
      {
        id: 'preview.alpha::RenamedTrade',
        data: { namespace: 'preview.alpha', name: 'RenamedTrade', $type: 'data' }
      }
    ];
    rerender(
      <EditorPage
        models={[modelWithType('RenamedTrade') as never]}
        files={[{ path: 'preview-alpha.rosetta', content: 'namespace preview.alpha', dirty: true }]}
      />
    );

    await waitFor(() => {
      expect(usePreviewStore.getState().selectedTargetId).toBe('preview.alpha.RenamedTrade');
      expect(MockWorker.instances[0]?.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'preview:generate',
          targetId: 'preview.alpha.RenamedTrade',
          requestId: expect.any(String)
        })
      );
    });
  });

  it('re-syncs preview files when workspace files change without re-posting duplicate preview:generate messages', async () => {
    editorStoreState.nodes = [
      {
        id: 'preview.alpha::Trade',
        data: { namespace: 'preview.alpha', name: 'Trade', $type: 'data' }
      }
    ];
    editorStoreState.selectedNodeId = 'preview.alpha::Trade';

    const { rerender } = render(
      <EditorPage
        models={[modelWithType('Trade') as never]}
        files={[
          { path: 'preview-alpha.rosetta', content: 'namespace preview.alpha', dirty: false }
        ]}
      />
    );

    await waitFor(() => {
      expect(MockWorker.instances).toHaveLength(1);
    });

    const worker = MockWorker.instances[0]!;
    const initialGenerateCount = worker.postMessage.mock.calls.filter(
      ([message]) =>
        (message as { type?: string; targetId?: string }).type === 'preview:generate' &&
        (message as { targetId?: string }).targetId === 'preview.alpha.Trade'
    ).length;
    const initialSetFilesCount = worker.postMessage.mock.calls.filter(
      ([message]) => (message as { type?: string }).type === 'preview:setFiles'
    ).length;

    rerender(
      <EditorPage
        models={[modelWithType('Trade') as never]}
        files={[
          {
            path: 'preview-alpha.rosetta',
            content: 'namespace preview.alpha\n\ntype Trade:\n  settlementDate string (0..1)',
            dirty: true
          }
        ]}
      />
    );

    await waitFor(() => {
      const refreshedSetFilesCount = worker.postMessage.mock.calls.filter(
        ([message]) => (message as { type?: string }).type === 'preview:setFiles'
      ).length;
      const refreshedGenerateCount = worker.postMessage.mock.calls.filter(
        ([message]) =>
          (message as { type?: string; targetId?: string }).type === 'preview:generate' &&
          (message as { targetId?: string }).targetId === 'preview.alpha.Trade'
      ).length;
      expect(refreshedSetFilesCount).toBeGreaterThan(initialSetFilesCount);
      expect(refreshedGenerateCount).toBe(initialGenerateCount);
      const setFilesRequestIds = worker.postMessage.mock.calls
        .filter(([message]) => (message as { type?: string }).type === 'preview:setFiles')
        .map(([message]) => (message as { requestId?: string }).requestId)
        .filter(Boolean);
      expect(new Set(setFilesRequestIds).size).toBe(setFilesRequestIds.length);
      const codegenSetFilesMessages = worker.postMessage.mock.calls
        .map(([message]) => message as { type?: string; requestId?: string })
        .filter((message) => message.type === 'codegen:setFiles');
      expect(codegenSetFilesMessages.length).toBeGreaterThan(0);
      expect(
        codegenSetFilesMessages.every((message) => message.requestId?.startsWith('codegen:'))
      ).toBe(true);
      expect(
        codegenSetFilesMessages.every((message) => !message.requestId?.startsWith('preview:'))
      ).toBe(true);
    });
  });

  it('ignores out-of-order stale preview responses for the same target', async () => {
    editorStoreState.nodes = [
      {
        id: 'preview.alpha::Trade',
        data: { namespace: 'preview.alpha', name: 'Trade', $type: 'data' }
      }
    ];
    editorStoreState.selectedNodeId = 'preview.alpha::Trade';

    const { rerender } = render(
      <EditorPage
        models={[modelWithType('Trade') as never]}
        files={[
          { path: 'preview-alpha.rosetta', content: 'namespace preview.alpha', dirty: false }
        ]}
      />
    );

    await waitFor(() => {
      expect(MockWorker.instances).toHaveLength(1);
    });

    const worker = MockWorker.instances[0]!;
    const originalRequestId = worker.postMessage.mock.calls
      .map(([message]) => message as { type?: string; requestId?: string })
      .find((message) => message.type === 'preview:generate')?.requestId;

    rerender(
      <EditorPage
        models={[modelWithType('Trade') as never]}
        files={[
          {
            path: 'preview-alpha.rosetta',
            content: 'namespace preview.alpha\n\ntype Trade:\n  settlementDate string (0..1)',
            dirty: true
          }
        ]}
      />
    );

    const latestRequestId = worker.postMessage.mock.calls
      .map(([message]) => message as { type?: string; requestId?: string })
      .filter((message) => message.type === 'preview:setFiles')
      .at(-1)?.requestId;

    await act(async () => {
      worker.dispatch('message', {
        data: {
          type: 'preview:result',
          targetId: 'preview.alpha.Trade',
          requestId: originalRequestId,
          schema: {
            schemaVersion: 1,
            targetId: 'preview.alpha.Trade',
            title: 'Old Trade',
            status: 'ready',
            fields: []
          }
        }
      });
    });

    expect(usePreviewStore.getState().schemas.get('preview.alpha.Trade')).toBeUndefined();

    await act(async () => {
      worker.dispatch('message', {
        data: {
          type: 'preview:result',
          targetId: 'preview.alpha.Trade',
          requestId: latestRequestId,
          schema: {
            schemaVersion: 1,
            targetId: 'preview.alpha.Trade',
            title: 'Trade',
            status: 'ready',
            fields: []
          }
        }
      });
    });

    expect(usePreviewStore.getState().schemas.get('preview.alpha.Trade')?.title).toBe('Trade');
  });

  it('marks preview stale when a cached schema exists and the worker later crashes', async () => {
    editorStoreState.nodes = [
      {
        id: 'preview.alpha::Trade',
        data: { namespace: 'preview.alpha', name: 'Trade', $type: 'data' }
      }
    ];
    editorStoreState.selectedNodeId = 'preview.alpha::Trade';

    render(
      <EditorPage
        models={[modelWithType('Trade') as never]}
        files={[
          { path: 'preview-alpha.rosetta', content: 'namespace preview.alpha', dirty: false }
        ]}
      />
    );

    await waitFor(() => {
      expect(MockWorker.instances).toHaveLength(1);
    });

    const worker = MockWorker.instances[0]!;
    const requestId = worker.postMessage.mock.calls
      .map(([message]) => message as { type?: string; requestId?: string })
      .find((message) => message.type === 'preview:generate')?.requestId;

    await act(async () => {
      worker.dispatch('message', {
        data: {
          type: 'preview:result',
          targetId: 'preview.alpha.Trade',
          requestId,
          schema: {
            schemaVersion: 1,
            targetId: 'preview.alpha.Trade',
            title: 'Trade',
            status: 'ready',
            fields: []
          }
        }
      });
    });

    await act(async () => {
      worker.dispatch('error', { type: 'error', message: 'worker crashed' });
    });

    expect(usePreviewStore.getState().status).toEqual({
      state: 'stale',
      targetId: 'preview.alpha.Trade',
      reason: 'generation-error',
      message: 'Preview worker crashed. worker crashed'
    });
  });

  it('marks preview unavailable when the worker rejects a message before any schema is cached', async () => {
    editorStoreState.nodes = [
      {
        id: 'preview.alpha::Trade',
        data: { namespace: 'preview.alpha', name: 'Trade', $type: 'data' }
      }
    ];
    editorStoreState.selectedNodeId = 'preview.alpha::Trade';

    render(
      <EditorPage
        models={[modelWithType('Trade') as never]}
        files={[
          { path: 'preview-alpha.rosetta', content: 'namespace preview.alpha', dirty: false }
        ]}
      />
    );

    await waitFor(() => {
      expect(MockWorker.instances).toHaveLength(1);
    });

    await act(async () => {
      MockWorker.instances[0]!.dispatch('messageerror', { type: 'messageerror' });
    });

    expect(usePreviewStore.getState().status).toEqual({
      state: 'unavailable',
      targetId: 'preview.alpha.Trade',
      reason: 'generation-error',
      message:
        'Preview worker rejected a message. A preview worker message could not be deserialized.'
    });
  });

  it('surfaces worker boot failures without crashing the page', async () => {
    setRuneStudioTestApi(() => ({
      createCodegenWorker() {
        throw new Error('worker boot failed');
      }
    }));

    render(<EditorPage models={[]} files={[]} />);

    await waitFor(() => {
      expect(usePreviewStore.getState().status).toEqual({
        state: 'unavailable',
        reason: 'generation-error',
        message: 'Preview worker could not start. worker boot failed'
      });
    });
  });

  it('resolves displayFile by opening the matching source file and returning its editor view', async () => {
    let displayFileHandler: ((uri: string) => Promise<{ id: string } | null>) | undefined;
    const lspClient = {
      onDisplayFile: vi.fn((handler: (uri: string) => Promise<{ id: string } | null>) => {
        displayFileHandler = handler;
        return vi.fn();
      })
    };

    render(
      <EditorPage
        models={[]}
        files={[
          {
            path: '/workspace/alpha.rosetta',
            name: 'alpha.rosetta',
            content: 'namespace alpha',
            dirty: false
          },
          {
            path: '/workspace/beta.rosetta',
            name: 'beta.rosetta',
            content: 'namespace beta',
            dirty: false
          }
        ]}
        lspClient={lspClient as never}
      />
    );

    await waitFor(() => {
      expect(displayFileHandler).toBeDefined();
    });

    let pendingView: Promise<{ id: string } | null> | undefined;
    await act(async () => {
      pendingView = displayFileHandler?.('file:///workspace/beta.rosetta');
    });
    await waitFor(() => {
      expect(sourceEditorMockState.latestProps?.activeFile).toBe('/workspace/beta.rosetta');
    });
    sourceEditorMockState.latestProps?.onEditorViewCreated?.('/workspace/beta.rosetta', {
      id: '/workspace/beta.rosetta'
    });
    await expect(pendingView).resolves.toEqual({ id: '/workspace/beta.rosetta' });

    await waitFor(() => {
      expect(screen.getByTestId('source-editor-mock')).toHaveAttribute(
        'data-active-file',
        '/workspace/beta.rosetta'
      );
    });
  });
});

describe('EditorPage workspace chrome', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', MockWorker);
    MockWorker.instances = [];
    setRuneStudioTestApi(() => undefined);
    usePreviewStore.getState().resetPreviewState();
    editorStoreState.nodes = [];
    editorStoreState.selectedNodeId = undefined;
    vi.clearAllMocks();
    sourceEditorMockState.latestProps = undefined;
    dockShellMockState.latestProps = undefined;
  });

  afterEach(() => {
    setRuneStudioTestApi(() => undefined);
    vi.unstubAllGlobals();
    cleanup();
  });

  it('renders a workspace header and keeps graph controls inside the graph panel', () => {
    render(
      <EditorPage
        models={[]}
        files={[{ path: 'trade.rosetta', content: 'namespace alpha', dirty: false }]}
        workspaceName="CDM Workspace"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Studio workspace header')).toBeInTheDocument();
    expect(screen.getByText('Rune Studio')).toBeInTheDocument();
    expect(screen.getByText('CDM Workspace')).toBeInTheDocument();
    expect(screen.getByText('1 file')).toBeInTheDocument();
    expect(screen.getByTitle('Generate code from model')).toBeInTheDocument();

    const graphToolbar = screen.getByLabelText('Graph toolbar');
    expect(graphToolbar).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fit View' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-layout' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grouped' })).toBeInTheDocument();
  });

  it('requests inspector focus when a node is selected', async () => {
    editorStoreState.nodes = [
      {
        id: 'cdm.base.datetime::AdjustableDate',
        data: { namespace: 'cdm.base.datetime', name: 'AdjustableDate', $type: 'data' }
      }
    ];
    editorStoreState.selectedNodeId = 'cdm.base.datetime::AdjustableDate';

    render(
      <EditorPage
        models={[]}
        files={[
          {
            path: 'base-datetime-type.rosetta',
            content: 'namespace cdm.base.datetime',
            dirty: false
          }
        ]}
      />
    );

    await waitFor(() => {
      expect(dockShellMockState.latestProps?.focusPanel).toEqual({
        component: 'workspace.inspector',
        nonce: 1
      });
    });
  });
});
