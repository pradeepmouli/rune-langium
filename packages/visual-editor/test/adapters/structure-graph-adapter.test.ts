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
        { name: 'tradeDate', typeCall: { type: { $refText: 'date' } }, card: { inf: 0, sup: 1, unbounded: false } },
        { name: 'tradeID', typeCall: { type: { $refText: 'string' } }, card: { inf: 0, sup: 1, unbounded: false } }
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
    const root = result.nodes.get('cdm.trade::Trade') as StructureDataNode;
    expect(root.kind).toBe('data');
    expect(root.rows).toHaveLength(2);
    expect(root.rows[0]!.attrName).toBe('tradeDate');
    expect(root.rows[0]!.typeName).toBe('date');
    expect(root.rows[0]!.typeKind).toBe('BasicType');
    expect(root.rows[0]!.isOptional).toBe(true);
    expect(root.rows[0]!.cardinality).toBe('0..1');
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
        { name: 'tradeID', typeCall: { type: { $refText: 'string' } }, card: { inf: 0, sup: 1, unbounded: false } },
        { name: 'parties', typeCall: { type: { $refText: 'Party' } }, card: { inf: 2, sup: 2, unbounded: false } }
      ]
    },
    {
      id: 'cdm.trade::Trade',
      $type: 'Data' as const,
      name: 'Trade',
      namespace: 'cdm.trade',
      extends: 'TradeBase',
      attributes: [
        { name: 'tradeDate', typeCall: { type: { $refText: 'date' } }, card: { inf: 0, sup: 1, unbounded: false } }
      ]
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

  it('flattens single-level only: Trade extends TradeBase extends TradeRoot drops TradeRoot attrs', () => {
    // Multi-level inheritance contract pin (silent-failure #2):
    // Phase 2 deliberately flattens just one level. If Trade extends TradeBase
    // and TradeBase extends TradeRoot, only TradeBase's attributes show in the
    // base container. TradeRoot's attributes are silently dropped until a
    // future phase walks the full chain. A breaking change here should
    // intentionally update this test.
    const fixtureDeep = {
      namespaces: [{ uri: 'cdm.trade' }],
      nodes: [
        {
          id: 'cdm.trade::TradeRoot',
          $type: 'Data' as const,
          name: 'TradeRoot',
          namespace: 'cdm.trade',
          attributes: [
            {
              name: 'rootField',
              typeCall: { type: { $refText: 'string' } },
              card: { inf: 1, sup: 1, unbounded: false }
            }
          ]
        },
        {
          id: 'cdm.trade::TradeBase',
          $type: 'Data' as const,
          name: 'TradeBase',
          namespace: 'cdm.trade',
          extends: 'TradeRoot',
          attributes: [
            {
              name: 'baseField',
              typeCall: { type: { $refText: 'string' } },
              card: { inf: 1, sup: 1, unbounded: false }
            }
          ]
        },
        {
          id: 'cdm.trade::Trade',
          $type: 'Data' as const,
          name: 'Trade',
          namespace: 'cdm.trade',
          extends: 'TradeBase',
          attributes: [
            {
              name: 'tradeField',
              typeCall: { type: { $refText: 'string' } },
              card: { inf: 1, sup: 1, unbounded: false }
            }
          ]
        }
      ]
    };

    const result = buildStructureGraph(fixtureDeep, {
      focusedTypeId: 'cdm.trade::Trade',
      expansionMap: new Map()
    });

    const base = result.nodes.get(result.rootNodeId) as StructureBaseContainer;
    expect(base.kind).toBe('base');
    expect(base.baseTypeName).toBe('TradeBase');
    // Only direct base's fields surface — rootField is NOT here.
    expect(base.baseRows.map((r) => r.attrName)).toEqual(['baseField']);
    expect(base.baseRows.some((r) => r.attrName === 'rootField')).toBe(false);

    const derived = result.nodes.get('cdm.trade::Trade') as StructureDataNode;
    expect(derived.rows.map((r) => r.attrName)).toEqual(['tradeField']);
    // rootField is NOT smuggled into the derived rows either.
    expect(derived.rows.some((r) => r.attrName === 'rootField')).toBe(false);
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
      attributes: [
        { name: 'notional', typeCall: { type: { $refText: 'Money' } }, card: { inf: 1, sup: 1, unbounded: false } }
      ]
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
          card: { inf: 0, unbounded: true }
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
      attributes: [
        { name: 'cashPayout', typeCall: { type: { $refText: 'Cash' } }, card: { inf: 1, sup: 1, unbounded: false } }
      ]
    },
    {
      id: 'cdm.trade::Trade',
      $type: 'Data' as const,
      name: 'Trade',
      namespace: 'cdm.trade',
      attributes: [
        { name: 'payout', typeCall: { type: { $refText: 'Payout' } }, card: { inf: 1, sup: 1, unbounded: false } }
      ]
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
          card: { inf: 1, sup: 1, unbounded: false }
        },
        {
          name: 'mystery',
          typeCall: { type: { $refText: 'MissingType' } },
          card: { inf: 0, sup: 1, unbounded: false }
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

describe('buildStructureGraph — BasicType classification', () => {
  // `pattern` is a grammar `basicType` (see rune-dsl.langium). Easy to miss
  // when reading the BASIC_TYPES set in isolation, so pinned here.
  it('classifies a basicType pattern as BasicType', () => {
    const fixture = {
      namespaces: [{ uri: 'cdm.misc' }],
      nodes: [
        {
          id: 'cdm.misc::Thing',
          $type: 'Data' as const,
          name: 'Thing',
          namespace: 'cdm.misc',
          attributes: [
            { name: 'regex', typeCall: { type: { $refText: 'pattern' } }, card: { inf: 0, sup: 1, unbounded: false } }
          ]
        }
      ]
    };
    const result = buildStructureGraph(fixture, {
      focusedTypeId: 'cdm.misc::Thing',
      expansionMap: new Map()
    });
    const row = (result.nodes.get('cdm.misc::Thing') as StructureDataNode).rows[0]!;
    expect(row.typeName).toBe('pattern');
    expect(row.typeKind).toBe('BasicType');
  });

  // `date` is a grammar `recordType`, not a `basicType`. The adapter conflates
  // both under `'BasicType'` because the UI renders them the same way (inline
  // chip, no drill-down). This test documents the conflation so a future
  // reader doesn't file it as a bug.
  it('classifies a recordType date as BasicType (UI conflates basicType + recordType)', () => {
    const fixture = {
      namespaces: [{ uri: 'cdm.misc' }],
      nodes: [
        {
          id: 'cdm.misc::Thing',
          $type: 'Data' as const,
          name: 'Thing',
          namespace: 'cdm.misc',
          attributes: [
            { name: 'when', typeCall: { type: { $refText: 'date' } }, card: { inf: 1, sup: 1, unbounded: false } }
          ]
        }
      ]
    };
    const result = buildStructureGraph(fixture, {
      focusedTypeId: 'cdm.misc::Thing',
      expansionMap: new Map()
    });
    const row = (result.nodes.get('cdm.misc::Thing') as StructureDataNode).rows[0]!;
    expect(row.typeName).toBe('date');
    expect(row.typeKind).toBe('BasicType');
  });
});

describe('buildStructureGraph — malformed typeCall', () => {
  // Silent-failure #5: `typeRefText` defaults to '' when the AST shape is off.
  // Pinning current behavior — '' is not in BASIC_TYPES and matches no node,
  // so the row classifies as Unresolved with an empty type name. Renderers
  // need to handle the empty-string chip without crashing.
  it('handles typeCall.type === undefined as Unresolved with empty typeName', () => {
    const fixture = {
      namespaces: [{ uri: 'x' }],
      nodes: [
        {
          id: 'x::Thing',
          $type: 'Data' as const,
          name: 'Thing',
          namespace: 'x',
          attributes: [{ name: 'broken', typeCall: { type: undefined }, card: { inf: 0, sup: 1, unbounded: false } }]
        }
      ]
    };
    const result = buildStructureGraph(fixture, {
      focusedTypeId: 'x::Thing',
      expansionMap: new Map()
    });
    const row = (result.nodes.get('x::Thing') as StructureDataNode).rows[0]!;
    expect(row.typeName).toBe('');
    expect(row.typeKind).toBe('Unresolved');
    expect(row.targetNodeId).toBeUndefined();
  });

  it('handles typeCall.type.$refText === undefined as Unresolved with empty typeName', () => {
    const fixture = {
      namespaces: [{ uri: 'x' }],
      nodes: [
        {
          id: 'x::Thing',
          $type: 'Data' as const,
          name: 'Thing',
          namespace: 'x',
          attributes: [
            {
              name: 'broken',
              typeCall: { type: { $refText: undefined } },
              card: { inf: 0, sup: 1, unbounded: false }
            }
          ]
        }
      ]
    };
    const result = buildStructureGraph(fixture, {
      focusedTypeId: 'x::Thing',
      expansionMap: new Map()
    });
    const row = (result.nodes.get('x::Thing') as StructureDataNode).rows[0]!;
    expect(row.typeName).toBe('');
    expect(row.typeKind).toBe('Unresolved');
    expect(row.targetNodeId).toBeUndefined();
  });
});

describe('buildStructureGraph — cardinality formatting', () => {
  it('formats 0..* cardinality without a doubled max marker', () => {
    const trade = buildStructureGraph(fixtureRef, {
      focusedTypeId: 'cdm.trade::Trade',
      expansionMap: new Map()
    }).nodes.get('cdm.trade::Trade') as StructureDataNode;
    const row = trade.rows.find((r) => r.attrName === 'economics')!;
    expect(row.cardinality).toBe('0..*');
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
      attributes: [
        { name: 'id', typeCall: { type: { $refText: 'string' } }, card: { inf: 1, sup: 1, unbounded: false } }
      ]
    },
    {
      id: 'cdm.trade::Trade',
      $type: 'Data' as const,
      name: 'Trade',
      namespace: 'cdm.trade',
      attributes: [
        { name: 'party', typeCall: { type: { $refText: 'Party' } }, card: { inf: 1, sup: 1, unbounded: false } }
      ]
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
          attributes: [
            { name: 'amt', typeCall: { type: { $refText: 'Money' } }, card: { inf: 1, sup: 1, unbounded: false } }
          ]
        }
      ]
    };

    const result = buildStructureGraph(fixtureCollision, {
      focusedTypeId: 'a::Trade',
      expansionMap: new Map()
    });
    const row = (result.nodes.get('a::Trade') as StructureDataNode).rows[0]!;
    // Prefer the same-namespace match
    expect(row.targetNodeId).toBe('a::Money');
  });

  it('terminates on cyclic references (A → B → A) without infinite recursion', () => {
    const fixtureCycle = {
      namespaces: [{ uri: 'c' }],
      nodes: [
        {
          id: 'c::A',
          $type: 'Data' as const,
          name: 'A',
          namespace: 'c',
          attributes: [{ name: 'b', typeCall: { type: { $refText: 'B' } }, card: { inf: 1, sup: 1, unbounded: false } }]
        },
        {
          id: 'c::B',
          $type: 'Data' as const,
          name: 'B',
          namespace: 'c',
          attributes: [{ name: 'a', typeCall: { type: { $refText: 'A' } }, card: { inf: 1, sup: 1, unbounded: false } }]
        }
      ]
    };

    const expansionMap = new Map<string, boolean>([
      [expansionKey({ namespaceUri: 'c', typeId: 'A', attrName: 'b' }), true],
      [expansionKey({ namespaceUri: 'c', typeId: 'B', attrName: 'a' }), true]
    ]);

    const result = buildStructureGraph(fixtureCycle, {
      focusedTypeId: 'c::A',
      expansionMap
    });

    // Both nodes materialized exactly once; the cycle did not blow the stack.
    expect(result.nodes.size).toBe(2);
    const a = result.nodes.get('c::A') as StructureDataNode;
    const b = result.nodes.get('c::B') as StructureDataNode;
    expect(a.expansions.get('b')).toBe('c::B');
    expect(b.expansions.get('a')).toBe('c::A');
  });

  it('returns an empty graph (no crash) when the focused root is a Choice', () => {
    const fixtureChoiceRoot = {
      namespaces: [{ uri: 'cdm.trade' }],
      nodes: [
        {
          id: 'cdm.trade::Payout',
          $type: 'Choice' as const,
          name: 'Payout',
          namespace: 'cdm.trade',
          attributes: [
            { name: 'cash', typeCall: { type: { $refText: 'string' } }, card: { inf: 1, sup: 1, unbounded: false } }
          ]
        }
      ]
    };

    const result = buildStructureGraph(fixtureChoiceRoot, {
      focusedTypeId: 'cdm.trade::Payout',
      expansionMap: new Map()
    });

    // Phase 2 scope: only Data roots are materialized. Choice-as-root falls
    // through; the graph is empty but the rootNodeId still echoes the focus.
    expect(result.rootNodeId).toBe('cdm.trade::Payout');
    expect(result.nodes.size).toBe(0);
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
            { name: 'amt', typeCall: { type: { $refText: 'Money' } }, card: { inf: 1, sup: 1, unbounded: false } },
            { name: 'party', typeCall: { type: { $refText: 'Party' } }, card: { inf: 1, sup: 1, unbounded: false } }
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
