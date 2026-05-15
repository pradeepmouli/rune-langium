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

const fixtureChoice = {
  namespaces: [{ uri: 'cdm.trade' }],
  nodes: [
    {
      id: 'cdm.trade::Payout',
      $type: 'Choice' as const,
      name: 'Payout',
      namespace: 'cdm.trade',
      attributes: [{ name: 'cashPayout', typeCall: { type: { $refText: 'Cash' } }, card: { min: 1, max: 1 } }]
    },
    {
      id: 'cdm.trade::Trade',
      $type: 'Data' as const,
      name: 'Trade',
      namespace: 'cdm.trade',
      attributes: [{ name: 'payout', typeCall: { type: { $refText: 'Payout' } }, card: { min: 1, max: 1 } }]
    }
  ]
};

const fixtureEnumAndUnresolved = {
  namespaces: [{ uri: 'cdm.trade' }],
  nodes: [
    {
      id: 'cdm.trade::DayCount',
      $type: 'Enum' as const,
      name: 'DayCount',
      namespace: 'cdm.trade',
      values: [{ name: 'ACT_360' }, { name: 'ACT_365' }]
    },
    {
      id: 'cdm.trade::Trade',
      $type: 'Data' as const,
      name: 'Trade',
      namespace: 'cdm.trade',
      attributes: [
        {
          name: 'dayCount',
          typeCall: { type: { $refText: 'DayCount' } },
          card: { min: 1, max: 1 }
        },
        {
          name: 'mystery',
          typeCall: { type: { $refText: 'MissingType' } },
          card: { min: 0, max: 1 }
        }
      ]
    }
  ]
};

describe('buildStructureGraph — Choice / Enum / Unresolved', () => {
  it('classifies a Choice-typed attr and expands to a choice node', () => {
    const key: StructureExpansionKey = {
      namespaceUri: 'cdm.trade',
      typeId: 'Trade',
      attrName: 'payout'
    };
    const result = buildStructureGraph(fixtureChoice, {
      focusedTypeId: 'cdm.trade::Trade',
      expansionMap: new Map([[expansionKey(key), true]])
    });
    const choice = result.nodes.get('cdm.trade::Payout');
    expect(choice?.kind).toBe('choice');
    const trade = result.nodes.get('cdm.trade::Trade') as StructureDataNode;
    expect(trade.rows.find((r) => r.attrName === 'payout')?.typeKind).toBe('Choice');
  });

  it('classifies an Enum-typed attr and does NOT expand it (chip-only)', () => {
    const key: StructureExpansionKey = {
      namespaceUri: 'cdm.trade',
      typeId: 'Trade',
      attrName: 'dayCount'
    };
    const result = buildStructureGraph(fixtureEnumAndUnresolved, {
      focusedTypeId: 'cdm.trade::Trade',
      expansionMap: new Map([[expansionKey(key), true]])
    });
    expect(result.nodes.has('cdm.trade::DayCount')).toBe(false);
    const trade = result.nodes.get('cdm.trade::Trade') as StructureDataNode;
    expect(trade.rows.find((r) => r.attrName === 'dayCount')?.typeKind).toBe('Enum');
  });

  it('marks unresolved references with kind=Unresolved', () => {
    const result = buildStructureGraph(fixtureEnumAndUnresolved, {
      focusedTypeId: 'cdm.trade::Trade',
      expansionMap: new Map()
    });
    const trade = result.nodes.get('cdm.trade::Trade') as StructureDataNode;
    const row = trade.rows.find((r) => r.attrName === 'mystery')!;
    expect(row.typeKind).toBe('Unresolved');
    expect(row.targetNodeId).toBeUndefined();
  });
});

const fixtureCrossNs = {
  namespaces: [{ uri: 'cdm.trade' }, { uri: 'cdm.product' }],
  nodes: [
    {
      id: 'cdm.product::Party',
      $type: 'Data' as const,
      name: 'Party',
      namespace: 'cdm.product',
      attributes: [{ name: 'id', typeCall: { type: { $refText: 'string' } }, card: { min: 1, max: 1 } }]
    },
    {
      id: 'cdm.trade::Trade',
      $type: 'Data' as const,
      name: 'Trade',
      namespace: 'cdm.trade',
      attributes: [{ name: 'party', typeCall: { type: { $refText: 'Party' } }, card: { min: 1, max: 1 } }]
    }
  ]
};

describe('buildStructureGraph — cross-namespace references', () => {
  it('resolves a reference to a type in a different namespace and surfaces targetNamespaceUri', () => {
    const result = buildStructureGraph(fixtureCrossNs, {
      focusedTypeId: 'cdm.trade::Trade',
      expansionMap: new Map()
    });
    const trade = result.nodes.get('cdm.trade::Trade') as StructureDataNode;
    const row = trade.rows.find((r) => r.attrName === 'party')!;
    expect(row.typeKind).toBe('Data');
    expect(row.targetNodeId).toBe('cdm.product::Party');
    expect(row.targetNamespaceUri).toBe('cdm.product');
  });

  it('disambiguates same-name types in different namespaces by qualified id', () => {
    const fixtureCollision = {
      namespaces: [{ uri: 'a' }, { uri: 'b' }],
      // Order matters: put the other-namespace Money FIRST so a naive
      // first-match resolver would return b::Money. The same-namespace
      // tiebreak should still prefer a::Money for the caller in 'a'.
      nodes: [
        { id: 'b::Money', $type: 'Data' as const, name: 'Money', namespace: 'b', attributes: [] },
        { id: 'a::Money', $type: 'Data' as const, name: 'Money', namespace: 'a', attributes: [] },
        {
          id: 'a::Trade',
          $type: 'Data' as const,
          name: 'Trade',
          namespace: 'a',
          attributes: [{ name: 'amt', typeCall: { type: { $refText: 'Money' } }, card: { min: 1, max: 1 } }]
        }
      ]
    };

    const result = buildStructureGraph(fixtureCollision, {
      focusedTypeId: 'a::Trade',
      expansionMap: new Map()
    });
    const row = (result.nodes.get('a::Trade') as StructureDataNode).rows[0];
    // Prefer the same-namespace match
    expect(row.targetNodeId).toBe('a::Money');
  });

  it('mixed: same-namespace and cross-namespace refs resolve correctly from the same caller', () => {
    const fixtureMixed = {
      namespaces: [{ uri: 'a' }, { uri: 'b' }],
      nodes: [
        { id: 'a::Money', $type: 'Data' as const, name: 'Money', namespace: 'a', attributes: [] },
        { id: 'b::Money', $type: 'Data' as const, name: 'Money', namespace: 'b', attributes: [] },
        // Only one Party — lives in 'b'
        { id: 'b::Party', $type: 'Data' as const, name: 'Party', namespace: 'b', attributes: [] },
        {
          id: 'a::Trade',
          $type: 'Data' as const,
          name: 'Trade',
          namespace: 'a',
          attributes: [
            { name: 'amt', typeCall: { type: { $refText: 'Money' } }, card: { min: 1, max: 1 } },
            { name: 'party', typeCall: { type: { $refText: 'Party' } }, card: { min: 1, max: 1 } }
          ]
        }
      ]
    };

    const result = buildStructureGraph(fixtureMixed, {
      focusedTypeId: 'a::Trade',
      expansionMap: new Map()
    });
    const trade = result.nodes.get('a::Trade') as StructureDataNode;
    const amt = trade.rows.find((r) => r.attrName === 'amt')!;
    const party = trade.rows.find((r) => r.attrName === 'party')!;
    // Same-namespace tiebreak picks a::Money
    expect(amt.targetNodeId).toBe('a::Money');
    expect(amt.targetNamespaceUri).toBe('a');
    // No 'a' Party — cross-namespace fallback to b::Party
    expect(party.targetNodeId).toBe('b::Party');
    expect(party.targetNamespaceUri).toBe('b');
  });
});
