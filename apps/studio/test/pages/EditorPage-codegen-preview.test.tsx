// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * EditorPage — lifted codegen worker→store path (Codex P2 follow-up coverage).
 *
 * The codegen:generate request/response cycle was lifted OUT of
 * CodePreviewPanel (now pure-display) INTO EditorPage as the single worker
 * owner. CodePreviewPanel's old worker-simulation tests were correctly
 * re-pointed at the store, leaving the lifted EditorPage logic untested.
 *
 * This suite restores that coverage by driving the real EditorPage with the
 * same MockWorker infrastructure used by EditorPage.test.tsx, and asserting on
 * observable behaviour only (MockWorker.postMessage spy + useCodegenStore
 * state) — never internals.
 *
 * Scenarios:
 *  1. Selecting a codegen target → EditorPage posts `codegen:generate`
 *     (correct target + a requestId).
 *  2. `codegen:result` for the current requestId → snapshot becomes `ready`.
 *  3. `codegen:outdated` → snapshot `stale`; `codegen:error` / worker `error`
 *     event → snapshot `unavailable`.
 *  4. STALE requestId: a `codegen:result` with a non-current requestId is
 *     ignored (restores the dropped stale-filter coverage).
 */

import React, { useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { usePreviewStore } from '../../src/store/preview-store.js';
import { usePerspectiveStore } from '../../src/store/perspective-store.js';
import { useCodegenStore } from '../../src/store/codegen-store.js';
import { setRuneStudioTestApi } from '../../src/test-api.js';

// ---------------------------------------------------------------------------
// Hoisted mock state (mirrors EditorPage.test.tsx — only what this suite needs)
// ---------------------------------------------------------------------------

const { editorStoreState, useEditorStore, useDiagnosticsStore, showToastSpy } = vi.hoisted(() => {
  const editorStoreState = {
    nodes: [] as Array<{ id: string; data: { namespace?: string; name?: string; $type?: string } }>,
    edges: [] as Array<{ source: string; target: string }>,
    selectedNodeId: undefined as string | undefined,
    detailPanelOpen: false,
    visibility: { expandedNamespaces: new Set<string>(), hiddenNodeIds: new Set<string>() },
    focusMode: true,
    layoutOptions: { direction: 'LR', nodeSeparation: 50, rankSeparation: 100, engine: 'dagre' as const },
    selectNode: vi.fn(),
    toggleNamespace: vi.fn(),
    expandAllNamespaces: vi.fn(),
    collapseAllNamespaces: vi.fn(),
    setLayoutEngine: vi.fn(),
    loadModels: vi.fn(),
    loadDeferredExports: vi.fn()
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
  Object.assign(useDiagnosticsStore, { getState: () => diagnosticsState });

  return { editorStoreState, useEditorStore, diagnosticsState, useDiagnosticsStore, showToastSpy: vi.fn() };
});

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

// ---------------------------------------------------------------------------
// Module mocks — keep EditorPage's heavy children inert in jsdom.
// ---------------------------------------------------------------------------

vi.mock('@rune-langium/visual-editor', () => ({
  RuneTypeGraph: React.forwardRef(
    (
      _props: unknown,
      ref: React.ForwardedRef<{
        fitView(): void;
        focusNode(nodeId: string): void;
        relayout(): void;
        exportRosetta(): Map<string, string>;
      }>
    ) => {
      useImperativeHandle(ref, () => ({
        fitView: vi.fn(),
        focusNode: vi.fn(),
        relayout: vi.fn(),
        exportRosetta: () => new Map()
      }));
      return React.createElement('div');
    }
  ),
  NamespaceExplorerPanel: () => React.createElement('div'),
  StructureView: () => React.createElement('div', { 'data-testid': 'structure-view-mock' }),
  EditorFormPanel: () => React.createElement('div'),
  ExpressionBuilder: () => React.createElement('div'),
  NameCell: function SentinelNameCell() {
    return null;
  },
  CardinalityCell: function SentinelCardinalityCell() {
    return null;
  },
  TypePickerCell: function SentinelTypePickerCell() {
    return null;
  },
  BUILTIN_TYPES: [],
  AST_TYPE_TO_NODE_TYPE: {},
  resolveNodeKind: (nodeOrData: unknown) => {
    if (nodeOrData == null) return 'data';
    const obj = nodeOrData as { data?: unknown; type?: string };
    const d = (obj.data ?? obj) as { $type?: string; typeKind?: string } | undefined;
    return d?.$type ?? d?.typeKind ?? obj?.type ?? 'data';
  },
  useEditorStore,
  useModelSourceSync: () => {}
}));

vi.mock('../../src/components/SourceEditor.js', () => ({
  SourceEditor: React.forwardRef((props: { activeFile?: string }, ref) => {
    useImperativeHandle(ref, () => ({ revealLine: vi.fn(), revealPosition: vi.fn() }));
    return React.createElement('div', {
      'data-testid': 'source-editor-mock',
      'data-active-file': props.activeFile ?? ''
    });
  })
}));

vi.mock('../../src/components/ConnectionStatus.js', () => ({ ConnectionStatus: () => React.createElement('div') }));
vi.mock('../../src/components/DiagnosticsPanel.js', () => ({ DiagnosticsPanel: () => React.createElement('div') }));
vi.mock('../../src/components/ExportMenu.js', () => ({ ExportMenu: () => React.createElement('div') }));
vi.mock('../../src/components/ExportDialog.js', () => ({ ExportDialog: () => null }));

vi.mock('@rune-langium/design-system/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement('button', props, children)
}));
vi.mock('@rune-langium/design-system/ui/separator', () => ({ Separator: () => React.createElement('div') }));
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

vi.mock('lucide-react', () => {
  const span = () => React.createElement('span');
  return {
    Maximize2: span,
    LayoutGrid: span,
    Code2: span,
    Network: span,
    FileCode2: span,
    Info: span,
    XCircle: span,
    Check: span,
    Download: span,
    Share2: span,
    Zap: span,
    Search: span,
    ChevronDown: span,
    ChevronUp: span,
    MoreHorizontal: span,
    Layers: span,
    Database: span,
    Bell: span,
    Settings: span,
    Plus: span,
    LogOut: span,
    CaseSensitive: span,
    X: span,
    FolderOpen: span,
    GitBranch: span,
    Package: span
  };
});

vi.mock('../../src/components/GraphFilterMenu.js', () => ({ GraphFilterMenu: () => React.createElement('div') }));

vi.mock('../../src/shell/DockShell.js', () => ({
  DockShell: ({ panelComponents }: { panelComponents?: Record<string, React.ComponentType> }) =>
    React.createElement('div', { 'data-testid': 'dock-shell' }, [
      panelComponents?.['workspace.fileTree']
        ? React.createElement(panelComponents['workspace.fileTree'], { key: 'fileTree' })
        : null,
      panelComponents?.['workspace.editor']
        ? React.createElement(panelComponents['workspace.editor'], { key: 'editor' })
        : null
    ])
}));

vi.mock('../../src/shell/panels/CenterStackPanel.js', () => ({
  CenterStackPanel: ({
    renderGraph,
    renderSource
  }: {
    renderGraph?: () => React.ReactElement | null;
    renderSource?: () => React.ReactElement | null;
  }) => React.createElement('div', { 'data-testid': 'center-stack-mock' }, renderGraph?.() ?? null, renderSource?.() ?? null)
}));

vi.mock('../../src/hooks/useLspDiagnosticsBridge.js', () => ({ useLspDiagnosticsBridge: () => undefined }));
vi.mock('../../src/store/diagnostics-store.js', () => ({ useDiagnosticsStore }));

// CodePreviewPanel is pure-display now; render it inert. EditorPage still owns
// the worker, so mocking the panel does NOT remove the codegen worker wiring.
vi.mock('../../src/components/CodePreviewPanel.js', () => ({
  CodePreviewPanel: () => React.createElement('div')
}));
vi.mock('../../src/components/FormPreviewPanel.js', () => ({ FormPreviewPanel: () => React.createElement('div') }));
vi.mock('../../src/utils/uri.js', () => ({ pathToUri: (path: string) => `file://${path}` }));

import { EditorPage } from '../../src/pages/EditorPage.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WS_FILES = [{ name: 'a.rosetta', path: 'a.rosetta', content: 'namespace a', dirty: false }];

/** Find the most recent codegen:generate message posted to the worker. */
function lastCodegenGenerate(worker: MockWorker): { type: string; target: string; requestId: string } | undefined {
  return worker.postMessage.mock.calls
    .map(([m]) => m as { type?: string; target?: string; requestId?: string })
    .filter((m): m is { type: string; target: string; requestId: string } => m.type === 'codegen:generate')
    .at(-1);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('EditorPage — lifted codegen worker→store path', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', MockWorker);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      }
    );
    MockWorker.instances = [];
    setRuneStudioTestApi(() => undefined);
    usePreviewStore.getState().resetPreviewState();
    useCodegenStore.getState().resetCodegenState();
    editorStoreState.nodes = [];
    editorStoreState.edges = [];
    editorStoreState.selectedNodeId = undefined;
    vi.clearAllMocks();
    // EditorPage embeds PerspectiveHost; default 'workspaces' renders a screen
    // that needs context. Force 'explore' so DockShell + the codegen worker
    // owner effects mount.
    usePerspectiveStore.setState({ activePerspective: 'explore' });
  });

  afterEach(() => {
    setRuneStudioTestApi(() => undefined);
    vi.unstubAllGlobals();
    cleanup();
  });

  it('posts codegen:generate to the worker when a codegen target is selected', async () => {
    render(<EditorPage models={[]} files={WS_FILES} />);

    await waitFor(() => {
      expect(MockWorker.instances).toHaveLength(1);
    });
    const worker = MockWorker.instances[0]!;

    // No codegen:generate while activeTarget is undefined (landing table).
    expect(lastCodegenGenerate(worker)).toBeUndefined();

    await act(async () => {
      useCodegenStore.getState().setCodePreviewTarget('typescript');
      useCodegenStore.getState().setActiveTarget('typescript');
    });

    await waitFor(() => {
      const msg = lastCodegenGenerate(worker);
      expect(msg).toBeDefined();
      expect(msg!.target).toBe('typescript');
      expect(typeof msg!.requestId).toBe('string');
      expect(msg!.requestId.length).toBeGreaterThan(0);
    });
  });

  it('marks the store snapshot ready on codegen:result for the current requestId', async () => {
    render(<EditorPage models={[]} files={WS_FILES} />);
    await waitFor(() => expect(MockWorker.instances).toHaveLength(1));
    const worker = MockWorker.instances[0]!;

    await act(async () => {
      useCodegenStore.getState().setCodePreviewTarget('zod');
      useCodegenStore.getState().setActiveTarget('zod');
    });

    await waitFor(() => expect(lastCodegenGenerate(worker)).toBeDefined());
    const { requestId } = lastCodegenGenerate(worker)!;

    await act(async () => {
      worker.dispatch('message', {
        data: {
          type: 'codegen:result',
          target: 'zod',
          requestId,
          files: [{ relativePath: 'ns.zod.ts', content: 'export const X = z.object({});', sourceMap: [] }]
        }
      });
    });

    const snapshot = useCodegenStore.getState().snapshot;
    expect(snapshot.status).toBe('ready');
    if (snapshot.status === 'ready') {
      expect(snapshot.target).toBe('zod');
      expect(snapshot.files).toHaveLength(1);
      expect(snapshot.files[0]?.relativePath).toBe('ns.zod.ts');
      expect(snapshot.files[0]?.content).toContain('z.object');
    }
  });

  it('marks the store snapshot stale on codegen:outdated', async () => {
    render(<EditorPage models={[]} files={WS_FILES} />);
    await waitFor(() => expect(MockWorker.instances).toHaveLength(1));
    const worker = MockWorker.instances[0]!;

    await act(async () => {
      useCodegenStore.getState().setCodePreviewTarget('zod');
      useCodegenStore.getState().setActiveTarget('zod');
    });
    await waitFor(() => expect(lastCodegenGenerate(worker)).toBeDefined());
    const { requestId } = lastCodegenGenerate(worker)!;

    // First a successful result so stale has files to preserve.
    await act(async () => {
      worker.dispatch('message', {
        data: {
          type: 'codegen:result',
          target: 'zod',
          requestId,
          files: [{ relativePath: 'ns.zod.ts', content: 'good', sourceMap: [] }]
        }
      });
    });
    await act(async () => {
      worker.dispatch('message', {
        data: {
          type: 'codegen:outdated',
          target: 'zod',
          requestId,
          message: 'Fix model errors to refresh the code preview.'
        }
      });
    });

    const snapshot = useCodegenStore.getState().snapshot;
    expect(snapshot.status).toBe('stale');
    if (snapshot.status === 'stale') {
      expect(snapshot.message).toMatch(/Fix model errors/i);
      // Last-good content retained.
      expect(snapshot.files[0]?.content).toBe('good');
    }
  });

  it('marks the store snapshot unavailable on codegen:error', async () => {
    render(<EditorPage models={[]} files={WS_FILES} />);
    await waitFor(() => expect(MockWorker.instances).toHaveLength(1));
    const worker = MockWorker.instances[0]!;

    await act(async () => {
      useCodegenStore.getState().setCodePreviewTarget('zod');
      useCodegenStore.getState().setActiveTarget('zod');
    });
    await waitFor(() => expect(lastCodegenGenerate(worker)).toBeDefined());
    const { requestId } = lastCodegenGenerate(worker)!;

    await act(async () => {
      worker.dispatch('message', {
        data: { type: 'codegen:error', target: 'zod', requestId, message: 'Code generation failed.' }
      });
    });

    const snapshot = useCodegenStore.getState().snapshot;
    expect(snapshot.status).toBe('unavailable');
    if (snapshot.status === 'unavailable') {
      expect(snapshot.message).toMatch(/Code generation failed/i);
    }
  });

  it('marks the store snapshot unavailable when the worker emits an error event', async () => {
    render(<EditorPage models={[]} files={WS_FILES} />);
    await waitFor(() => expect(MockWorker.instances).toHaveLength(1));
    const worker = MockWorker.instances[0]!;

    await act(async () => {
      useCodegenStore.getState().setCodePreviewTarget('zod');
      useCodegenStore.getState().setActiveTarget('zod');
    });
    await waitFor(() => expect(lastCodegenGenerate(worker)).toBeDefined());

    await act(async () => {
      worker.dispatch('error', { type: 'error', message: 'worker crashed' });
    });

    const snapshot = useCodegenStore.getState().snapshot;
    expect(snapshot.status).toBe('unavailable');
    if (snapshot.status === 'unavailable') {
      expect(snapshot.message).toMatch(/reload Studio/i);
    }
  });

  it('ignores a codegen:result carrying a stale (non-current) requestId', async () => {
    render(<EditorPage models={[]} files={WS_FILES} />);
    await waitFor(() => expect(MockWorker.instances).toHaveLength(1));
    const worker = MockWorker.instances[0]!;

    await act(async () => {
      useCodegenStore.getState().setCodePreviewTarget('zod');
      useCodegenStore.getState().setActiveTarget('zod');
    });
    await waitFor(() => expect(lastCodegenGenerate(worker)).toBeDefined());
    const { requestId } = lastCodegenGenerate(worker)!;

    // A stale response with an older/foreign requestId must be ignored.
    await act(async () => {
      worker.dispatch('message', {
        data: {
          type: 'codegen:result',
          target: 'zod',
          requestId: 'codegen:zod:stale-0',
          files: [{ relativePath: 'stale.zod.ts', content: 'stale payload', sourceMap: [] }]
        }
      });
    });

    // Snapshot must NOT reflect the stale payload — still waiting.
    const afterStale = useCodegenStore.getState().snapshot;
    expect(afterStale.status).toBe('waiting');

    // The fresh response (current requestId) IS applied.
    await act(async () => {
      worker.dispatch('message', {
        data: {
          type: 'codegen:result',
          target: 'zod',
          requestId,
          files: [{ relativePath: 'fresh.zod.ts', content: 'fresh payload', sourceMap: [] }]
        }
      });
    });

    const fresh = useCodegenStore.getState().snapshot;
    expect(fresh.status).toBe('ready');
    if (fresh.status === 'ready') {
      expect(fresh.files[0]?.relativePath).toBe('fresh.zod.ts');
      expect(fresh.files[0]?.content).toBe('fresh payload');
    }
  });
});
