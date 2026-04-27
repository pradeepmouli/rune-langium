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
vi.mock('@codemirror/language', () => ({ StreamLanguage: { define: vi.fn(() => []) } }));
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
    expect(w.postMessage).toHaveBeenCalledWith({ type: 'codegen:generate', target: 'json-schema' });
  });

  it('renders new content after codegen:result with json-schema target', async () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'JSON Schema' }));
    });
    await act(async () => {
      const handler = (w.addEventListener.mock.calls.find(([e]) => e === 'message') ?? [])[1] as
        | ((e: MessageEvent) => void)
        | undefined;
      handler?.({
        data: {
          type: 'codegen:result',
          target: 'json-schema',
          relativePath: 'ns.schema.json',
          content: '{}',
          sourceMap: []
        }
      } as MessageEvent);
    });
    expect(screen.getByTestId('codegen-status')).toHaveTextContent(/Generated \(JSON Schema\)/i);
  });
});
