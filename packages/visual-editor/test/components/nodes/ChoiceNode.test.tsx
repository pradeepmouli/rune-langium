// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Regression tests for ChoiceNode (PR #182 Codex review, Finding 1 & Finding 3).
 *
 * Finding 1: in structure-view context, layoutStructureGraph emits React Flow
 * nodes with `type: 'choice'` and `data: { ...n, variant: 'structure' }`.
 * ChoiceNode previously read `data.options` as StructureRow[], but the new
 * architectural fix introduces StructureChoiceArm (typeName + typeKind only —
 * no attrName, no cardinality). Arms have no name distinct from their type.
 *
 * Finding 3: the structure-variant wrapper must carry `rune-node-choice--structure`
 * so the CSS height override (`.rune-node-choice--structure .rune-node-header`)
 * resolves at all. Verified with class-name assertions since jsdom can't compute
 * layout.
 *
 * Tests here verify:
 *   1. Structure-variant ChoiceNode renders each arm's typeName.
 *   2. Each arm gets a type chip (rune-cell-type-chip).
 *   3. Arms do NOT render cardinality cells (no rune-cell-card — arms are
 *      alternatives, not attributes).
 *   4. The correct CSS class names are present for the layout SSoT.
 *   5. Graph-variant ChoiceNode (pre-existing behavior) is unaffected.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { ChoiceNode } from '../../../src/components/nodes/ChoiceNode.js';
import type { StructureChoiceArm, StructureExpansionKey, StructureRow } from '../../../src/types/structure-view.js';
import { expansionKey } from '../../../src/types/structure-view.js';

// ---------------------------------------------------------------------------
// Structure-variant fixture — mirrors shape emitted by layoutStructureGraph
// StructureChoiceArm: typeName + typeKind + optional targetNodeId. No attrName,
// no cardinality — choice arms are alternatives ("is this type"), not attributes.
// ---------------------------------------------------------------------------

const options: StructureChoiceArm[] = [
  {
    typeName: 'CashSettlement',
    typeKind: 'Data',
    targetNodeId: 'cdm.settlement::CashSettlement'
  },
  {
    typeName: 'PhysicalSettlement',
    typeKind: 'Data',
    targetNodeId: 'cdm.settlement::PhysicalSettlement'
  }
];

const structureData = {
  id: 'cdm.settlement::SettlementTerms',
  kind: 'choice',
  name: 'SettlementTerms',
  namespaceUri: 'cdm.settlement',
  options,
  expansions: new Map(),
  variant: 'structure'
};

function renderInFlow(jsx: React.ReactNode) {
  return render(<ReactFlowProvider>{jsx}</ReactFlowProvider>);
}

describe('ChoiceNode — structure variant (Finding 1)', () => {
  it('renders each arm typeName (pre-fix this would render an empty box)', () => {
    renderInFlow(
      <ChoiceNode data={structureData as any} selected={false} id="cdm.settlement::SettlementTerms" type="choice" />
    );
    expect(screen.getAllByText('CashSettlement').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('PhysicalSettlement').length).toBeGreaterThanOrEqual(1);
  });

  it('renders each arm typeName as a type chip', () => {
    renderInFlow(
      <ChoiceNode data={structureData as any} selected={false} id="cdm.settlement::SettlementTerms" type="choice" />
    );
    const chips = document.querySelectorAll('.rune-cell-type-chip');
    expect(chips.length).toBe(options.length);
  });

  it('does NOT render cardinality cells — arms are alternatives, not attributes', () => {
    renderInFlow(
      <ChoiceNode data={structureData as any} selected={false} id="cdm.settlement::SettlementTerms" type="choice" />
    );
    // rune-cell-card is only present on Data attribute rows, not on Choice arms.
    const cards = document.querySelectorAll('.rune-cell-card');
    expect(cards.length).toBe(0);
  });

  it('does NOT emit per-arm source Handles (structure variant has no edges; Finding F)', () => {
    // The structure layout emits zero edges and nodesConnectable=false; mounting
    // Handles adds wasted DOM nodes, RF handle subscriptions, and a11y noise.
    renderInFlow(
      <ChoiceNode data={structureData as any} selected={false} id="cdm.settlement::SettlementTerms" type="choice" />
    );
    expect(screen.queryByTestId('choice-arm-handle-CashSettlement')).toBeNull();
    expect(screen.queryByTestId('choice-arm-handle-PhysicalSettlement')).toBeNull();
    expect(document.querySelectorAll('[data-handlepos]').length).toBe(0);
  });

  it('does NOT fall through to graph-variant rendering (no data-summary attribute)', () => {
    const { container } = renderInFlow(
      <ChoiceNode data={structureData as any} selected={false} id="cdm.settlement::SettlementTerms" type="choice" />
    );
    // Graph variant adds data-summary to the wrapper; structure variant does not.
    expect(container.querySelector('[data-summary]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Finding 3 regression: structure-variant wrapper carries the class name that
// the CSS SSoT rule targets.
//
// The CSS fix adds `.rune-node-choice--structure .rune-node-header { height:
// var(--rune-header-height); … }` to constrain the header to HEADER_HEIGHT.
// jsdom cannot compute layout, so we can't assert a rendered pixel height.
// Instead, we assert:
//   1. The outer wrapper has class `rune-node-choice--structure` so the CSS
//      selector resolves at all.
//   2. The header element is present and carries class `rune-node-header`
//      (the child selector target).
// If the class names were changed in ChoiceNode.tsx without updating the CSS,
// these tests would catch the drift before it reached CI's visual regression.
// ---------------------------------------------------------------------------

describe('ChoiceNode — Finding 3: structure-variant CSS class names (layout SSoT)', () => {
  it('outer wrapper has rune-node-choice--structure class', () => {
    const { container } = renderInFlow(
      <ChoiceNode data={structureData as any} selected={false} id="cdm.settlement::SettlementTerms" type="choice" />
    );
    // Use querySelector — the ReactFlowProvider adds extra wrapper divs so
    // navigating via firstElementChild is not reliable.
    const wrapper = container.querySelector('.rune-node-choice--structure');
    expect(wrapper).not.toBeNull();
  });

  it('header element has rune-node-header class (CSS selector target for height override)', () => {
    const { container } = renderInFlow(
      <ChoiceNode data={structureData as any} selected={false} id="cdm.settlement::SettlementTerms" type="choice" />
    );
    const header = container.querySelector('.rune-node-choice--structure .rune-node-header');
    expect(header).not.toBeNull();
  });

  it('graph-variant wrapper does NOT have the --structure modifier (no false positive)', () => {
    const { container } = renderInFlow(
      <ChoiceNode data={graphData as any} selected={false} id="cdm.settlement::SettlementTerms" type="choice" />
    );
    const structureVariant = container.querySelector('.rune-node-choice--structure');
    expect(structureVariant).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Graph-variant — existing behavior must be unaffected
// ---------------------------------------------------------------------------

const graphData = {
  $type: 'Choice',
  id: 'cdm.settlement::SettlementTerms',
  kind: 'choice',
  name: 'SettlementTerms',
  namespace: 'cdm.settlement',
  attributes: [
    {
      name: 'cashOption',
      typeCall: { type: { $refText: 'CashSettlement' } },
      card: { inf: 0, sup: 1, unbounded: false }
    },
    {
      name: 'physicalOption',
      typeCall: { type: { $refText: 'PhysicalSettlement' } },
      card: { inf: 0, sup: 1, unbounded: false }
    }
  ]
  // No `variant` field → graph variant
};

describe('ChoiceNode — graph variant (pre-existing behavior)', () => {
  it('renders the choice name', () => {
    renderInFlow(
      <ChoiceNode data={graphData as any} selected={false} id="cdm.settlement::SettlementTerms" type="choice" />
    );
    expect(screen.getByText('SettlementTerms')).toBeInTheDocument();
  });

  it('shows member count summary', () => {
    renderInFlow(
      <ChoiceNode data={graphData as any} selected={false} id="cdm.settlement::SettlementTerms" type="choice" />
    );
    expect(screen.getByText('2 options')).toBeInTheDocument();
  });

  it('renders attribute names from data.attributes', () => {
    renderInFlow(
      <ChoiceNode data={graphData as any} selected={false} id="cdm.settlement::SettlementTerms" type="choice" />
    );
    // getTypeRefText returns the $refText, which is the display name in graph mode.
    // Use getAllByText since the same text may appear multiple times in some fixtures.
    expect(screen.getAllByText('CashSettlement').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('PhysicalSettlement').length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Phase 14e/B — Choice arm parity with Data row (chevron + TypePickerCell)
// ---------------------------------------------------------------------------

describe('ChoiceNode — structure variant — arm expansion chevron (Phase 14e/B)', () => {
  // Mixed fixture: two expandable arms (Data, Choice), three terminal arms
  // (Enum, Builtin, Unresolved). Chevron must show only for the first two.
  const mixedArms: StructureChoiceArm[] = [
    { typeName: 'CashSettlement', typeKind: 'Data', targetNodeId: 'cdm.settlement::CashSettlement' },
    { typeName: 'PhysicalSettlement', typeKind: 'Choice', targetNodeId: 'cdm.settlement::PhysicalSettlement' },
    { typeName: 'DayCount', typeKind: 'Enum', targetNodeId: 'cdm.base::DayCount' },
    { typeName: 'string', typeKind: 'Builtin' },
    { typeName: 'MissingType', typeKind: 'Unresolved' }
  ];

  function mixedData(extra?: object) {
    return {
      id: 'cdm.settlement::SettlementMethod',
      kind: 'choice',
      name: 'SettlementMethod',
      namespaceUri: 'cdm.settlement',
      options: mixedArms,
      expansions: new Map(),
      variant: 'structure',
      ...extra
    };
  }

  it('renders an expand button for Data and Choice arms; omits it for Enum / Builtin / Unresolved', () => {
    renderInFlow(
      <ChoiceNode data={mixedData() as any} selected={false} id="cdm.settlement::SettlementMethod" type="choice" />
    );
    expect(screen.getByTestId('choice-arm-expand-CashSettlement')).toBeInTheDocument(); // Data → chevron
    expect(screen.getByTestId('choice-arm-expand-PhysicalSettlement')).toBeInTheDocument(); // Choice → chevron
    expect(screen.queryByTestId('choice-arm-expand-DayCount')).toBeNull(); // Enum → no chevron
    expect(screen.queryByTestId('choice-arm-expand-string')).toBeNull(); // Builtin → no chevron
    expect(screen.queryByTestId('choice-arm-expand-MissingType')).toBeNull(); // Unresolved → no chevron
  });

  it('fires onToggleExpansion with the correct StructureExpansionKey shape on click', () => {
    const onToggle = vi.fn();
    renderInFlow(
      <ChoiceNode
        data={mixedData({ onToggleExpansion: onToggle }) as any}
        selected={false}
        id="cdm.settlement::SettlementMethod"
        type="choice"
      />
    );
    fireEvent.click(screen.getByTestId('choice-arm-expand-CashSettlement'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    const calledWith = onToggle.mock.calls[0][0] as StructureExpansionKey;
    // Arm expansion key contract: arm.typeName fills attrName slot.
    // For the root Choice (no data.instancePath), ownerInstancePath = [self id].
    expect(calledWith).toEqual({
      namespaceUri: 'cdm.settlement',
      typeId: 'SettlementMethod',
      attrName: 'CashSettlement',
      instancePath: ['cdm.settlement::SettlementMethod']
    });
  });

  it('aria-expanded mirrors the expansionMap state (collapsed → false, expanded → true)', () => {
    const key = expansionKey({
      namespaceUri: 'cdm.settlement',
      typeId: 'SettlementMethod',
      attrName: 'CashSettlement',
      instancePath: ['cdm.settlement::SettlementMethod']
    });
    const expanded = new Map<string, boolean>([[key, true]]);
    const { rerender } = renderInFlow(
      <ChoiceNode data={mixedData() as any} selected={false} id="cdm.settlement::SettlementMethod" type="choice" />
    );
    expect(screen.getByTestId('choice-arm-expand-CashSettlement')).toHaveAttribute('aria-expanded', 'false');
    rerender(
      <ReactFlowProvider>
        <ChoiceNode
          data={mixedData({ expansionMap: expanded }) as any}
          selected={false}
          id="cdm.settlement::SettlementMethod"
          type="choice"
        />
      </ReactFlowProvider>
    );
    expect(screen.getByTestId('choice-arm-expand-CashSettlement')).toHaveAttribute('aria-expanded', 'true');
  });

  it('aria-label describes the action (expand vs collapse)', () => {
    const key = expansionKey({
      namespaceUri: 'cdm.settlement',
      typeId: 'SettlementMethod',
      attrName: 'CashSettlement',
      instancePath: ['cdm.settlement::SettlementMethod']
    });
    const expanded = new Map<string, boolean>([[key, true]]);
    const { rerender } = renderInFlow(
      <ChoiceNode data={mixedData() as any} selected={false} id="cdm.settlement::SettlementMethod" type="choice" />
    );
    expect(screen.getByTestId('choice-arm-expand-CashSettlement')).toHaveAttribute(
      'aria-label',
      'Expand CashSettlement'
    );
    rerender(
      <ReactFlowProvider>
        <ChoiceNode
          data={mixedData({ expansionMap: expanded }) as any}
          selected={false}
          id="cdm.settlement::SettlementMethod"
          type="choice"
        />
      </ReactFlowProvider>
    );
    expect(screen.getByTestId('choice-arm-expand-CashSettlement')).toHaveAttribute(
      'aria-label',
      'Collapse CashSettlement'
    );
  });

  it('does not call onToggleExpansion when callback is absent (safe no-op)', () => {
    renderInFlow(
      <ChoiceNode data={mixedData() as any} selected={false} id="cdm.settlement::SettlementMethod" type="choice" />
    );
    expect(() => fireEvent.click(screen.getByTestId('choice-arm-expand-CashSettlement'))).not.toThrow();
  });
});

describe('ChoiceNode — structure variant — TypePickerCell injection on arm rows (Phase 14e/B)', () => {
  const dataArms: StructureChoiceArm[] = [
    { typeName: 'CashSettlement', typeKind: 'Data', targetNodeId: 'cdm.settlement::CashSettlement' },
    { typeName: 'string', typeKind: 'Builtin' }
  ];
  const dataWithArms = {
    id: 'cdm.settlement::SettlementMethod',
    kind: 'choice',
    name: 'SettlementMethod',
    namespaceUri: 'cdm.settlement',
    options: dataArms,
    expansions: new Map(),
    variant: 'structure'
  };

  it('renders TypePickerCell on every arm row when cellComponents.type is injected', () => {
    const TypeCellSpy = ({ typeName, attrName }: { typeName: string; attrName: string }) => (
      <span data-testid={`type-cell-${attrName}`}>{typeName}</span>
    );
    renderInFlow(
      <ChoiceNode
        data={{ ...dataWithArms, cellComponents: { type: TypeCellSpy } } as any}
        selected={false}
        id="cdm.settlement::SettlementMethod"
        type="choice"
      />
    );
    expect(screen.getByTestId('type-cell-CashSettlement')).toBeInTheDocument();
    expect(screen.getByTestId('type-cell-string')).toBeInTheDocument();
  });

  it('TypeCell receives canonical data.id (NOT the React Flow wrapper id) and the arm typeName as attrName', () => {
    const captured: Array<{ nodeId: string; attrName: string; typeKind: StructureRow['typeKind'] }> = [];
    const TypeCellSpy = ({
      nodeId,
      attrName,
      typeKind
    }: {
      nodeId: string;
      typeName: string;
      typeKind: StructureRow['typeKind'];
      attrName: string;
    }) => {
      captured.push({ nodeId, attrName, typeKind });
      return <span />;
    };
    const wrapperId = 'Trade::primary::cdm.settlement::SettlementMethod'; // RF instance id
    renderInFlow(
      <ChoiceNode
        data={{ ...dataWithArms, cellComponents: { type: TypeCellSpy } } as any}
        selected={false}
        id={wrapperId}
        type="choice"
      />
    );
    expect(captured).toHaveLength(2);
    for (const c of captured) {
      // Canonical id is the data.id, never the wrapper id.
      expect(c.nodeId).toBe('cdm.settlement::SettlementMethod');
      expect(c.nodeId).not.toBe(wrapperId);
    }
    // typeKind round-trips: Builtin arm reads as BasicType for the cell.
    const stringArm = captured.find((c) => c.attrName === 'string');
    expect(stringArm?.typeKind).toBe('BasicType');
    const dataArm = captured.find((c) => c.attrName === 'CashSettlement');
    expect(dataArm?.typeKind).toBe('Data');
  });

  it('falls back to the type chip when cellComponents.type is absent', () => {
    renderInFlow(
      <ChoiceNode data={dataWithArms as any} selected={false} id="cdm.settlement::SettlementMethod" type="choice" />
    );
    const chips = document.querySelectorAll('.rune-cell-type-chip');
    expect(chips.length).toBe(dataArms.length);
  });
});

// ---------------------------------------------------------------------------
// Phase 14e/B — Codex P2 silent-drop regression (PR #196)
//
// When TypePickerCell is injected as cellComponents.type on ChoiceNode,
// the cell must receive:
//   - nodeId  = canonical Choice node id (data.id), NOT the React Flow wrapper id
//   - attrName = arm.typeName  (= the arm's current typeCall.$refText)
//
// The store's updateAttributeType action (after the fix) uses these to locate
// and update the correct choiceOptions arm. This test asserts that ChoiceNode
// passes the correct props to the injected cell — the store-level fix is covered
// by editor-store-actions.test.ts.
// ---------------------------------------------------------------------------

describe('ChoiceNode — structure variant — TypePickerCell receives choiceId + armTypeName (Codex P2 regression)', () => {
  const arms: StructureChoiceArm[] = [
    { typeName: 'CashPayment', typeKind: 'Data', targetNodeId: 'payment::CashPayment' },
    { typeName: 'BankTransfer', typeKind: 'Data', targetNodeId: 'payment::BankTransfer' }
  ];

  const choiceNodeData = {
    id: 'payment::PaymentMethod',
    kind: 'choice',
    name: 'PaymentMethod',
    namespaceUri: 'payment',
    options: arms,
    expansions: new Map(),
    variant: 'structure'
  };

  it('passes canonical choiceId (data.id) and arm.typeName as attrName to each injected TypeCell', () => {
    const captured: Array<{ nodeId: string; attrName: string }> = [];
    const TypeCellSpy = ({
      nodeId,
      attrName
    }: {
      typeName: string;
      typeKind: StructureRow['typeKind'];
      nodeId: string;
      attrName: string;
    }) => {
      captured.push({ nodeId, attrName });
      return <span data-testid={`type-cell-${attrName}`} />;
    };

    const wrapperId = 'wrapper::instance::payment::PaymentMethod'; // React Flow wraps canonical id
    renderInFlow(
      <ChoiceNode
        data={{ ...choiceNodeData, cellComponents: { type: TypeCellSpy } } as any}
        selected={false}
        id={wrapperId}
        type="choice"
      />
    );

    expect(captured).toHaveLength(arms.length);

    // Every arm must use data.id (canonical), not the RF wrapper id.
    for (const c of captured) {
      expect(c.nodeId).toBe('payment::PaymentMethod');
      expect(c.nodeId).not.toBe(wrapperId);
    }

    // attrName must equal the arm's typeName — this is the key the store uses
    // to find and update the correct choiceOptions arm.
    const cashCapture = captured.find((c) => c.attrName === 'CashPayment');
    expect(cashCapture).toBeDefined();
    const bankCapture = captured.find((c) => c.attrName === 'BankTransfer');
    expect(bankCapture).toBeDefined();
  });
});
