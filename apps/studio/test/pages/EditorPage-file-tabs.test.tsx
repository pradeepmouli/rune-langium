// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Gap 1 — file tabs chrome: per-tab diagnostics counts and the
 * "+" new-file affordance. (No close affordance in this PR.)
 *
 * The FileTabStrip is an internal component of ExplorePerspective rendered in
 * the topbar, so it is exercised through the EditorPage harness (the same
 * provider-shaped render path the source-sync tests use). Heavy visual panes
 * are stubbed to keep the test fast and focused on the topbar chrome.
 */

import React, { useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { useDiagnosticsStore } from '../../src/store/diagnostics-store.js';

// ---------------------------------------------------------------------------
// Stubs — mirror the EditorPage-source-sync setup; only the topbar chrome
// matters here, so every heavy visual pane is a no-op.
// ---------------------------------------------------------------------------

vi.mock('@rune-langium/visual-editor', async () => {
  const actual = await vi.importActual<typeof import('@rune-langium/visual-editor')>('@rune-langium/visual-editor');
  return {
    ...actual,
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
    StructureView: () => React.createElement('div'),
    EditorFormPanel: () => React.createElement('div'),
    ExpressionBuilder: () => React.createElement('div'),
    NameCell: () => null,
    CardinalityCell: () => null,
    TypePickerCell: () => null
  };
});

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
vi.mock('../../src/components/ExportDialog.js', () => ({ ExportDialog: () => null }));
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
vi.mock('../../src/shell/panels/CenterStackPanel.js', () => ({
  CenterStackPanel: () => React.createElement('div', { 'data-testid': 'center-stack' })
}));
vi.mock('../../src/hooks/useLspDiagnosticsBridge.js', () => ({
  useLspDiagnosticsBridge: () => undefined
}));
vi.mock('../../src/components/StudioToastProvider.js', () => ({
  StudioToastProvider: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, {}, children),
  useStudioToast: () => ({ showToast: vi.fn(), showLoadingToast: vi.fn(() => 'toast-id'), dismissToast: vi.fn() })
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { renderEditorPage } from './editor-page-harness.js';
import { usePerspectiveStore } from '../../src/store/perspective-store.js';
import type { WorkspaceFile } from '../../src/services/workspace.js';

const FILE_A = 'a.rosetta';
const FILE_B = 'b.rosetta';

function makeFiles(): WorkspaceFile[] {
  return [
    { name: FILE_A, path: FILE_A, content: 'namespace a', dirty: false },
    { name: FILE_B, path: FILE_B, content: 'namespace b', dirty: true }
  ];
}

function tabByName(name: string): HTMLElement {
  // Each tab is a single button.studio-topbar__tab holding the name + chiclets.
  const nameSpan = screen.getByText(name);
  const tab = nameSpan.closest('.studio-topbar__tab');
  if (!tab) throw new Error(`tab for ${name} not found`);
  return tab as HTMLElement;
}

describe('FileTabStrip chrome (Gap 1)', () => {
  beforeEach(() => {
    // File tabs render only in the explore perspective (default store value is
    // the launcher; App swaps to 'explore' once a workspace loads).
    usePerspectiveStore.getState().setActivePerspective('explore');
  });

  afterEach(() => {
    useDiagnosticsStore.getState().clearAll();
    usePerspectiveStore.getState().setActivePerspective('workspaces');
    cleanup();
  });

  it('renders a tab per user file with name + kind badge', () => {
    renderEditorPage({ files: makeFiles() });
    expect(screen.getByText(FILE_A)).toBeTruthy();
    expect(screen.getByText(FILE_B)).toBeTruthy();
  });

  it('renders error and warning count chiclets per file from the diagnostics store', () => {
    useDiagnosticsStore.getState().setFileDiagnostics(FILE_A, [
      { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, severity: 1, message: 'err1' },
      { range: { start: { line: 1, character: 0 }, end: { line: 1, character: 1 } }, severity: 1, message: 'err2' },
      { range: { start: { line: 2, character: 0 }, end: { line: 2, character: 1 } }, severity: 2, message: 'warn1' }
    ]);

    renderEditorPage({ files: makeFiles() });

    const tabA = tabByName(FILE_A);
    const errChip = tabA.querySelector('.studio-topbar__tab-count.is-error');
    const warnChip = tabA.querySelector('.studio-topbar__tab-count.is-warning');
    expect(errChip?.textContent).toBe('2');
    expect(warnChip?.textContent).toBe('1');

    // File B has no diagnostics → no count chiclets.
    const tabB = tabByName(FILE_B);
    expect(tabB.querySelector('.studio-topbar__tab-count')).toBeNull();
  });

  it('"+" button appends a new untitled file and is always present', () => {
    const onFilesChange = vi.fn();
    renderEditorPage({ files: makeFiles(), onFilesChange });

    const newBtn = screen.getByLabelText('New file');
    fireEvent.click(newBtn);

    expect(onFilesChange).toHaveBeenCalledTimes(1);
    const next = onFilesChange.mock.calls[0]![0] as WorkspaceFile[];
    expect(next).toHaveLength(3);
    expect(next.some((f) => f.path === 'untitled.rosetta')).toBe(true);
  });
});
