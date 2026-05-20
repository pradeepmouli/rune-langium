// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for NamespaceExplorerPanel component.
 *
 * Verifies tree rendering, expand/collapse, search filtering,
 * visibility toggles, node selection callbacks, and drag-source palette
 * behaviour.
 *
 * Phase 13 amend: row body is single-purpose (drag-source mark only);
 * navigation moved to a dedicated chevron-right nav button per finding 4.
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

  // -------------------------------------------------------------------------
  // Row click model (post-iteration): the only click-actionable element in
  // the row is the navigate arrow on the right. The row body and the type
  // name are NOT click targets — the only operations on the row are HTML5
  // drag (to add the type as a ref) and Enter/Space (which delegates to the
  // navigate action for keyboard parity with the arrow click). The earlier
  // "click-to-mark-as-drag-source" semantic and the "click-on-name-to-
  // navigate" semantic were both removed because the user reported them
  // as confusing — every visual affordance in the row now points at "drag
  // or click the arrow", nothing else.
  // -------------------------------------------------------------------------

  it('single-click on the row body is a no-op (drag-source-mark removed)', () => {
    const onSetDragSource = vi.fn();
    const { props } = renderPanel({ onSetDragSource });
    const typeRow = screen.getByTestId('ns-type-com.model::Trade');

    fireEvent.click(typeRow);

    expect(onSetDragSource).not.toHaveBeenCalled();
    expect(props.onSelectNode).not.toHaveBeenCalled();
  });

  it('click on nav button calls onSelectNode', () => {
    const { props } = renderPanel();
    const navBtn = screen.getByTestId('ns-type-nav-com.model::Trade');

    fireEvent.click(navBtn);

    expect(props.onSelectNode).toHaveBeenCalledOnce();
  });

  it('nav click triggers the just-navigated CSS pulse on the row', () => {
    // Navigation feedback: clicking the arrow flashes the row briefly so
    // the user knows their click registered before focus moves to the
    // navigated target. The pulse is a CSS animation keyed by the
    // `studio-type-row--just-navigated` class, toggled by a useState +
    // 500ms setTimeout in TypeItemRow.
    const { props } = renderPanel();
    const navBtn = screen.getByTestId('ns-type-nav-com.model::Trade');
    const typeRow = screen.getByTestId('ns-type-com.model::Trade');

    fireEvent.click(navBtn);

    expect(props.onSelectNode).toHaveBeenCalledOnce();
    expect(typeRow.className).toContain('studio-type-row--just-navigated');
  });

  it('keyboard activate nav button (Enter) calls onSelectNode', async () => {
    const { props } = renderPanel();
    const navBtn = screen.getByTestId('ns-type-nav-com.model::Trade');

    // Tab to focus the nav button and press Enter
    navBtn.focus();
    fireEvent.keyDown(navBtn, { key: 'Enter' });
    // Native <button> dispatches click on Enter — simulate that
    fireEvent.click(navBtn);

    expect(props.onSelectNode).toHaveBeenCalledOnce();
  });

  it('Enter on nav button does NOT bubble to row keydown (no double-fire)', () => {
    // Codex P2 regression: previously the nav button's keydown bubbled to
    // the row's onKeyDown handler, AND the native button click activation
    // also fired — one keystroke triggered onSelectNode twice (once via
    // bubble, once via click). handleNavKeyDown's stopPropagation prevents
    // that, so the count stays exactly 1.
    const { props } = renderPanel();
    const navBtn = screen.getByTestId('ns-type-nav-com.model::Trade');

    navBtn.focus();
    fireEvent.keyDown(navBtn, { key: 'Enter' });
    fireEvent.click(navBtn); // native button click on Enter

    expect(props.onSelectNode).toHaveBeenCalledOnce();
  });

  it('Space on nav button does NOT bubble to row keydown', () => {
    const { props } = renderPanel();
    const navBtn = screen.getByTestId('ns-type-nav-com.model::Trade');

    navBtn.focus();
    fireEvent.keyDown(navBtn, { key: ' ' });
    fireEvent.click(navBtn);

    // One activation = one onSelectNode call (no double-fire from keydown
    // bubbling to the row's onKeyDown AND the button's native click).
    expect(props.onSelectNode).toHaveBeenCalledOnce();
  });

  it('nav button is present for all type rows', () => {
    renderPanel();
    // Each type row in defaultNodes should have a corresponding nav button
    for (const node of defaultNodes) {
      expect(screen.getByTestId(`ns-type-nav-${node.id}`)).toBeTruthy();
    }
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

  // -------------------------------------------------------------------------
  // a11y — row body is NOT a button (PR #210 P2 review)
  //
  // The row body advertises no button semantics — no `role`, no `tabIndex`,
  // no Enter/Space activation. The nav-arrow `<button>` embedded in the row
  // is the sole interactive control; it is independently keyboard-focusable
  // (tabIndex=0, descriptive aria-label) and handles the navigate action.
  // Keeping keyboard activation on the row while removing mouse activation
  // would have given AT users a phantom action sighted users can't trigger.
  // -------------------------------------------------------------------------

  it('row body has no button role and is not in the tab order', () => {
    renderPanel();
    const typeRow = screen.getByTestId('ns-type-com.model::Trade');
    expect(typeRow.getAttribute('role')).toBeNull();
    expect(typeRow.getAttribute('tabindex')).toBeNull();
  });

  it('Enter key on row body does NOT fire onSelectNode (no button semantics)', () => {
    const { props } = renderPanel();
    const typeRow = screen.getByTestId('ns-type-com.model::Trade');
    fireEvent.keyDown(typeRow, { key: 'Enter' });
    expect(props.onSelectNode).not.toHaveBeenCalled();
  });

  it('Space key on row body does NOT fire onSelectNode (no button semantics)', () => {
    const { props } = renderPanel();
    const typeRow = screen.getByTestId('ns-type-com.model::Trade');
    fireEvent.keyDown(typeRow, { key: ' ' });
    expect(props.onSelectNode).not.toHaveBeenCalled();
  });

  it('nav button has independent tabIndex=0 (keyboard-focusable)', () => {
    renderPanel();
    const navBtn = screen.getByTestId('ns-type-nav-com.model::Trade');
    expect(navBtn.getAttribute('tabindex')).toBe('0');
  });

  it('nav button has descriptive aria-label', () => {
    renderPanel();
    const navBtn = screen.getByTestId('ns-type-nav-com.model::Trade');
    expect(navBtn.getAttribute('aria-label')).toBe('Navigate to Trade');
  });

  it('non-activation keys on row body (e.g. ArrowDown) do not fire any callback', () => {
    const onSetDragSource = vi.fn();
    const { props } = renderPanel({ onSetDragSource });
    const typeRow = screen.getByTestId('ns-type-com.model::Trade');
    fireEvent.keyDown(typeRow, { key: 'ArrowDown' });
    expect(props.onSelectNode).not.toHaveBeenCalled();
    expect(onSetDragSource).not.toHaveBeenCalled();
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
