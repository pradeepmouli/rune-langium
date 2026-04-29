// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

// Capture the domEventHandlers argument so tests can invoke the click handler
// directly — the CodeMirror-based panel no longer has per-line DOM elements.
const capturedHandlers: { click?: (event: MouseEvent, view: object) => void } = {};

vi.mock('@codemirror/view', () => ({
  EditorView: class MockEditorView {
    dom = document.createElement('div');
    state = { doc: { toString: () => '' } };
    destroy = vi.fn();
    dispatch = vi.fn();
    static theme = vi.fn(() => []);
    static updateListener = { of: vi.fn(() => []) };
    static domEventHandlers = vi.fn((handlers: { click?: (e: MouseEvent, v: object) => void }) => {
      if (handlers.click) capturedHandlers.click = handlers.click;
      return [];
    });
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
beforeEach(() => {
  useCodegenStore.setState({ codePreviewTarget: 'zod' });
  capturedHandlers.click = undefined;
});

function makeWorker() {
  return {
    postMessage: vi.fn(),
    onmessage: null as ((e: MessageEvent) => void) | null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };
}

function getMessageHandler(worker: ReturnType<typeof makeWorker>) {
  return (worker.addEventListener.mock.calls.find(([e]) => e === 'message') ?? [])[1] as
    | ((e: MessageEvent) => void)
    | undefined;
}

/** Returns a fake CodeMirror view whose posAtCoords maps to a given outputLine. */
function makeFakeView(outputLine: number) {
  return {
    posAtCoords: vi.fn((_: { x: number; y: number }) => outputLine),
    state: { doc: { lineAt: vi.fn((_pos: number) => ({ number: outputLine + 1 })) } }
  };
}

describe('CodePreviewPanel — source-map click-to-navigate', () => {
  it('calls revealLineInCenter and setSelection on mapped line click', async () => {
    const w = makeWorker();
    const sourceEditorRef = { revealLineInCenter: vi.fn(), setSelection: vi.fn() };
    render(
      <CodePreviewPanel
        worker={w as unknown as Worker}
        sourceEditorRef={sourceEditorRef as never}
      />
    );
    const sourceMap = [
      { outputLine: 2, sourceUri: 'file:///trade.rune', sourceLine: 5, sourceChar: 3 }
    ];
    await act(async () => {
      getMessageHandler(w)?.({
        data: {
          type: 'codegen:result',
          target: 'zod',
          relativePath: 'ns.zod.ts',
          content: 'line0\nline1\nline2\n',
          sourceMap
        }
      } as MessageEvent);
    });

    // Invoke the CodeMirror click handler — posAtCoords returns 2, lineAt(2)
    // returns { number: 3 }, so lineNumber = 3 - 1 = 2, matching outputLine 2.
    await act(async () => {
      capturedHandlers.click?.(
        new MouseEvent('click', { clientX: 0, clientY: 0 }),
        makeFakeView(2)
      );
    });

    expect(sourceEditorRef.revealLineInCenter).toHaveBeenCalledWith(5);
    expect(sourceEditorRef.setSelection).toHaveBeenCalledWith({ line: 5, character: 3 });
  });

  it('does nothing when clicking with empty source map', async () => {
    const w = makeWorker();
    const sourceEditorRef = { revealLineInCenter: vi.fn(), setSelection: vi.fn() };
    render(
      <CodePreviewPanel
        worker={w as unknown as Worker}
        sourceEditorRef={sourceEditorRef as never}
      />
    );
    await act(async () => {
      getMessageHandler(w)?.({
        data: {
          type: 'codegen:result',
          target: 'zod',
          relativePath: 'ns.zod.ts',
          content: 'line0\nline1\n',
          sourceMap: []
        }
      } as MessageEvent);
    });
    await act(async () => {
      capturedHandlers.click?.(
        new MouseEvent('click', { clientX: 0, clientY: 0 }),
        makeFakeView(0)
      );
    });
    expect(sourceEditorRef.revealLineInCenter).not.toHaveBeenCalled();
    expect(sourceEditorRef.setSelection).not.toHaveBeenCalled();
  });

  it('does nothing when sourceEditorRef is null', async () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    await act(async () => {
      getMessageHandler(w)?.({
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
    // Invoking the click handler with a null ref must not throw.
    await act(async () => {
      capturedHandlers.click?.(
        new MouseEvent('click', { clientX: 0, clientY: 0 }),
        makeFakeView(0)
      );
    });
  });
});
