// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for NamespaceExplorerPanel component.
 *
 * Verifies tree rendering, expand/collapse, search filtering,
 * visibility toggles, and node selection callbacks.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NamespaceExplorerPanel } from '../../src/components/panels/NamespaceExplorerPanel.js';
import type { TypeGraphNode, AnyGraphNode, TypeKind } from '../../src/types.js';

// Mock @tanstack/react-virtual to render all items in jsdom (no real scroll container)
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

function makeNode(ns: string, name: string, astType: string = 'Data'): TypeGraphNode {
  const nodeTypeMap: Record<string, string> = {
    Data: 'data',
    Choice: 'choice',
    RosettaEnumeration: 'enum',
    RosettaFunction: 'func'
  };
  return {
    id: `${ns}::${name}`,
    type: nodeTypeMap[astType] ?? 'data',
    position: { x: 0, y: 0 },
    data: {
      $type: astType,
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

const defaultNodes = [
  makeNode('com.model', 'Trade'),
  makeNode('com.model', 'Event'),
  makeNode('com.lib', 'Date'),
  makeNode('cdm.product', 'Asset', 'Choice')
];

function renderPanel(overrides: Partial<React.ComponentProps<typeof NamespaceExplorerPanel>> = {}) {
  const allNamespaces = new Set(defaultNodes.map((n) => n.data.namespace));
  const props = {
    nodes: defaultNodes,
    expandedNamespaces: allNamespaces,
    hiddenNodeIds: new Set<string>(),
    onToggleNamespace: vi.fn(),
    onToggleNode: vi.fn(),
    onExpandAll: vi.fn(),
    onCollapseAll: vi.fn(),
    onSelectNode: vi.fn(),
    ...overrides
  };
  return { ...render(<NamespaceExplorerPanel {...props} />), props };
}

describe('NamespaceExplorerPanel', () => {
  it('renders the explorer container', () => {
    renderPanel();
    expect(screen.getByTestId('namespace-explorer')).toBeTruthy();
    expect(screen.getByText('Type explorer')).toBeTruthy();
    expect(screen.getByText('Browse namespaces and types in the active source.')).toBeTruthy();
  });

  it('renders all namespaces', () => {
    renderPanel();
    expect(screen.getByTestId('ns-row-com.model')).toBeTruthy();
    expect(screen.getByTestId('ns-row-com.lib')).toBeTruthy();
    expect(screen.getByTestId('ns-row-cdm.product')).toBeTruthy();
  });

  it('shows total type count in header badge', () => {
    renderPanel();
    // 4 visible / 4 total
    expect(screen.getByText('4/4')).toBeTruthy();
  });

  it('shows types within expanded namespaces', () => {
    renderPanel();
    // All namespaces start expanded (treeExpanded is initialized from nodes)
    expect(screen.getByText('Trade')).toBeTruthy();
    expect(screen.getByText('Event')).toBeTruthy();
    expect(screen.getByText('Date')).toBeTruthy();
    expect(screen.getByText('Asset')).toBeTruthy();
  });

  it('shows empty state when no nodes', () => {
    renderPanel({ nodes: [] });
    expect(screen.getByText('No types loaded')).toBeTruthy();
  });

  it('calls onExpandAll when expand-all button clicked', () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByTestId('expand-all'));
    expect(props.onExpandAll).toHaveBeenCalledOnce();
  });

  it('calls onCollapseAll when collapse-all button clicked', () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByTestId('collapse-all'));
    expect(props.onCollapseAll).toHaveBeenCalledOnce();
  });

  it('calls onToggleNode when type visibility toggled', () => {
    const { props } = renderPanel();
    const toggleBtn = screen.getByTestId('ns-type-com.model::Trade').querySelector('button');
    expect(toggleBtn).toBeTruthy();
    fireEvent.click(toggleBtn!);
    expect(props.onToggleNode).toHaveBeenCalledWith('com.model::Trade');
  });

  it('calls onSelectNode when type name clicked', () => {
    const { props } = renderPanel();
    const typeRow = screen.getByTestId('ns-type-com.model::Trade');
    const nameSpan = typeRow.querySelector('span.truncate');
    expect(nameSpan).toBeTruthy();
    fireEvent.click(nameSpan!);
    expect(props.onSelectNode).toHaveBeenCalledWith('com.model::Trade');
  });

  it('filters types when search query entered', () => {
    renderPanel();
    const searchInput = screen.getByTestId('namespace-search');
    expect(searchInput).toHaveAttribute('placeholder', 'Filter types or namespaces...');
    fireEvent.change(searchInput, { target: { value: 'Trade' } });

    // Trade should be visible
    expect(screen.getByText('Trade')).toBeTruthy();
    // Asset should not be visible (different namespace, name doesn't match)
    expect(screen.queryByText('Asset')).toBeNull();
  });

  it('shows "No matching types or namespaces" when search has no results', () => {
    renderPanel();
    const searchInput = screen.getByTestId('namespace-search');
    fireEvent.change(searchInput, { target: { value: 'zzzznonexistent' } });
    expect(screen.getByText('No matching types or namespaces')).toBeTruthy();
  });

  it('highlights selected node', () => {
    renderPanel({ selectedNodeId: 'com.model::Trade' });
    const typeRow = screen.getByTestId('ns-type-com.model::Trade');
    expect(typeRow.className).toContain('bg-accent');
  });

  it('shows reduced visible count when namespaces hidden', () => {
    // Only com.model is expanded, others hidden
    const expanded = new Set(['com.model']);
    renderPanel({ expandedNamespaces: expanded });
    // 2 visible (Trade, Event in com.model) / 4 total
    expect(screen.getByText('2/4')).toBeTruthy();
  });

  it('shows reduced visible count when individual nodes hidden', () => {
    const allNamespaces = new Set(defaultNodes.map((n) => n.data.namespace));
    const hidden = new Set(['com.model::Trade']);
    renderPanel({ expandedNamespaces: allNamespaces, hiddenNodeIds: hidden });
    // 3 visible / 4 total (Trade is hidden)
    expect(screen.getByText('3/4')).toBeTruthy();
  });
});
