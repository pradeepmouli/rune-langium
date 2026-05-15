// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { buildStructureGraph } from '../../src/adapters/structure-graph-adapter.js';

// Minimal in-memory document representation; real adapter accepts the
// visual-editor's GraphSnapshot or LangiumDocument (see implementation).
const fixtureSimple = {
  namespaces: [{ uri: 'cdm.trade' }],
  nodes: [
    {
      id: 'cdm.trade::Trade',
      $type: 'Data' as const,
      name: 'Trade',
      namespace: 'cdm.trade',
      extends: undefined,
      attributes: [
        { name: 'tradeDate', typeCall: { type: { $refText: 'date' } }, card: { min: 0, max: 1 } },
        { name: 'tradeID', typeCall: { type: { $refText: 'string' } }, card: { min: 0, max: 1 } }
      ]
    }
  ]
};

describe('buildStructureGraph — standalone Data type', () => {
  it('produces a single root node with rows for each attribute', () => {
    const result = buildStructureGraph(fixtureSimple, {
      focusedTypeId: 'cdm.trade::Trade',
      expansionMap: new Map()
    });

    expect(result.rootNodeId).toBe('cdm.trade::Trade');
    expect(result.nodes.size).toBe(1);
    const root = result.nodes.get('cdm.trade::Trade');
    expect(root?.kind).toBe('data');
    expect((root as any).rows).toHaveLength(2);
    expect((root as any).rows[0].attrName).toBe('tradeDate');
    expect((root as any).rows[0].typeName).toBe('date');
    expect((root as any).rows[0].typeKind).toBe('BasicType');
    expect((root as any).rows[0].isOptional).toBe(true);
    expect((root as any).rows[0].cardinality).toBe('0..1');
  });

  it('returns empty graph when focusedTypeId is unknown', () => {
    const result = buildStructureGraph(fixtureSimple, {
      focusedTypeId: 'cdm.trade::Missing',
      expansionMap: new Map()
    });

    expect(result.nodes.size).toBe(0);
  });
});
