// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, act, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { undo, redo } from '@codemirror/commands';
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
import { PreviewSessionContext } from '../../src/shell/providers/preview-session-context.js';

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
  it.each(['function-body', 'function-condition', 'data-condition'] as const)(
    'binds the correct same-named declaration for %s',
    async (mode) => {
      const text =
        'namespace test\ntype Shared:\n amount int (1..1)\n condition DataValid: amount > 0\nfunc Shared:\n inputs: factor int (1..1)\n output: out int (1..1)\n condition FunctionValid: factor > 1\n set out: factor + 2';
      const result = await parse(text);
      expect(result.parserErrors).toEqual([]);
      const { props } = await context();
      const file = { ...props.file, content: text };
      const writes = vi.fn();
      const documents = new ExpressionDocument({
        getGeneration: () => 1,
        getFile: () => file,
        onContentChange: writes
      });
      const nodeId = makeNodeId('test', 'Shared', mode === 'data-condition' ? 'Data' : 'RosettaFunction');
      const loadScope = vi.fn(async () => ({ inputs: [], aliases: [], output: null }));
      const host = render(
        <ExpressionWorkspace
          {...props}
          nodeId={nodeId}
          file={file}
          documents={documents}
          onContentChange={writes}
          parsed={{ filePath: file.path, model: result.value, source: text }}
          loadScope={loadScope}
          target={mode === 'function-body' ? undefined : { nodeId, kind: 'precondition', index: 0 }}
        />
      );
      const editor = await host.findByTestId('implementation-editor');
      const view = EditorView.findFromDOM(editor.querySelector('.cm-editor')!)!;
      const expression =
        mode === 'function-body' ? 'factor + 2' : mode === 'function-condition' ? 'factor > 1' : 'amount > 0';
      const from = text.indexOf(expression);
      act(() => view.dispatch({ selection: { anchor: from } }));
      fireEvent.click(host.getByRole('button', { name: 'Builder' }));
      await host.findByRole('dialog');
      expect(loadScope).toHaveBeenCalledExactlyOnceWith({ from, to: from + expression.length });
      fireEvent.click(host.getByTestId('tab-text'));
      const draft = EditorView.findFromDOM(host.getByTestId('text-editor').querySelector('.cm-editor')!)!;
      expect(draft.state.doc.toString()).toBe(expression);
      expect(writes).not.toHaveBeenCalled();
    }
  );

  it('displays generated TypeScript read-only, caches tab clicks, and retains stale output for invalid Rune', async () => {
    const { props, writes, getFile } = await context();
    const project = vi.fn(async (language, subject) => ({
      language,
      subject,
      code: 'export function Calculate(): number { return 1; }',
      sourceMap: [],
      requiredHelpers: []
    }));
    const factory = () => ({ schema: vi.fn(), execute: vi.fn(), project, dispose: vi.fn() });
    const renderWorkspace = (current = props) => (
      <PreviewSessionContext.Provider value={factory}>
        <ExpressionWorkspace {...current} />
      </PreviewSessionContext.Provider>
    );
    const host = render(renderWorkspace());
    const editor = await host.findByTestId('implementation-editor');
    const view = EditorView.findFromDOM(editor.querySelector('.cm-editor')!)!;
    fireEvent.click(host.getByRole('button', { name: 'TypeScript' }));
    await waitFor(() =>
      expect(host.getByTestId('generated-expression')).toHaveTextContent('export function Calculate')
    );
    const generated = EditorView.findFromDOM(host.getByTestId('generated-expression').querySelector('.cm-editor')!)!;
    act(() => generated.dispatch({ changes: { from: 0, insert: 'invalid' } }));
    expect(writes).not.toHaveBeenCalled();
    fireEvent.click(host.getByRole('button', { name: 'Rune' }));
    fireEvent.click(host.getByRole('button', { name: 'TypeScript' }));
    expect(project).toHaveBeenCalledOnce();
    fireEvent.click(host.getByRole('button', { name: 'Rune' }));
    act(() => view.dispatch({ changes: { from: source.indexOf('1\n'), insert: 'if (' } }));
    host.rerender(renderWorkspace({ ...props, file: getFile(), parseCurrent: false }));
    fireEvent.click(host.getByRole('button', { name: 'TypeScript' }));
    expect(host.getByTestId('generated-expression')).toHaveTextContent('export function Calculate');
    expect(host.getByRole('status')).toHaveTextContent('last valid source');
    expect(project).toHaveBeenCalledOnce();
  });
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

  it.each(['rename', 'delete'])(
    'invalidates the editor when a current parse confirms declaration %s',
    async (change) => {
      const { props, writes, getFile } = await context();
      const host = render(<ExpressionWorkspace {...props} />);
      await host.findByTestId('implementation-editor');
      const updated = change === 'rename' ? source.replace('Calculate', 'Renamed') : 'namespace test\nversion "test"\n';
      writes(props.file.path, updated);
      writes.mockClear();
      const result = await parse(updated);
      host.rerender(
        <ExpressionWorkspace
          {...props}
          file={getFile()}
          parsed={{ filePath: props.file.path, source: updated, model: result.value }}
          parseCurrent
        />
      );
      await waitFor(() => expect(host.queryByTestId('implementation-editor')).toBeNull());
      expect(host.getByRole('button', { name: 'Builder' })).toBeDisabled();
      expect(host.getByRole('status')).toHaveTextContent('no longer present');
      expect(writes).not.toHaveBeenCalled();
    }
  );

  it('applies a builder edit as one CodeMirror undo entry', async () => {
    const { props, writes } = await context();
    const loadScope = vi.fn(async () => ({ inputs: [], aliases: [], output: null }));
    const host = render(<ExpressionWorkspace {...props} loadScope={loadScope} />);
    const editor = await host.findByTestId('implementation-editor');
    const view = EditorView.findFromDOM(editor.querySelector('.cm-editor')!)!;
    act(() => view.dispatch({ selection: { anchor: source.indexOf('1\n') } }));
    fireEvent.click(host.getByRole('button', { name: 'Builder' }));
    await host.findByRole('dialog');
    fireEvent.click(host.getByTestId('tab-text'));
    const draftView = EditorView.findFromDOM(host.getByTestId('text-editor').querySelector('.cm-editor')!)!;
    act(() => draftView.dispatch({ changes: { from: 0, to: draftView.state.doc.length, insert: '42' } }));
    expect(writes).not.toHaveBeenCalled();
    fireEvent.click(host.getByRole('button', { name: 'Apply' }));
    expect(view.state.doc.toString()).toBe(source.replace('1\n', '42\n'));
    expect(writes).toHaveBeenCalledOnce();
    await waitFor(() => expect(view.hasFocus).toBe(true));
    act(() => undo(view));
    expect(view.state.doc.toString()).toBe(source);
    act(() => redo(view));
    expect(view.state.doc.toString()).toBe(source.replace('1\n', '42\n'));
  });

  it('rejects an external source update while the builder is open, keeping the private draft', async () => {
    const { props, writes } = await context();
    const loadScope = async () => ({ inputs: [], aliases: [], output: null });
    const host = render(<ExpressionWorkspace {...props} loadScope={loadScope} />);
    const editor = await host.findByTestId('implementation-editor');
    const view = EditorView.findFromDOM(editor.querySelector('.cm-editor')!)!;
    act(() => view.dispatch({ selection: { anchor: source.indexOf('1\n') } }));
    fireEvent.click(host.getByRole('button', { name: 'Builder' }));
    await host.findByRole('dialog');
    fireEvent.click(host.getByTestId('tab-text'));
    const draftView = EditorView.findFromDOM(host.getByTestId('text-editor').querySelector('.cm-editor')!)!;
    act(() => draftView.dispatch({ changes: { from: 0, to: draftView.state.doc.length, insert: '42' } }));
    host.rerender(
      <ExpressionWorkspace
        {...props}
        loadScope={loadScope}
        parseCurrent={false}
        file={{ ...props.file, content: source.replace('1\n', '3\n') }}
      />
    );
    fireEvent.click(host.getByRole('button', { name: 'Apply' }));
    expect(writes).not.toHaveBeenCalled();
    expect(host.getByText('The source changed. Reopen the builder to apply this draft.')).toBeVisible();
    expect(
      EditorView.findFromDOM(host.getByTestId('text-editor').querySelector('.cm-editor')!)!.state.doc.toString()
    ).toBe('42');
  });

  it.each(['reorder', 'delete'])('rejects a captured condition after source %s', async (reason) => {
    const text =
      'namespace test\nversion "test"\ntype Deal:\n amount int (1..1)\n condition First: amount > 0\n condition Second: amount < 10';
    const parsed = await parse(text);
    let file: WorkspaceFile = { path: '/rules.rosetta', name: 'rules.rosetta', content: text, dirty: false };
    const writes = vi.fn();
    const documents = new ExpressionDocument({ getGeneration: () => 1, getFile: () => file, onContentChange: writes });
    const props = {
      nodeId: makeNodeId('test', 'Deal'),
      file,
      parsed: { filePath: file.path, model: parsed.value, source: text },
      documents,
      readOnly: false,
      parseCurrent: true,
      target: { nodeId: makeNodeId('test', 'Deal'), kind: 'precondition' as const, index: 1 },
      onContentChange: writes,
      onOpenSource: vi.fn(),
      loadScope: async () => ({ inputs: [], aliases: [], output: null })
    };
    const host = render(<ExpressionWorkspace {...props} />);
    await host.findByTestId('implementation-editor');
    fireEvent.click(host.getByRole('button', { name: 'Builder' }));
    await host.findByRole('dialog');
    fireEvent.click(host.getByTestId('tab-text'));
    const draft = EditorView.findFromDOM(host.getByTestId('text-editor').querySelector('.cm-editor')!)!;
    act(() => draft.dispatch({ changes: { from: 0, to: draft.state.doc.length, insert: 'amount < 20' } }));
    file = {
      ...file,
      content:
        reason === 'delete'
          ? text.replace('\n condition Second: amount < 10', '')
          : text.replace(
              'condition First: amount > 0\n condition Second: amount < 10',
              'condition Second: amount < 10\n condition First: amount > 0'
            )
    };
    documents.observe('file:///rules.rosetta');
    host.rerender(<ExpressionWorkspace {...props} file={file} parseCurrent={false} />);
    fireEvent.click(host.getByRole('button', { name: 'Apply' }));
    expect(writes).not.toHaveBeenCalled();
    expect(host.getByRole('alert')).toHaveTextContent('The source changed. Reopen the builder');
    expect(draft.state.doc.toString()).toBe('amount < 20');
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

  it('respects file read-only capability even if the host flag is false', async () => {
    const { props, writes } = await context();
    const host = render(
      <ExpressionWorkspace
        {...props}
        file={{ ...props.file, readOnly: true }}
        loadScope={async () => ({ inputs: [], aliases: [], output: null })}
      />
    );
    const editor = await host.findByTestId('implementation-editor');
    const view = EditorView.findFromDOM(editor.querySelector('.cm-editor')!)!;
    act(() => view.dispatch({ changes: { from: source.indexOf('1\n'), insert: '9' } }));
    expect(view.state.doc.toString()).toBe(source);
    expect(host.getByRole('button', { name: 'Builder' })).toBeDisabled();
    expect(writes).not.toHaveBeenCalled();
  });

  it('never mounts an empty writable view when the source file is missing', async () => {
    const { props } = await context();
    const host = render(<ExpressionWorkspace {...props} file={undefined} />);
    await waitFor(() => expect(host.queryByTestId('implementation-editor')).toBeNull());
    expect(host.getByRole('button', { name: 'Open in Source' })).toBeVisible();
  });
});
