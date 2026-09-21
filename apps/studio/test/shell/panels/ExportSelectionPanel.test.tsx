// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { TypeOption } from '@rune-langium/visual-editor';
import { ExportSelectionPanel } from '../../../src/shell/panels/ExportSelectionPanel.js';

let selectOption: ((option: TypeOption | null) => void) | undefined;

vi.mock('../../../src/components/WorkspaceTypePicker.js', () => ({
  WorkspaceTypePicker: (props: { onSelectOption?: (option: TypeOption | null) => void }) => {
    selectOption = props.onSelectOption;
    return <button type="button">Add declaration</button>;
  }
}));

const party: TypeOption = { value: 'test.Party', label: 'Party', namespace: 'test', kind: 'data' };

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
