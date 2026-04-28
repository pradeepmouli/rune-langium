// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';

// Reuse same mocks
vi.mock('@codemirror/view', () => ({
  EditorView: class MockEditorView {
    dom = document.createElement('div');
    state = { doc: { toString: () => '' } };
    destroy = vi.fn();
    dispatch = vi.fn();
    static theme = vi.fn(() => []);
    static updateListener = { of: vi.fn(() => []) };
    static domEventHandlers = vi.fn(() => []);
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
beforeEach(() => useCodegenStore.setState({ codePreviewTarget: 'zod' }));

function makeWorker() {
  return {
    postMessage: vi.fn(),
    onmessage: null as ((e: MessageEvent) => void) | null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };
}

describe('CodePreviewPanel — source-map click-to-navigate', () => {
  it('calls revealLineInCenter and setSelection on mapped line click', async () => {
    const w = makeWorker();
    const sourceEditorRef = { revealLineInCenter: vi.fn(), setSelection: vi.fn() };
    const { container } = render(
      <CodePreviewPanel
        worker={w as unknown as Worker}
        sourceEditorRef={sourceEditorRef as never}
      />
    );
    const sourceMap = [
      { outputLine: 2, sourceUri: 'file:///trade.rune', sourceLine: 5, sourceChar: 3 }
    ];
    // Deliver a codegen:result with content "line0\nline1\nline2\n" and sourceMap
    await act(async () => {
      const handler = (w.addEventListener.mock.calls.find(([e]) => e === 'message') ?? [])[1] as
        | ((e: MessageEvent) => void)
        | undefined;
      handler?.({
        data: {
          type: 'codegen:result',
          target: 'zod',
          relativePath: 'ns.zod.ts',
          content: 'line0\nline1\nline2\n',
          sourceMap
        }
      } as MessageEvent);
    });

    // Click the div with data-line="2" — mapped to sourceLine=5 in the sourceMap
    const lineEl = container.querySelector('[data-line="2"]');
    expect(lineEl).toBeTruthy();
    await act(async () => {
      fireEvent.click(lineEl!);
    });

    expect(sourceEditorRef.revealLineInCenter).toHaveBeenCalledWith(5);
    expect(sourceEditorRef.setSelection).toHaveBeenCalledWith({ line: 5, character: 3 });
  });

  it('does nothing when clicking with empty source map', async () => {
    const w = makeWorker();
    const sourceEditorRef = { revealLineInCenter: vi.fn(), setSelection: vi.fn() };
    const { container } = render(
      <CodePreviewPanel
        worker={w as unknown as Worker}
        sourceEditorRef={sourceEditorRef as never}
      />
    );
    await act(async () => {
      const handler = (w.addEventListener.mock.calls.find(([e]) => e === 'message') ?? [])[1] as
        | ((e: MessageEvent) => void)
        | undefined;
      handler?.({
        data: {
          type: 'codegen:result',
          target: 'zod',
          relativePath: 'ns.zod.ts',
          content: 'line0\nline1\n',
          sourceMap: []
        }
      } as MessageEvent);
    });
    const lineEl = container.querySelector('[data-line="0"]');
    await act(async () => {
      if (lineEl) fireEvent.click(lineEl);
    });
    expect(sourceEditorRef.revealLineInCenter).not.toHaveBeenCalled();
    expect(sourceEditorRef.setSelection).not.toHaveBeenCalled();
  });

  it('does nothing when sourceEditorRef is null', async () => {
    const w = makeWorker();
    const { container } = render(
      <CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />
    );
    await act(async () => {
      const handler = (w.addEventListener.mock.calls.find(([e]) => e === 'message') ?? [])[1] as
        | ((e: MessageEvent) => void)
        | undefined;
      handler?.({
        data: {
          type: 'codegen:result',
          target: 'zod',
          relativePath: 'ns.zod.ts',
          content: 'line0\n',
          sourceMap: [
            { outputLine: 0, sourceUri: 'file:///trade.rune', sourceLine: 5, sourceChar: 3 }
          ]
        }
      } as MessageEvent);
    });
    const lineEl = container.querySelector('[data-line="0"]');
    await act(async () => {
      if (lineEl) fireEvent.click(lineEl);
    });
    expect(lineEl).toBeTruthy();
  });
});
