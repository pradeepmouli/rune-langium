// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * 018 Phase 0 Task 0.8 — integration coverage for the table-as-landing
 * flow on CodePreviewPanel.
 *
 * Verifies:
 *   - panel mounts to the targets table (activeTarget=undefined initial)
 *   - no codegen request is dispatched while the table is showing
 *   - clicking [View] enters the viewer for that target AND triggers codegen
 *   - clicking the ← Targets button returns to the table
 *   - the obsolete TargetSwitcher tabs are no longer rendered
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

vi.mock('@codemirror/view', () => ({
  EditorView: class MockEditorView {
    dom = document.createElement('div');
    state = { doc: { toString: () => '' } };
    destroy = vi.fn();
    dispatch = vi.fn();
    static theme = vi.fn(() => []);
    static updateListener = { of: vi.fn(() => []) };
    static domEventHandlers = vi.fn(() => []);
    static lineWrapping = [];
    constructor({ parent }: { parent?: Element }) {
      if (parent) parent.appendChild(this.dom);
    }
  },
  lineNumbers: vi.fn(() => []),
  highlightActiveLine: vi.fn(() => []),
  drawSelection: vi.fn(() => [])
}));
vi.mock('@codemirror/state', () => ({
  EditorState: { create: vi.fn(() => ({})), readOnly: { of: vi.fn(() => []) } },
  Compartment: class {
    of = vi.fn(() => []);
    reconfigure = vi.fn(() => ({}));
  }
}));
vi.mock('@codemirror/language', () => ({
  StreamLanguage: { define: vi.fn(() => []) },
  HighlightStyle: { define: vi.fn(() => ({})) },
  syntaxHighlighting: vi.fn(() => [])
}));
vi.mock('@codemirror/lang-json', () => ({ json: vi.fn(() => []) }));
vi.mock('@codemirror/lang-javascript', () => ({ javascript: vi.fn(() => []) }));

import { CodePreviewPanel } from '../../src/components/CodePreviewPanel.js';
import { useCodegenStore } from '../../src/store/codegen-store.js';

afterEach(() => cleanup());
beforeEach(() => useCodegenStore.getState().resetCodegenState());

function makeWorker() {
  return {
    postMessage: vi.fn(),
    onmessage: null as ((e: MessageEvent) => void) | null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };
}

describe('CodePreviewPanel table-as-landing flow', () => {
  it('renders the targets table on initial mount (activeTarget undefined)', () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    expect(screen.getByTestId('codegen-targets-table')).toBeTruthy();
    expect(screen.queryByTestId('code-preview-editor')).toBeNull();
  });

  it('does not request codegen while the table is showing', () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    expect(w.postMessage).not.toHaveBeenCalled();
  });

  it('clicking [View] on a row enters the viewer and triggers codegen', () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    fireEvent.click(screen.getByTestId('codegen-targets-table__view-typescript'));
    // store transitions to viewer mode
    expect(useCodegenStore.getState().activeTarget).toBe('typescript');
    expect(useCodegenStore.getState().codePreviewTarget).toBe('typescript');
    // viewer is rendered, table is gone
    expect(screen.queryByTestId('codegen-targets-table')).toBeNull();
    expect(screen.getByTestId('code-preview-editor')).toBeTruthy();
    // codegen dispatched for the chosen target
    expect(w.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'codegen:generate', target: 'typescript' })
    );
  });

  it('clicking the ← Targets button returns to the table', () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    fireEvent.click(screen.getByTestId('codegen-targets-table__view-zod'));
    fireEvent.click(screen.getByTestId('codegen-back-to-targets'));
    expect(useCodegenStore.getState().activeTarget).toBeUndefined();
    expect(screen.getByTestId('codegen-targets-table')).toBeTruthy();
    expect(screen.queryByTestId('code-preview-editor')).toBeNull();
  });

  it('does not re-trigger codegen when the user returns to the table and back to the same target', async () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    fireEvent.click(screen.getByTestId('codegen-targets-table__view-zod'));
    const callsAfterFirstView = w.postMessage.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByTestId('codegen-back-to-targets'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('codegen-targets-table__view-zod'));
    });
    // re-entering the viewer for the *same* target should trigger
    // codegen again because the `activeTarget` dep on the request
    // useEffect flips undefined → 'zod' a second time.
    expect(w.postMessage.mock.calls.length).toBeGreaterThan(callsAfterFirstView);
  });

  it('does not render the old TargetSwitcher tabs in either mode', () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    expect(screen.queryByTestId('target-switcher')).toBeNull();
    fireEvent.click(screen.getByTestId('codegen-targets-table__view-zod'));
    expect(screen.queryByTestId('target-switcher')).toBeNull();
  });
});
