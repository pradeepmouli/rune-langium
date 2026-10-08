// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { parseExpression } from '@rune-langium/core';
import { ExpressionBuilderDialog } from '../../src/components/editing/ExpressionBuilderDialog.js';
import { ExpressionDocument } from '../../src/services/expression-document.js';

afterEach(cleanup);
function session(raw = '1 + 2') {
  let source = `prefix ${raw} suffix`;
  let generation = 1;
  const writes = vi.fn((_: string, text: string) => {
    source = text;
  });
  const documents = new ExpressionDocument({
    getGeneration: () => generation,
    getFile: () => ({ path: '/file.rosetta', content: source }),
    onContentChange: writes
  });
  const region = { from: 7, to: 7 + raw.length };
  const binding = documents.capture('file:///file.rosetta', 'test.F', region)!;
  const props = {
    binding,
    target: { region, kind: 'operation' as const, index: 1, expression: parseExpression(raw).value },
    scope: { inputs: [], aliases: [], output: null },
    onApply: (edit: Parameters<typeof documents.applyDocumentEdit>[0]) => documents.applyDocumentEdit(edit),
    onClose: vi.fn()
  };
  return {
    props,
    writes,
    source: () => source,
    change: () => {
      source = source.replace(raw, '3 + 4');
      documents.observe(binding.uri);
    },
    switchWorkspace: () => {
      generation++;
    }
  };
}

function draft(host: ReturnType<typeof render>, text: string) {
  fireEvent.click(host.getByTestId('tab-text'));
  const view = EditorView.findFromDOM(host.getByTestId('text-editor').querySelector('.cm-editor')!)!;
  act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }));
}

describe('isolated expression builder dialog', () => {
  it('keeps Cancel and Escape local with zero source writes', () => {
    const s = session();
    const host = render(<ExpressionBuilderDialog {...s.props} />);
    draft(host, '42');
    fireEvent.click(host.getByRole('button', { name: 'Cancel' }));
    expect(s.writes).not.toHaveBeenCalled();
    expect(s.source()).toBe('prefix 1 + 2 suffix');
    expect(s.props.onClose).toHaveBeenCalled();
    fireEvent.keyDown(host.getByRole('dialog'), { key: 'Escape' });
    expect(s.writes).not.toHaveBeenCalled();
  });

  it('applies only the captured later expression, with exact prefix and suffix', () => {
    const s = session();
    const host = render(<ExpressionBuilderDialog {...s.props} />);
    draft(host, '42');
    fireEvent.click(host.getByRole('button', { name: 'Apply' }));
    expect(s.writes).toHaveBeenCalledOnce();
    expect(s.source()).toBe('prefix 42 suffix');
    expect(s.props.onClose).toHaveBeenCalledOnce();
  });

  it.each(['source', 'workspace'])('rejects stale %s and retains the draft', (reason) => {
    const s = session();
    const host = render(<ExpressionBuilderDialog {...s.props} />);
    draft(host, '42');
    if (reason === 'source') s.change();
    else s.switchWorkspace();
    fireEvent.click(host.getByRole('button', { name: 'Apply' }));
    expect(s.writes).not.toHaveBeenCalled();
    expect(host.getByText('The source changed. Reopen the builder to apply this draft.')).toBeVisible();
    expect(
      EditorView.findFromDOM(host.getByTestId('text-editor').querySelector('.cm-editor')!)!.state.doc.toString()
    ).toBe('42');
  });

  it('preserves unchanged comments exactly and rejects invalid Rune drafts', () => {
    const s = session('1 /* explanation */ + 2');
    const host = render(<ExpressionBuilderDialog {...s.props} />);
    fireEvent.click(host.getByRole('button', { name: 'Apply' }));
    expect(s.writes).not.toHaveBeenCalled();
    expect(s.props.onClose).toHaveBeenCalledOnce();
    draft(host, 'if (');
    fireEvent.click(host.getByRole('button', { name: 'Apply' }));
    expect(s.writes).not.toHaveBeenCalled();
    expect(host.getByRole('alert')).toHaveTextContent('Invalid Rune expression');
  });
  it('reseeds a newly opened draft and enforces read-only source', () => {
    const first = session('1 + 2');
    const host = render(<ExpressionBuilderDialog {...first.props} />);
    draft(host, '42');
    host.unmount();
    const next = session('3 + 4');
    const reopened = render(
      <ExpressionBuilderDialog {...next.props} binding={{ ...next.props.binding, readOnly: true }} />
    );
    fireEvent.click(reopened.getByTestId('tab-text'));
    const view = EditorView.findFromDOM(reopened.getByTestId('text-editor').querySelector('.cm-editor')!)!;
    act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '99' } }));
    expect(view.state.doc.toString()).toBe('3 + 4');
    expect(reopened.getByRole('button', { name: 'Apply' })).toBeDisabled();
    expect(next.writes).not.toHaveBeenCalled();
  });
});
