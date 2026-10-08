// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, act, cleanup, waitFor } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { makeNodeId } from '@rune-langium/visual-editor';
import {
  parse,
  serializeRuneModel,
  createRuneDslServices,
  type RosettaFunction,
  type Dehydrated
} from '@rune-langium/core';
import { ExpressionWorkspace } from '../../src/components/editing/ExpressionWorkspace.js';
import { ExpressionDocument } from '../../src/services/expression-document.js';
import type { WorkspaceFile } from '../../src/services/workspace.js';

afterEach(cleanup);
const source = 'namespace test\nversion "test"\nfunc Calculate:\n  output: result int (1..1)\n  set result: 1\n';

async function context() {
  const result = await parse(source);
  let file: WorkspaceFile = { path: '/first.rosetta', name: 'first.rosetta', content: source, dirty: false };
  const sibling = { ...file, path: '/second.rosetta', name: 'second.rosetta' };
  const writes = vi.fn((_: string, text: string) => {
    file = { ...file, content: text };
  });
  const documents = new ExpressionDocument({ getGeneration: () => 1, getFile: () => file, onContentChange: writes });
  const props = {
    nodeId: makeNodeId('test', 'Calculate', 'RosettaFunction'),
    file,
    parsed: { filePath: file.path, model: result.value, source },
    documents,
    parseCurrent: true,
    readOnly: false,
    onContentChange: writes,
    onOpenSource: vi.fn()
  };
  return { props, sibling, writes, getFile: () => file };
}

describe('source-bound expression workspace', () => {
  it('keeps invalid text editable during pending/failed parses and writes only the owning file', async () => {
    const { props, sibling, writes, getFile } = await context();
    const host = render(<ExpressionWorkspace {...props} />);
    const editor = await host.findByTestId('implementation-editor');
    const view = EditorView.findFromDOM(editor.querySelector('.cm-editor')!)!;
    const from = source.indexOf('1\n');
    act(() => view.dispatch({ changes: { from, to: from + 1, insert: 'if (' } }));
    expect(writes).toHaveBeenLastCalledWith('/first.rosetta', source.replace('1\n', 'if (\n'));
    host.rerender(<ExpressionWorkspace {...props} file={getFile()} parseCurrent={false} />);
    expect(view.state.doc.toString()).toContain('if (');
    act(() => view.dispatch({ changes: { from: from + 4, insert: 'x' } }));
    expect(view.state.doc.toString()).toContain('if (x');
    expect(sibling.content).toBe(source);
  });

  it('waits for curated source and then displays the serialized declaration read-only', async () => {
    const { props, writes } = await context();
    const { RuneDsl } = createRuneDslServices();
    const wire = JSON.parse(serializeRuneModel(RuneDsl.serializer.JsonSerializer, props.parsed.model));
    const owner = wire.elements[0] as Dehydrated<RosettaFunction>;
    const host = render(
      <ExpressionWorkspace
        {...props}
        parsed={undefined}
        parseCurrent={false}
        sourceOwner={owner}
        readOnly
        file={{ ...props.file, content: '', sourceLoaded: false, readOnly: true }}
      />
    );
    expect(host.queryByTestId('implementation-editor')).toBeNull();
    expect(host.getByText('Loading source…')).toBeVisible();
    host.rerender(
      <ExpressionWorkspace
        {...props}
        parsed={undefined}
        parseCurrent={false}
        sourceOwner={owner}
        readOnly
        file={{ ...props.file, sourceLoaded: true, readOnly: true }}
      />
    );
    const editor = await host.findByTestId('implementation-editor');
    const view = EditorView.findFromDOM(editor.querySelector('.cm-editor')!)!;
    act(() => view.dispatch({ changes: { from: source.indexOf('1\n'), insert: 'broken' } }));
    expect(view.state.doc.toString()).toBe(source);
    expect(writes).not.toHaveBeenCalled();
  });

  it('never mounts an empty writable view when the source file is missing', async () => {
    const { props } = await context();
    const host = render(<ExpressionWorkspace {...props} file={undefined} />);
    await waitFor(() => expect(host.queryByTestId('implementation-editor')).toBeNull());
    expect(host.getByRole('button', { name: 'Open in Source' })).toBeVisible();
  });
});
