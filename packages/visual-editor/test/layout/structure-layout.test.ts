// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { layoutStructureGraph } from '../../src/layout/structure-layout.js';
import type { StructureGraphInput } from '@rune-langium/visual-editor';

describe('layoutStructureGraph — single Data node', () => {
  it('produces one React Flow node with no parent', () => {
    const input: StructureGraphInput = {
      rootNodeId: 'Trade',
      nodes: new Map([
        [
          'Trade',
          {
            id: 'Trade',
            kind: 'data',
            name: 'Trade',
            namespaceUri: 'cdm.trade',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [
              {
                attrName: 'tradeDate',
                typeName: 'date',
                typeKind: 'BasicType',
                cardinality: '0..1',
                isOptional: true,
                isInherited: false
              }
            ],
            expansions: new Map()
          }
        ]
      ])
    };

    const { nodes, edges } = layoutStructureGraph(input);

    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('Trade');
    expect(nodes[0].type).toBe('data');
    expect(nodes[0].parentId).toBeUndefined();
    expect(edges).toHaveLength(0);
  });
});

describe('layoutStructureGraph — base container with derived inside', () => {
  it('produces a base structureBase with the derived data as its child', () => {
    const input: StructureGraphInput = {
      rootNodeId: 'Trade::__base',
      nodes: new Map([
        [
          'Trade::__base',
          {
            id: 'Trade::__base',
            kind: 'base',
            baseTypeName: 'TradeBase',
            baseTypeNamespaceUri: 'cdm.trade',
            baseRows: [
              {
                attrName: 'tradeID',
                typeName: 'string',
                typeKind: 'BasicType',
                cardinality: '0..1',
                isOptional: true,
                isInherited: true
              }
            ],
            childNodeId: 'Trade',
            // Phase 2 addition: base containers carry their own expansions
            // for inherited complex rows (spec §3.2 uniformity). Empty here.
            expansions: new Map()
          }
        ],
        [
          'Trade',
          {
            id: 'Trade',
            kind: 'data',
            name: 'Trade',
            namespaceUri: 'cdm.trade',
            extendsName: 'TradeBase',
            extendsNodeId: 'TradeBase',
            rows: [
              {
                attrName: 'tradeDate',
                typeName: 'date',
                typeKind: 'BasicType',
                cardinality: '0..1',
                isOptional: true,
                isInherited: false
              }
            ],
            expansions: new Map()
          }
        ]
      ])
    };

    const { nodes } = layoutStructureGraph(input);
    expect(nodes).toHaveLength(2);
    // Phase 13 / Finding 2: layout uses per-edge instance ids for children
    // (`parentId::attrName::canonicalId`). Root retains its canonical id; we
    // look children up by `data.id` (the canonical id is preserved on the
    // payload).
    const base = nodes.find((n) => n.id === 'Trade::__base')!;
    const derived = nodes.find((n) => (n.data as { id?: string }).id === 'Trade')!;
    expect(base.type).toBe('structureBase');
    expect(derived.parentId).toBe('Trade::__base');
    expect(derived.extent).toBe('parent');
  });
});

describe('layoutStructureGraph — expansion as child', () => {
  it('places an expanded target as a child of the source Data node', () => {
    const input: StructureGraphInput = {
      rootNodeId: 'Trade',
      nodes: new Map([
        [
          'Trade',
          {
            id: 'Trade',
            kind: 'data',
            name: 'Trade',
            namespaceUri: 'cdm.trade',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [
              {
                attrName: 'economics',
                typeName: 'Economics',
                typeKind: 'Data',
                targetNodeId: 'Economics',
                targetNamespaceUri: 'cdm.trade',
                cardinality: '0..*',
                isOptional: true,
                isInherited: false
              }
            ],
            expansions: new Map([['economics', 'Economics']])
          }
        ],
        [
          'Economics',
          {
            id: 'Economics',
            kind: 'data',
            name: 'Economics',
            namespaceUri: 'cdm.trade',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [
              {
                attrName: 'notional',
                typeName: 'Money',
                typeKind: 'Unresolved',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              }
            ],
            expansions: new Map()
          }
        ]
      ])
    };

    const { nodes } = layoutStructureGraph(input);
    expect(nodes).toHaveLength(2);
    // Look up by data.id (canonical); Finding 2 uses per-edge instance ids
    // for child React Flow ids while keeping `data` aligned to canonical.
    const economics = nodes.find((n) => (n.data as { id?: string }).id === 'Economics')!;
    const trade = nodes.find((n) => n.id === 'Trade')!;
    expect(economics.parentId).toBe('Trade');
    expect(economics.extent).toBe('parent');
    // Relative-placement check: Economics sits in the right-hand column of
    // its parent, i.e. its right edge aligns with (or exceeds) the parent's
    // right edge — equivalently, its left edge is at parent.width - child.width.
    // Asserting the property, not the COL_WIDTH constant, keeps the test
    // independent of layout tuning.
    const tradeWidth = trade.width ?? 0;
    const economicsWidth = economics.width ?? 0;
    const economicsX = (economics.position as { x: number; y: number }).x;
    expect(economicsX).toBeGreaterThanOrEqual(tradeWidth - economicsWidth);
  });
});

describe('layoutStructureGraph — sibling vertical alignment', () => {
  it('stacks multiple expansions on the same parent without overlap', () => {
    // Two expansions on a single Data node. After the yCursor fix
    // (amendment to Task 3.1), the second child's y must be at least
    // `child1.y + child1.height`, i.e. they do not overlap vertically.
    // Distinct typeName / attrName values keep row ordering deterministic.
    const input: StructureGraphInput = {
      rootNodeId: 'Trade',
      nodes: new Map([
        [
          'Trade',
          {
            id: 'Trade',
            kind: 'data',
            name: 'Trade',
            namespaceUri: 'cdm.trade',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [
              {
                attrName: 'party',
                typeName: 'Party',
                typeKind: 'Data',
                targetNodeId: 'Party',
                targetNamespaceUri: 'cdm.trade',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              },
              {
                attrName: 'counterparty',
                typeName: 'Counterparty',
                typeKind: 'Data',
                targetNodeId: 'Counterparty',
                targetNamespaceUri: 'cdm.trade',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              }
            ],
            expansions: new Map([
              ['party', 'Party'],
              ['counterparty', 'Counterparty']
            ])
          }
        ],
        [
          'Party',
          {
            id: 'Party',
            kind: 'data',
            name: 'Party',
            namespaceUri: 'cdm.trade',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [
              {
                attrName: 'partyId',
                typeName: 'string',
                typeKind: 'BasicType',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              },
              {
                attrName: 'partyName',
                typeName: 'string',
                typeKind: 'BasicType',
                cardinality: '0..1',
                isOptional: true,
                isInherited: false
              }
            ],
            expansions: new Map()
          }
        ],
        [
          'Counterparty',
          {
            id: 'Counterparty',
            kind: 'data',
            name: 'Counterparty',
            namespaceUri: 'cdm.trade',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [
              {
                attrName: 'counterpartyId',
                typeName: 'string',
                typeKind: 'BasicType',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              }
            ],
            expansions: new Map()
          }
        ]
      ])
    };

    const { nodes } = layoutStructureGraph(input);
    expect(nodes).toHaveLength(3);

    const party = nodes.find((n) => (n.data as { id?: string }).id === 'Party')!;
    const counterparty = nodes.find((n) => (n.data as { id?: string }).id === 'Counterparty')!;
    expect(party.parentId).toBe('Trade');
    expect(counterparty.parentId).toBe('Trade');

    const partyY = (party.position as { x: number; y: number }).y;
    const counterpartyY = (counterparty.position as { x: number; y: number }).y;
    const partyHeight = party.height ?? 0;

    // Determine sibling order by y so the assertion is robust to insertion
    // order, then assert non-overlap.
    const [first, second, firstHeight] =
      partyY <= counterpartyY
        ? [partyY, counterpartyY, partyHeight]
        : [counterpartyY, partyY, counterparty.height ?? 0];
    expect(second).toBeGreaterThanOrEqual(first + firstHeight);
  });
});

describe('layoutStructureGraph — per-edge instances for repeated type refs (Finding 2)', () => {
  it('materialises one Node record per expansion edge when two rows reference the same target', () => {
    // Phase 13 / Finding 2 (spec 020): real schemas (CDM, FpML) routinely
    // reference the same type from multiple rows — e.g. `buyer: Party` AND
    // `seller: Party`. The previous dedup-by-canonical-id silently dropped
    // the second placement, leaving a blank gap in the column.
    //
    // The fix gives each placement a unique instance id of the form
    // `parentInstanceId::attrName::canonicalTargetId`. Both rows visibly
    // drill into their own copy of the target; the shared `data` payload
    // means cell editors and downstream consumers still see one canonical
    // type.
    //
    // Fixture: a `Trade` Data node with `buyer: Party` AND `seller: Party`,
    // both expanded. Layout must emit TWO Party placements, with distinct
    // React Flow ids but matching `data.id`.
    const input: StructureGraphInput = {
      rootNodeId: 'Trade',
      nodes: new Map([
        [
          'Trade',
          {
            id: 'Trade',
            kind: 'data',
            name: 'Trade',
            namespaceUri: 'cdm.trade',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [
              {
                attrName: 'buyer',
                typeName: 'Party',
                typeKind: 'Data',
                targetNodeId: 'Party',
                targetNamespaceUri: 'cdm.trade',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              },
              {
                attrName: 'seller',
                typeName: 'Party',
                typeKind: 'Data',
                targetNodeId: 'Party',
                targetNamespaceUri: 'cdm.trade',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              }
            ],
            expansions: new Map([
              ['buyer', 'Party'],
              ['seller', 'Party']
            ])
          }
        ],
        [
          'Party',
          {
            id: 'Party',
            kind: 'data',
            name: 'Party',
            namespaceUri: 'cdm.trade',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [
              {
                attrName: 'value',
                typeName: 'string',
                typeKind: 'BasicType',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              }
            ],
            expansions: new Map()
          }
        ]
      ])
    };

    const { nodes } = layoutStructureGraph(input);

    // Both per-row placements present — find by data.id (canonical) since the
    // React Flow `id` field carries the per-edge instance id.
    const partyPlacements = nodes.filter((n) => (n.data as { id?: string }).id === 'Party');
    expect(partyPlacements).toHaveLength(2);

    // React Flow ids must be unique; both must include the attrName so the
    // edge identity is recoverable from the id.
    const ids = partyPlacements.map((n) => n.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toEqual(expect.arrayContaining(['Trade::buyer::Party', 'Trade::seller::Party']));

    // Both contained under the same parent React Flow node.
    expect(partyPlacements[0].parentId).toBe('Trade');
    expect(partyPlacements[1].parentId).toBe('Trade');

    // Total: Root + two Party placements.
    expect(nodes).toHaveLength(3);
  });

  it('does not double-place a target that is also on the recursion ancestor path (cycle guard)', () => {
    // A self-referencing Data type. The row-level expansion is recorded but
    // the recursion stops at the cycle; we must NOT emit a Self node twice
    // under itself.
    const input: StructureGraphInput = {
      rootNodeId: 'Node',
      nodes: new Map([
        [
          'Node',
          {
            id: 'Node',
            kind: 'data',
            name: 'Node',
            namespaceUri: 'ns',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [
              {
                attrName: 'parent',
                typeName: 'Node',
                typeKind: 'Data',
                targetNodeId: 'Node',
                targetNamespaceUri: 'ns',
                cardinality: '0..1',
                isOptional: true,
                isInherited: false
              }
            ],
            expansions: new Map([['parent', 'Node']])
          }
        ]
      ])
    };

    const { nodes } = layoutStructureGraph(input);
    // Only the root — the self-reference is on the ancestor path so the
    // expansion is suppressed and the recursion terminates.
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('Node');
  });
});

describe('layoutStructureGraph — defensive cycle protection', () => {
  it('does not stack-overflow when input.nodes has a mutual-expansion cycle', () => {
    // Adapter normally prevents this via SuppressedEdge, but a malformed
    // StructureGraphInput should not crash the layout pass.
    const input: StructureGraphInput = {
      rootNodeId: 'A',
      nodes: new Map([
        [
          'A',
          {
            id: 'A',
            kind: 'data',
            name: 'A',
            namespaceUri: 'ns',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [
              {
                attrName: 'next',
                typeName: 'B',
                typeKind: 'Data',
                targetNodeId: 'B',
                targetNamespaceUri: 'ns',
                cardinality: '0..1',
                isOptional: true,
                isInherited: false
              }
            ],
            expansions: new Map([['next', 'B']])
          }
        ],
        [
          'B',
          {
            id: 'B',
            kind: 'data',
            name: 'B',
            namespaceUri: 'ns',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [
              {
                attrName: 'next',
                typeName: 'A',
                typeKind: 'Data',
                targetNodeId: 'A',
                targetNamespaceUri: 'ns',
                cardinality: '0..1',
                isOptional: true,
                isInherited: false
              }
            ],
            expansions: new Map([['next', 'A']])
          }
        ]
      ])
    };

    // Test passes by not throwing/hanging. With per-edge instance ids
    // (Finding 2), the placement walks: root A is placed (canonical id),
    // then A's `next → B` expansion adds B with instance id `A::next::B`.
    // When recursing into B, its `next → A` expansion would form a cycle
    // (A is on the ancestor path), so the placement is suppressed by the
    // cycle guard. Two nodes total — A as root, B as A's expansion child.
    const { nodes } = layoutStructureGraph(input);
    expect(nodes).toHaveLength(2);
    const a = nodes.find((n) => (n.data as { id?: string }).id === 'A')!;
    const b = nodes.find((n) => (n.data as { id?: string }).id === 'B')!;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a.parentId).toBeUndefined();
    expect(b.parentId).toBe('A');
  });
});

describe('layoutStructureGraph — Choice node', () => {
  it('places a Choice as the root with no parent', () => {
    const input: StructureGraphInput = {
      rootNodeId: 'PriceChoice',
      nodes: new Map([
        [
          'PriceChoice',
          {
            id: 'PriceChoice',
            kind: 'choice',
            name: 'PriceChoice',
            namespaceUri: 'cdm.trade',
            // StructureChoiceArm: typeName + typeKind only — no attrName, no cardinality.
            options: [
              { typeName: 'Money', typeKind: 'Builtin' as const },
              { typeName: 'IndexedRate', typeKind: 'Unresolved' as const }
            ]
          }
        ]
      ])
    };

    const { nodes } = layoutStructureGraph(input);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('choice');
    expect(nodes[0].parentId).toBeUndefined();
  });

  it('places a Choice as an expansion child of a Data root', () => {
    // Pins the Phase 1 invariant that Choice is a valid expansion target,
    // not just a root. The placement pass must emit it under `parentId`
    // when reached via a Data parent's `expansions` map.
    const input: StructureGraphInput = {
      rootNodeId: 'Trade',
      nodes: new Map([
        [
          'Trade',
          {
            id: 'Trade',
            kind: 'data',
            name: 'Trade',
            namespaceUri: 'cdm.trade',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [
              {
                attrName: 'price',
                typeName: 'PriceChoice',
                typeKind: 'Choice',
                targetNodeId: 'PriceChoice',
                targetNamespaceUri: 'cdm.trade',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              }
            ],
            expansions: new Map([['price', 'PriceChoice']])
          }
        ],
        [
          'PriceChoice',
          {
            id: 'PriceChoice',
            kind: 'choice',
            name: 'PriceChoice',
            namespaceUri: 'cdm.trade',
            // StructureChoiceArm: typeName + typeKind only — no attrName, no cardinality.
            options: [{ typeName: 'Money', typeKind: 'Builtin' as const }]
          }
        ]
      ])
    };

    const { nodes } = layoutStructureGraph(input);
    expect(nodes).toHaveLength(2);
    const choice = nodes.find((n) => (n.data as { id?: string }).id === 'PriceChoice')!;
    expect(choice).toBeDefined();
    expect(choice.type).toBe('choice');
    expect(choice.parentId).toBe('Trade');
    expect(choice.extent).toBe('parent');
  });
});

describe('layoutStructureGraph — base container with expanded inherited row', () => {
  it('places a base container expansion target as a right-column child', () => {
    // Phase 2 invariant: base containers carry their own `expansions` for
    // inherited complex rows (spec §3.2 — containment is uniform across
    // inheritance and type-reference). A row owned by the base level must
    // be just as eligible to carry an expansion edge as a derived-level row.
    const input: StructureGraphInput = {
      rootNodeId: 'Trade::__base',
      nodes: new Map([
        [
          'Trade::__base',
          {
            id: 'Trade::__base',
            kind: 'base',
            baseTypeName: 'TradeBase',
            baseTypeNamespaceUri: 'cdm.trade',
            baseRows: [
              {
                attrName: 'party',
                typeName: 'Party',
                typeKind: 'Data',
                targetNodeId: 'Party',
                targetNamespaceUri: 'cdm.trade',
                cardinality: '1..1',
                isOptional: false,
                isInherited: true
              }
            ],
            childNodeId: 'Trade',
            expansions: new Map([['party', 'Party']])
          }
        ],
        [
          'Trade',
          {
            id: 'Trade',
            kind: 'data',
            name: 'Trade',
            namespaceUri: 'cdm.trade',
            extendsName: 'TradeBase',
            extendsNodeId: 'TradeBase',
            rows: [],
            expansions: new Map()
          }
        ],
        [
          'Party',
          {
            id: 'Party',
            kind: 'data',
            name: 'Party',
            namespaceUri: 'cdm.trade',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [
              {
                attrName: 'partyId',
                typeName: 'string',
                typeKind: 'BasicType',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              }
            ],
            expansions: new Map()
          }
        ]
      ])
    };

    const { nodes } = layoutStructureGraph(input);
    const base = nodes.find((n) => n.id === 'Trade::__base')!;
    const trade = nodes.find((n) => (n.data as { id?: string }).id === 'Trade')!;
    const party = nodes.find((n) => (n.data as { id?: string }).id === 'Party')!;
    expect(base).toBeDefined();
    expect(party).toBeDefined();
    expect(party.parentId).toBe('Trade::__base');
    expect(party.extent).toBe('parent');
    // Relative-placement check: Party sits in the right-hand column of the
    // base container — its left edge clears the derived child's right edge.
    // Asserting the geometric property (not COL_WIDTH) keeps the test
    // independent of layout tuning.
    const partyX = (party.position as { x: number; y: number }).x;
    const tradeX = (trade.position as { x: number; y: number }).x;
    const tradeWidth = trade.width ?? 0;
    const partyWidth = party.width ?? 0;
    const baseWidth = base.width ?? 0;
    // Right column starts past the derived child's right edge.
    expect(partyX).toBeGreaterThanOrEqual(tradeX + tradeWidth);
    // And the expansion stays within the base container.
    expect(partyX + partyWidth).toBeLessThanOrEqual(baseWidth);
  });
});

describe('layoutStructureGraph — base container child y includes BASE_PADDING (geometry alignment)', () => {
  it('positions derived child and row offsets with BASE_PADDING offset from node origin', () => {
    // Regression for CSS-vs-layout drift: .rune-graph-group--base has
    // `padding: 16px` (BASE_PADDING), so every rendered row is 16px lower than
    // the node origin. Layout y-coords must include BASE_PADDING so that
    // expansion children placed at rowOffsets.get(attrName) visually align
    // with their base row, and the derived child clears the base rows + gap.
    //
    // Constants (must stay in sync with structure-layout.ts):
    const BASE_PADDING = 16;
    const HEADER_HEIGHT = 28;
    const ROW_HEIGHT = 28;
    const ROW_GAP = 8;

    const input: StructureGraphInput = {
      rootNodeId: 'Trade::__base',
      nodes: new Map([
        [
          'Trade::__base',
          {
            id: 'Trade::__base',
            kind: 'base',
            baseTypeName: 'TradeBase',
            baseTypeNamespaceUri: 'cdm.trade',
            baseRows: [
              {
                attrName: 'party',
                typeName: 'Party',
                typeKind: 'Data',
                targetNodeId: 'Party',
                targetNamespaceUri: 'cdm.trade',
                cardinality: '1..1',
                isOptional: false,
                isInherited: true
              }
            ],
            childNodeId: 'Trade',
            expansions: new Map([['party', 'Party']])
          }
        ],
        [
          'Trade',
          {
            id: 'Trade',
            kind: 'data',
            name: 'Trade',
            namespaceUri: 'cdm.trade',
            extendsName: 'TradeBase',
            extendsNodeId: 'TradeBase',
            rows: [],
            expansions: new Map()
          }
        ],
        [
          'Party',
          {
            id: 'Party',
            kind: 'data',
            name: 'Party',
            namespaceUri: 'cdm.trade',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [
              {
                attrName: 'partyId',
                typeName: 'string',
                typeKind: 'BasicType',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              }
            ],
            expansions: new Map()
          }
        ]
      ])
    };

    const { nodes } = layoutStructureGraph(input);
    const trade = nodes.find((n) => (n.data as { id?: string }).id === 'Trade')!;
    const party = nodes.find((n) => (n.data as { id?: string }).id === 'Party')!;

    // Derived child must be placed below base rows + BASE_PADDING gap.
    // Expected: BASE_PADDING (top CSS padding) is NOT part of this formula —
    // placeBaseChildren places the child at:
    //   y = HEADER_HEIGHT + 1 * ROW_HEIGHT + BASE_PADDING
    const expectedTradeY = HEADER_HEIGHT + 1 * ROW_HEIGHT + BASE_PADDING;
    expect((trade.position as { x: number; y: number }).y).toBe(expectedTradeY);

    // Right-column expansion for the base row must start at the row's
    // vertical center minus half ROW_HEIGHT, accounting for BASE_PADDING top.
    // Row 0 center = BASE_PADDING + HEADER_HEIGHT + 0 * ROW_HEIGHT + ROW_HEIGHT/2
    const row0Center = BASE_PADDING + HEADER_HEIGHT + 0 * ROW_HEIGHT + ROW_HEIGHT / 2;
    const expectedPartyY = row0Center - ROW_HEIGHT / 2; // = rowTop for row 0
    expect((party.position as { x: number; y: number }).y).toBe(expectedPartyY);

    // BASE_PADDING must equal 16 — documents the CSS coupling in the test.
    expect(BASE_PADDING).toBe(16);
  });
});

describe('layoutStructureGraph — late-row expansion sizing', () => {
  it('parent height accommodates a tall expansion on the last row', () => {
    // Regression for the sizing-vs-placement asymmetry (review must-fix #6/#7):
    // when only a late row is expanded, the placement pass advances
    // `yCursor = max(rowTop, yCursor)`, pushing the placed child below the
    // simple sum of expansion heights. The sizing pass must mirror that walk,
    // otherwise the parent's height clips the child.
    //
    // Fixture: a parent with three rows; only the last row (`tall`) is
    // expanded, and its target has many rows so it is tall.
    const input: StructureGraphInput = {
      rootNodeId: 'Parent',
      nodes: new Map([
        [
          'Parent',
          {
            id: 'Parent',
            kind: 'data',
            name: 'Parent',
            namespaceUri: 'ns',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [
              {
                attrName: 'first',
                typeName: 'string',
                typeKind: 'BasicType',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              },
              {
                attrName: 'second',
                typeName: 'string',
                typeKind: 'BasicType',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              },
              {
                attrName: 'tall',
                typeName: 'Tall',
                typeKind: 'Data',
                targetNodeId: 'Tall',
                targetNamespaceUri: 'ns',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              }
            ],
            expansions: new Map([['tall', 'Tall']])
          }
        ],
        [
          'Tall',
          {
            id: 'Tall',
            kind: 'data',
            name: 'Tall',
            namespaceUri: 'ns',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: Array.from({ length: 8 }, (_, i) => ({
              attrName: `r${i}`,
              typeName: 'string' as const,
              typeKind: 'BasicType' as const,
              cardinality: '1..1' as const,
              isOptional: false,
              isInherited: false
            })),
            expansions: new Map()
          }
        ]
      ])
    };

    const { nodes } = layoutStructureGraph(input);
    const parent = nodes.find((n) => (n.data as { id?: string }).id === 'Parent')!;
    const tall = nodes.find((n) => (n.data as { id?: string }).id === 'Tall')!;
    const tallY = (tall.position as { x: number; y: number }).y;
    const tallHeight = tall.height ?? 0;
    const parentHeight = parent.height ?? 0;
    // Parent must enclose the child's bottom edge — would fail before the
    // sizing pass was taught to simulate placement's max(rowTop, yCursor).
    expect(parentHeight).toBeGreaterThanOrEqual(tallY + tallHeight);
  });
});
