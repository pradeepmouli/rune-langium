// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useEditorStore, type TypeOption } from '@rune-langium/visual-editor';
import { ExportSelectionPanel } from '../../../src/shell/panels/ExportSelectionPanel.js';

let selectOption: ((option: TypeOption | null) => void) | undefined;

vi.mock('../../../src/components/WorkspaceTypePicker.js', () => ({
  WorkspaceTypePicker: (props: { onSelectOption?: (option: TypeOption | null) => void }) => {
    selectOption = props.onSelectOption;
    return <button type="button">Add declaration</button>;
  }
}));

const party: TypeOption = { value: 'test.Party', label: 'Party', namespace: 'test', kind: 'data' };

afterEach(() => {
  useEditorStore.setState({ nodesById: new Map() } as never);
});

it('adds, deduplicates, and removes declaration roots', () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <ExportSelectionPanel selection={{ namespaces: [], declarations: [] }} onChange={onChange} />
  );

  act(() => selectOption?.(party));
  expect(onChange).toHaveBeenLastCalledWith({
    namespaces: [],
    declarations: [{ namespace: 'test', name: 'Party', kind: 'Data' }]
  });

  const selection = onChange.mock.calls[0]?.[0]!;
  rerender(<ExportSelectionPanel selection={selection} onChange={onChange} />);
  act(() => selectOption?.(party));
  expect(onChange).toHaveBeenCalledOnce();

  screen.getByRole('button', { name: 'Remove Party' }).click();
  expect(onChange).toHaveBeenLastCalledWith({ namespaces: [], declarations: [] });
});

it('adds and removes whole namespace roots from the shared repository', () => {
  const node = {
    id: 'test.Party',
    meta: { namespace: 'test' },
    data: { $type: 'Data', name: 'Party' }
  };
  useEditorStore.setState({ nodesById: new Map([[node.id, node]]) } as never);
  const onChange = vi.fn();
  const { rerender } = render(
    <ExportSelectionPanel selection={{ namespaces: [], declarations: [] }} onChange={onChange} />
  );

  fireEvent.change(screen.getByLabelText('Add export namespace'), { target: { value: 'test' } });
  expect(onChange).toHaveBeenLastCalledWith({ namespaces: ['test'], declarations: [] });

  rerender(<ExportSelectionPanel selection={{ namespaces: ['test'], declarations: [] }} onChange={onChange} />);
  screen.getByRole('button', { name: 'Remove test' }).click();
  expect(onChange).toHaveBeenLastCalledWith({ namespaces: [], declarations: [] });
});
