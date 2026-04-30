// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';

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
  EditorState: {
    create: vi.fn(() => ({})),
    readOnly: { of: vi.fn(() => []) }
  },
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

function makeWorker() {
  const worker = {
    postMessage: vi.fn(),
    onmessage: null as ((e: MessageEvent) => void) | null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };
  return worker;
}

afterEach(() => cleanup());
beforeEach(() => useCodegenStore.setState({ codePreviewTarget: 'zod' }));

describe('CodePreviewPanel — status transitions', () => {
  it('shows "Generating…" on initial mount', () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    expect(screen.getByTestId('codegen-status')).toHaveTextContent(/Generating/i);
    expect(w.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'codegen:generate',
        target: 'zod',
        requestId: expect.any(String)
      })
    );
  });

  it('shows "Generated (Zod)" after codegen:result with target=zod', async () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    const requestId = (w.postMessage.mock.calls.at(-1)?.[0] as { requestId?: string })?.requestId;
    await act(async () => {
      // Simulate the worker posting a result back
      const handler = (w.addEventListener.mock.calls.find(([e]) => e === 'message') ?? [])[1] as
        | ((e: MessageEvent) => void)
        | undefined;
      handler?.({
        data: {
          type: 'codegen:result',
          target: 'zod',
          requestId,
          files: [
            {
              relativePath: 'ns.zod.ts',
              content: 'export const X = z.object({});',
              sourceMap: []
            }
          ]
        }
      } as MessageEvent);
    });
    expect(screen.getByTestId('codegen-status')).toHaveTextContent(/Generated \(Zod\)/i);
    expect(screen.getByTestId('codegen-relative-path')).toHaveTextContent('ns.zod.ts');
  });

  it('shows "Outdated — fix errors to refresh" on codegen:outdated', async () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    const requestId = (w.postMessage.mock.calls.at(-1)?.[0] as { requestId?: string })?.requestId;
    await act(async () => {
      const handler = (w.addEventListener.mock.calls.find(([e]) => e === 'message') ?? [])[1] as
        | ((e: MessageEvent) => void)
        | undefined;
      handler?.({
        data: {
          type: 'codegen:result',
          target: 'zod',
          requestId,
          files: [{ relativePath: 'ns.zod.ts', content: 'content', sourceMap: [] }]
        }
      } as MessageEvent);
    });
    await act(async () => {
      const handler = (w.addEventListener.mock.calls.find(([e]) => e === 'message') ?? [])[1] as
        | ((e: MessageEvent) => void)
        | undefined;
      handler?.({
        data: {
          type: 'codegen:outdated',
          target: 'zod',
          requestId,
          message: 'Fix model errors to refresh the code preview.'
        }
      } as MessageEvent);
    });
    expect(screen.getByTestId('codegen-status')).toHaveTextContent(/Outdated.*fix errors/i);
  });

  it('retains content (does NOT blank) on codegen:outdated', async () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    const requestId = (w.postMessage.mock.calls.at(-1)?.[0] as { requestId?: string })?.requestId;
    await act(async () => {
      const handler = (w.addEventListener.mock.calls.find(([e]) => e === 'message') ?? [])[1] as
        | ((e: MessageEvent) => void)
        | undefined;
      handler?.({
        data: {
          type: 'codegen:result',
          target: 'zod',
          requestId,
          files: [{ relativePath: 'ns.zod.ts', content: 'last good content', sourceMap: [] }]
        }
      } as MessageEvent);
    });
    await act(async () => {
      const handler = (w.addEventListener.mock.calls.find(([e]) => e === 'message') ?? [])[1] as
        | ((e: MessageEvent) => void)
        | undefined;
      handler?.({
        data: {
          type: 'codegen:outdated',
          target: 'zod',
          requestId,
          message: 'Fix model errors to refresh the code preview.'
        }
      } as MessageEvent);
    });
    // Not blanked back to "Generating..."
    expect(screen.getByTestId('codegen-status')).not.toHaveTextContent(/Generating…/i);
  });

  it('shows "Preview unavailable" when generation fails before any successful output', async () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    const requestId = (w.postMessage.mock.calls.at(-1)?.[0] as { requestId?: string })?.requestId;
    await act(async () => {
      const handler = (w.addEventListener.mock.calls.find(([e]) => e === 'message') ?? [])[1] as
        | ((e: MessageEvent) => void)
        | undefined;
      handler?.({
        data: {
          type: 'codegen:error',
          target: 'zod',
          requestId,
          message: 'Code generation failed.'
        }
      } as MessageEvent);
    });
    expect(screen.getByTestId('codegen-status')).toHaveTextContent(/Preview unavailable/i);
  });

  it('ignores stale responses with an older request id for the same target', async () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    const currentRequestId = (w.postMessage.mock.calls.at(-1)?.[0] as { requestId?: string })
      ?.requestId;

    await act(async () => {
      const handler = (w.addEventListener.mock.calls.find(([e]) => e === 'message') ?? [])[1] as
        | ((e: MessageEvent) => void)
        | undefined;
      handler?.({
        data: {
          type: 'codegen:result',
          target: 'zod',
          requestId: 'codegen:zod:older',
          files: [{ relativePath: 'stale.zod.ts', content: 'stale', sourceMap: [] }]
        }
      } as MessageEvent);
      handler?.({
        data: {
          type: 'codegen:result',
          target: 'zod',
          requestId: currentRequestId,
          files: [{ relativePath: 'fresh.zod.ts', content: 'fresh', sourceMap: [] }]
        }
      } as MessageEvent);
    });

    expect(screen.getByTestId('codegen-relative-path')).toHaveTextContent('fresh.zod.ts');
  });

  it('shows "Preview unavailable" when the worker errors', async () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    await act(async () => {
      const handler = (w.addEventListener.mock.calls.find(([e]) => e === 'error') ?? [])[1] as
        | ((e: ErrorEvent) => void)
        | undefined;
      handler?.({ message: 'worker crashed', error: new Error('boom') } as ErrorEvent);
    });
    expect(screen.getByTestId('codegen-status')).toHaveTextContent(/Preview unavailable/i);
  });

  it('removes worker listeners on unmount', () => {
    const w = makeWorker();
    const { unmount } = render(
      <CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />
    );
    unmount();
    expect(w.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    expect(w.removeEventListener).toHaveBeenCalledWith('error', expect.any(Function));
  });
});
