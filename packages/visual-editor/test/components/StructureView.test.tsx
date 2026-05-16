// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for the StructureView component (Phase 7).
 *
 * Task 7.1 — empty-state renders when focusedTypeId is undefined.
 * Task 7.2 — adapter + layout integration: expansion map controls visibility.
 * PR #182 Finding 2 — unsupported-root state for non-Data and stale selections.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StructureView } from '../../src/components/StructureView.js';
import type { AdapterDocument } from '../../src/adapters/structure-graph-adapter.js';
import { expansionKey } from '../../src/types/structure-view.js';

// -----------------------------------------------------------------------
// Task 7.1 — empty-state
// -----------------------------------------------------------------------

describe('StructureView — empty state', () => {
  it('renders empty-state when focusedTypeId is undefined', () => {
    render(<StructureView focusedTypeId={undefined} adapterDoc={undefined} />);
    expect(screen.getByTestId('structure-empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('structure-empty-state')).toHaveTextContent(
      'Select a type from the Namespace Explorer to view its structure.'
    );
  });

  it('renders empty-state when adapterDoc is undefined even with a focusedTypeId', () => {
    render(<StructureView focusedTypeId="cdm.trade::Trade" adapterDoc={undefined} />);
    expect(screen.getByTestId('structure-empty-state')).toBeInTheDocument();
  });

  it('renders empty-state when focusedTypeId is undefined even with an adapterDoc', () => {
    const doc: AdapterDocument = {
      namespaces: [{ uri: 'cdm.trade' }],
      nodes: []
    };
    render(<StructureView focusedTypeId={undefined} adapterDoc={doc} />);
    expect(screen.getByTestId('structure-empty-state')).toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------
// Task 7.2 — adapter + layout integration
// -----------------------------------------------------------------------

/**
 * Fixture: Trade with an economics: Economics attribute.
 * Uses canonical cardinality shape { inf, sup?, unbounded }.
 */
const tradeDoc: AdapterDocument = {
  namespaces: [{ uri: 'cdm.trade' }],
  nodes: [
    {
      id: 'cdm.trade::Economics',
      $type: 'Data' as const,
      name: 'Economics',
      namespace: 'cdm.trade',
      attributes: [
        {
          name: 'notional',
          typeCall: { type: { $refText: 'number' } },
          card: { inf: 0, sup: 1, unbounded: false }
        }
      ]
    },
    {
      id: 'cdm.trade::Trade',
      $type: 'Data' as const,
      name: 'Trade',
      namespace: 'cdm.trade',
      attributes: [
        {
          name: 'tradeDate',
          typeCall: { type: { $refText: 'date' } },
          card: { inf: 0, sup: 1, unbounded: false }
        },
        {
          name: 'economics',
          typeCall: { type: { $refText: 'Economics' } },
          card: { inf: 0, unbounded: false }
        }
      ]
    }
  ]
};

/**
 * Mock ReactFlow to avoid jsdom layout measurement failures.
 * The mock renders each node's data-id so we can assert which nodes are present
 * without requiring full browser geometry.
 */
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    ReactFlow: ({ nodes }: { nodes: Array<{ id: string }> }) => (
      <div data-testid="mock-react-flow">
        {nodes.map((n) => (
          <div key={n.id} data-testid={`rf-node-${n.id}`} data-node-id={n.id} />
        ))}
      </div>
    ),
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
  };
});

// -----------------------------------------------------------------------
// PR #182 Finding 2 — unsupported-root state
//
// When focusedTypeId points at a non-Data node (Choice/Enum) or a node that
// no longer exists in adapterDoc, StructureView must render a clear message
// with data-testid="structure-unsupported-root-state" and NOT mount ReactFlow.
// -----------------------------------------------------------------------

describe('StructureView — unsupported root state (Finding 2)', () => {
  it('renders unsupported-root when focusedTypeId resolves to a Choice in adapterDoc', () => {
    const docWithChoice: AdapterDocument = {
      namespaces: [{ uri: 'cdm.settlement' }],
      nodes: [
        {
          id: 'cdm.settlement::SettlementTerms',
          $type: 'Choice' as const,
          name: 'SettlementTerms',
          namespace: 'cdm.settlement',
          attributes: []
        }
      ]
    };
    render(<StructureView focusedTypeId="cdm.settlement::SettlementTerms" adapterDoc={docWithChoice} />);
    expect(screen.getByTestId('structure-unsupported-root-state')).toBeInTheDocument();
    // ReactFlow must NOT be mounted.
    expect(screen.queryByTestId('mock-react-flow')).toBeNull();
    // The existing empty-state should NOT appear.
    expect(screen.queryByTestId('structure-empty-state')).toBeNull();
  });

  it('renders unsupported-root when focusedTypeId resolves to an Enum in adapterDoc', () => {
    const docWithEnum: AdapterDocument = {
      namespaces: [{ uri: 'cdm.base' }],
      nodes: [
        {
          id: 'cdm.base::DayCountFraction',
          $type: 'Enum' as const,
          name: 'DayCountFraction',
          namespace: 'cdm.base',
          values: [{ name: 'ACT_360' }]
        }
      ]
    };
    render(<StructureView focusedTypeId="cdm.base::DayCountFraction" adapterDoc={docWithEnum} />);
    expect(screen.getByTestId('structure-unsupported-root-state')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-react-flow')).toBeNull();
  });

  it('renders unsupported-root when focusedTypeId does not exist in adapterDoc (stale selection)', () => {
    const docWithoutStaleNode: AdapterDocument = {
      namespaces: [{ uri: 'cdm.trade' }],
      nodes: [
        {
          id: 'cdm.trade::Trade',
          $type: 'Data' as const,
          name: 'Trade',
          namespace: 'cdm.trade',
          attributes: []
        }
      ]
    };
    render(<StructureView focusedTypeId="cdm.trade::DeletedType" adapterDoc={docWithoutStaleNode} />);
    expect(screen.getByTestId('structure-unsupported-root-state')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-react-flow')).toBeNull();
  });

  it('does NOT render unsupported-root for a valid Data selection', () => {
    render(<StructureView focusedTypeId="cdm.trade::Trade" adapterDoc={tradeDoc} />);
    expect(screen.queryByTestId('structure-unsupported-root-state')).toBeNull();
    expect(screen.getByTestId('mock-react-flow')).toBeInTheDocument();
  });
});

describe('StructureView — adapter + layout integration', () => {
  it('renders Trade node; Economics node absent when not expanded', () => {
    render(<StructureView focusedTypeId="cdm.trade::Trade" adapterDoc={tradeDoc} expansionMap={new Map()} />);

    // Flow container should be present (not empty state)
    expect(screen.queryByTestId('structure-empty-state')).toBeNull();
    expect(screen.getByTestId('mock-react-flow')).toBeInTheDocument();

    // The Trade root node should be present
    const tradeNode = screen.queryByTestId('rf-node-cdm.trade::Trade');
    expect(tradeNode).toBeInTheDocument();

    // Economics should NOT appear since expansion map is empty
    const economicsNode = screen.queryByTestId('rf-node-cdm.trade::Economics');
    expect(economicsNode).toBeNull();
  });

  it('renders Economics node when expansion map marks it as expanded', () => {
    const key = expansionKey({
      namespaceUri: 'cdm.trade',
      typeId: 'Trade',
      attrName: 'economics'
    });
    const expansionMap = new Map([[key, true]]);

    render(<StructureView focusedTypeId="cdm.trade::Trade" adapterDoc={tradeDoc} expansionMap={expansionMap} />);

    expect(screen.queryByTestId('structure-empty-state')).toBeNull();
    // Economics node should now be present in the layout output
    const economicsNode = screen.queryByTestId('rf-node-cdm.trade::Economics');
    expect(economicsNode).toBeInTheDocument();
  });
});
