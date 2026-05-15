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
    const base = nodes.find((n) => n.id === 'Trade::__base')!;
    const derived = nodes.find((n) => n.id === 'Trade')!;
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
    const economics = nodes.find((n) => n.id === 'Economics')!;
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

    const party = nodes.find((n) => n.id === 'Party')!;
    const counterparty = nodes.find((n) => n.id === 'Counterparty')!;
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

describe('layoutStructureGraph — cross-tree handle deduplication', () => {
  it('emits one Node record for a target referenced by two parents', () => {
    // Phase 2's adapter cache-replay can produce duplicate expansion edges
    // pointing to the same target id from multiple parents. React Flow
    // forbids a node from having two parents, so the layout dedupes by
    // first-encounter-wins — the second placement attempt is silently
    // dropped. This test exercises that dedup path.
    //
    // Fixture: a single `Root` Data node with two rows (`a` and `b`),
    // both expanded to the same `Target`. Only the first reference (by
    // Map iteration order, which preserves insertion order) survives.
    const input: StructureGraphInput = {
      rootNodeId: 'Root',
      nodes: new Map([
        [
          'Root',
          {
            id: 'Root',
            kind: 'data',
            name: 'Root',
            namespaceUri: 'cdm.trade',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [
              {
                attrName: 'a',
                typeName: 'Target',
                typeKind: 'Data',
                targetNodeId: 'Target',
                targetNamespaceUri: 'cdm.trade',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              },
              {
                attrName: 'b',
                typeName: 'Target',
                typeKind: 'Data',
                targetNodeId: 'Target',
                targetNamespaceUri: 'cdm.trade',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              }
            ],
            expansions: new Map([
              ['a', 'Target'],
              ['b', 'Target']
            ])
          }
        ],
        [
          'Target',
          {
            id: 'Target',
            kind: 'data',
            name: 'Target',
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

    // Exactly one record for Target — the duplicate from `b → Target`
    // is silently dropped by the `placed: Set<string>` dedup in
    // `layoutStructureGraph`.
    const targets = nodes.filter((n) => n.id === 'Target');
    expect(targets).toHaveLength(1);
    expect(targets[0].parentId).toBe('Root');
    expect(nodes).toHaveLength(2); // Root + Target only
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

    // Test passes by not throwing/hanging. After the cycle-placeholder
    // symmetry fix (sizing-pass placeholder is cached in `sizes`), the
    // placement pass produces both nodes: A as the root, and B as A's
    // expansion child via the cached placeholder. The recursive back-edge
    // from B → A is dropped by the `placed: Set<string>` dedup (A is
    // already placed), so the cycle does not unroll further.
    const { nodes } = layoutStructureGraph(input);
    expect(nodes).toHaveLength(2);
    expect(nodes.some((n) => n.id === 'A')).toBe(true);
    expect(nodes.some((n) => n.id === 'B')).toBe(true);
    const a = nodes.find((n) => n.id === 'A')!;
    const b = nodes.find((n) => n.id === 'B')!;
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
            options: [
              {
                attrName: 'fixedPrice',
                typeName: 'Money',
                typeKind: 'BasicType',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              },
              {
                attrName: 'indexedPrice',
                typeName: 'IndexedRate',
                typeKind: 'BasicType',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              }
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
            options: [
              {
                attrName: 'fixedPrice',
                typeName: 'Money',
                typeKind: 'BasicType',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              }
            ]
          }
        ]
      ])
    };

    const { nodes } = layoutStructureGraph(input);
    expect(nodes).toHaveLength(2);
    const choice = nodes.find((n) => n.id === 'PriceChoice')!;
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
    const trade = nodes.find((n) => n.id === 'Trade')!;
    const party = nodes.find((n) => n.id === 'Party')!;
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
    const trade = nodes.find((n) => n.id === 'Trade')!;
    const party = nodes.find((n) => n.id === 'Party')!;

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
    const parent = nodes.find((n) => n.id === 'Parent')!;
    const tall = nodes.find((n) => n.id === 'Tall')!;
    const tallY = (tall.position as { x: number; y: number }).y;
    const tallHeight = tall.height ?? 0;
    const parentHeight = parent.height ?? 0;
    // Parent must enclose the child's bottom edge — would fail before the
    // sizing pass was taught to simulate placement's max(rowTop, yCursor).
    expect(parentHeight).toBeGreaterThanOrEqual(tallY + tallHeight);
  });
});
