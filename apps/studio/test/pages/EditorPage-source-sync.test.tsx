// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Integration regression guard: inspector/structure edits sync to source
 * WITHOUT the Graph pane mounted.
 *
 * Defect B (2026-05-21, fix/inspector-source-sync): the source-sync
 * subscription lived inside `RuneTypeGraph`, which is only mounted when
 * the Graph pane is the active visual pane.  Edits made while the
 * Structure pane was active never reached `onFilesChange`.
 *
 * Fix: `useModelSourceSync` was lifted to `EditorPage` and called
 * unconditionally (line ~1173 of EditorPage.tsx), so the subscription
 * fires regardless of which visual pane is mounted.
 *
 * This test proves the integration-site wiring:
 *   1. `EditorPage` is rendered with a real parsed model.
 *   2. `CenterStackPanel` is stubbed to call only `renderStructure` (not
 *      `renderGraph`) — the Graph pane is intentionally absent.
 *   3. A store mutation (`updateCardinality`) replicates what the
 *      Structure-pane cell editors do.
 *   4. `onFilesChange` is asserted to fire with a file whose content
 *      reflects the edit.
 *
 * If the fix regresses (hook moved back inside RuneTypeGraph, or the
 * call removed from EditorPage), the store mutation will not trigger
 * `onFilesChange` and the `waitFor` will time out — exactly the
 * behaviour the fix eliminated.
 */

import React, { useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, waitFor, act } from '@testing-library/react';
import { parse } from '@rune-langium/core';
import { setRuneStudioTestApi } from '../../src/test-api.js';
import { usePerspectiveStore } from '../../src/store/perspective-store.js';

// ---------------------------------------------------------------------------
// Hoisted shared state
// ---------------------------------------------------------------------------

const { showToastSpy } = vi.hoisted(() => ({
  showToastSpy: vi.fn()
}));

// ---------------------------------------------------------------------------
// Worker stub (matches existing harness)
// ---------------------------------------------------------------------------

class MockWorker {
  static instances: MockWorker[] = [];
  readonly postMessage = vi.fn();
  readonly addEventListener = vi.fn();
  readonly removeEventListener = vi.fn();
  readonly terminate = vi.fn();
  constructor(_url: URL, _options?: WorkerOptions) {
    MockWorker.instances.push(this);
  }
}

// ---------------------------------------------------------------------------
// @rune-langium/visual-editor mock
//
// The critical difference from other EditorPage test files:
//
//   useModelSourceSync — we use vi.importActual to get the REAL implementation.
//   useEditorStore     — we use vi.importActual to get the REAL Zustand store
//                        so React components re-render on state changes and
//                        updateCardinality()/etc. work correctly.
//
// All visual components (RuneTypeGraph, StructureView, …) remain stubbed so
// the test stays fast and focused on the sync wiring, not graph rendering.
// ---------------------------------------------------------------------------

vi.mock('@rune-langium/visual-editor', async () => {
  const actual = await vi.importActual<typeof import('@rune-langium/visual-editor')>('@rune-langium/visual-editor');
  return {
    ...actual,
    // Render stubs — keep the test fast; none of these affect the sync path.
    RuneTypeGraph: React.forwardRef((_props: unknown, ref: React.ForwardedRef<unknown>) => {
      useImperativeHandle(ref, () => ({
        fitView: () => {},
        focusNode: () => {},
        relayout: () => {},
        exportRosetta: () => new Map()
      }));
      return React.createElement('div', { 'data-testid': 'graph-mock' });
    }),
    NamespaceExplorerPanel: () => React.createElement('div'),
    StructureView: () => React.createElement('div', { 'data-testid': 'structure-view-mock' }),
    EditorFormPanel: () => React.createElement('div'),
    ExpressionBuilder: () => React.createElement('div'),
    NameCell: () => null,
    CardinalityCell: () => null,
    TypePickerCell: () => null
    // useModelSourceSync and useEditorStore come from `actual` (the spread above).
    // All other non-component exports also come from actual, so BUILTIN_TYPES,
    // AST_TYPE_TO_NODE_TYPE, resolveNodeKind, etc. work correctly too.
  };
});

// ---------------------------------------------------------------------------
// Remaining heavy dependencies — same stubs as other EditorPage tests
// ---------------------------------------------------------------------------

vi.mock('../../src/components/SourceEditor.js', () => ({
  SourceEditor: React.forwardRef((_props: unknown, ref: React.ForwardedRef<unknown>) => {
    useImperativeHandle(ref, () => ({ revealLine: () => {}, revealPosition: () => {} }));
    return React.createElement('div', { 'data-testid': 'source-editor-mock' });
  })
}));

vi.mock('../../src/components/ConnectionStatus.js', () => ({
  ConnectionStatus: () => React.createElement('div')
}));

vi.mock('../../src/components/DiagnosticsPanel.js', () => ({
  DiagnosticsPanel: () => React.createElement('div')
}));

vi.mock('../../src/components/ExportDialog.js', () => ({
  ExportDialog: () => null
}));

vi.mock('../../src/components/CodePreviewPanel.js', () => ({
  CodePreviewPanel: () => React.createElement('div')
}));

vi.mock('../../src/components/FormPreviewPanel.js', () => ({
  FormPreviewPanel: () => React.createElement('div')
}));

vi.mock('../../src/components/GraphFilterMenu.js', () => ({
  GraphFilterMenu: () => React.createElement('div')
}));

vi.mock('../../src/shell/DockShell.js', () => ({
  DockShell: ({ panelComponents }: { panelComponents?: Record<string, React.ComponentType> }) =>
    React.createElement('div', { 'data-testid': 'dock-shell' }, [
      panelComponents?.['workspace.visualPreview']
        ? React.createElement(panelComponents['workspace.visualPreview'], { key: 'visual' })
        : null
    ])
}));

/**
 * CenterStackPanel stub that renders ONLY the Structure pane and NEVER
 * the Graph pane — this is the key regression probe.  Before the fix,
 * the source-sync subscription only fired when renderGraph() was called
 * (i.e., RuneTypeGraph was mounted).  With the fix, the subscription
 * lives in EditorPage itself and fires unconditionally.
 */
vi.mock('../../src/shell/panels/CenterStackPanel.js', () => ({
  CenterStackPanel: ({
    renderStructure,
    renderSource
  }: {
    renderGraph?: () => React.ReactElement | null;
    renderSource?: () => React.ReactElement | null;
    renderInspector?: () => React.ReactElement | null;
    renderStructure?: () => React.ReactElement | null;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'center-stack-no-graph' },
      // Deliberately skip renderGraph() — that's the whole point of this test.
      renderSource?.() ?? null,
      renderStructure?.() ?? null
    )
}));

vi.mock('../../src/hooks/useLspDiagnosticsBridge.js', () => ({
  useLspDiagnosticsBridge: () => undefined
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

vi.mock('../../src/utils/uri.js', () => ({
  pathToUri: (path: string) => `file://${path}`
}));

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

import { renderEditorPage } from './editor-page-harness.js';
import { useEditorStore } from '@rune-langium/visual-editor';

// ---------------------------------------------------------------------------
// Rosetta source fixture
// ---------------------------------------------------------------------------

const NS = 'sync.test';
const FILE_PATH = 'sync-test.rosetta';

const ROSETTA_SOURCE = `namespace ${NS}
version "1.0.0"

type Order:
  quantity int (1..1)
  price number (1..1)
`;

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('EditorPage — Structure-mode source sync (regression fix/inspector-source-sync)', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', MockWorker);
    MockWorker.instances = [];
    setRuneStudioTestApi(() => undefined);
    vi.clearAllMocks();
    // Reset the real Zustand editor store between tests so nodes from a
    // previous run don't bleed in and confuse the fingerprint / initial-skip.
    act(() => {
      useEditorStore.getState().loadModels([]);
    });
    // EditorPage embeds PerspectiveHost; store defaults to 'workspaces' which
    // renders WorkspacesPerspective (requires context). This test renders a
    // loaded workspace — reset to 'explore' so DockShell is shown.
    usePerspectiveStore.setState({ activePerspective: 'explore' });
  });

  afterEach(() => {
    setRuneStudioTestApi(() => undefined);
    vi.unstubAllGlobals();
    cleanup();
  });

  it('fires onFilesChange with changed content when an attribute is edited in Structure mode (graph pane NOT mounted)', async () => {
    // 1. Parse a real Rosetta source so loadModels produces real TypeGraphNodes.
    const parseResult = await parse(ROSETTA_SOURCE, `inmemory:///${FILE_PATH}`);
    expect(parseResult.hasErrors).toBe(false);
    const model = parseResult.value;

    const onFilesChange = vi.fn();

    // 2. Render EditorPage with the real parsed model.
    //    - `models` drives the useEffect that calls loadModels.
    //    - `parsedModels` provides the filePath→namespace mapping for
    //      namespaceToFile so handleModelChanged can map namespace → file.
    //    - `files` has the actual content that will be smart-merged.
    renderEditorPage({
      models: [model],
      parsedModels: [{ filePath: FILE_PATH, model }],
      files: [{ name: FILE_PATH, path: FILE_PATH, content: ROSETTA_SOURCE, dirty: false }],
      onFilesChange
    });

    // 3. Wait for the initial loadModels effect to settle and the
    //    useModelSourceSync initial-skip to record its baseline.
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });

    // Confirm nodes were loaded into the real store.
    const nodes = useEditorStore.getState().nodes;
    const orderNode = nodes.find((n) => n.data.name === 'Order');
    expect(orderNode).toBeDefined();

    // Clear any onFilesChange calls that may have fired during mount/initial
    // effects (e.g. from debounced timers in other hooks).
    onFilesChange.mockClear();

    // 4. Mutate the store exactly as the Structure-pane CardinalityCell does.
    //    Change `quantity` from (1..1) to (0..*).
    act(() => {
      useEditorStore.getState().updateCardinality(orderNode!.id, 'quantity', '(0..*)');
    });

    // 5. Assert onFilesChange fires.  The regression: before the fix this
    //    waitFor would time out because the subscription only fired when
    //    RuneTypeGraph was mounted — and our CenterStackPanel stub never
    //    calls renderGraph().
    await waitFor(
      () => {
        expect(onFilesChange).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    // 6. Assert the updated file content reflects the cardinality change.
    //    The smart-merge preserves the rest of the source; only the edited
    //    attribute line changes.
    const [updatedFiles] = onFilesChange.mock.calls.at(-1) as [
      Array<{ name: string; path: string; content: string; dirty: boolean }>
    ];
    const updatedFile = updatedFiles.find((f) => f.path === FILE_PATH);

    expect(updatedFile).toBeDefined();
    // The file is marked dirty because content changed.
    expect(updatedFile!.dirty).toBe(true);
    // The serialized output reflects the cardinality edit.
    // serializeModel may emit with or without wrapping parens, e.g.
    // `0..*` or `(0..*)` — match flexibly.
    expect(updatedFile!.content).toMatch(/quantity\s+int\s+\(?0\.\.\*\)?/);
    // The original (1..1) form should no longer appear on the quantity line.
    expect(updatedFile!.content).not.toMatch(/quantity\s+int\s+\(?1\.\.1\)?/);
  });
});
