// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import React, { useEffect, useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, waitFor, screen, act, fireEvent } from '@testing-library/react';
import { usePreviewStore } from '../../src/store/preview-store.js';
import { usePerspectiveStore } from '../../src/store/perspective-store.js';
import { setRuneStudioTestApi } from '../../src/test-api.js';

const {
  editorStoreState,
  useEditorStore,
  diagnosticsState,
  useDiagnosticsStore,
  runeTypeGraphMockState,
  resizeObserverMockState,
  namespaceExplorerMockState,
  structureViewMockState,
  showToastSpy
} = vi.hoisted(() => {
  const editorStoreState = {
    nodes: [] as Array<{
      id: string;
      data: { namespace?: string; name?: string; $type?: string; deferred?: boolean };
    }>,
    edges: [] as Array<{ source: string; target: string }>,
    selectedNodeId: undefined as string | undefined,
    detailPanelOpen: false,
    visibility: { expandedNamespaces: new Set<string>(), hiddenNodeIds: new Set<string>() },
    focusMode: true,
    layoutOptions: { direction: 'LR', nodeSeparation: 50, rankSeparation: 100, engine: 'dagre' as const },
    selectNode: vi.fn((nodeId: string, _options?: { isolateInFocusMode?: boolean; reapplyFocusMode?: boolean }) => {
      editorStoreState.selectedNodeId = nodeId;
      editorStoreState.detailPanelOpen = nodeId !== null;
    }),
    toggleNamespace: vi.fn(),
    expandAllNamespaces: vi.fn(),
    collapseAllNamespaces: vi.fn(),
    setLayoutEngine: vi.fn(),
    loadModels: vi.fn(),
    loadDeferredExports: vi.fn(),
    pendingHydrationNamespaces: [] as string[],
    hydratedNamespaces: [] as string[],
    hydrationNonce: 0,
    requestNamespaceHydration: vi.fn(),
    markNamespacesHydrated: vi.fn(),
    resetHydration: vi.fn()
  };

  const useEditorStore = ((selector: (state: typeof editorStoreState) => unknown) =>
    selector(editorStoreState)) as typeof import('@rune-langium/visual-editor').useEditorStore;
  Object.assign(useEditorStore, {
    getState: () => editorStoreState,
    setState: vi.fn((partial: Partial<typeof editorStoreState>) => {
      Object.assign(editorStoreState, partial);
    })
  });

  const diagnosticsState = { fileDiagnostics: new Map(), totalErrors: 0, totalWarnings: 0 };
  const useDiagnosticsStore = (() =>
    diagnosticsState) as typeof import('../../src/store/diagnostics-store.js').useDiagnosticsStore;
  Object.assign(useDiagnosticsStore, {
    getState: () => diagnosticsState
  });

  const runeTypeGraphMockState = {
    focusNode: vi.fn(),
    fitView: vi.fn(),
    relayout: vi.fn(),
    latestConfig: undefined as
      | {
          layout?: { direction?: 'LR' | 'TB'; groupByInheritance?: boolean };
        }
      | undefined,
    latestCallbacks: undefined as
      | {
          onNavigateToType?: (nodeId: string) => void;
        }
      | undefined
  };

  const resizeObserverMockState = {
    instances: [] as Array<{
      callback: ResizeObserverCallback;
      targets: Element[];
    }>
  };

  const namespaceExplorerMockState = {
    latestProps: undefined as
      | {
          onSelectNode?: (nodeId: string) => void;
          [key: string]: unknown;
        }
      | undefined
  };

  // Sentinel functions used as identity-stable cell component references in the
  // StructureView mock. Assigned as plain functions so vi.fn() is not needed —
  // we only care about identity, not call counts.
  const SENTINEL_NAME_CELL = function SentinelNameCell() {
    return null;
  };
  const SENTINEL_TYPE_CELL = function SentinelTypePickerCell() {
    return null;
  };
  const SENTINEL_CARD_CELL = function SentinelCardinalityCell() {
    return null;
  };

  const structureViewMockState = {
    latestProps: undefined as
      | {
          focusedTypeId?: string;
          adapterDoc?: unknown;
          cellComponents?: {
            name?: unknown;
            type?: unknown;
            card?: unknown;
          };
        }
      | undefined,
    SENTINEL_NAME_CELL,
    SENTINEL_TYPE_CELL,
    SENTINEL_CARD_CELL
  };

  const showToastSpy = vi.fn();

  return {
    editorStoreState,
    useEditorStore,
    diagnosticsState,
    useDiagnosticsStore,
    runeTypeGraphMockState,
    resizeObserverMockState,
    namespaceExplorerMockState,
    structureViewMockState,
    showToastSpy
  };
});

const { sourceEditorMockState, dockShellMockState, diagnosticsPanelMockState } = vi.hoisted(() => ({
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
  },
  diagnosticsPanelMockState: {
    latestProps: undefined as
      | {
          fileDiagnostics?: Map<string, Array<{ message: string; severity?: 1 | 2 | 3 | 4; source?: string }>>;
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
  RuneTypeGraph: React.forwardRef(
    (
      {
        callbacks,
        config
      }: {
        callbacks?: { onNavigateToType?: (nodeId: string) => void };
        config?: { layout?: { direction?: 'LR' | 'TB'; groupByInheritance?: boolean } };
      },
      ref: React.ForwardedRef<{
        fitView(): void;
        focusNode(nodeId: string): void;
        relayout(config?: { groupByInheritance?: boolean }): void;
        exportRosetta(): Map<string, string>;
      }>
    ) => {
      runeTypeGraphMockState.latestConfig = config;
      runeTypeGraphMockState.latestCallbacks = callbacks;
      useImperativeHandle(ref, () => ({
        fitView: runeTypeGraphMockState.fitView,
        focusNode: runeTypeGraphMockState.focusNode,
        relayout: runeTypeGraphMockState.relayout,
        exportRosetta: () => new Map()
      }));
      return React.createElement('div');
    }
  ),
  NamespaceExplorerPanel: (props: { onSelectNode?: (nodeId: string) => void; [key: string]: unknown }) => {
    namespaceExplorerMockState.latestProps = props;
    return React.createElement('div');
  },
  StructureView: (props: {
    focusedTypeId?: string;
    adapterDoc?: unknown;
    cellComponents?: { name?: unknown; type?: unknown; card?: unknown };
  }) => {
    structureViewMockState.latestProps = props;
    return React.createElement('div', { 'data-testid': 'structure-view-mock' });
  },
  EditorFormPanel: () => React.createElement('div'),
  ExpressionBuilder: () => React.createElement('div'),
  // Cell components: exported as the sentinel functions so EditorPage's
  // structureCellComponents memo captures the exact same references.
  NameCell: structureViewMockState.SENTINEL_NAME_CELL,
  CardinalityCell: structureViewMockState.SENTINEL_CARD_CELL,
  TypePickerCell: structureViewMockState.SENTINEL_TYPE_CELL,
  BUILTIN_TYPES: [],
  AST_TYPE_TO_NODE_TYPE: {},
  // Mirrors the production helper's fallback chain
  // (data.$type → data.typeKind → node.type → 'data'). Kept as a tiny
  // hand-rolled stub instead of re-importing the real helper so the mock
  // module stays a self-contained set of explicit exports — adding new
  // production exports here is intentional friction.
  resolveNodeKind: (nodeOrData: unknown) => {
    if (nodeOrData == null) return 'data';
    const obj = nodeOrData as { data?: unknown; type?: string };
    const d = (obj.data ?? obj) as { $type?: string; typeKind?: string } | undefined;
    return d?.$type ?? d?.typeKind ?? obj?.type ?? 'data';
  },
  // Phase A — tiny stubs mirroring the real display helpers' output shape so
  // graphNodesToAdapterDocument's projectStructureMeta can run under the mock.
  annotationsToDisplay: (annotations: unknown[] | undefined) =>
    (annotations ?? []).map((ref) => {
      const r = ref as { annotation?: { $refText?: string }; attribute?: { $refText?: string } };
      return { name: r.annotation?.$refText ?? 'unknown', attribute: r.attribute?.$refText };
    }),
  conditionsToDisplay: (conditions: unknown[] | undefined) =>
    (conditions ?? []).map((c) => {
      const cond = c as { name?: string };
      return { name: cond.name ?? undefined, expressionText: '' };
    }),
  useEditorStore,
  useModelSourceSync: () => {}
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
  DiagnosticsPanel: (props: {
    fileDiagnostics: Map<string, Array<{ message: string; severity?: 1 | 2 | 3 | 4; source?: string }>>;
  }) => {
    diagnosticsPanelMockState.latestProps = props;
    return React.createElement('div');
  }
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
  ScrollArea: ({ children }: { children?: React.ReactNode }) => React.createElement('div', {}, children)
}));

vi.mock('../../src/services/workspace.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/workspace.js')>();
  return {
    ...actual,
    linkDocument: vi.fn().mockResolvedValue({ linked: false, errors: [], newModels: [] })
  };
});

vi.mock('../../src/components/StudioToastProvider.js', () => ({
  StudioToastProvider: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, {}, children),
  useStudioToast: () => ({ showToast: showToastSpy })
}));

vi.mock('lucide-react', () => ({
  Maximize2: () => React.createElement('span'),
  LayoutGrid: () => React.createElement('span'),
  Code2: () => React.createElement('span'),
  Network: () => React.createElement('span'),
  FileCode2: () => React.createElement('span'),
  Info: () => React.createElement('span'),
  XCircle: () => React.createElement('span'),
  Check: () => React.createElement('span'),
  Download: () => React.createElement('span'),
  Share2: () => React.createElement('span'),
  Zap: () => React.createElement('span'),
  Search: () => React.createElement('span'),
  ChevronDown: () => React.createElement('span'),
  ChevronUp: () => React.createElement('span'),
  MoreHorizontal: () => React.createElement('span'),
  Layers: () => React.createElement('span'),
  Database: () => React.createElement('span'),
  Bell: () => React.createElement('span'),
  Settings: () => React.createElement('span'),
  // Workspace dropdown (e2e-batch): EditorPage adds Plus + LogOut icons
  // for the Popover menu items (new workspace / close workspace).
  Plus: () => React.createElement('span'),
  LogOut: () => React.createElement('span'),
  CaseSensitive: () => React.createElement('span'),
  // Dialog primitive's close button uses `X` from lucide-react. The curated
  // models modal in EditorPage pulls Dialog in transitively even when it
  // isn't open, so the lucide-react mock has to cover X too.
  X: () => React.createElement('span'),
  // perspective-registry icons (ActivityBar now imports from perspective-registry)
  FolderOpen: () => React.createElement('span'),
  GitBranch: () => React.createElement('span'),
  Package: () => React.createElement('span')
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
      panelComponents?.['workspace.fileTree']
        ? React.createElement(panelComponents['workspace.fileTree'], { key: 'fileTree' })
        : null,
      panelComponents?.['workspace.editor']
        ? React.createElement(panelComponents['workspace.editor'], { key: 'editor' })
        : null,
      panelComponents?.['workspace.visualPreview']
        ? React.createElement(panelComponents['workspace.visualPreview'], { key: 'visual' })
        : null,
      panelComponents?.['workspace.problems']
        ? React.createElement(panelComponents['workspace.problems'], { key: 'problems' })
        : null
    ]);
  }
}));

vi.mock('../../src/shell/panels/CenterStackPanel.js', () => ({
  // Simplified stub: renders all four panes unconditionally so that
  // StructureView is always mounted when VisualPreviewPanelMounted renders.
  // This surfaces the cellComponents wiring in EditorPage — an earlier
  // regression had cell editors built but never passed to StructureView
  // (same class as the Phase 7 integration miss fixed by PR #185).
  // renderSource is included so SourceEditor (inside renderSourcePane) is
  // still mounted — other tests rely on SourceEditor being rendered.
  CenterStackPanel: ({
    renderStructure,
    renderGraph,
    renderSource,
    renderInspector
  }: {
    renderGraph?: () => React.ReactElement | null;
    renderSource?: () => React.ReactElement | null;
    renderInspector?: () => React.ReactElement | null;
    renderStructure?: () => React.ReactElement | null;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'center-stack-mock' },
      renderGraph?.() ?? null,
      renderSource?.() ?? null,
      renderInspector?.() ?? null,
      renderStructure?.() ?? null
    )
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
  pathToUri: (path: string) => `file://${path}`,
  uriToPath: (uri: string) => uri.replace(/^file:\/\/\/?workspace\//, '').replace(/^file:\/\//, '')
}));

import { renderEditorPage } from './editor-page-harness.js';

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
    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        private instance: { callback: ResizeObserverCallback; targets: Element[] };
        constructor(callback: ResizeObserverCallback) {
          this.instance = { callback, targets: [] };
          resizeObserverMockState.instances.push(this.instance);
        }
        observe(target: Element) {
          this.instance.targets.push(target);
        }
        disconnect() {}
        unobserve() {}
      }
    );
    MockWorker.instances = [];
    setRuneStudioTestApi(() => undefined);
    usePreviewStore.getState().resetPreviewState();
    editorStoreState.nodes = [];
    editorStoreState.edges = [];
    editorStoreState.selectedNodeId = undefined;
    editorStoreState.hydrationNonce = 0;
    vi.clearAllMocks();
    sourceEditorMockState.latestProps = undefined;
    dockShellMockState.latestProps = undefined;
    runeTypeGraphMockState.latestConfig = undefined;
    runeTypeGraphMockState.latestCallbacks = undefined;
    runeTypeGraphMockState.fitView = vi.fn();
    runeTypeGraphMockState.relayout = vi.fn();
    resizeObserverMockState.instances = [];
    namespaceExplorerMockState.latestProps = undefined;
    // EditorPage embeds PerspectiveHost; store defaults to 'workspaces' which
    // renders WorkspacesPerspective (requires context). These tests render a
    // loaded workspace — reset to 'explore' so DockShell is visible.
    usePerspectiveStore.setState({ activePerspective: 'explore' });
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

    const _view = renderEditorPage({
      models: [],
      files: [{ name: 'trade.rosetta', path: 'trade.rosetta', content: 'namespace beta', dirty: false }]
    });

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

    const { rerenderEditorPage } = renderEditorPage({
      models: [modelWithType('Trade') as never],
      files: [
        {
          name: 'preview-alpha.rosetta',
          path: 'preview-alpha.rosetta',
          content: 'namespace preview.alpha',
          dirty: false
        }
      ]
    });

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
    rerenderEditorPage({
      models: [],
      files: [
        {
          name: 'preview-alpha.rosetta',
          path: 'preview-alpha.rosetta',
          content: 'namespace preview.alpha',
          dirty: true
        }
      ]
    });

    editorStoreState.nodes = [
      {
        id: 'preview.alpha::RenamedTrade',
        data: { namespace: 'preview.alpha', name: 'RenamedTrade', $type: 'data' }
      }
    ];
    rerenderEditorPage({
      models: [modelWithType('RenamedTrade') as never],
      files: [
        {
          name: 'preview-alpha.rosetta',
          path: 'preview-alpha.rosetta',
          content: 'namespace preview.alpha',
          dirty: true
        }
      ]
    });

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

    const { rerenderEditorPage } = renderEditorPage({
      models: [modelWithType('Trade') as never],
      files: [
        {
          name: 'preview-alpha.rosetta',
          path: 'preview-alpha.rosetta',
          content: 'namespace preview.alpha',
          dirty: false
        }
      ]
    });

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

    rerenderEditorPage({
      models: [modelWithType('Trade') as never],
      files: [
        {
          name: 'preview-alpha.rosetta',
          path: 'preview-alpha.rosetta',
          content: 'namespace preview.alpha\n\ntype Trade:\n  settlementDate string (0..1)',
          dirty: true
        }
      ]
    });

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
      expect(codegenSetFilesMessages.every((message) => message.requestId?.startsWith('codegen:'))).toBe(true);
      expect(codegenSetFilesMessages.every((message) => !message.requestId?.startsWith('preview:'))).toBe(true);
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

    const { rerenderEditorPage } = renderEditorPage({
      models: [modelWithType('Trade') as never],
      files: [
        {
          name: 'preview-alpha.rosetta',
          path: 'preview-alpha.rosetta',
          content: 'namespace preview.alpha',
          dirty: false
        }
      ]
    });

    await waitFor(() => {
      expect(MockWorker.instances).toHaveLength(1);
    });

    const worker = MockWorker.instances[0]!;
    const originalRequestId = worker.postMessage.mock.calls
      .map(([message]) => message as { type?: string; requestId?: string })
      .find((message) => message.type === 'preview:generate')?.requestId;

    rerenderEditorPage({
      models: [modelWithType('Trade') as never],
      files: [
        {
          name: 'preview-alpha.rosetta',
          path: 'preview-alpha.rosetta',
          content: 'namespace preview.alpha\n\ntype Trade:\n  settlementDate string (0..1)',
          dirty: true
        }
      ]
    });

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

  it('derives preview target source identity from parsedModels when worker-cloned models lack document metadata', async () => {
    editorStoreState.nodes = [
      {
        id: 'preview.alpha::Trade',
        data: { namespace: 'preview.alpha', name: 'Trade', $type: 'data' }
      }
    ];
    editorStoreState.selectedNodeId = 'preview.alpha::Trade';

    const parsedModel = {
      name: 'preview.alpha',
      elements: [{ name: 'Trade' }]
    };

    renderEditorPage({
      models: [parsedModel as never],
      parsedModels: [{ filePath: '/preview-alpha.rosetta', model: parsedModel as never }],
      files: [
        {
          name: 'preview-alpha.rosetta',
          path: '/preview-alpha.rosetta',
          content: 'namespace preview.alpha',
          dirty: false
        }
      ]
    });

    await waitFor(() => {
      expect(usePreviewStore.getState().selectedTarget).toMatchObject({
        id: 'preview.alpha.Trade',
        sourceUri: 'file:///preview-alpha.rosetta',
        sourceIndex: 0
      });
    });
  });

  it('marks preview stale when a cached schema exists and the worker later crashes', async () => {
    editorStoreState.nodes = [
      {
        id: 'preview.alpha::Trade',
        data: { namespace: 'preview.alpha', name: 'Trade', $type: 'data' }
      }
    ];
    editorStoreState.selectedNodeId = 'preview.alpha::Trade';

    renderEditorPage({
      models: [modelWithType('Trade') as never],
      files: [
        {
          name: 'preview-alpha.rosetta',
          path: 'preview-alpha.rosetta',
          content: 'namespace preview.alpha',
          dirty: false
        }
      ]
    });

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

    renderEditorPage({
      models: [modelWithType('Trade') as never],
      files: [
        {
          name: 'preview-alpha.rosetta',
          path: 'preview-alpha.rosetta',
          content: 'namespace preview.alpha',
          dirty: false
        }
      ]
    });

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
      message: 'Preview worker rejected a message. A preview worker message could not be deserialized.'
    });
  });

  it('surfaces worker boot failures without crashing the page', async () => {
    setRuneStudioTestApi(() => ({
      createCodegenWorker() {
        throw new Error('worker boot failed');
      }
    }));

    renderEditorPage({
      models: [],
      files: []
    });

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

    const _view = renderEditorPage({
      models: [],
      files: [
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
      ],
      lspClient: lspClient as never
    });

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
      expect(screen.getByTestId('source-editor-mock')).toHaveAttribute('data-active-file', '/workspace/beta.rosetta');
    });
  });
});

describe('EditorPage workspace chrome', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', MockWorker);
    MockWorker.instances = [];
    setRuneStudioTestApi(() => undefined);
    usePreviewStore.getState().resetPreviewState();
    // EditorPage represents a loaded workspace — Explore must be active so
    // PerspectiveHost renders DockShell (not hidden by display:none).
    usePerspectiveStore.setState({ activePerspective: 'explore' });
    editorStoreState.nodes = [];
    editorStoreState.selectedNodeId = undefined;
    vi.clearAllMocks();
    sourceEditorMockState.latestProps = undefined;
    dockShellMockState.latestProps = undefined;
    runeTypeGraphMockState.latestCallbacks = undefined;
    namespaceExplorerMockState.latestProps = undefined;
  });

  afterEach(() => {
    setRuneStudioTestApi(() => undefined);
    vi.unstubAllGlobals();
    cleanup();
  });

  it('renders a workspace header and keeps graph controls inside the graph panel', () => {
    const _view = renderEditorPage({
      models: [],
      files: [{ name: 'trade.rosetta', path: 'trade.rosetta', content: 'namespace alpha', dirty: false }],
      workspaceName: 'CDM Workspace',
      onClose: vi.fn()
    });

    expect(screen.getByLabelText('Studio workspace header')).toBeInTheDocument();
    expect(screen.getByText('Rune Studio')).toBeInTheDocument();
    expect(screen.getByText('CDM Workspace')).toBeInTheDocument();
    expect(screen.getByText('1 file')).toBeInTheDocument();
    expect(screen.getByText('Generate')).toBeInTheDocument();

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

    renderEditorPage({
      models: [],
      files: [
        {
          name: 'base-datetime-type.rosetta',
          path: 'base-datetime-type.rosetta',
          content: 'namespace cdm.base.datetime',
          dirty: false
        }
      ]
    });

    await waitFor(() => {
      expect(dockShellMockState.latestProps?.focusPanel).toEqual({
        component: 'workspace.inspector',
        nonce: 1
      });
    });
  });

  it('shows a destructive toast when navigating to a type that is not loaded', () => {
    editorStoreState.nodes = [
      {
        id: 'cdm.base.datetime::AdjustableDate',
        data: { namespace: 'cdm.base.datetime', name: 'AdjustableDate', $type: 'data' }
      }
    ];

    renderEditorPage({
      models: [],
      files: [
        {
          name: 'base-datetime-type.rosetta',
          path: 'base-datetime-type.rosetta',
          content: 'namespace cdm.base.datetime',
          dirty: false
        }
      ]
    });

    act(() => {
      runeTypeGraphMockState.latestCallbacks?.onNavigateToType?.('cdm.base.datetime::GhostType');
    });

    expect(showToastSpy).toHaveBeenCalledWith({
      description: 'Type "GhostType" not loaded — load the file containing this type',
      variant: 'destructive',
      duration: 3000
    });
  });

  it('selects explorer nodes without re-centering the graph view', () => {
    editorStoreState.edges = [];
    editorStoreState.nodes = [
      {
        id: 'cdm.base.datetime::AdjustableDate',
        data: { namespace: 'cdm.base.datetime', name: 'AdjustableDate', $type: 'data' }
      }
    ];

    renderEditorPage({
      models: [],
      files: [
        {
          name: 'base-datetime-type.rosetta',
          path: 'base-datetime-type.rosetta',
          content: 'namespace cdm.base.datetime',
          dirty: false
        }
      ]
    });

    act(() => {
      namespaceExplorerMockState.latestProps?.onSelectNode?.('cdm.base.datetime::AdjustableDate');
    });

    expect(editorStoreState.selectedNodeId).toBe('cdm.base.datetime::AdjustableDate');
    expect(editorStoreState.detailPanelOpen).toBe(true);
    expect(editorStoreState.selectNode).toHaveBeenCalledWith('cdm.base.datetime::AdjustableDate', {
      reapplyFocusMode: true
    });
    expect(runeTypeGraphMockState.focusNode).not.toHaveBeenCalled();
  });

  it('re-centers navigation targets that have no graph edges', () => {
    editorStoreState.edges = [];
    editorStoreState.nodes = [
      {
        id: 'cdm.base.datetime::Standalone',
        data: { namespace: 'cdm.base.datetime', name: 'Standalone', $type: 'data' }
      }
    ];

    renderEditorPage({
      models: [],
      files: [
        {
          name: 'base-datetime-type.rosetta',
          path: 'base-datetime-type.rosetta',
          content: 'namespace cdm.base.datetime',
          dirty: false
        }
      ]
    });

    act(() => {
      runeTypeGraphMockState.latestCallbacks?.onNavigateToType?.('cdm.base.datetime::Standalone');
    });

    expect(editorStoreState.selectNode).toHaveBeenCalledWith('cdm.base.datetime::Standalone', {
      reapplyFocusMode: true
    });
    expect(runeTypeGraphMockState.focusNode).not.toHaveBeenCalled();
  });

  it('requests namespace hydration when navigating directly to a deferred curated type', () => {
    editorStoreState.edges = [];
    editorStoreState.nodes = [
      {
        id: 'cdm.base.datetime::DeferredDate',
        data: { namespace: 'cdm.base.datetime', name: 'DeferredDate', $type: 'data', deferred: true }
      }
    ];

    renderEditorPage({
      models: [],
      files: [
        {
          name: 'base-datetime-type.rosetta',
          path: 'base-datetime-type.rosetta',
          content: 'namespace cdm.base.datetime',
          dirty: false
        }
      ]
    });

    act(() => {
      runeTypeGraphMockState.latestCallbacks?.onNavigateToType?.('cdm.base.datetime::DeferredDate');
    });

    expect(editorStoreState.selectNode).toHaveBeenCalledWith('cdm.base.datetime::DeferredDate', {
      reapplyFocusMode: true
    });
    expect(editorStoreState.requestNamespaceHydration).toHaveBeenCalledWith('cdm.base.datetime');
  });

  it('merges workspace parse errors into the Problems panel alongside LSP diagnostics', () => {
    diagnosticsState.fileDiagnostics = new Map([
      [
        'file:///workspace/trade.rosetta',
        [
          {
            range: {
              start: { line: 2, character: 0 },
              end: { line: 2, character: 5 }
            },
            severity: 2,
            source: 'lsp',
            message: 'Suspicious cardinality'
          }
        ]
      ]
    ]);
    diagnosticsState.totalErrors = 0;
    diagnosticsState.totalWarnings = 1;

    renderEditorPage({
      parseErrors: new Map([['trade.rosetta', ['Expected ":" after type declaration']]]),
      files: [
        {
          name: 'trade.rosetta',
          path: 'trade.rosetta',
          content: 'namespace example\ntype Trade\n  tradeId string (1..1)\n',
          dirty: true
        }
      ]
    });

    const merged = diagnosticsPanelMockState.latestProps?.fileDiagnostics;
    expect(merged?.get('trade.rosetta')).toEqual([
      expect.objectContaining({
        severity: 1,
        source: 'parser',
        message: 'Expected ":" after type declaration'
      }),
      expect.objectContaining({
        severity: 2,
        source: 'lsp',
        message: 'Suspicious cardinality'
      })
    ]);
  });

  it('does not count info diagnostics as errors in the footer totals', () => {
    diagnosticsState.fileDiagnostics = new Map([
      [
        'file:///workspace/trade.rosetta',
        [
          {
            range: {
              start: { line: 2, character: 0 },
              end: { line: 2, character: 5 }
            },
            severity: 3,
            source: 'lsp',
            message: 'Informational hint'
          }
        ]
      ]
    ]);
    diagnosticsState.totalErrors = 0;
    diagnosticsState.totalWarnings = 0;

    renderEditorPage({
      files: [
        {
          name: 'trade.rosetta',
          path: 'trade.rosetta',
          content: 'namespace example\ntype Trade:\n  tradeId string (1..1)\n',
          dirty: false
        }
      ]
    });

    expect(screen.queryByText(/err \/ .*warn/)).not.toBeInTheDocument();
  });

  it('re-centers connected navigation targets when focus mode hides nothing', () => {
    editorStoreState.nodes = [
      {
        id: 'cdm.base.datetime::AdjustableDate',
        data: { namespace: 'cdm.base.datetime', name: 'AdjustableDate', $type: 'data' }
      },
      {
        id: 'cdm.base.datetime::BusinessCenter',
        data: { namespace: 'cdm.base.datetime', name: 'BusinessCenter', $type: 'data' }
      }
    ];
    editorStoreState.edges = [
      { source: 'cdm.base.datetime::AdjustableDate', target: 'cdm.base.datetime::BusinessCenter' }
    ];
    editorStoreState.selectedNodeId = 'cdm.base.datetime::AdjustableDate';

    renderEditorPage({
      models: [],
      files: [
        {
          name: 'base-datetime-type.rosetta',
          path: 'base-datetime-type.rosetta',
          content: 'namespace cdm.base.datetime',
          dirty: false
        }
      ]
    });

    act(() => {
      runeTypeGraphMockState.latestCallbacks?.onNavigateToType?.('cdm.base.datetime::BusinessCenter');
    });

    expect(runeTypeGraphMockState.focusNode).not.toHaveBeenCalled();

    runeTypeGraphMockState.focusNode.mockClear();

    fireEvent.keyDown(screen.getByTestId('explore-workbench'), { key: 'ArrowLeft', altKey: true });

    expect(runeTypeGraphMockState.focusNode).not.toHaveBeenCalled();
  });

  it('shows a destructive toast when navigating back to a node that is no longer in the graph', () => {
    editorStoreState.nodes = [
      {
        id: 'cdm.base.datetime::AdjustableDate',
        data: { namespace: 'cdm.base.datetime', name: 'AdjustableDate', $type: 'data' }
      },
      {
        id: 'cdm.base.datetime::BusinessCenter',
        data: { namespace: 'cdm.base.datetime', name: 'BusinessCenter', $type: 'data' }
      }
    ];
    editorStoreState.selectedNodeId = 'cdm.base.datetime::AdjustableDate';

    const view = renderEditorPage({
      models: [],
      files: [
        {
          name: 'base-datetime-type.rosetta',
          path: 'base-datetime-type.rosetta',
          content: 'namespace cdm.base.datetime',
          dirty: false
        }
      ]
    });

    act(() => {
      runeTypeGraphMockState.latestCallbacks?.onNavigateToType?.('cdm.base.datetime::BusinessCenter');
    });

    editorStoreState.nodes = [
      {
        id: 'cdm.base.datetime::BusinessCenter',
        data: { namespace: 'cdm.base.datetime', name: 'BusinessCenter', $type: 'data' }
      }
    ];
    view.rerenderEditorPage({
      models: [],
      files: [
        {
          name: 'base-datetime-type.rosetta',
          path: 'base-datetime-type.rosetta',
          content: 'namespace cdm.base.datetime',
          dirty: false
        }
      ]
    });

    fireEvent.keyDown(screen.getByTestId('explore-workbench'), { key: 'ArrowLeft', altKey: true });

    expect(showToastSpy).toHaveBeenCalledWith({
      description: 'Previous node "cdm.base.datetime::AdjustableDate" is no longer in the graph',
      variant: 'destructive',
      duration: 3000
    });
  });

  it('updates graph config direction when responsive relayout flips orientation', async () => {
    renderEditorPage({
      models: [],
      files: [
        {
          name: 'base-datetime-type.rosetta',
          path: 'base-datetime-type.rosetta',
          content: 'namespace cdm.base.datetime',
          dirty: false
        }
      ]
    });

    expect(runeTypeGraphMockState.latestConfig?.layout?.direction).toBe('LR');

    const graphCanvas = document.querySelector('.studio-graph-canvas') as HTMLDivElement | null;
    expect(graphCanvas).not.toBeNull();
    vi.spyOn(graphCanvas!, 'getBoundingClientRect').mockReturnValue({
      width: 800,
      height: 820
    } as DOMRect);

    fireEvent.click(screen.getByTitle('Re-run auto layout'));

    await waitFor(() => {
      expect(runeTypeGraphMockState.latestConfig?.layout?.direction).toBe('TB');
    });
  });

  it('updates graph config direction when the window resize makes the graph pane tall', async () => {
    renderEditorPage({
      models: [],
      files: [
        {
          name: 'base-datetime-type.rosetta',
          path: 'base-datetime-type.rosetta',
          content: 'namespace cdm.base.datetime',
          dirty: false
        }
      ]
    });

    expect(runeTypeGraphMockState.latestConfig?.layout?.direction).toBe('LR');

    const graphCanvas = document.querySelector('.studio-graph-canvas') as HTMLDivElement | null;
    expect(graphCanvas).not.toBeNull();
    vi.spyOn(graphCanvas!, 'getBoundingClientRect').mockReturnValue({
      width: 800,
      height: 820
    } as DOMRect);

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    await waitFor(() => {
      expect(runeTypeGraphMockState.latestConfig?.layout?.direction).toBe('TB');
    });
  });

  it('fits the graph view when the graph pane resizes without changing orientation', async () => {
    renderEditorPage({
      models: [],
      files: [
        {
          name: 'base-datetime-type.rosetta',
          path: 'base-datetime-type.rosetta',
          content: 'namespace cdm.base.datetime',
          dirty: false
        }
      ]
    });

    const graphCanvas = document.querySelector('.studio-graph-canvas') as HTMLDivElement | null;
    expect(graphCanvas).not.toBeNull();
    vi.spyOn(graphCanvas!, 'getBoundingClientRect').mockReturnValue({
      width: 1100,
      height: 700
    } as DOMRect);

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    await waitFor(() => {
      expect(runeTypeGraphMockState.fitView).toHaveBeenCalled();
    });
    expect(runeTypeGraphMockState.relayout).not.toHaveBeenCalled();
  });

  it('re-runs responsive relayout when a node becomes selected', async () => {
    const { rerenderEditorPage } = renderEditorPage({
      models: [],
      files: [
        {
          name: 'base-datetime-type.rosetta',
          path: 'base-datetime-type.rosetta',
          content: 'namespace cdm.base.datetime',
          dirty: false
        }
      ]
    });

    const graphCanvas = document.querySelector('.studio-graph-canvas') as HTMLDivElement | null;
    expect(graphCanvas).not.toBeNull();
    vi.spyOn(graphCanvas!, 'getBoundingClientRect').mockReturnValue({
      width: 800,
      height: 820
    } as DOMRect);

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    await waitFor(() => {
      expect(runeTypeGraphMockState.latestConfig?.layout?.direction).toBe('TB');
    });

    runeTypeGraphMockState.relayout.mockClear();
    editorStoreState.nodes = [
      {
        id: 'cdm.base.datetime::BusinessCenter',
        data: { namespace: 'cdm.base.datetime', name: 'BusinessCenter', $type: 'data' }
      }
    ];
    editorStoreState.selectedNodeId = 'cdm.base.datetime::BusinessCenter';

    rerenderEditorPage({
      models: [],
      files: [
        {
          name: 'base-datetime-type.rosetta',
          path: 'base-datetime-type.rosetta',
          content: 'namespace cdm.base.datetime',
          dirty: false
        }
      ]
    });

    await waitFor(() => {
      expect(runeTypeGraphMockState.relayout).toHaveBeenCalledWith({
        engine: 'dagre',
        direction: 'TB',
        groupByInheritance: false
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Regression guard: StructureView cell-editor wiring (Phase 5/8 integration)
// ---------------------------------------------------------------------------
// PR #190 review caught that NameCell, CardinalityCell, and TypePickerCell were
// built and unit-tested in isolation but never injected into the StructureView
// at the EditorPage mount site — same "shipped but unreachable" pattern as the
// Phase 7 integration miss fixed by PR #185.
//
// This suite asserts that EditorPage passes cellComponents containing the three
// cell constructors so DataNode's structure variant renders editable cells
// instead of read-only spans. It would have caught the original gap.
// ---------------------------------------------------------------------------
describe('EditorPage StructureView cell-editor wiring (Phase 5/8 regression guard)', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', MockWorker);
    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        private instance: { callback: ResizeObserverCallback; targets: Element[] };
        constructor(callback: ResizeObserverCallback) {
          this.instance = { callback, targets: [] };
          resizeObserverMockState.instances.push(this.instance);
        }
        observe(target: Element) {
          this.instance.targets.push(target);
        }
        disconnect() {}
        unobserve() {}
      }
    );
    MockWorker.instances = [];
    setRuneStudioTestApi(() => undefined);
    usePreviewStore.getState().resetPreviewState();
    editorStoreState.nodes = [];
    editorStoreState.edges = [];
    editorStoreState.selectedNodeId = undefined;
    vi.clearAllMocks();
    structureViewMockState.latestProps = undefined;
    resizeObserverMockState.instances = [];
    // EditorPage embeds PerspectiveHost; store defaults to 'workspaces' which
    // renders WorkspacesPerspective (requires context). These tests render a
    // loaded workspace — reset to 'explore' so DockShell is shown.
    usePerspectiveStore.setState({ activePerspective: 'explore' });
  });

  afterEach(() => {
    setRuneStudioTestApi(() => undefined);
    vi.unstubAllGlobals();
    cleanup();
  });

  it('passes cellComponents with NameCell, TypePickerCell, and CardinalityCell to StructureView', () => {
    // The CenterStackPanel mock (above) renders the structure pane unconditionally,
    // so StructureView renders immediately without needing to activate the pane.
    renderEditorPage({
      models: [],
      files: [
        {
          name: 'trade.rosetta',
          path: 'trade.rosetta',
          content: 'namespace alpha',
          dirty: false
        }
      ]
    });

    expect(screen.getByTestId('structure-view-mock')).toBeInTheDocument();

    const { cellComponents } = structureViewMockState.latestProps ?? {};
    expect(cellComponents).toBeDefined();
    // Assert identity against the sentinel functions exported by the mock —
    // if EditorPage is importing a different object (or undefined), these fail.
    expect(cellComponents?.name).toBe(structureViewMockState.SENTINEL_NAME_CELL);
    expect(cellComponents?.type).toBe(structureViewMockState.SENTINEL_TYPE_CELL);
    expect(cellComponents?.card).toBe(structureViewMockState.SENTINEL_CARD_CELL);
  });

  it('keeps hydrated curated models alive across same-workspace rerenders and clears them on workspace switch', async () => {
    vi.useFakeTimers();
    try {
      const hydratedModel = {
        name: 'cdm.base.datetime',
        elements: []
      } as unknown as import('@rune-langium/core').RosettaModel;
      const deferredEntry = {
        filePath: 'cdm/cdm.base.datetime',
        namespace: 'cdm.base.datetime',
        exports: [{ type: 'Data', name: 'BusinessCenters' }]
      };
      const workspaceService = await import('../../src/services/workspace.js');
      const linkDocumentMock = vi.mocked(workspaceService.linkDocument);
      linkDocumentMock.mockReset();
      linkDocumentMock.mockResolvedValueOnce({ linked: true, errors: [], newModels: [hydratedModel] });
      linkDocumentMock.mockResolvedValue({ linked: false, errors: [], newModels: [] });

      editorStoreState.nodes = [
        {
          id: 'cdm.base.datetime::BusinessCenters',
          data: {
            namespace: 'cdm.base.datetime',
            name: 'BusinessCenters',
            $type: 'Data',
            deferred: true
          }
        }
      ];
      editorStoreState.selectedNodeId = 'cdm.base.datetime::BusinessCenters';

      const { rerenderEditorPage } = renderEditorPage({
        workspaceId: 'ws-curated',
        models: [],
        deferredExports: [deferredEntry],
        files: [],
        fileCount: 0
      });

      expect(editorStoreState.loadModels).toHaveBeenCalledWith([]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      expect(linkDocumentMock).toHaveBeenCalledWith('cdm/cdm.base.datetime');
      expect(editorStoreState.loadModels).toHaveBeenLastCalledWith([hydratedModel]);

      editorStoreState.loadModels.mockClear();

      await act(async () => {
        rerenderEditorPage({
          workspaceId: 'ws-curated',
          models: [],
          deferredExports: [deferredEntry],
          files: [],
          fileCount: 0
        });
      });

      expect(editorStoreState.loadModels).toHaveBeenLastCalledWith([hydratedModel]);

      editorStoreState.loadModels.mockClear();

      await act(async () => {
        rerenderEditorPage({
          workspaceId: 'ws-next',
          models: [],
          deferredExports: [deferredEntry],
          files: [],
          fileCount: 0
        });
      });

      expect(editorStoreState.loadModels).toHaveBeenLastCalledWith([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not re-link the selected curated node when only its object identity changes after hydration', async () => {
    vi.useFakeTimers();
    try {
      const deferredEntry = {
        filePath: 'cdm/cdm.base.staticdata.party',
        namespace: 'cdm.base.staticdata.party',
        exports: [{ type: 'Data', name: 'Counterparty' }]
      };
      const workspaceService = await import('../../src/services/workspace.js');
      const linkDocumentMock = vi.mocked(workspaceService.linkDocument);
      linkDocumentMock.mockReset();
      linkDocumentMock.mockResolvedValue({ linked: true, errors: [], newModels: [] });

      editorStoreState.nodes = [
        {
          id: 'cdm.base.staticdata.party::Counterparty',
          data: {
            namespace: 'cdm.base.staticdata.party',
            name: 'Counterparty',
            $type: 'Data',
            deferred: true
          }
        }
      ];
      editorStoreState.selectedNodeId = 'cdm.base.staticdata.party::Counterparty';
      editorStoreState.hydrationNonce = 1;

      const { rerenderEditorPage } = renderEditorPage({
        workspaceId: 'ws-curated',
        models: [],
        deferredExports: [deferredEntry],
        files: [],
        fileCount: 0
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(linkDocumentMock).toHaveBeenCalledTimes(1);
      expect(linkDocumentMock).toHaveBeenLastCalledWith('cdm/cdm.base.staticdata.party');

      editorStoreState.nodes = [
        {
          id: 'cdm.base.staticdata.party::Counterparty',
          data: {
            namespace: 'cdm.base.staticdata.party',
            name: 'Counterparty',
            $type: 'Data',
            deferred: true
          }
        }
      ];

      await act(async () => {
        rerenderEditorPage({
          workspaceId: 'ws-curated',
          models: [],
          deferredExports: [deferredEntry],
          files: [],
          fileCount: 0
        });
        await Promise.resolve();
      });

      expect(linkDocumentMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores stale curated link results that resolve after the workspace changes', async () => {
    vi.useFakeTimers();
    try {
      const hydratedModel = {
        name: 'cdm.base.datetime',
        elements: []
      } as unknown as import('@rune-langium/core').RosettaModel;
      const deferredEntry = {
        filePath: 'cdm/cdm.base.datetime',
        namespace: 'cdm.base.datetime',
        exports: [{ type: 'Data', name: 'BusinessCenters' }]
      };
      const workspaceService = await import('../../src/services/workspace.js');
      const linkDocumentMock = vi.mocked(workspaceService.linkDocument);
      linkDocumentMock.mockReset();

      let resolveLinkDocument:
        | ((value: { linked: boolean; errors: []; newModels: (typeof hydratedModel)[] }) => void)
        | undefined;
      linkDocumentMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveLinkDocument = resolve;
          })
      );
      linkDocumentMock.mockResolvedValue({ linked: false, errors: [], newModels: [] });

      editorStoreState.nodes = [
        {
          id: 'cdm.base.datetime::BusinessCenters',
          data: {
            namespace: 'cdm.base.datetime',
            name: 'BusinessCenters',
            $type: 'Data',
            deferred: true
          }
        }
      ];
      editorStoreState.selectedNodeId = 'cdm.base.datetime::BusinessCenters';

      const { rerenderEditorPage } = renderEditorPage({
        workspaceId: 'ws-curated',
        models: [],
        deferredExports: [deferredEntry],
        files: [],
        fileCount: 0
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      expect(linkDocumentMock).toHaveBeenCalledWith('cdm/cdm.base.datetime');

      editorStoreState.nodes = [];
      editorStoreState.selectedNodeId = undefined;
      editorStoreState.loadModels.mockClear();

      await act(async () => {
        rerenderEditorPage({
          workspaceId: 'ws-next',
          models: [],
          deferredExports: [deferredEntry],
          files: [],
          fileCount: 0
        });
      });

      expect(editorStoreState.loadModels).toHaveBeenLastCalledWith([]);
      const callCountAfterWorkspaceSwitch = editorStoreState.loadModels.mock.calls.length;

      resolveLinkDocument?.({ linked: true, errors: [], newModels: [hydratedModel] });

      await act(async () => {
        await Promise.resolve();
      });

      expect(editorStoreState.loadModels.mock.calls).toHaveLength(callCountAfterWorkspaceSwitch);
      expect(editorStoreState.loadModels).toHaveBeenLastCalledWith([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
