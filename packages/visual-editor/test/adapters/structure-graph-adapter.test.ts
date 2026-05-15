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

  it('walks the full chain: Trade extends TradeBase extends TradeRoot nests yellow inside yellow', () => {
    // Spec §3.2: "Multi-level inheritance nests yellow inside yellow recursively."
    // The outermost base container (TradeRoot's) is rootNodeId; TradeBase's
    // container nests inside it; the focused Data node is innermost. Each
    // base container's baseRows hold only that level's own attributes
    // (marked isInherited), and the focused Data node holds only its own
    // additions — no row duplication across levels.
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

    // Three nodes: 2 base containers + 1 data node.
    expect(result.nodes.size).toBe(3);

    const outerId = `cdm.trade::Trade::__base::cdm.trade::TradeRoot`;
    const innerId = `cdm.trade::Trade::__base::cdm.trade::TradeBase`;

    // rootNodeId is the outermost (TradeRoot's container).
    expect(result.rootNodeId).toBe(outerId);

    const outer = result.nodes.get(outerId) as StructureBaseContainer;
    expect(outer.kind).toBe('base');
    expect(outer.baseTypeName).toBe('TradeRoot');
    expect(outer.baseRows.map((r) => r.attrName)).toEqual(['rootField']);
    expect(outer.baseRows.every((r) => r.isInherited)).toBe(true);
    expect(outer.childNodeId).toBe(innerId);

    const inner = result.nodes.get(innerId) as StructureBaseContainer;
    expect(inner.kind).toBe('base');
    expect(inner.baseTypeName).toBe('TradeBase');
    expect(inner.baseRows.map((r) => r.attrName)).toEqual(['baseField']);
    expect(inner.baseRows.every((r) => r.isInherited)).toBe(true);
    expect(inner.childNodeId).toBe('cdm.trade::Trade');

    const derived = result.nodes.get('cdm.trade::Trade') as StructureDataNode;
    expect(derived.kind).toBe('data');
    // Only Trade's own additions; ancestor attrs are NOT duplicated here.
    expect(derived.rows.map((r) => r.attrName)).toEqual(['tradeField']);
    expect(derived.rows.some((r) => r.attrName === 'rootField')).toBe(false);
    expect(derived.rows.some((r) => r.attrName === 'baseField')).toBe(false);
  });

  it('terminates on cyclic extends (A extends B extends A) without infinite recursion', () => {
    // Defensive: well-formed CDM cannot express this, but the chain walker
    // must not loop. A visited-set guard breaks the walk when an ancestor id
    // repeats; the resulting graph shape is "sensible" — finite, with the
    // valid ancestor(s) wrapping the focused Data node — but the exact shape
    // is incidental. The contract is "terminates and doesn't crash."
    const fixtureCyclicExtends = {
      namespaces: [{ uri: 'cdm.cycle' }],
      nodes: [
        {
          id: 'cdm.cycle::A',
          $type: 'Data' as const,
          name: 'A',
          namespace: 'cdm.cycle',
          extends: 'B',
          attributes: [
            { name: 'a', typeCall: { type: { $refText: 'string' } }, card: { inf: 1, sup: 1, unbounded: false } }
          ]
        },
        {
          id: 'cdm.cycle::B',
          $type: 'Data' as const,
          name: 'B',
          namespace: 'cdm.cycle',
          extends: 'A',
          attributes: [
            { name: 'b', typeCall: { type: { $refText: 'string' } }, card: { inf: 1, sup: 1, unbounded: false } }
          ]
        }
      ]
    };

    // The call must return — vitest will mark this test failing on timeout
    // if the walker loops.
    const result = buildStructureGraph(fixtureCyclicExtends, {
      focusedTypeId: 'cdm.cycle::A',
      expansionMap: new Map()
    });

    // Graph is finite. Focused A is present.
    expect(result.nodes.has('cdm.cycle::A')).toBe(true);
    const a = result.nodes.get('cdm.cycle::A') as StructureDataNode;
    expect(a.kind).toBe('data');
    // The walker stops before re-entering A: B is allowed once (the direct
    // base), then B.extends → A is rejected by the visited guard. So we
    // expect exactly one base container wrapping A.
    expect(result.nodes.size).toBe(2);
    const baseId = `cdm.cycle::A::__base::cdm.cycle::B`;
    expect(result.rootNodeId).toBe(baseId);
    const base = result.nodes.get(baseId) as StructureBaseContainer;
    expect(base.kind).toBe('base');
    expect(base.baseTypeName).toBe('B');
    expect(base.childNodeId).toBe('cdm.cycle::A');
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
  // `pattern` is a grammar `basicType` but it is NOT in the canonical
  // `BUILTIN_TYPES` list (packages/visual-editor/src/types.ts). The adapter
  // uses BUILTIN_TYPES as the single source of truth for chip-only types, so
  // `pattern` falls through to the node-lookup path and resolves as
  // Unresolved when no matching node exists.
  it('classifies a non-builtin "pattern" reference as Unresolved (not in BUILTIN_TYPES)', () => {
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
    expect(row.typeKind).toBe('Unresolved');
  });

  // `int` IS in `BUILTIN_TYPES` — pinning this because an earlier review-fix
  // pass incorrectly dropped `int` from the local set. Aligning with the
  // canonical UI list ensures the adapter stays consistent with the type
  // selectors and other consumers.
  it('classifies int as BasicType (member of canonical BUILTIN_TYPES)', () => {
    const fixture = {
      namespaces: [{ uri: 'cdm.misc' }],
      nodes: [
        {
          id: 'cdm.misc::Thing',
          $type: 'Data' as const,
          name: 'Thing',
          namespace: 'cdm.misc',
          attributes: [
            { name: 'count', typeCall: { type: { $refText: 'int' } }, card: { inf: 1, sup: 1, unbounded: false } }
          ]
        }
      ]
    };
    const result = buildStructureGraph(fixture, {
      focusedTypeId: 'cdm.misc::Thing',
      expansionMap: new Map()
    });
    const row = (result.nodes.get('cdm.misc::Thing') as StructureDataNode).rows[0]!;
    expect(row.typeName).toBe('int');
    expect(row.typeKind).toBe('BasicType');
  });

  // `date` is in BUILTIN_TYPES (grammar `recordType`). The adapter does not
  // distinguish basicType vs. recordType because the UI renders both the same
  // way (inline chip, no drill-down).
  it('classifies a recordType date as BasicType', () => {
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
    // A → B is kept (B is not an ancestor of A in the recursion stack).
    expect(a.expansions.get('b')).toBe('c::B');
    // B → A is dropped: A IS an ancestor of B in the recursion path, so the
    // containment edge would form a parent-cycle in Phase 3's React Flow
    // layout. The chip row remains; only the parent/child edge is suppressed.
    // See the `cycle-aware expansion` block below for full coverage.
    expect(b.expansions.size).toBe(0);
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

  it('resolves a fully-qualified reference like "cdm.product.Party"', () => {
    // Phase 9 source-drop path inserts qualified names for cross-namespace
    // refs (TypeCall.type and extends both use QualifiedName per
    // rune-dsl.langium). findNodeByName must split on the last dot and
    // match {name, namespace} together.
    const fixtureQualified = {
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
            {
              name: 'party',
              typeCall: { type: { $refText: 'cdm.product.Party' } },
              card: { inf: 1, sup: 1, unbounded: false }
            }
          ]
        }
      ]
    };

    const result = buildStructureGraph(fixtureQualified, {
      focusedTypeId: 'cdm.trade::Trade',
      expansionMap: new Map()
    });
    const trade = result.nodes.get('cdm.trade::Trade') as StructureDataNode;
    const row = trade.rows.find((r) => r.attrName === 'party')!;
    expect(row.typeKind).toBe('Data');
    expect(row.targetNodeId).toBe('cdm.product::Party');
    expect(row.targetNamespaceUri).toBe('cdm.product');
  });

  it('prefers exact qualified match over same-name unqualified collision', () => {
    // Two `Money` nodes in different namespaces. The caller is in `cdm.other`
    // — without qualification, same-namespace tiebreak would fail and the
    // first-listed (cdm.product::Money) would win. With the qualified ref
    // "cdm.trade.Money", we must resolve to cdm.trade::Money regardless of
    // caller namespace.
    const fixtureQualifiedCollision = {
      namespaces: [{ uri: 'cdm.product' }, { uri: 'cdm.trade' }, { uri: 'cdm.other' }],
      nodes: [
        { id: 'cdm.product::Money', $type: 'Data' as const, name: 'Money', namespace: 'cdm.product', attributes: [] },
        { id: 'cdm.trade::Money', $type: 'Data' as const, name: 'Money', namespace: 'cdm.trade', attributes: [] },
        {
          id: 'cdm.other::Holding',
          $type: 'Data' as const,
          name: 'Holding',
          namespace: 'cdm.other',
          attributes: [
            {
              name: 'amt',
              typeCall: { type: { $refText: 'cdm.trade.Money' } },
              card: { inf: 1, sup: 1, unbounded: false }
            }
          ]
        }
      ]
    };

    const result = buildStructureGraph(fixtureQualifiedCollision, {
      focusedTypeId: 'cdm.other::Holding',
      expansionMap: new Map()
    });
    const row = (result.nodes.get('cdm.other::Holding') as StructureDataNode).rows[0]!;
    expect(row.typeKind).toBe('Data');
    expect(row.targetNodeId).toBe('cdm.trade::Money');
    expect(row.targetNamespaceUri).toBe('cdm.trade');
  });

  it('resolves a qualified `extends` reference (extends uses QualifiedName too)', () => {
    // rune-dsl.langium line 60: `extends superType=[Data:QualifiedName]`.
    // Same fix in findNodeByName must cover the inheritance path.
    const fixtureQualifiedExtends = {
      namespaces: [{ uri: 'cdm.base' }, { uri: 'cdm.trade' }],
      nodes: [
        {
          id: 'cdm.base::TradeBase',
          $type: 'Data' as const,
          name: 'TradeBase',
          namespace: 'cdm.base',
          attributes: [
            { name: 'tradeID', typeCall: { type: { $refText: 'string' } }, card: { inf: 1, sup: 1, unbounded: false } }
          ]
        },
        {
          id: 'cdm.trade::Trade',
          $type: 'Data' as const,
          name: 'Trade',
          namespace: 'cdm.trade',
          extends: 'cdm.base.TradeBase',
          attributes: [
            {
              name: 'tradeDate',
              typeCall: { type: { $refText: 'date' } },
              card: { inf: 0, sup: 1, unbounded: false }
            }
          ]
        }
      ]
    };

    const result = buildStructureGraph(fixtureQualifiedExtends, {
      focusedTypeId: 'cdm.trade::Trade',
      expansionMap: new Map()
    });
    const base = result.nodes.get(result.rootNodeId) as StructureBaseContainer;
    expect(base.kind).toBe('base');
    expect(base.baseTypeName).toBe('TradeBase');
    expect(base.baseTypeNamespaceUri).toBe('cdm.base');
    expect(base.baseRows.map((r) => r.attrName)).toEqual(['tradeID']);
  });

  it('does NOT fall back to unqualified matching when a qualified namespace fails to resolve', () => {
    // Type names can't contain dots in the DSL, so a $refText with dots is
    // unambiguously qualified. If the namespace is wrong (typo, broken import,
    // dangling reference), the lookup must fail authoritatively — falling
    // through to unqualified matching would silently resolve a same-named
    // type in some other namespace, masking the error.
    const fixtureBrokenQualified = {
      namespaces: [{ uri: 'cdm.product' }, { uri: 'cdm.trade' }],
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
            // Typoed namespace: 'missing.ns.Party' instead of 'cdm.product.Party'.
            // Naive fallback to unqualified would find 'Party' in cdm.product.
            {
              name: 'party',
              typeCall: { type: { $refText: 'missing.ns.Party' } },
              card: { inf: 1, sup: 1, unbounded: false }
            }
          ]
        }
      ]
    };

    const result = buildStructureGraph(fixtureBrokenQualified, {
      focusedTypeId: 'cdm.trade::Trade',
      expansionMap: new Map()
    });
    const trade = result.nodes.get('cdm.trade::Trade') as StructureDataNode;
    const row = trade.rows.find((r) => r.attrName === 'party')!;
    expect(row.typeKind).toBe('Unresolved');
    expect(row.targetNodeId).toBeUndefined();
    expect(row.targetNamespaceUri).toBeUndefined();
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

describe('buildStructureGraph — expansion target with inheritance', () => {
  // Spec §3.2: containment is the single mechanism for both inheritance and
  // type-reference, and they must compose uniformly. An expanded Data target
  // therefore needs the same yellow base-container wrapping that the focused
  // root gets — the `materializeDataWithInheritance` helper is shared
  // between both call sites. Without it, expanded Trade would render bare
  // even though `Trade extends TradeBase`.

  it('wraps a single-level expanded target in its base container', () => {
    const fixture = {
      namespaces: [{ uri: 'cdm.trade' }],
      nodes: [
        {
          id: 'cdm.trade::TradeBase',
          $type: 'Data' as const,
          name: 'TradeBase',
          namespace: 'cdm.trade',
          attributes: [
            { name: 'tradeID', typeCall: { type: { $refText: 'string' } }, card: { inf: 1, sup: 1, unbounded: false } }
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
              name: 'tradeDate',
              typeCall: { type: { $refText: 'date' } },
              card: { inf: 1, sup: 1, unbounded: false }
            }
          ]
        },
        {
          id: 'cdm.trade::Portfolio',
          $type: 'Data' as const,
          name: 'Portfolio',
          namespace: 'cdm.trade',
          attributes: [
            {
              name: 'trade',
              typeCall: { type: { $refText: 'Trade' } },
              card: { inf: 1, sup: 1, unbounded: false }
            }
          ]
        }
      ]
    };

    const result = buildStructureGraph(fixture, {
      focusedTypeId: 'cdm.trade::Portfolio',
      expansionMap: new Map([
        [expansionKey({ namespaceUri: 'cdm.trade', typeId: 'Portfolio', attrName: 'trade' }), true]
      ])
    });

    // Portfolio + Trade data node + TradeBase container = 3 nodes total.
    expect(result.nodes.size).toBe(3);
    expect(result.nodes.has('cdm.trade::Portfolio')).toBe(true);
    expect(result.nodes.has('cdm.trade::Trade')).toBe(true);

    const baseId = `cdm.trade::Trade::__base::cdm.trade::TradeBase`;
    const base = result.nodes.get(baseId) as StructureBaseContainer;
    expect(base.kind).toBe('base');
    expect(base.baseTypeName).toBe('TradeBase');
    expect(base.baseRows.map((r) => r.attrName)).toEqual(['tradeID']);
    expect(base.baseRows.every((r) => r.isInherited)).toBe(true);
    expect(base.childNodeId).toBe('cdm.trade::Trade');

    // The Trade data node holds ONLY its own additions, not inherited rows.
    const trade = result.nodes.get('cdm.trade::Trade') as StructureDataNode;
    expect(trade.rows.map((r) => r.attrName)).toEqual(['tradeDate']);

    // The expansion edge points at the OUTERMOST base container — not the
    // raw Trade id. This is the contract that prior fixes missed.
    const portfolio = result.nodes.get('cdm.trade::Portfolio') as StructureDataNode;
    expect(portfolio.expansions.get('trade')).toBe(baseId);
  });

  it('wraps a multi-level expanded target (Trade extends TradeBase extends TradeRoot)', () => {
    const fixture = {
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
        },
        {
          id: 'cdm.trade::Portfolio',
          $type: 'Data' as const,
          name: 'Portfolio',
          namespace: 'cdm.trade',
          attributes: [
            {
              name: 'trade',
              typeCall: { type: { $refText: 'Trade' } },
              card: { inf: 1, sup: 1, unbounded: false }
            }
          ]
        }
      ]
    };

    const result = buildStructureGraph(fixture, {
      focusedTypeId: 'cdm.trade::Portfolio',
      expansionMap: new Map([
        [expansionKey({ namespaceUri: 'cdm.trade', typeId: 'Portfolio', attrName: 'trade' }), true]
      ])
    });

    // Portfolio + Trade data + TradeBase container + TradeRoot container = 4.
    expect(result.nodes.size).toBe(4);
    const outerId = `cdm.trade::Trade::__base::cdm.trade::TradeRoot`;
    const innerId = `cdm.trade::Trade::__base::cdm.trade::TradeBase`;

    expect(result.nodes.has(outerId)).toBe(true);
    expect(result.nodes.has(innerId)).toBe(true);
    expect(result.nodes.has('cdm.trade::Trade')).toBe(true);

    const outer = result.nodes.get(outerId) as StructureBaseContainer;
    expect(outer.baseTypeName).toBe('TradeRoot');
    expect(outer.baseRows.map((r) => r.attrName)).toEqual(['rootField']);
    expect(outer.childNodeId).toBe(innerId);

    const inner = result.nodes.get(innerId) as StructureBaseContainer;
    expect(inner.baseTypeName).toBe('TradeBase');
    expect(inner.baseRows.map((r) => r.attrName)).toEqual(['baseField']);
    expect(inner.childNodeId).toBe('cdm.trade::Trade');

    // Expansion edge points at the outermost (TradeRoot's) container.
    const portfolio = result.nodes.get('cdm.trade::Portfolio') as StructureDataNode;
    expect(portfolio.expansions.get('trade')).toBe(outerId);
  });

  it('reuses cached outermost id when two attributes expand the same inheriting Data', () => {
    // Verifies the outerMostId cache: Portfolio.trade1 + Portfolio.trade2
    // both expand to Trade (which extends TradeBase). The chain must be
    // materialized exactly once, and BOTH expansion edges must point at
    // the same outermost id.
    const fixture = {
      namespaces: [{ uri: 'cdm.trade' }],
      nodes: [
        {
          id: 'cdm.trade::TradeBase',
          $type: 'Data' as const,
          name: 'TradeBase',
          namespace: 'cdm.trade',
          attributes: [
            { name: 'tradeID', typeCall: { type: { $refText: 'string' } }, card: { inf: 1, sup: 1, unbounded: false } }
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
              name: 'tradeDate',
              typeCall: { type: { $refText: 'date' } },
              card: { inf: 1, sup: 1, unbounded: false }
            }
          ]
        },
        {
          id: 'cdm.trade::Portfolio',
          $type: 'Data' as const,
          name: 'Portfolio',
          namespace: 'cdm.trade',
          attributes: [
            {
              name: 'trade1',
              typeCall: { type: { $refText: 'Trade' } },
              card: { inf: 1, sup: 1, unbounded: false }
            },
            {
              name: 'trade2',
              typeCall: { type: { $refText: 'Trade' } },
              card: { inf: 1, sup: 1, unbounded: false }
            }
          ]
        }
      ]
    };

    const result = buildStructureGraph(fixture, {
      focusedTypeId: 'cdm.trade::Portfolio',
      expansionMap: new Map([
        [expansionKey({ namespaceUri: 'cdm.trade', typeId: 'Portfolio', attrName: 'trade1' }), true],
        [expansionKey({ namespaceUri: 'cdm.trade', typeId: 'Portfolio', attrName: 'trade2' }), true]
      ])
    });

    // Portfolio + Trade + TradeBase container — Trade and its base
    // container are each materialized exactly once.
    expect(result.nodes.size).toBe(3);
    const baseId = `cdm.trade::Trade::__base::cdm.trade::TradeBase`;
    expect(result.nodes.has(baseId)).toBe(true);
    expect(result.nodes.has('cdm.trade::Trade')).toBe(true);

    const portfolio = result.nodes.get('cdm.trade::Portfolio') as StructureDataNode;
    // Both edges resolve to the SAME outermost id.
    expect(portfolio.expansions.get('trade1')).toBe(baseId);
    expect(portfolio.expansions.get('trade2')).toBe(baseId);
  });
});

describe('buildStructureGraph — cycle-aware expansion (ancestor edges dropped)', () => {
  // Phase 3 layout interprets `StructureNode.expansions` as React Flow
  // containment (child node `parentId` = ancestor id). A literal A → A or
  // A → B → A in the expansions chain would form a parent-cycle the layout
  // cannot resolve, so the adapter MUST drop containment edges back to any
  // ancestor in the current recursion path while preserving the row chip
  // itself. Sibling cross-references (target completed in a prior branch,
  // not currently on the recursion stack) are preserved — they render as
  // out-of-tree handles in Phase 3.

  it('drops direct self-reference: Tree.parent: Tree records no expansion edge', () => {
    const fixtureSelf = {
      namespaces: [{ uri: 'ns' }],
      nodes: [
        {
          id: 'ns::Tree',
          $type: 'Data' as const,
          name: 'Tree',
          namespace: 'ns',
          attributes: [
            {
              name: 'parent',
              typeCall: { type: { $refText: 'Tree' } },
              card: { inf: 0, sup: 1, unbounded: false }
            }
          ]
        }
      ]
    };
    const expansionMap = new Map<string, boolean>([
      [expansionKey({ namespaceUri: 'ns', typeId: 'Tree', attrName: 'parent' }), true]
    ]);

    const result = buildStructureGraph(fixtureSelf, {
      focusedTypeId: 'ns::Tree',
      expansionMap
    });

    // Only one Tree node — no self-clone or recursion explosion.
    expect(result.nodes.size).toBe(1);
    const tree = result.nodes.get('ns::Tree') as StructureDataNode;
    // Containment edge suppressed (parent is the ancestor of itself).
    expect(tree.expansions.size).toBe(0);
    // Row data is intact — the chip still references Tree by id; only the
    // parent/child layout edge is missing.
    const row = tree.rows.find((r) => r.attrName === 'parent')!;
    expect(row.typeKind).toBe('Data');
    expect(row.targetNodeId).toBe('ns::Tree');
  });

  it('drops indirect cycle A → B → A: keeps A.next, suppresses B.next', () => {
    const fixtureIndirect = {
      namespaces: [{ uri: 'ns' }],
      nodes: [
        {
          id: 'ns::A',
          $type: 'Data' as const,
          name: 'A',
          namespace: 'ns',
          attributes: [
            {
              name: 'next',
              typeCall: { type: { $refText: 'B' } },
              card: { inf: 1, sup: 1, unbounded: false }
            }
          ]
        },
        {
          id: 'ns::B',
          $type: 'Data' as const,
          name: 'B',
          namespace: 'ns',
          attributes: [
            {
              name: 'next',
              typeCall: { type: { $refText: 'A' } },
              card: { inf: 1, sup: 1, unbounded: false }
            }
          ]
        }
      ]
    };
    const expansionMap = new Map<string, boolean>([
      [expansionKey({ namespaceUri: 'ns', typeId: 'A', attrName: 'next' }), true],
      [expansionKey({ namespaceUri: 'ns', typeId: 'B', attrName: 'next' }), true]
    ]);

    const result = buildStructureGraph(fixtureIndirect, {
      focusedTypeId: 'ns::A',
      expansionMap
    });

    expect(result.nodes.size).toBe(2);
    const a = result.nodes.get('ns::A') as StructureDataNode;
    const b = result.nodes.get('ns::B') as StructureDataNode;

    // A → B kept: B is not an ancestor when we record this edge.
    expect(a.expansions.get('next')).toBe('ns::B');
    // B → A dropped: A IS an ancestor (we recursed A then B).
    expect(b.expansions.size).toBe(0);

    // Row data intact on both sides.
    const aRow = a.rows.find((r) => r.attrName === 'next')!;
    expect(aRow.typeKind).toBe('Data');
    expect(aRow.targetNodeId).toBe('ns::B');
    const bRow = b.rows.find((r) => r.attrName === 'next')!;
    expect(bRow.typeKind).toBe('Data');
    expect(bRow.targetNodeId).toBe('ns::A');
  });

  it('preserves sibling cross-references: Trade.party AND Trade.counterparty both point to Party', () => {
    // Critical contract test. The naive fix of "if target already in `out`,
    // drop the edge" would clobber the second expansion (counterparty) here.
    // Party is in `out` after the first recursion completes, but Party is
    // NOT an ancestor of Trade — it's a completed sibling, so the edge MUST
    // be preserved so Phase 3 can render the second reference as an
    // out-of-tree handle / shared child.
    const fixtureSibling = {
      namespaces: [{ uri: 'ns' }],
      nodes: [
        {
          id: 'ns::Party',
          $type: 'Data' as const,
          name: 'Party',
          namespace: 'ns',
          attributes: [
            { name: 'id', typeCall: { type: { $refText: 'string' } }, card: { inf: 1, sup: 1, unbounded: false } }
          ]
        },
        {
          id: 'ns::Trade',
          $type: 'Data' as const,
          name: 'Trade',
          namespace: 'ns',
          attributes: [
            {
              name: 'party',
              typeCall: { type: { $refText: 'Party' } },
              card: { inf: 1, sup: 1, unbounded: false }
            },
            {
              name: 'counterparty',
              typeCall: { type: { $refText: 'Party' } },
              card: { inf: 1, sup: 1, unbounded: false }
            }
          ]
        }
      ]
    };
    const expansionMap = new Map<string, boolean>([
      [expansionKey({ namespaceUri: 'ns', typeId: 'Trade', attrName: 'party' }), true],
      [expansionKey({ namespaceUri: 'ns', typeId: 'Trade', attrName: 'counterparty' }), true]
    ]);

    const result = buildStructureGraph(fixtureSibling, {
      focusedTypeId: 'ns::Trade',
      expansionMap
    });

    // Trade + Party only — no clone of Party for the second reference.
    expect(result.nodes.size).toBe(2);
    const trade = result.nodes.get('ns::Trade') as StructureDataNode;
    // Both edges to the completed-sibling Party are preserved.
    expect(trade.expansions.get('party')).toBe('ns::Party');
    expect(trade.expansions.get('counterparty')).toBe('ns::Party');
  });
});

describe('buildStructureGraph — context-dependent expansion edges (cache replay)', () => {
  // The `outerMostId` cache makes wrapper-id resolution context-independent,
  // but expansion edges themselves are context-dependent — gated by the
  // recursion ancestor path. A naive cache (one that caches the *materialized
  // node*) would freeze a context-dependent suppression decision into a
  // permanent state. The adapter records suppressions in a side table and
  // replays them on every cache reuse so completed-sibling references that
  // were ancestors in their *first* materialization context get promoted
  // when reached later through a non-cyclic path. Spec §3.2 mandates
  // completed-sibling cross-references be preserved as cross-tree handles.
  //
  // This block is the sixth Codex finding on PR #173 tracing to spec §3.2's
  // containment-uniformity principle, but the first in the "caching strategy"
  // sub-category (prior findings were all about missing call sites).

  it('promotes B → A edge when B is reached via a non-cyclic path after first being materialized inside a cycle (Codex scenario)', () => {
    // Adversarial cycle from Codex review: Root.a → A, Root.b → B, A.b → B,
    // B.a → A. The first traversal (Root.a → A → B) suppresses B.a → A
    // because A is on the recursion stack. But the SECOND traversal
    // (Root.b → B) reaches B with A as a completed sibling, not an ancestor.
    // The edge must be promoted. Without the cache-replay logic, B.expansions
    // would be {} forever and Phase 3 would lose a real containment edge.
    const fixture = {
      namespaces: [{ uri: 'ns' }],
      nodes: [
        {
          id: 'ns::Root',
          $type: 'Data' as const,
          name: 'Root',
          namespace: 'ns',
          attributes: [
            { name: 'a', typeCall: { type: { $refText: 'A' } }, card: { inf: 1, sup: 1, unbounded: false } },
            { name: 'b', typeCall: { type: { $refText: 'B' } }, card: { inf: 1, sup: 1, unbounded: false } }
          ]
        },
        {
          id: 'ns::A',
          $type: 'Data' as const,
          name: 'A',
          namespace: 'ns',
          attributes: [{ name: 'b', typeCall: { type: { $refText: 'B' } }, card: { inf: 1, sup: 1, unbounded: false } }]
        },
        {
          id: 'ns::B',
          $type: 'Data' as const,
          name: 'B',
          namespace: 'ns',
          attributes: [{ name: 'a', typeCall: { type: { $refText: 'A' } }, card: { inf: 1, sup: 1, unbounded: false } }]
        }
      ]
    };
    const expansionMap = new Map<string, boolean>([
      [expansionKey({ namespaceUri: 'ns', typeId: 'Root', attrName: 'a' }), true],
      [expansionKey({ namespaceUri: 'ns', typeId: 'Root', attrName: 'b' }), true],
      [expansionKey({ namespaceUri: 'ns', typeId: 'A', attrName: 'b' }), true],
      [expansionKey({ namespaceUri: 'ns', typeId: 'B', attrName: 'a' }), true]
    ]);

    const result = buildStructureGraph(fixture, {
      focusedTypeId: 'ns::Root',
      expansionMap
    });

    expect(result.nodes.size).toBe(3);
    const root = result.nodes.get('ns::Root') as StructureDataNode;
    const a = result.nodes.get('ns::A') as StructureDataNode;
    const b = result.nodes.get('ns::B') as StructureDataNode;

    expect(root.expansions.get('a')).toBe('ns::A');
    expect(root.expansions.get('b')).toBe('ns::B');
    expect(a.expansions.get('b')).toBe('ns::B');
    // The key assertion — would fail before the cache-replay fix.
    expect(b.expansions.get('a')).toBe('ns::A');
  });

  it('still suppresses direct self-reference even with cache replay (regression)', () => {
    // Pure cycle with no alternate path. Cache-replay must NOT incorrectly
    // promote this — there's no non-cyclic route to "rescue" it.
    const fixture = {
      namespaces: [{ uri: 'ns' }],
      nodes: [
        {
          id: 'ns::Tree',
          $type: 'Data' as const,
          name: 'Tree',
          namespace: 'ns',
          attributes: [
            {
              name: 'parent',
              typeCall: { type: { $refText: 'Tree' } },
              card: { inf: 0, sup: 1, unbounded: false }
            }
          ]
        }
      ]
    };
    const result = buildStructureGraph(fixture, {
      focusedTypeId: 'ns::Tree',
      expansionMap: new Map([[expansionKey({ namespaceUri: 'ns', typeId: 'Tree', attrName: 'parent' }), true]])
    });

    expect(result.nodes.size).toBe(1);
    const tree = result.nodes.get('ns::Tree') as StructureDataNode;
    expect(tree.expansions.size).toBe(0);
  });

  it('still suppresses A → B → A when the ONLY path to B passes through A (regression)', () => {
    // Existing cycle-aware test, restated as a guard for the cache-replay
    // logic. B is only reachable via A, so B.next → A must stay suppressed.
    const fixture = {
      namespaces: [{ uri: 'ns' }],
      nodes: [
        {
          id: 'ns::A',
          $type: 'Data' as const,
          name: 'A',
          namespace: 'ns',
          attributes: [
            { name: 'next', typeCall: { type: { $refText: 'B' } }, card: { inf: 1, sup: 1, unbounded: false } }
          ]
        },
        {
          id: 'ns::B',
          $type: 'Data' as const,
          name: 'B',
          namespace: 'ns',
          attributes: [
            { name: 'next', typeCall: { type: { $refText: 'A' } }, card: { inf: 1, sup: 1, unbounded: false } }
          ]
        }
      ]
    };
    const result = buildStructureGraph(fixture, {
      focusedTypeId: 'ns::A',
      expansionMap: new Map<string, boolean>([
        [expansionKey({ namespaceUri: 'ns', typeId: 'A', attrName: 'next' }), true],
        [expansionKey({ namespaceUri: 'ns', typeId: 'B', attrName: 'next' }), true]
      ])
    });

    expect(result.nodes.size).toBe(2);
    const a = result.nodes.get('ns::A') as StructureDataNode;
    const b = result.nodes.get('ns::B') as StructureDataNode;
    expect(a.expansions.get('next')).toBe('ns::B');
    expect(b.expansions.size).toBe(0);
  });

  it('promotes suppressed inherited-row edge via base-container cache replay', () => {
    // Inherited-row analogue of the Codex scenario. Root extends BaseRoot,
    // BaseRoot.a: A, BaseRoot.b: B, A.b: B, B.a: A. All expanded. The base
    // container's `a` expansion gets walked first (path includes A), then
    // A.b → B causes B materialization (path includes A,B), then B.a → A is
    // suppressed. When the base container's `b` row is walked, B is in cache
    // and A is a completed sibling — B.a → A must be promoted.
    const fixture = {
      namespaces: [{ uri: 'ns' }],
      nodes: [
        {
          id: 'ns::BaseRoot',
          $type: 'Data' as const,
          name: 'BaseRoot',
          namespace: 'ns',
          attributes: [
            { name: 'a', typeCall: { type: { $refText: 'A' } }, card: { inf: 1, sup: 1, unbounded: false } },
            { name: 'b', typeCall: { type: { $refText: 'B' } }, card: { inf: 1, sup: 1, unbounded: false } }
          ]
        },
        {
          id: 'ns::Root',
          $type: 'Data' as const,
          name: 'Root',
          namespace: 'ns',
          extends: 'BaseRoot',
          attributes: [
            { name: 'extra', typeCall: { type: { $refText: 'string' } }, card: { inf: 0, sup: 1, unbounded: false } }
          ]
        },
        {
          id: 'ns::A',
          $type: 'Data' as const,
          name: 'A',
          namespace: 'ns',
          attributes: [{ name: 'b', typeCall: { type: { $refText: 'B' } }, card: { inf: 1, sup: 1, unbounded: false } }]
        },
        {
          id: 'ns::B',
          $type: 'Data' as const,
          name: 'B',
          namespace: 'ns',
          attributes: [{ name: 'a', typeCall: { type: { $refText: 'A' } }, card: { inf: 1, sup: 1, unbounded: false } }]
        }
      ]
    };
    const expansionMap = new Map<string, boolean>([
      [expansionKey({ namespaceUri: 'ns', typeId: 'BaseRoot', attrName: 'a' }), true],
      [expansionKey({ namespaceUri: 'ns', typeId: 'BaseRoot', attrName: 'b' }), true],
      [expansionKey({ namespaceUri: 'ns', typeId: 'A', attrName: 'b' }), true],
      [expansionKey({ namespaceUri: 'ns', typeId: 'B', attrName: 'a' }), true]
    ]);

    const result = buildStructureGraph(fixture, {
      focusedTypeId: 'ns::Root',
      expansionMap
    });

    const baseId = `ns::Root::__base::ns::BaseRoot`;
    const base = result.nodes.get(baseId) as StructureBaseContainer;
    const a = result.nodes.get('ns::A') as StructureDataNode;
    const b = result.nodes.get('ns::B') as StructureDataNode;

    // Base container carries the inherited-row expansions.
    expect(base.expansions.get('a')).toBe('ns::A');
    expect(base.expansions.get('b')).toBe('ns::B');
    // A.b → B kept.
    expect(a.expansions.get('b')).toBe('ns::B');
    // The key inherited-row assertion: B.a → A promoted via cache replay
    // because reaching B through BaseRoot.b places A as a completed sibling.
    expect(b.expansions.get('a')).toBe('ns::A');
  });
});

describe('buildStructureGraph — base container row expansion (inherited rows carry expansions)', () => {
  // Spec §3.2: containment is the uniform mechanism for both inheritance
  // and type-reference. A complex-typed inherited row owned by a base level
  // (e.g. TradeBase.party: Party, viewed via Trade) must be expandable in
  // exactly the same way as a row on the derived type — but the expansion
  // edge lives on the base container (the row's declaration owner) and the
  // expansion key uses the BASE's namespace+name so the same state applies
  // whether the user views TradeBase directly or any descendant.

  it('inherited Data ref expanded materializes target as base-owned containment edge', () => {
    // Spec §3.2: an inherited complex-typed row (e.g. TradeBase.party: Party
    // viewed via Trade) must be expandable. The expansion edge lives on the
    // base container (the row's declaration owner), NOT the derived Data node,
    // and the expansion key uses the BASE's namespace+name so the same state
    // applies whether the user views TradeBase directly or any descendant.
    const fixture = {
      namespaces: [{ uri: 'cdm.trade' }],
      nodes: [
        {
          id: 'cdm.trade::Party',
          $type: 'Data' as const,
          name: 'Party',
          namespace: 'cdm.trade',
          attributes: [
            { name: 'id', typeCall: { type: { $refText: 'string' } }, card: { inf: 1, sup: 1, unbounded: false } }
          ]
        },
        {
          id: 'cdm.trade::TradeBase',
          $type: 'Data' as const,
          name: 'TradeBase',
          namespace: 'cdm.trade',
          attributes: [
            {
              name: 'party',
              typeCall: { type: { $refText: 'Party' } },
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
              name: 'tradeDate',
              typeCall: { type: { $refText: 'date' } },
              card: { inf: 1, sup: 1, unbounded: false }
            }
          ]
        }
      ]
    };

    const result = buildStructureGraph(fixture, {
      focusedTypeId: 'cdm.trade::Trade',
      expansionMap: new Map([
        // Key uses the BASE's ns/name — TradeBase, not Trade.
        [expansionKey({ namespaceUri: 'cdm.trade', typeId: 'TradeBase', attrName: 'party' }), true]
      ])
    });

    // 3 nodes: TradeBase container, Trade data, Party data.
    expect(result.nodes.size).toBe(3);
    const baseId = `cdm.trade::Trade::__base::cdm.trade::TradeBase`;
    const base = result.nodes.get(baseId) as StructureBaseContainer;
    expect(base.kind).toBe('base');
    // The expansion edge lives on the BASE container.
    expect(base.expansions.get('party')).toBe('cdm.trade::Party');

    // The derived Data node has no expansion for `party` — it doesn't own
    // that attribute.
    const trade = result.nodes.get('cdm.trade::Trade') as StructureDataNode;
    expect(trade.expansions.size).toBe(0);

    // Party itself is materialized with its own rows.
    expect(result.nodes.has('cdm.trade::Party')).toBe(true);
    const party = result.nodes.get('cdm.trade::Party') as StructureDataNode;
    expect(party.kind).toBe('data');
    expect(party.rows.map((r) => r.attrName)).toEqual(['id']);
  });

  it('inherited Choice ref expanded materializes the choice node', () => {
    const fixture = {
      namespaces: [{ uri: 'ns' }],
      nodes: [
        {
          id: 'ns::Payout',
          $type: 'Choice' as const,
          name: 'Payout',
          namespace: 'ns',
          attributes: [
            { name: 'cash', typeCall: { type: { $refText: 'string' } }, card: { inf: 1, sup: 1, unbounded: false } }
          ]
        },
        {
          id: 'ns::TradeBase',
          $type: 'Data' as const,
          name: 'TradeBase',
          namespace: 'ns',
          attributes: [
            {
              name: 'payout',
              typeCall: { type: { $refText: 'Payout' } },
              card: { inf: 1, sup: 1, unbounded: false }
            }
          ]
        },
        {
          id: 'ns::Trade',
          $type: 'Data' as const,
          name: 'Trade',
          namespace: 'ns',
          extends: 'TradeBase',
          attributes: [
            {
              name: 'tradeDate',
              typeCall: { type: { $refText: 'date' } },
              card: { inf: 1, sup: 1, unbounded: false }
            }
          ]
        }
      ]
    };

    const result = buildStructureGraph(fixture, {
      focusedTypeId: 'ns::Trade',
      expansionMap: new Map([[expansionKey({ namespaceUri: 'ns', typeId: 'TradeBase', attrName: 'payout' }), true]])
    });

    const baseId = `ns::Trade::__base::ns::TradeBase`;
    const base = result.nodes.get(baseId) as StructureBaseContainer;
    expect(base.expansions.get('payout')).toBe('ns::Payout');
    // Choices have no inheritance wrapping — the edge points at the Choice
    // node id directly, no synthetic container.
    const payout = result.nodes.get('ns::Payout');
    expect(payout?.kind).toBe('choice');
  });

  it('multi-level: outer base level owns its own attribute expansions', () => {
    // Trade extends TradeBase extends TradeRoot. TradeRoot.party: Party is
    // expanded. The OUTER base container (TradeRoot's) carries the
    // expansion edge — not the inner one. Pins ownership: each base level
    // is responsible for its own attribute expansions, not its descendants'.
    const fixture = {
      namespaces: [{ uri: 'cdm.trade' }],
      nodes: [
        {
          id: 'cdm.trade::Party',
          $type: 'Data' as const,
          name: 'Party',
          namespace: 'cdm.trade',
          attributes: [
            { name: 'id', typeCall: { type: { $refText: 'string' } }, card: { inf: 1, sup: 1, unbounded: false } }
          ]
        },
        {
          id: 'cdm.trade::TradeRoot',
          $type: 'Data' as const,
          name: 'TradeRoot',
          namespace: 'cdm.trade',
          attributes: [
            {
              name: 'party',
              typeCall: { type: { $refText: 'Party' } },
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

    const result = buildStructureGraph(fixture, {
      focusedTypeId: 'cdm.trade::Trade',
      expansionMap: new Map([
        [expansionKey({ namespaceUri: 'cdm.trade', typeId: 'TradeRoot', attrName: 'party' }), true]
      ])
    });

    const outerId = `cdm.trade::Trade::__base::cdm.trade::TradeRoot`;
    const innerId = `cdm.trade::Trade::__base::cdm.trade::TradeBase`;
    const outer = result.nodes.get(outerId) as StructureBaseContainer;
    const inner = result.nodes.get(innerId) as StructureBaseContainer;
    const trade = result.nodes.get('cdm.trade::Trade') as StructureDataNode;

    // The OUTER (TradeRoot) container owns the `party` expansion.
    expect(outer.expansions.get('party')).toBe('cdm.trade::Party');
    // Inner (TradeBase) container has no expansions — its only row is a
    // BasicType, plus it doesn't own TradeRoot's `party`.
    expect(inner.expansions.size).toBe(0);
    // Derived Trade node has no expansions — same reason.
    expect(trade.expansions.size).toBe(0);
    expect(result.nodes.has('cdm.trade::Party')).toBe(true);
  });

  it('inherited Data target that itself inherits chains correctly (composes with target-inheritance)', () => {
    // Structural symmetry: TradeBase.party: Party AND Party extends PartyBase.
    // Expanding `party` from TradeBase's level must produce an expansion edge
    // pointing at the OUTERMOST container of Party's chain (PartyBase's
    // container), not at the bare Party id. This composes inherited-row
    // expansion with expansion-target-inheritance.
    const fixture = {
      namespaces: [{ uri: 'ns' }],
      nodes: [
        {
          id: 'ns::PartyBase',
          $type: 'Data' as const,
          name: 'PartyBase',
          namespace: 'ns',
          attributes: [
            { name: 'partyId', typeCall: { type: { $refText: 'string' } }, card: { inf: 1, sup: 1, unbounded: false } }
          ]
        },
        {
          id: 'ns::Party',
          $type: 'Data' as const,
          name: 'Party',
          namespace: 'ns',
          extends: 'PartyBase',
          attributes: [
            { name: 'name', typeCall: { type: { $refText: 'string' } }, card: { inf: 1, sup: 1, unbounded: false } }
          ]
        },
        {
          id: 'ns::TradeBase',
          $type: 'Data' as const,
          name: 'TradeBase',
          namespace: 'ns',
          attributes: [
            {
              name: 'party',
              typeCall: { type: { $refText: 'Party' } },
              card: { inf: 1, sup: 1, unbounded: false }
            }
          ]
        },
        {
          id: 'ns::Trade',
          $type: 'Data' as const,
          name: 'Trade',
          namespace: 'ns',
          extends: 'TradeBase',
          attributes: [
            {
              name: 'tradeDate',
              typeCall: { type: { $refText: 'date' } },
              card: { inf: 1, sup: 1, unbounded: false }
            }
          ]
        }
      ]
    };

    const result = buildStructureGraph(fixture, {
      focusedTypeId: 'ns::Trade',
      expansionMap: new Map([[expansionKey({ namespaceUri: 'ns', typeId: 'TradeBase', attrName: 'party' }), true]])
    });

    const tradeBaseId = `ns::Trade::__base::ns::TradeBase`;
    const tradeBase = result.nodes.get(tradeBaseId) as StructureBaseContainer;

    // Outermost container of Party's chain — PartyBase's wrap.
    const partyOuterId = `ns::Party::__base::ns::PartyBase`;
    // The base container's expansion points at the OUTERMOST id, mirroring
    // the contract enforced for derived-node expansions in the
    // `expansion target with inheritance` describe block above.
    expect(tradeBase.expansions.get('party')).toBe(partyOuterId);

    // Full chain materialized: TradeBase container, Trade data, PartyBase
    // container, Party data = 4 nodes.
    expect(result.nodes.size).toBe(4);
    expect(result.nodes.has(partyOuterId)).toBe(true);
    expect(result.nodes.has('ns::Party')).toBe(true);
    expect(result.nodes.has(tradeBaseId)).toBe(true);
    expect(result.nodes.has('ns::Trade')).toBe(true);

    const partyOuter = result.nodes.get(partyOuterId) as StructureBaseContainer;
    expect(partyOuter.baseTypeName).toBe('PartyBase');
    expect(partyOuter.childNodeId).toBe('ns::Party');
    const party = result.nodes.get('ns::Party') as StructureDataNode;
    // Only Party's own additions on the derived node.
    expect(party.rows.map((r) => r.attrName)).toEqual(['name']);
  });
});
