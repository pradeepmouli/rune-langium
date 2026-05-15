// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { buildStructureGraph } from '../../src/adapters/structure-graph-adapter.js';
import {
  type StructureBaseContainer,
  type StructureDataNode,
  type StructureExpansionKey,
  expansionKey
} from '../../src/types/structure-view.js';

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

const fixtureExtends = {
  namespaces: [{ uri: 'cdm.trade' }],
  nodes: [
    {
      id: 'cdm.trade::TradeBase',
      $type: 'Data' as const,
      name: 'TradeBase',
      namespace: 'cdm.trade',
      attributes: [
        { name: 'tradeID', typeCall: { type: { $refText: 'string' } }, card: { min: 0, max: 1 } },
        { name: 'parties', typeCall: { type: { $refText: 'Party' } }, card: { min: 2, max: 2 } }
      ]
    },
    {
      id: 'cdm.trade::Trade',
      $type: 'Data' as const,
      name: 'Trade',
      namespace: 'cdm.trade',
      extends: 'TradeBase',
      attributes: [{ name: 'tradeDate', typeCall: { type: { $refText: 'date' } }, card: { min: 0, max: 1 } }]
    }
  ]
};

describe('buildStructureGraph — inheritance', () => {
  it('produces a base-type container wrapping the derived Data', () => {
    const result = buildStructureGraph(fixtureExtends, {
      focusedTypeId: 'cdm.trade::Trade',
      expansionMap: new Map()
    });

    // Root is the base container, NOT the Data node directly
    const rootNode = result.nodes.get(result.rootNodeId);
    expect(rootNode?.kind).toBe('base');
    const base = rootNode as StructureBaseContainer;
    expect(base.baseTypeName).toBe('TradeBase');
    expect(base.baseRows.map((r) => r.attrName)).toEqual(['tradeID', 'parties']);
    expect(base.baseRows.every((r) => r.isInherited)).toBe(true);

    // Derived Data is referenced by id
    expect(base.childNodeId).toBe('cdm.trade::Trade');
    const derived = result.nodes.get('cdm.trade::Trade') as StructureDataNode;
    expect(derived?.kind).toBe('data');
    expect(derived.rows.map((r) => r.attrName)).toEqual(['tradeDate']); // ONLY new additions
  });
});

const fixtureRef = {
  namespaces: [{ uri: 'cdm.trade' }],
  nodes: [
    {
      id: 'cdm.trade::Economics',
      $type: 'Data' as const,
      name: 'Economics',
      namespace: 'cdm.trade',
      attributes: [{ name: 'notional', typeCall: { type: { $refText: 'Money' } }, card: { min: 1, max: 1 } }]
    },
    {
      id: 'cdm.trade::Trade',
      $type: 'Data' as const,
      name: 'Trade',
      namespace: 'cdm.trade',
      attributes: [
        {
          name: 'economics',
          typeCall: { type: { $refText: 'Economics' } },
          card: { min: 0, max: '*' as const }
        }
      ]
    }
  ]
};

describe('buildStructureGraph — type-reference expansion', () => {
  it('does NOT expand when the attribute is collapsed', () => {
    const result = buildStructureGraph(fixtureRef, {
      focusedTypeId: 'cdm.trade::Trade',
      expansionMap: new Map()
    });
    expect(result.nodes.size).toBe(1);
    expect(result.nodes.has('cdm.trade::Economics')).toBe(false);
  });

  it('expands target type when the attribute is expanded', () => {
    const key: StructureExpansionKey = {
      namespaceUri: 'cdm.trade',
      typeId: 'Trade',
      attrName: 'economics'
    };
    const expansionMap = new Map([[expansionKey(key), true]]);

    const result = buildStructureGraph(fixtureRef, {
      focusedTypeId: 'cdm.trade::Trade',
      expansionMap
    });

    expect(result.nodes.has('cdm.trade::Economics')).toBe(true);
    const trade = result.nodes.get('cdm.trade::Trade') as StructureDataNode;
    expect(trade.expansions.get('economics')).toBe('cdm.trade::Economics');
  });
});
