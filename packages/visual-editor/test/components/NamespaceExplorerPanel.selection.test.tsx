// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NamespaceExplorerPanel } from '../../src/components/panels/NamespaceExplorerPanel.js';
import type { TypeGraphNode, AnyGraphNode } from '../../src/types.js';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({
    count,
    estimateSize
  }: {
    count: number;
    estimateSize: (i: number) => number;
  }) => {
    let offset = 0;
    const items = Array.from({ length: count }, (_, i) => {
      const size = estimateSize(i);
      const item = { index: i, key: String(i), start: offset, size, end: offset + size };
      offset += size;
      return item;
    });
    return {
      getVirtualItems: () => items,
      getTotalSize: () => offset
    };
  }
}));

function makeNode(ns: string, name: string): TypeGraphNode {
  return {
    id: `${ns}::${name}`,
    type: 'data',
    position: { x: 0, y: 0 },
    data: {
      $type: 'Data',
      name,
      namespace: ns,
      attributes: [],
      conditions: [],
      annotations: [],
      synonyms: [],
      position: { x: 0, y: 0 },
      hasExternalRefs: false,
      errors: []
    } as AnyGraphNode
  };
}

describe('NamespaceExplorerPanel selection sync', () => {
  it('re-expands the selected node namespace when selection changes externally', () => {
    const nodes = [makeNode('alpha.ns', 'Trade'), makeNode('beta.ns', 'Event')];
    const props = {
      nodes,
      expandedNamespaces: new Set(nodes.map((node) => node.data.namespace)),
      hiddenNodeIds: new Set<string>(),
      onToggleNamespace: vi.fn(),
      onToggleNode: vi.fn(),
      onExpandAll: vi.fn(),
      onCollapseAll: vi.fn(),
      onSelectNode: vi.fn()
    };

    const { rerender } = render(<NamespaceExplorerPanel {...props} />);

    fireEvent.click(screen.getByTestId('ns-row-beta.ns').querySelector('button')!);
    expect(screen.queryByText('Event')).toBeNull();

    rerender(<NamespaceExplorerPanel {...props} selectedNodeId="beta.ns::Event" />);

    expect(screen.getByText('Event')).toBeTruthy();
    expect(screen.getByTestId('ns-type-beta.ns::Event')).toHaveAttribute('data-selected', 'true');
  });
});
