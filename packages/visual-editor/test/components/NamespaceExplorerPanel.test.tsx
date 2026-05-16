// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for NamespaceExplorerPanel component.
 *
 * Verifies tree rendering, expand/collapse, search filtering,
 * visibility toggles, node selection callbacks, and drag-source palette
 * behaviour (Phase 8: single-click marks drag source, double-click navigates).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NamespaceExplorerPanel } from '../../src/components/panels/NamespaceExplorerPanel.js';
import type { TypeGraphNode, AnyGraphNode } from '../../src/types.js';
import { TYPE_REF_PAYLOAD_MIME, isTypeRefPayload, typeRefMimeForKind } from '../../src/types/structure-view.js';

// Mock @tanstack/react-virtual to render all items in jsdom (no real scroll container)
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: (i: number) => number }) => {
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
  makeNode('cdm.product', 'Asset', 'Choice'),
  makeNode('cdm.trade', 'Trade')
];

function renderPanel(overrides: Partial<React.ComponentProps<typeof NamespaceExplorerPanel>> = {}) {
  const allNamespaces = new Set(defaultNodes.map((n) => n.data.namespace));
  const props = {
    nodes: defaultNodes,
    expandedNamespaces: allNamespaces,
    hiddenNodeIds: new Set<string>(),
    onToggleNamespace: vi.fn(),
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
    // 5 visible / 5 total (defaultNodes has 5 entries including cdm.trade::Trade)
    expect(screen.getByText('5/5')).toBeTruthy();
  });

  it('shows types within expanded namespaces', () => {
    renderPanel();
    // All namespaces start expanded (treeExpanded is initialized from nodes)
    // Use getAllByText since 'Trade' appears in both com.model and cdm.trade
    expect(screen.getAllByText('Trade').length).toBeGreaterThanOrEqual(1);
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

  it('single-click calls onSetDragSource immediately and does NOT navigate', () => {
    const onSetDragSource = vi.fn();
    const { props } = renderPanel({ onSetDragSource });
    const typeRow = screen.getByTestId('ns-type-com.model::Trade');

    // Click is immediate — no timer needed.
    fireEvent.click(typeRow);

    expect(onSetDragSource).toHaveBeenCalledOnce();
    const payload = onSetDragSource.mock.calls[0]![0];
    expect(isTypeRefPayload(payload)).toBe(true);
    expect(payload.typeId).toBe('com.model::Trade');
    expect(payload.typeName).toBe('Trade');
    expect(payload.namespaceUri).toBe('com.model');
    expect(payload.kind).toBe('Data');
    // onSelectNode should NOT have been called on a single click
    expect(props.onSelectNode).not.toHaveBeenCalled();
  });

  it('double-click calls onSelectNode and clears drag source when this row is the active source', () => {
    const onClearDragSource = vi.fn();
    const onSelectNode = vi.fn();
    // Render with dragSourceId matching the row so isDragSource=true.
    // fireEvent.doubleClick dispatches only a dblclick event (not preceding clicks);
    // we fire an explicit click first to mirror the real browser sequence, then
    // the dblclick to trigger handleDoubleClick. isDragSource=true (via dragSourceId
    // prop) so the handler must call onClearDragSource before navigating.
    render(
      <NamespaceExplorerPanel
        nodes={defaultNodes}
        expandedNamespaces={new Set(defaultNodes.map((n) => n.data.namespace))}
        hiddenNodeIds={new Set()}
        onToggleNamespace={vi.fn()}
        onExpandAll={vi.fn()}
        onCollapseAll={vi.fn()}
        onSelectNode={(id) => onSelectNode(id)}
        onClearDragSource={onClearDragSource}
        dragSourceId="cdm.trade::Trade"
      />
    );
    const row = screen.getByTestId('ns-type-cdm.trade::Trade');
    // Simulate click sequence: click (sets drag source) then dblclick (clears + navigates).
    fireEvent.click(row);
    fireEvent.doubleClick(row);

    // onClearDragSource must be called (row IS the active drag source)
    expect(onClearDragSource).toHaveBeenCalled();
    // Navigation must happen
    expect(onSelectNode).toHaveBeenCalledTimes(1);
  });

  it('filters types when search query entered', () => {
    renderPanel();
    const searchInput = screen.getByTestId('namespace-search');
    expect(searchInput).toHaveAttribute('placeholder', 'Filter types or namespaces...');
    fireEvent.change(searchInput, { target: { value: 'Trade' } });

    // Both Trade rows (com.model::Trade and cdm.trade::Trade) should be visible
    expect(screen.getAllByText('Trade').length).toBeGreaterThanOrEqual(1);
    // Asset should not be visible (name doesn't match 'Trade')
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
    // 2 visible (Trade, Event in com.model) / 5 total (defaultNodes now has 5)
    expect(screen.getByText('2/5')).toBeTruthy();
  });

  it('shows reduced visible count when individual nodes hidden', () => {
    const allNamespaces = new Set(defaultNodes.map((n) => n.data.namespace));
    const hidden = new Set(['com.model::Trade']);
    renderPanel({ expandedNamespaces: allNamespaces, hiddenNodeIds: hidden });
    // 4 visible / 5 total (com.model::Trade is hidden; cdm.trade::Trade is still visible)
    expect(screen.getByText('4/5')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Phase 8 — drag-source palette behaviour
  // -------------------------------------------------------------------------

  it('type rows for draggable kinds have the draggable attribute', () => {
    renderPanel();
    const tradeRow = screen.getByTestId('ns-type-com.model::Trade');
    // HTMLElement.draggable is a boolean property
    expect((tradeRow as HTMLElement).draggable).toBe(true);
  });

  it('dragstart registers canonical MIME with JSON payload and kind-specific marker MIME', () => {
    renderPanel();
    const tradeRow = screen.getByTestId('ns-type-com.model::Trade');

    // Simulate dataTransfer to capture setData calls
    const setData = vi.fn();
    const dataTransfer = { setData, effectAllowed: '' as DataTransfer['effectAllowed'] };

    fireEvent.dragStart(tradeRow, { dataTransfer });

    // Canonical MIME must be registered with a JSON payload that passes isTypeRefPayload
    const canonicalCall = setData.mock.calls.find((c: string[]) => c[0] === TYPE_REF_PAYLOAD_MIME);
    expect(canonicalCall).toBeTruthy();
    const parsed = JSON.parse(canonicalCall![1] as string);
    expect(isTypeRefPayload(parsed)).toBe(true);
    expect(parsed.typeId).toBe('com.model::Trade');
    expect(parsed.kind).toBe('Data');

    // Kind-specific marker MIME must also be registered
    const kindMime = typeRefMimeForKind('Data');
    const markerCall = setData.mock.calls.find((c: string[]) => c[0] === kindMime);
    expect(markerCall).toBeTruthy();

    // effectAllowed must be 'link' per the dual-MIME contract
    expect(dataTransfer.effectAllowed).toBe('link');
  });

  it('double-click on row B does NOT clear drag source when row A is the current source', () => {
    // Row A (com.model::Trade) is the current drag source. The user double-clicks row B
    // (cdm.trade::Trade). isDragSource=false for row B, so onClearDragSource must NOT
    // be called — the existing deliberate single-click on row A must survive.
    const onClearDragSource = vi.fn();
    const onSelectNode = vi.fn();
    render(
      <NamespaceExplorerPanel
        nodes={defaultNodes}
        expandedNamespaces={new Set(defaultNodes.map((n) => n.data.namespace))}
        hiddenNodeIds={new Set()}
        onToggleNamespace={vi.fn()}
        onExpandAll={vi.fn()}
        onCollapseAll={vi.fn()}
        onSelectNode={(id) => onSelectNode(id)}
        onClearDragSource={onClearDragSource}
        // Row A is the drag source; row B (cdm.trade::Trade) is NOT.
        dragSourceId="com.model::Trade"
      />
    );
    const rowB = screen.getByTestId('ns-type-cdm.trade::Trade');
    fireEvent.doubleClick(rowB);

    // onClearDragSource must NOT be called (row B is not the drag source)
    expect(onClearDragSource).not.toHaveBeenCalled();
    // Navigation must still happen
    expect(onSelectNode).toHaveBeenCalledTimes(1);
  });

  it('renders → arrow when dragSourceId matches the row nodeId', () => {
    renderPanel({ dragSourceId: 'com.model::Trade' });
    const arrow = screen.getByLabelText('active drag source');
    expect(arrow).toBeTruthy();
  });

  it('does NOT render → arrow when dragSourceId does not match', () => {
    renderPanel({ dragSourceId: 'com.lib::Date' });
    // Trade row should not have the arrow
    const tradeRow = screen.getByTestId('ns-type-com.model::Trade');
    expect(tradeRow.querySelector('[aria-label="active drag source"]')).toBeNull();
  });

  it('does NOT render → arrow when dragSourceId is absent', () => {
    renderPanel();
    expect(screen.queryByLabelText('active drag source')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // a11y — keyboard activation (Finding 3: react-doctor)
  // -------------------------------------------------------------------------

  it('Enter key calls onSetDragSource with correct payload (no timer delay)', () => {
    const onSetDragSource = vi.fn();
    const { props } = renderPanel({ onSetDragSource });
    const typeRow = screen.getByTestId('ns-type-com.model::Trade');
    fireEvent.keyDown(typeRow, { key: 'Enter' });
    // Keyboard activation is immediate — no 250ms deferral.
    expect(onSetDragSource).toHaveBeenCalledOnce();
    const payload = onSetDragSource.mock.calls[0]![0];
    expect(isTypeRefPayload(payload)).toBe(true);
    expect(payload.typeId).toBe('com.model::Trade');
    expect(payload.kind).toBe('Data');
    // Navigation should NOT be triggered
    expect(props.onSelectNode).not.toHaveBeenCalled();
  });

  it('Space key calls onSetDragSource with correct payload (no timer delay)', () => {
    const onSetDragSource = vi.fn();
    const { props } = renderPanel({ onSetDragSource });
    const typeRow = screen.getByTestId('ns-type-com.model::Trade');
    fireEvent.keyDown(typeRow, { key: ' ' });
    expect(onSetDragSource).toHaveBeenCalledOnce();
    const payload = onSetDragSource.mock.calls[0]![0];
    expect(payload.typeId).toBe('com.model::Trade');
    expect(props.onSelectNode).not.toHaveBeenCalled();
  });

  it('type rows have role=button and tabIndex=0 for keyboard accessibility', () => {
    renderPanel();
    const typeRow = screen.getByTestId('ns-type-com.model::Trade');
    expect(typeRow.getAttribute('role')).toBe('button');
    expect(typeRow.getAttribute('tabindex')).toBe('0');
  });

  // -------------------------------------------------------------------------
  // Non-draggable kinds (Finding 4: Copilot)
  // -------------------------------------------------------------------------

  it('Function-kind row is not draggable', () => {
    const funcNode = makeNode('cdm.func', 'MyFunc', 'RosettaFunction');
    render(
      <NamespaceExplorerPanel
        nodes={[funcNode]}
        expandedNamespaces={new Set(['cdm.func'])}
        hiddenNodeIds={new Set()}
        onToggleNamespace={vi.fn()}
        onExpandAll={vi.fn()}
        onCollapseAll={vi.fn()}
        onSelectNode={vi.fn()}
      />
    );
    const funcRow = screen.getByTestId('ns-type-cdm.func::MyFunc');
    expect((funcRow as HTMLElement).draggable).toBe(false);
  });

  it('dragstart on non-draggable Function row does not call setData', () => {
    const funcNode = makeNode('cdm.func', 'MyFunc', 'RosettaFunction');
    render(
      <NamespaceExplorerPanel
        nodes={[funcNode]}
        expandedNamespaces={new Set(['cdm.func'])}
        hiddenNodeIds={new Set()}
        onToggleNamespace={vi.fn()}
        onExpandAll={vi.fn()}
        onCollapseAll={vi.fn()}
        onSelectNode={vi.fn()}
      />
    );
    const funcRow = screen.getByTestId('ns-type-cdm.func::MyFunc');
    const setData = vi.fn();
    const dataTransfer = { setData, effectAllowed: '' as DataTransfer['effectAllowed'] };
    fireEvent.dragStart(funcRow, { dataTransfer });
    // Non-supported kind: dragstart should be suppressed, setData never called.
    expect(setData).not.toHaveBeenCalled();
  });
});
