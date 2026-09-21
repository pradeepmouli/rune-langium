// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { act, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useEditorStore, type ExplorerSelection, type ExplorerSelectionAction } from '@rune-langium/visual-editor';
import { ExportSelectionPanel } from '../../../src/shell/panels/ExportSelectionPanel.js';

let explorerSelection: ExplorerSelection | undefined;

vi.mock('@rune-langium/visual-editor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rune-langium/visual-editor')>();
  return {
    ...actual,
    NamespaceExplorerPanel: (props: { selection?: ExplorerSelection }) => {
      explorerSelection = props.selection;
      return <div data-testid="shared-type-explorer" />;
    }
  };
});

afterEach(() => {
  explorerSelection = undefined;
  useEditorStore.setState({ nodesById: new Map() } as never);
});

function setNodes(): void {
  const node = {
    id: 'test.Party',
    meta: { namespace: 'test' },
    data: { $type: 'Data', name: 'Party' }
  };
  useEditorStore.setState({ nodesById: new Map([[node.id, node]]) } as never);
}

it('converts shared explorer declaration selection into a codegen root', () => {
  setNodes();
  const onChange = vi.fn();
  const requiredBy = new Map([['["test","Data","Party"]', ['["test","Func","lookupParty"]']]]);
  const { rerender } = render(
    <ExportSelectionPanel
      selection={{ namespaces: [], declarations: [] }}
      requiredBy={requiredBy}
      onChange={onChange}
    />
  );

  expect(explorerSelection?.explicit).toEqual(new Set());
  expect(explorerSelection?.requiredBy).toBe(requiredBy);
  act(() => explorerSelection?.onChange(new Set(['["test","Data","Party"]'])));
  expect(onChange).toHaveBeenLastCalledWith({
    namespaces: [],
    declarations: [{ namespace: 'test', name: 'Party', kind: 'Data' }]
  });

  rerender(
    <ExportSelectionPanel
      selection={{ namespaces: [], declarations: [{ namespace: 'test', name: 'Party', kind: 'Data' }] }}
      onChange={onChange}
    />
  );
  act(() => explorerSelection?.onChange(new Set()));
  expect(onChange).toHaveBeenLastCalledWith({ namespaces: [], declarations: [] });
});

it('retains namespace roots from shared explorer namespace actions', () => {
  setNodes();
  const onChange = vi.fn();
  const action: ExplorerSelectionAction = { kind: 'namespace', namespaces: ['test'], checked: true };
  const { rerender } = render(
    <ExportSelectionPanel selection={{ namespaces: [], declarations: [] }} onChange={onChange} />
  );

  act(() => explorerSelection?.onChange(new Set(['["test","Data","Party"]']), action));
  expect(onChange).toHaveBeenLastCalledWith({ namespaces: ['test'], declarations: [] });

  rerender(<ExportSelectionPanel selection={{ namespaces: ['test'], declarations: [] }} onChange={onChange} />);
  act(() => explorerSelection?.onChange(new Set(), { ...action, checked: false }));
  expect(onChange).toHaveBeenLastCalledWith({ namespaces: [], declarations: [] });
});
