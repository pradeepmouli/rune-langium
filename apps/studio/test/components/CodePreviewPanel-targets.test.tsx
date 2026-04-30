// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
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
beforeEach(() => useCodegenStore.setState({ codePreviewTarget: 'zod' }));

function makeWorker() {
  return {
    postMessage: vi.fn(),
    onmessage: null as ((e: MessageEvent) => void) | null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };
}

describe('CodePreviewPanel — target switching', () => {
  it('sends codegen:generate when switching target from Zod to JSON Schema', async () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    const jsonSchemaTab = screen.getByRole('tab', { name: 'JSON Schema' });
    await act(async () => {
      fireEvent.click(jsonSchemaTab);
    });
    expect(w.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'codegen:generate',
        target: 'json-schema',
        requestId: expect.any(String)
      })
    );
  });

  it('renders new content after codegen:result with json-schema target', async () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'JSON Schema' }));
    });
    const requestId = (w.postMessage.mock.calls.at(-1)?.[0] as { requestId?: string })?.requestId;
    await act(async () => {
      const handler = (w.addEventListener.mock.calls.find(([e]) => e === 'message') ?? [])[1] as
        | ((e: MessageEvent) => void)
        | undefined;
      handler?.({
        data: {
          type: 'codegen:result',
          target: 'json-schema',
          requestId,
          files: [{ relativePath: 'ns.schema.json', content: '{}', sourceMap: [] }]
        }
      } as MessageEvent);
    });
    expect(screen.getByTestId('codegen-status')).toHaveTextContent(/Generated \(JSON Schema\)/i);
  });

  it('ignores stale results for a previously selected target', async () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'TypeScript' }));
    });
    const requestId = (w.postMessage.mock.calls.at(-1)?.[0] as { requestId?: string })?.requestId;
    await act(async () => {
      const handler = (w.addEventListener.mock.calls.find(([e]) => e === 'message') ?? [])[1] as
        | ((e: MessageEvent) => void)
        | undefined;
      handler?.({
        data: {
          type: 'codegen:result',
          target: 'typescript',
          requestId: 'codegen:typescript:stale',
          files: [{ relativePath: 'ns.schema.json', content: '{}', sourceMap: [] }]
        }
      } as MessageEvent);
      handler?.({
        data: {
          type: 'codegen:result',
          target: 'typescript',
          requestId,
          files: [{ relativePath: 'ns.ts', content: 'export {}', sourceMap: [] }]
        }
      } as MessageEvent);
    });
    expect(screen.getByRole('tab', { name: 'TypeScript' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByTestId('codegen-status')).toHaveTextContent(/Generated \(TypeScript\)/i);
  });

  it('ignores stale outdated messages for the previously generated target after switching targets', async () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);

    await act(async () => {
      const handler = (w.addEventListener.mock.calls.find(([e]) => e === 'message') ?? [])[1] as
        | ((e: MessageEvent) => void)
        | undefined;
      handler?.({
        data: {
          type: 'codegen:result',
          target: 'zod',
          requestId: (w.postMessage.mock.calls.at(-1)?.[0] as { requestId?: string })?.requestId,
          files: [{ relativePath: 'ns.zod.ts', content: 'zod content', sourceMap: [] }]
        }
      } as MessageEvent);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'TypeScript' }));
    });
    const requestId = (w.postMessage.mock.calls.at(-1)?.[0] as { requestId?: string })?.requestId;

    await act(async () => {
      const handler = (w.addEventListener.mock.calls.find(([e]) => e === 'message') ?? [])[1] as
        | ((e: MessageEvent) => void)
        | undefined;
      handler?.({
        data: {
          type: 'codegen:outdated',
          target: 'typescript',
          requestId: 'codegen:typescript:stale',
          message: 'Fix model errors to refresh the code preview.'
        }
      } as MessageEvent);
      handler?.({
        data: {
          type: 'codegen:result',
          target: 'typescript',
          requestId,
          files: [{ relativePath: 'ns.ts', content: 'ts content', sourceMap: [] }]
        }
      } as MessageEvent);
    });

    expect(screen.getByRole('tab', { name: 'TypeScript' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByTestId('codegen-status')).toHaveTextContent(/Generated \(TypeScript\)/i);
  });

  it('lets the user switch between generated files from the same result', async () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);

    await act(async () => {
      const requestId = (w.postMessage.mock.calls.at(-1)?.[0] as { requestId?: string })?.requestId;
      const handler = (w.addEventListener.mock.calls.find(([e]) => e === 'message') ?? [])[1] as
        | ((e: MessageEvent) => void)
        | undefined;
      handler?.({
        data: {
          type: 'codegen:result',
          target: 'zod',
          requestId,
          files: [
            { relativePath: 'alpha.zod.ts', content: 'alpha', sourceMap: [] },
            { relativePath: 'beta.zod.ts', content: 'beta', sourceMap: [] }
          ]
        }
      } as MessageEvent);
    });

    fireEvent.change(screen.getByTestId('codegen-file-select'), {
      target: { value: 'beta.zod.ts' }
    });

    expect(screen.getByTestId('codegen-relative-path')).toHaveTextContent('beta.zod.ts');
  });
});
