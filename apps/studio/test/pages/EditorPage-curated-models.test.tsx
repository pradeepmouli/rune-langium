// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Regression guard: ActivityBar "Curated Models" button must open a modal
 * containing <ModelLoader /> when clicked from inside EditorPage. Prod-smoke
 * (https://www.daikonic.dev/rune-studio/studio/) caught the button stubbed
 * to () => {} after a workspace was open. Same "shipped but unreachable"
 * pattern as the Phase 7 integration miss in PR #185 — assert that the
 * click actually mounts ModelLoader.
 *
 * This test keeps the real Dialog primitive and the real ModelLoader so
 * the wiring is exercised end-to-end. Heavy editor internals (DockShell,
 * SourceEditor, the visual-editor package, codegen worker boot) are mocked
 * to keep the suite fast and focused on the click-to-open path.
 */

import React, { useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { setRuneStudioTestApi } from '../../src/test-api.js';
import { closeDialogViaEscape } from '../helpers/radix-dialog.js';

const { editorStoreState, useEditorStore } = vi.hoisted(() => {
  const editorStoreState = {
    nodes: [] as Array<{ id: string; data: { namespace?: string; name?: string; $type?: string } }>,
    edges: [] as Array<{ source: string; target: string }>,
    selectedNodeId: undefined as string | undefined,
    detailPanelOpen: false,
    visibility: { expandedNamespaces: new Set<string>(), hiddenNodeIds: new Set<string>() },
    focusMode: true,
    layoutOptions: { direction: 'LR' as const, nodeSeparation: 50, rankSeparation: 100, engine: 'dagre' as const },
    selectNode: vi.fn(),
    toggleNamespace: vi.fn(),
    expandAllNamespaces: vi.fn(),
    collapseAllNamespaces: vi.fn(),
    setLayoutEngine: vi.fn(),
    loadModels: vi.fn(),
    loadDeferredExports: vi.fn()
  };
  const useEditorStore = ((selector: (s: typeof editorStoreState) => unknown) =>
    selector(editorStoreState)) as typeof import('@rune-langium/visual-editor').useEditorStore;
  Object.assign(useEditorStore, {
    getState: () => editorStoreState,
    setState: vi.fn()
  });
  return { editorStoreState, useEditorStore };
});

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

vi.mock('@rune-langium/visual-editor', () => ({
  RuneTypeGraph: React.forwardRef((_props: unknown, ref: React.ForwardedRef<unknown>) => {
    useImperativeHandle(ref, () => ({
      fitView: () => {},
      focusNode: () => {},
      relayout: () => {},
      exportRosetta: () => new Map()
    }));
    return React.createElement('div');
  }),
  NamespaceExplorerPanel: () => React.createElement('div'),
  StructureView: () => React.createElement('div'),
  EditorFormPanel: () => React.createElement('div'),
  ExpressionBuilder: () => React.createElement('div'),
  NameCell: () => null,
  CardinalityCell: () => null,
  TypePickerCell: () => null,
  BUILTIN_TYPES: [],
  AST_TYPE_TO_NODE_TYPE: {},
  resolveNodeKind: () => 'data',
  useEditorStore
}));

vi.mock('../../src/components/SourceEditor.js', () => ({
  SourceEditor: React.forwardRef((_props: unknown, ref: React.ForwardedRef<unknown>) => {
    useImperativeHandle(ref, () => ({ revealLine: () => {}, revealPosition: () => {} }));
    return React.createElement('div');
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
  DockShell: () => React.createElement('div', { 'data-testid': 'dock-shell' })
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
  useStudioToast: () => ({ showToast: vi.fn() })
}));

import { EditorPage } from '../../src/pages/EditorPage.js';

describe('EditorPage — Curated Models button wiring', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', MockWorker);
    MockWorker.instances = [];
    setRuneStudioTestApi(() => undefined);
    editorStoreState.nodes = [];
    editorStoreState.selectedNodeId = undefined;
    vi.clearAllMocks();
  });

  afterEach(() => {
    setRuneStudioTestApi(() => undefined);
    vi.unstubAllGlobals();
    cleanup();
  });

  it('does not render the curated models dialog on mount', () => {
    render(
      <EditorPage
        models={[]}
        files={[{ name: 'trade.rosetta', path: 'trade.rosetta', content: 'namespace alpha', dirty: false }]}
      />
    );
    expect(screen.queryByTestId('curated-models-dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('model-loader')).not.toBeInTheDocument();
  });

  it('opens a dialog containing ModelLoader when the ActivityBar Curated Models button is clicked', () => {
    render(
      <EditorPage
        models={[]}
        files={[{ name: 'trade.rosetta', path: 'trade.rosetta', content: 'namespace alpha', dirty: false }]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /curated models/i }));

    // Dialog renders via radix portal — getBy* searches the whole document.
    const dialog = screen.getByTestId('curated-models-dialog');
    expect(dialog).toBeInTheDocument();

    // The body mounts the real <ModelLoader />.
    expect(screen.getByTestId('model-loader')).toBeInTheDocument();
    // Dialog title is "Reference Models" AND ModelLoader's own section
    // heading is also "Reference Models" — both should be present, so
    // assert that at least one matches (avoids brittle getByText with two
    // identical strings).
    expect(screen.getAllByText(/reference models/i).length).toBeGreaterThanOrEqual(1);
    // At least one curated bundle button from the registry (cdm/fpml/rune-dsl)
    // is rendered, proving ModelLoader is fully alive in the dialog body.
    expect(screen.getByRole('button', { name: /cdm \(common domain model\)/i })).toBeInTheDocument();
  });

  it('closes the curated models dialog when the user presses Esc', async () => {
    render(
      <EditorPage
        models={[]}
        files={[{ name: 'trade.rosetta', path: 'trade.rosetta', content: 'namespace alpha', dirty: false }]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /curated models/i }));
    expect(screen.getByTestId('curated-models-dialog')).toBeInTheDocument();

    // Shared helper — wraps `userEvent.keyboard('{Escape}')` + `waitFor` to
    // ride out Radix's async Presence unmount. See
    // `test/helpers/radix-dialog.ts` and the Copilot review on PR #215.
    await closeDialogViaEscape('curated-models-dialog');
  });
});
