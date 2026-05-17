// SPDX-License-Identifier: MIT

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { DataNode } from '../../../src/components/nodes/DataNode.js';
import type { StructureExpansionKey, StructureRow } from '../../../src/types/structure-view.js';
import { expansionKey } from '../../../src/types/structure-view.js';

// Canonical StructureRow shape as emitted by layoutStructureGraph
const rows: StructureRow[] = [
  {
    attrName: 'tradeDate',
    typeName: 'date',
    typeKind: 'BasicType',
    cardinality: '0..1',
    isOptional: true,
    isInherited: false
  },
  {
    attrName: 'economics',
    typeName: 'Economics',
    typeKind: 'Data',
    cardinality: '0..*',
    isOptional: true,
    isInherited: false
  }
];

const data = {
  $type: 'Data',
  id: 'Trade',
  kind: 'data',
  name: 'Trade',
  namespaceUri: 'test.ns',
  rows,
  expansions: new Map(),
  variant: 'structure'
};

function renderInFlow(jsx: React.ReactNode) {
  return render(<ReactFlowProvider>{jsx}</ReactFlowProvider>);
}

describe('DataNode — structure variant', () => {
  it('renders a children-slot region next to rows', () => {
    renderInFlow(<DataNode data={data as any} selected={false} id="Trade" type="data" />);
    expect(screen.getByTestId('data-node-children')).toBeInTheDocument();
  });

  it('emits a per-row source Handle for each member', () => {
    renderInFlow(<DataNode data={data as any} selected={false} id="Trade" type="data" />);
    expect(screen.getByTestId('row-handle-tradeDate')).toBeInTheDocument();
    expect(screen.getByTestId('row-handle-economics')).toBeInTheDocument();
  });

  it('renders injected cell components when provided in data.cellComponents', () => {
    const Custom = ({ value }: { value: string }) => <em data-testid="custom-cell">{value}</em>;
    const data2 = {
      ...data,
      cellComponents: {
        name: ({ value, nodeId: _n, attrName: _a }: { value: string; nodeId: string; attrName: string }) => (
          <Custom value={value} />
        )
      }
    };
    renderInFlow(<DataNode data={data2 as any} selected={false} id="Trade" type="data" />);
    const cells = screen.getAllByTestId('custom-cell');
    expect(cells.length).toBeGreaterThan(0);
    expect(cells[0]).toHaveTextContent('tradeDate');
  });
});

// ---------------------------------------------------------------------------
// Finding 1 (spec 020 Phase 13) — row-level expand/collapse control
// ---------------------------------------------------------------------------

describe('DataNode — structure variant — row expansion control (Finding 1)', () => {
  // Mixed fixture: one expandable Data row, one terminal BasicType row,
  // one Choice row (expandable), one Enum row (NOT expandable).
  const mixedRows: StructureRow[] = [
    {
      attrName: 'tradeDate',
      typeName: 'date',
      typeKind: 'BasicType',
      cardinality: '0..1',
      isOptional: true,
      isInherited: false
    },
    {
      attrName: 'economics',
      typeName: 'Economics',
      typeKind: 'Data',
      cardinality: '0..*',
      isOptional: true,
      isInherited: false
    },
    {
      attrName: 'settlementTerms',
      typeName: 'SettlementTerms',
      typeKind: 'Choice',
      cardinality: '1..1',
      isOptional: false,
      isInherited: false
    },
    {
      attrName: 'currency',
      typeName: 'CurrencyCode',
      typeKind: 'Enum',
      cardinality: '1..1',
      isOptional: false,
      isInherited: false
    },
    {
      attrName: 'broken',
      typeName: 'MissingType',
      typeKind: 'Unresolved',
      cardinality: '0..1',
      isOptional: true,
      isInherited: false
    }
  ];

  function mixedData(extra?: object) {
    return {
      $type: 'Data',
      id: 'cdm.trade::Trade',
      kind: 'data',
      name: 'Trade',
      namespaceUri: 'cdm.trade',
      rows: mixedRows,
      expansions: new Map(),
      variant: 'structure',
      ...extra
    };
  }

  it('renders an expand button for Data and Choice rows, omits it for BasicType / Enum / Unresolved', () => {
    renderInFlow(<DataNode data={mixedData() as any} selected={false} id="cdm.trade::Trade" type="data" />);
    expect(screen.getByTestId('expand-row-economics')).toBeInTheDocument(); // Data → button
    expect(screen.getByTestId('expand-row-settlementTerms')).toBeInTheDocument(); // Choice → button
    expect(screen.queryByTestId('expand-row-tradeDate')).toBeNull(); // BasicType → no button
    expect(screen.queryByTestId('expand-row-currency')).toBeNull(); // Enum → no button
    expect(screen.queryByTestId('expand-row-broken')).toBeNull(); // Unresolved → no button
  });

  it('fires onToggleExpansion with the correct StructureExpansionKey shape on click', () => {
    const onToggle = vi.fn();
    renderInFlow(
      <DataNode
        data={mixedData({ onToggleExpansion: onToggle }) as any}
        selected={false}
        id="cdm.trade::Trade"
        type="data"
      />
    );
    fireEvent.click(screen.getByTestId('expand-row-economics'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    const calledWith = onToggle.mock.calls[0][0] as StructureExpansionKey;
    // typeId is the bare type name (matches adapter shouldExpand contract);
    // namespaceUri matches the owner node's namespace.
    expect(calledWith).toEqual({
      namespaceUri: 'cdm.trade',
      typeId: 'Trade',
      attrName: 'economics'
    });
  });

  it('aria-expanded mirrors the expansionMap state (collapsed → false, expanded → true)', () => {
    const key = expansionKey({ namespaceUri: 'cdm.trade', typeId: 'Trade', attrName: 'economics' });
    const expanded = new Map<string, boolean>([[key, true]]);
    const { rerender } = renderInFlow(
      <DataNode data={mixedData() as any} selected={false} id="cdm.trade::Trade" type="data" />
    );
    expect(screen.getByTestId('expand-row-economics')).toHaveAttribute('aria-expanded', 'false');

    rerender(
      <ReactFlowProvider>
        <DataNode
          data={mixedData({ expansionMap: expanded }) as any}
          selected={false}
          id="cdm.trade::Trade"
          type="data"
        />
      </ReactFlowProvider>
    );
    expect(screen.getByTestId('expand-row-economics')).toHaveAttribute('aria-expanded', 'true');
  });

  it('aria-label describes the action (expand vs collapse) for AT users', () => {
    const key = expansionKey({ namespaceUri: 'cdm.trade', typeId: 'Trade', attrName: 'economics' });
    const expanded = new Map<string, boolean>([[key, true]]);
    const { rerender } = renderInFlow(
      <DataNode data={mixedData() as any} selected={false} id="cdm.trade::Trade" type="data" />
    );
    expect(screen.getByTestId('expand-row-economics')).toHaveAttribute('aria-label', 'Expand economics');
    rerender(
      <ReactFlowProvider>
        <DataNode
          data={mixedData({ expansionMap: expanded }) as any}
          selected={false}
          id="cdm.trade::Trade"
          type="data"
        />
      </ReactFlowProvider>
    );
    expect(screen.getByTestId('expand-row-economics')).toHaveAttribute('aria-label', 'Collapse economics');
  });

  it('does not call onToggleExpansion when callback is absent (safe no-op)', () => {
    // No onToggleExpansion in data — clicking the button must not throw.
    renderInFlow(<DataNode data={mixedData() as any} selected={false} id="cdm.trade::Trade" type="data" />);
    expect(() => fireEvent.click(screen.getByTestId('expand-row-economics'))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Regression — Codex P2 Finding 1: cells must receive data.id (canonical),
// not React Flow's wrapper id (which encodes per-edge instance paths).
//
// After Phase 13 / Option A, expanded children have React Flow ids like
// `Root::buyer::Party` while data.id is still the canonical `Party`. All
// store actions look up nodes by canonical id; forwarding the wrapper id
// causes silent no-ops for every edit inside a nested expanded row.
// ---------------------------------------------------------------------------

describe('DataNode — structure variant — cells forward canonical data.id, not wrapper id', () => {
  // Fixture: data.id is canonical (`Party`); React Flow wrapper id is an
  // instance-encoded path (`Root::buyer::Party`) as produced by Option A.
  // The two must differ so any regression is immediately observable.
  const canonicalId = 'Party';
  const instanceId = 'Root::buyer::Party'; // React Flow wrapper id (per-edge instance)

  const instanceRows: StructureRow[] = [
    {
      attrName: 'partyId',
      typeName: 'string',
      typeKind: 'BasicType',
      cardinality: '1..1',
      isOptional: false,
      isInherited: false
    },
    {
      attrName: 'role',
      typeName: 'RoleEnum',
      typeKind: 'Enum',
      cardinality: '0..1',
      isOptional: true,
      isInherited: false
    }
  ];

  const instanceData = {
    $type: 'Data',
    id: canonicalId, // canonical id preserved on data payload (Option A contract)
    kind: 'data',
    name: 'Party',
    namespaceUri: 'cdm.trade',
    rows: instanceRows,
    expansions: new Map(),
    variant: 'structure'
  };

  it('NameCell receives data.id, not the React Flow wrapper id', () => {
    const capturedNodeIds: string[] = [];
    const NameCellSpy = ({ nodeId, value, attrName: _a }: { nodeId: string; value: string; attrName: string }) => {
      capturedNodeIds.push(nodeId);
      return <span data-testid={`name-cell-${value}`}>{value}</span>;
    };
    const dataWithCells = { ...instanceData, cellComponents: { name: NameCellSpy } };

    renderInFlow(<DataNode data={dataWithCells as any} selected={false} id={instanceId} type="data" />);

    // Both rows must be rendered; all forwarded nodeIds must be the canonical id.
    expect(capturedNodeIds.length).toBeGreaterThan(0);
    for (const nodeId of capturedNodeIds) {
      expect(nodeId).toBe(canonicalId);
      expect(nodeId).not.toBe(instanceId);
    }
  });

  it('TypeCell receives data.id, not the React Flow wrapper id', () => {
    const capturedNodeIds: string[] = [];
    const TypeCellSpy = ({
      nodeId,
      typeName: _t,
      typeKind: _k,
      attrName: _a
    }: {
      nodeId: string;
      typeName: string;
      typeKind: StructureRow['typeKind'];
      attrName: string;
    }) => {
      capturedNodeIds.push(nodeId);
      return <span />;
    };
    const dataWithCells = { ...instanceData, cellComponents: { type: TypeCellSpy } };

    renderInFlow(<DataNode data={dataWithCells as any} selected={false} id={instanceId} type="data" />);

    expect(capturedNodeIds.length).toBeGreaterThan(0);
    for (const nodeId of capturedNodeIds) {
      expect(nodeId).toBe(canonicalId);
      expect(nodeId).not.toBe(instanceId);
    }
  });

  it('CardCell receives data.id, not the React Flow wrapper id', () => {
    const capturedNodeIds: string[] = [];
    const CardCellSpy = ({ nodeId, value: _v, attrName: _a }: { nodeId: string; value: string; attrName: string }) => {
      capturedNodeIds.push(nodeId);
      return <span />;
    };
    const dataWithCells = { ...instanceData, cellComponents: { card: CardCellSpy } };

    renderInFlow(<DataNode data={dataWithCells as any} selected={false} id={instanceId} type="data" />);

    expect(capturedNodeIds.length).toBeGreaterThan(0);
    for (const nodeId of capturedNodeIds) {
      expect(nodeId).toBe(canonicalId);
      expect(nodeId).not.toBe(instanceId);
    }
  });
});
