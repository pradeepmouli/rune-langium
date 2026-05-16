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

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { ChoiceNode } from '../../../src/components/nodes/ChoiceNode.js';
import type { StructureChoiceArm } from '../../../src/types/structure-view.js';

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

  it('renders a row handle per arm (keyed by typeName)', () => {
    renderInFlow(
      <ChoiceNode data={structureData as any} selected={false} id="cdm.settlement::SettlementTerms" type="choice" />
    );
    expect(screen.getByTestId('choice-arm-handle-CashSettlement')).toBeInTheDocument();
    expect(screen.getByTestId('choice-arm-handle-PhysicalSettlement')).toBeInTheDocument();
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
