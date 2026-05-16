// SPDX-License-Identifier: MIT

/**
 * Regression tests for ChoiceNode (PR #182 Codex review, Finding 1).
 *
 * Finding: in structure-view context, layoutStructureGraph emits React Flow
 * nodes with `type: 'choice'` and `data: { ...n, variant: 'structure' }`, but
 * ChoiceNode was reading `data.attributes` while StructureChoiceNode carries
 * its arms on `data.options`. The pre-fix code rendered an empty box.
 *
 * Tests here verify:
 *   1. Structure-variant ChoiceNode renders each option's attrName.
 *   2. Graph-variant ChoiceNode (pre-existing behavior) still renders correctly.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { ChoiceNode } from '../../../src/components/nodes/ChoiceNode.js';
import type { StructureRow } from '../../../src/types/structure-view.js';

// ---------------------------------------------------------------------------
// Structure-variant fixture — mirrors shape emitted by layoutStructureGraph
// ---------------------------------------------------------------------------

const options: StructureRow[] = [
  {
    attrName: 'CashSettlement',
    typeName: 'CashSettlement',
    typeKind: 'Data',
    cardinality: '0..1',
    isOptional: true,
    isInherited: false
  },
  {
    attrName: 'PhysicalSettlement',
    typeName: 'PhysicalSettlement',
    typeKind: 'Data',
    cardinality: '0..1',
    isOptional: true,
    isInherited: false
  }
];

const structureData = {
  id: 'cdm.settlement::SettlementTerms',
  kind: 'choice',
  name: 'SettlementTerms',
  namespaceUri: 'cdm.settlement',
  options,
  variant: 'structure'
};

function renderInFlow(jsx: React.ReactNode) {
  return render(<ReactFlowProvider>{jsx}</ReactFlowProvider>);
}

describe('ChoiceNode — structure variant (Finding 1)', () => {
  it('renders each option attrName (pre-fix this would render an empty box)', () => {
    renderInFlow(
      <ChoiceNode data={structureData as any} selected={false} id="cdm.settlement::SettlementTerms" type="choice" />
    );
    // attrName appears in both .rune-cell-name and .rune-cell-type-chip in this
    // fixture (attrName === typeName), so getAllByText is correct here.
    expect(screen.getAllByText('CashSettlement').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('PhysicalSettlement').length).toBeGreaterThanOrEqual(1);
  });

  it('renders each option typeName as a type chip', () => {
    renderInFlow(
      <ChoiceNode data={structureData as any} selected={false} id="cdm.settlement::SettlementTerms" type="choice" />
    );
    // typeName for both options is the same as attrName in this fixture —
    // confirm at least one type-chip element is rendered per row.
    const chips = document.querySelectorAll('.rune-cell-type-chip');
    expect(chips.length).toBe(options.length);
  });

  it('renders each option cardinality', () => {
    renderInFlow(
      <ChoiceNode data={structureData as any} selected={false} id="cdm.settlement::SettlementTerms" type="choice" />
    );
    const cards = document.querySelectorAll('.rune-cell-card');
    expect(cards.length).toBe(options.length);
    expect(cards[0]).toHaveTextContent('0..1');
  });

  it('renders a row handle per option', () => {
    renderInFlow(
      <ChoiceNode data={structureData as any} selected={false} id="cdm.settlement::SettlementTerms" type="choice" />
    );
    expect(screen.getByTestId('choice-row-handle-CashSettlement')).toBeInTheDocument();
    expect(screen.getByTestId('choice-row-handle-PhysicalSettlement')).toBeInTheDocument();
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
