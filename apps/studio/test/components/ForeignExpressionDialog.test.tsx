// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import { act } from 'react';
import { ForeignExpressionDialog } from '../../src/components/editing/ForeignExpressionDialog.js';
import { ExpressionDocument } from '../../src/services/expression-document.js';

vi.mock('../../src/lens/ts-wasm-asset.js', () => ({
  getTsWasmBytes: async () => {
    const { readFileSync } = await import('node:fs');
    const { createRequire } = await import('node:module');
    return new Uint8Array(
      readFileSync(
        createRequire(import.meta.url)
          .resolve('@vscode/tree-sitter-wasm/package.json')
          .replace(/package\.json$/, 'wasm/tree-sitter-typescript.wasm')
      )
    );
  }
}));
afterEach(cleanup);
describe('explicit reverse expression editing', () => {
  it.each(['amount > 2', 'amount.toFixed(2)'])('validates %s before any captured-region write', async (text) => {
    let file = { path: '/test.rosetta', content: 'prefix amount > 1 suffix' };
    const writes = vi.fn((path, content) => {
      file = { path, content };
    });
    const documents = new ExpressionDocument({ getGeneration: () => 1, getFile: () => file, onContentChange: writes });
    const region = { from: 7, to: 17 };
    const binding = documents.capture('file:///test.rosetta', 'test.Rule', region)!;
    const host = render(
      <ForeignExpressionDialog
        binding={binding}
        region={region}
        language="typescript"
        onApply={(edit) => documents.applyDocumentEdit(edit)}
        onClose={vi.fn()}
      />
    );
    const view = EditorView.findFromDOM(host.getByRole('dialog').querySelector('.cm-editor')!)!;
    act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }));
    expect(writes).not.toHaveBeenCalled();
    fireEvent.click(host.getByRole('button', { name: 'Apply' }));
    if (text.includes('toFixed')) {
      await host.findByRole('alert');
      expect(writes).not.toHaveBeenCalled();
    } else {
      await waitFor(() => expect(writes).toHaveBeenCalledOnce());
      expect(file.content).toBe('prefix amount > 2 suffix');
    }
  });
});
