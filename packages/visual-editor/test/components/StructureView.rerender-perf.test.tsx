// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Phase 14c regression test — single-cell edit ≤1 DataNode rerender.
 *
 * Before Phase 14c, the StructureFlowInner useMemo rebuilt every visible
 * node's `data` payload on every render because (a) StructureView's
 * injection step did `{ ...n.data, cellComponents, expansionMap,
 * onToggleExpansion }` and (b) the upstream layout/adapter produced fresh
 * node + data objects on every layout pass. React Flow shallow-compares
 * `node.data` for memoization, so every Data instance re-rendered on every
 * keystroke.
 *
 * This test treats StructureView as a black box: it mocks ReactFlow so that
 * each emitted node is rendered through a spy DataNode that increments a
 * per-instance counter. A "keystroke" is simulated by re-rendering
 * StructureView with the SAME adapterDoc + expansionMap inputs. With the
 * Phase 14c fix in place the per-instance counters either stay at 1 (the
 * spy is memoized via React.memo with shallow compare on `data` identity)
 * or — at minimum — total rerenders across N visible nodes stay ≤1.
 *
 * Without the fix, every node's `data` identity changes on every render, so
 * the spy memo busts and the total rerender count equals N.
 *
 * Acceptance: total post-edit rerenders ≤ 1.
 */

import { describe, it, expect, vi } from 'vitest';
import { memo } from 'react';
import { render } from '@testing-library/react';
import { StructureView } from '../../src/components/StructureView.js';
import type { AdapterDocument } from '../../src/adapters/structure-graph-adapter.js';
import { expansionKey } from '../../src/types/structure-view.js';

// -----------------------------------------------------------------------
// Spy DataNode that counts renders per React Flow node id, memoized with
// shallow comparison on `data` (matches React Flow's internal behavior of
// shallow-comparing node.data for memo cache hits).
// -----------------------------------------------------------------------

const renderCounts = new Map<string, number>();

function shallowEqual<T extends Record<string, unknown>>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.is(a[k], b[k])) return false;
  }
  return true;
}

const SpyDataNode = memo(
  function SpyDataNode({ id }: { id: string; data: unknown }) {
    renderCounts.set(id, (renderCounts.get(id) ?? 0) + 1);
    return <div data-testid={`spy-data-node-${id}`} />;
  },
  (prev, next) =>
    prev.id === next.id && shallowEqual(prev.data as Record<string, unknown>, next.data as Record<string, unknown>)
);

// -----------------------------------------------------------------------
// Mock ReactFlow so each emitted node is rendered through SpyDataNode (for
// data + choice + structureBase variants). The real nodeTypes registry is
// bypassed; this test only cares about the identity of `node.data` that
// StructureView produces, not React Flow's own rendering pipeline.
// -----------------------------------------------------------------------

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    ReactFlow: ({ nodes }: { nodes: Array<{ id: string; type?: string; data: unknown }> }) => (
      <div data-testid="mock-react-flow">
        {nodes.map((n) => (
          <SpyDataNode key={n.id} id={n.id} data={n.data} />
        ))}
      </div>
    ),
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useReactFlow: () => ({ fitView: () => {} })
  };
});

// -----------------------------------------------------------------------
// Fixture: Trade -> Economics (expanded) -> nested. Yields 2+ visible
// DataNode instances after expansion so we can observe per-instance
// rerender behavior across more than the root node.
// -----------------------------------------------------------------------

const tradeDoc: AdapterDocument = {
  namespaces: [{ uri: 'cdm.trade' }],
  nodes: [
    {
      id: 'cdm.trade::Economics',
      $type: 'Data' as const,
      name: 'Economics',
      namespace: 'cdm.trade',
      attributes: [
        // astRange carried through to StructureRow per buildRow — adapter
        // rebuilds the object identity per pass even when values are unchanged.
        // Test fixture pins it so the perf comparator's structural astRange
        // handling stays exercised (Codex P2 on PR #205).
        {
          name: 'notional',
          typeCall: { type: { $refText: 'number' } },
          card: { inf: 0, sup: 1, unbounded: false },
          astRange: { start: 100, end: 110 }
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
          card: { inf: 0, sup: 1, unbounded: false },
          astRange: { start: 200, end: 210 }
        },
        {
          name: 'economics',
          typeCall: { type: { $refText: 'Economics' } },
          card: { inf: 0, unbounded: false },
          astRange: { start: 220, end: 230 }
        }
      ]
    }
  ]
};

// Key used by the adapter to gate Economics expansion under Trade.
const economicsKey = expansionKey({
  namespaceUri: 'cdm.trade',
  typeId: 'Trade',
  attrName: 'economics',
  instancePath: ['cdm.trade::Trade']
});

/**
 * Build a fresh AdapterDocument with content equivalent to `tradeDoc` but
 * everything (top-level object, namespaces, nodes, attributes) at NEW
 * identities. Mirrors what happens in apps/studio/EditorPage when
 * `storeNodes` mutates on a keystroke: `graphNodesToAdapterDocument`
 * re-runs and returns a brand-new object tree, even though the
 * underlying type definitions for Trade/Economics are unchanged.
 *
 * If one Trade attribute is renamed, the corresponding attribute name
 * differs — but the Economics subtree is byte-for-byte identical and
 * should NOT cause Economics's React Flow node to re-render.
 */
function cloneTradeDoc(renameEconomicsAttrTo?: string): AdapterDocument {
  return {
    namespaces: [{ uri: 'cdm.trade' }],
    nodes: [
      {
        id: 'cdm.trade::Economics',
        $type: 'Data' as const,
        name: 'Economics',
        namespace: 'cdm.trade',
        attributes: [
          {
            name: renameEconomicsAttrTo ?? 'notional',
            typeCall: { type: { $refText: 'number' } },
            card: { inf: 0, sup: 1, unbounded: false },
            // Fresh astRange object with same values — mimics adapter reparse
            // producing new identity for unchanged content.
            astRange: { start: 100, end: 110 }
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
            card: { inf: 0, sup: 1, unbounded: false },
            astRange: { start: 200, end: 210 }
          },
          {
            name: 'economics',
            typeCall: { type: { $refText: 'Economics' } },
            card: { inf: 0, unbounded: false },
            astRange: { start: 220, end: 230 }
          }
        ]
      }
    ]
  };
}

describe('StructureView — single-cell edit rerenders ≤1 DataNode (Phase 14c)', () => {
  it('rerenders at most one visible DataNode when one cell-targeted field changes', () => {
    renderCounts.clear();

    // Stable parent-side props — mirrors apps/studio/EditorPage which
    // memoizes cellComponents and provides a stable toggleExpansion.
    const cellComponents = {};
    const onToggleExpansion = () => {};
    const expansionMap = new Map([[economicsKey, true]]);

    const { rerender, container } = render(
      <StructureView
        focusedTypeId="cdm.trade::Trade"
        adapterDoc={cloneTradeDoc()}
        expansionMap={expansionMap}
        cellComponents={cellComponents}
        onToggleExpansion={onToggleExpansion}
      />
    );

    // Sanity: more than one Data instance is visible (root Trade + expanded
    // Economics). Without ≥2 nodes the perf assertion is vacuous.
    const visibleNodes = container.querySelectorAll('[data-testid^="spy-data-node-"]');
    expect(visibleNodes.length).toBeGreaterThanOrEqual(2);

    // Each spy mounted exactly once on initial render.
    for (const [, count] of renderCounts) {
      expect(count).toBe(1);
    }

    // Reset counters so subsequent counts represent ONLY post-edit
    // re-renders. (We've already verified initial counts above.)
    renderCounts.clear();

    // Simulate a single keystroke that produced no semantic change in the
    // adapter document (e.g. typing into a cell, blurring without commit;
    // or a downstream store re-render with no field delta). The adapter
    // produces a fresh AdapterDocument identity, but every node's
    // structural content is unchanged. Post-fix: ZERO re-renders.
    rerender(
      <StructureView
        focusedTypeId="cdm.trade::Trade"
        adapterDoc={cloneTradeDoc()}
        expansionMap={expansionMap}
        cellComponents={cellComponents}
        onToggleExpansion={onToggleExpansion}
      />
    );

    // Post-edit re-render budget.
    const totalRerenders = [...renderCounts.values()].reduce((a, b) => a + b, 0);
    // Acceptance criterion: ≤1 DataNode re-rendered after a content-equivalent
    // adapterDoc swap. Before Phase 14c this equals the number of visible
    // Data instances (every node re-renders) because the adapter+layout
    // produce fresh data identities on every pass.
    expect(totalRerenders).toBeLessThanOrEqual(1);
  });

  it('still re-renders the changed node when one attribute actually differs', () => {
    // Correctness sibling of the previous test: verify the identity-
    // preserving merge does NOT mask real content changes. If Economics's
    // sole attribute is renamed, Economics's React Flow data MUST change so
    // the cell editor sees the new value. Other nodes (Trade, in this
    // fixture) stay reference-stable.
    renderCounts.clear();

    const cellComponents = {};
    const onToggleExpansion = () => {};
    const expansionMap = new Map([[economicsKey, true]]);

    const { rerender } = render(
      <StructureView
        focusedTypeId="cdm.trade::Trade"
        adapterDoc={cloneTradeDoc()}
        expansionMap={expansionMap}
        cellComponents={cellComponents}
        onToggleExpansion={onToggleExpansion}
      />
    );

    // Each spy mounted once.
    for (const [, count] of renderCounts) {
      expect(count).toBe(1);
    }
    renderCounts.clear();

    // Rename Economics.notional → 'principal' (a real edit on that subtree).
    rerender(
      <StructureView
        focusedTypeId="cdm.trade::Trade"
        adapterDoc={cloneTradeDoc('principal')}
        expansionMap={expansionMap}
        cellComponents={cellComponents}
        onToggleExpansion={onToggleExpansion}
      />
    );

    const totalRerenders = [...renderCounts.values()].reduce((a, b) => a + b, 0);
    // EXACTLY one re-render expected: Economics's data shape changed
    // (attribute name) so its node identity must change; Trade's data is
    // byte-identical (no Trade-attribute renamed) so its node should be
    // reused. The ≤1 invariant remains intact even when there is a real edit.
    expect(totalRerenders).toBeLessThanOrEqual(1);
    expect(totalRerenders).toBeGreaterThanOrEqual(1);
  });
});
