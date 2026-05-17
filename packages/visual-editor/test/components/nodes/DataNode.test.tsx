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
    // Phase 14d (fix): rowKey now includes self's rfId in instancePath.
    // For the root node with id="cdm.trade::Trade" and no data.instancePath,
    // ownerInstancePath = [...[], 'cdm.trade::Trade'] = ['cdm.trade::Trade'].
    // typeId is the bare type name (matches adapter shouldExpand contract);
    // namespaceUri matches the owner node's namespace.
    expect(calledWith).toEqual({
      namespaceUri: 'cdm.trade',
      typeId: 'Trade',
      attrName: 'economics',
      instancePath: ['cdm.trade::Trade']
    });
  });

  it('aria-expanded mirrors the expansionMap state (collapsed → false, expanded → true)', () => {
    // Phase 14d (fix): expansionMap key now includes self rfId in instancePath.
    const key = expansionKey({
      namespaceUri: 'cdm.trade',
      typeId: 'Trade',
      attrName: 'economics',
      instancePath: ['cdm.trade::Trade']
    });
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
    // Phase 14d (fix): expansionMap key now includes self rfId in instancePath.
    const key = expansionKey({
      namespaceUri: 'cdm.trade',
      typeId: 'Trade',
      attrName: 'economics',
      instancePath: ['cdm.trade::Trade']
    });
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

// ---------------------------------------------------------------------------
// Phase 14d — per-instance row expansion chevrons (updated for 14d fix)
// ---------------------------------------------------------------------------

describe('DataNode — structure variant — per-instance chevron keys (Phase 14d)', () => {
  // Two DataNode instances rendered for the same canonical Party but at
  // different ancestor paths. Their row chevrons must fire with DISTINCT
  // expansion keys so per-instance expansion state stays independent.

  const partyRows: StructureRow[] = [
    {
      attrName: 'address',
      typeName: 'Address',
      typeKind: 'Data',
      cardinality: '1..1',
      isOptional: false,
      isInherited: false
    }
  ];

  function partyData(instancePath: ReadonlyArray<string>, onToggle: (k: StructureExpansionKey) => void) {
    return {
      $type: 'Data',
      id: 'cdm.trade::Party', // canonical id — same across instances
      kind: 'data',
      name: 'Party',
      namespaceUri: 'cdm.trade',
      rows: partyRows,
      expansions: new Map(),
      variant: 'structure',
      instancePath,
      onToggleExpansion: onToggle
    };
  }

  it('chevron fires with self rfId included in instancePath (self-inclusive key)', () => {
    // Phase 14d (fix): ownerInstancePath = [...data.instancePath, id].
    // data.instancePath = ['cdm.trade::Trade'], id = 'cdm.trade::Trade::buyer::cdm.trade::Party'
    // → fired instancePath = ['cdm.trade::Trade', 'cdm.trade::Trade::buyer::cdm.trade::Party']
    const onToggle = vi.fn();
    renderInFlow(
      <DataNode
        data={partyData(['cdm.trade::Trade'], onToggle) as any}
        selected={false}
        id="cdm.trade::Trade::buyer::cdm.trade::Party"
        type="data"
      />
    );
    fireEvent.click(screen.getByTestId('expand-row-address'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle.mock.calls[0][0]).toEqual({
      namespaceUri: 'cdm.trade',
      typeId: 'Party',
      attrName: 'address',
      instancePath: ['cdm.trade::Trade', 'cdm.trade::Trade::buyer::cdm.trade::Party']
    } satisfies StructureExpansionKey);
  });

  it('two visible occurrences with different rfIds produce different chevron keys', () => {
    // Renders two DataNodes back-to-back: one for buyer.Party, one for seller.Party.
    // Both have the same canonical data and data.instancePath = ['cdm.trade::Trade'],
    // but different React Flow ids (rfIds). After the fix, each chevron's rowKey
    // includes self's rfId, so the two keys are distinct.
    const buyerToggle = vi.fn();
    const sellerToggle = vi.fn();

    // buyer.Party: data.instancePath=['cdm.trade::Trade'], id='cdm.trade::Trade::buyer::cdm.trade::Party'
    // → fired instancePath = ['cdm.trade::Trade', 'cdm.trade::Trade::buyer::cdm.trade::Party']
    const { unmount } = renderInFlow(
      <DataNode
        data={partyData(['cdm.trade::Trade'], buyerToggle) as any}
        selected={false}
        id="cdm.trade::Trade::buyer::cdm.trade::Party"
        type="data"
      />
    );
    fireEvent.click(screen.getByTestId('expand-row-address'));
    expect(buyerToggle).toHaveBeenCalledWith(
      expect.objectContaining({
        attrName: 'address',
        instancePath: ['cdm.trade::Trade', 'cdm.trade::Trade::buyer::cdm.trade::Party']
      })
    );
    unmount();

    // seller.Party: data.instancePath=['cdm.trade::Trade'], id='cdm.trade::Trade::seller::cdm.trade::Party'
    // → fired instancePath = ['cdm.trade::Trade', 'cdm.trade::Trade::seller::cdm.trade::Party']
    renderInFlow(
      <DataNode
        data={partyData(['cdm.trade::Trade'], sellerToggle) as any}
        selected={false}
        id="cdm.trade::Trade::seller::cdm.trade::Party"
        type="data"
      />
    );
    fireEvent.click(screen.getByTestId('expand-row-address'));
    expect(sellerToggle).toHaveBeenCalledWith(
      expect.objectContaining({
        attrName: 'address',
        instancePath: ['cdm.trade::Trade', 'cdm.trade::Trade::seller::cdm.trade::Party']
      })
    );

    // The two keys serialize to DIFFERENT strings, so they map to independent
    // entries in the persistence layer — confirming per-instance independence.
    const buyerKey = buyerToggle.mock.calls[0][0] as StructureExpansionKey;
    const sellerKey = sellerToggle.mock.calls[0][0] as StructureExpansionKey;
    expect(expansionKey(buyerKey)).not.toBe(expansionKey(sellerKey));
  });

  it('back-compat: omitted data.instancePath still uses self rfId (no undefined in key)', () => {
    // When `data.instancePath` is absent (e.g., a unit test that omits it),
    // ownerInstancePath = [...[], id] = [id]. The key is NOT the legacy form;
    // it includes the React Flow id. This is intentional — the back-compat
    // fallback in shouldExpand also checks the legacy key (no-instancePath suffix),
    // so old persisted maps still trigger expansion via the fallback.
    const onToggle = vi.fn();
    renderInFlow(
      <DataNode
        // Note: NO instancePath in data.
        data={
          {
            $type: 'Data',
            id: 'cdm.trade::Party',
            kind: 'data',
            name: 'Party',
            namespaceUri: 'cdm.trade',
            rows: partyRows,
            expansions: new Map(),
            variant: 'structure',
            onToggleExpansion: onToggle
          } as any
        }
        selected={false}
        id="cdm.trade::Party"
        type="data"
      />
    );
    fireEvent.click(screen.getByTestId('expand-row-address'));
    const key = onToggle.mock.calls[0][0] as StructureExpansionKey;
    // ownerInstancePath = [...(undefined ?? []), 'cdm.trade::Party'] = ['cdm.trade::Party']
    expect(key.instancePath).toEqual(['cdm.trade::Party']);
    // Serializes with the instance-path suffix (non-legacy form).
    expect(expansionKey(key)).toBe('cdm.trade::Party::address::cdm.trade::Party');
  });
});

// ---------------------------------------------------------------------------
// Phase 14d (fix) — regression: per-instance chevron parity at the same level
//
// This is the canonical regression test for the bug where buyer.Party.address
// and seller.Party.address chevrons shared the same expansion key because
// data.instancePath excluded self. After the fix, both instances have different
// rfIds in their instancePath, so store entries are independent.
// ---------------------------------------------------------------------------

describe('DataNode — Phase 14d fix — full per-instance parity at duplicated-type level', () => {
  // Scenario: Trade has buyer: Party and seller: Party, both expanded.
  // Both Party nodes have data.instancePath = ['cdm.trade::Trade'] (ancestors only).
  // The ONLY distinguishing factor is their rfId (React Flow id):
  //   buyer's Party rfId: 'cdm.trade::Trade::buyer::cdm.trade::Party'
  //   seller's Party rfId: 'cdm.trade::Trade::seller::cdm.trade::Party'
  //
  // After the fix, each chevron's rowKey appends self's rfId to instancePath,
  // making the two keys diverge.

  const partyRows: StructureRow[] = [
    {
      attrName: 'address',
      typeName: 'Address',
      typeKind: 'Data',
      cardinality: '1..1',
      isOptional: false,
      isInherited: false
    },
    {
      attrName: 'name',
      typeName: 'string',
      typeKind: 'BasicType',
      cardinality: '1..1',
      isOptional: false,
      isInherited: false
    }
  ];

  // Shared canonical data — same as what the layout would produce for both
  // buyer.Party and seller.Party (same type, same rows, same namespaceUri).
  const canonicalData = {
    $type: 'Data',
    id: 'cdm.trade::Party',
    kind: 'data',
    name: 'Party',
    namespaceUri: 'cdm.trade',
    rows: partyRows,
    expansions: new Map(),
    variant: 'structure',
    // Same instancePath for both — ancestors exclude self (the documented limitation).
    instancePath: ['cdm.trade::Trade']
  };

  const BUYER_RF_ID = 'cdm.trade::Trade::buyer::cdm.trade::Party';
  const SELLER_RF_ID = 'cdm.trade::Trade::seller::cdm.trade::Party';

  const BUYER_EXPANDED_KEY = expansionKey({
    namespaceUri: 'cdm.trade',
    typeId: 'Party',
    attrName: 'address',
    instancePath: ['cdm.trade::Trade', BUYER_RF_ID]
  });
  const SELLER_EXPANDED_KEY = expansionKey({
    namespaceUri: 'cdm.trade',
    typeId: 'Party',
    attrName: 'address',
    instancePath: ['cdm.trade::Trade', SELLER_RF_ID]
  });

  it('click on buyer.Party chevron fires key with buyer rfId, NOT seller rfId', () => {
    const buyerToggle = vi.fn();
    const { unmount } = renderInFlow(
      <DataNode
        data={{ ...canonicalData, onToggleExpansion: buyerToggle } as any}
        selected={false}
        id={BUYER_RF_ID}
        type="data"
      />
    );
    fireEvent.click(screen.getByTestId('expand-row-address'));
    expect(buyerToggle).toHaveBeenCalledTimes(1);
    const fired = buyerToggle.mock.calls[0][0] as StructureExpansionKey;
    expect(fired.instancePath).toEqual(['cdm.trade::Trade', BUYER_RF_ID]);
    expect(fired.instancePath).not.toContain(SELLER_RF_ID);
    unmount();
  });

  it('click on seller.Party chevron fires key with seller rfId, NOT buyer rfId', () => {
    const sellerToggle = vi.fn();
    renderInFlow(
      <DataNode
        data={{ ...canonicalData, onToggleExpansion: sellerToggle } as any}
        selected={false}
        id={SELLER_RF_ID}
        type="data"
      />
    );
    fireEvent.click(screen.getByTestId('expand-row-address'));
    expect(sellerToggle).toHaveBeenCalledTimes(1);
    const fired = sellerToggle.mock.calls[0][0] as StructureExpansionKey;
    expect(fired.instancePath).toEqual(['cdm.trade::Trade', SELLER_RF_ID]);
    expect(fired.instancePath).not.toContain(BUYER_RF_ID);
  });

  it('buyer-expanded map makes buyer chevron EXPANDED and seller chevron COLLAPSED', () => {
    // Simulate the user having expanded buyer.Party.address only.
    const buyerOnlyMap = new Map<string, boolean>([[BUYER_EXPANDED_KEY, true]]);

    // Buyer Party node — should show address as EXPANDED.
    const { unmount: unmountBuyer } = renderInFlow(
      <DataNode
        data={{ ...canonicalData, expansionMap: buyerOnlyMap } as any}
        selected={false}
        id={BUYER_RF_ID}
        type="data"
      />
    );
    expect(screen.getByTestId('expand-row-address')).toHaveAttribute('aria-expanded', 'true');
    unmountBuyer();

    // Seller Party node — should show address as COLLAPSED (different key).
    renderInFlow(
      <DataNode
        data={{ ...canonicalData, expansionMap: buyerOnlyMap } as any}
        selected={false}
        id={SELLER_RF_ID}
        type="data"
      />
    );
    expect(screen.getByTestId('expand-row-address')).toHaveAttribute('aria-expanded', 'false');
  });

  it('buyer and seller keys serialize to different strings — independent persistence entries', () => {
    expect(BUYER_EXPANDED_KEY).not.toBe(SELLER_EXPANDED_KEY);
    // Confirm the suffix contains the distinguishing rfId segment.
    expect(BUYER_EXPANDED_KEY).toContain('buyer');
    expect(SELLER_EXPANDED_KEY).toContain('seller');
  });
});
