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
    // (Finding G: dimensions are now on style.width/height per RF12 contract.)
    const tradeWidth = (trade.style?.width as number | undefined) ?? 0;
    const economicsWidth = (economics.style?.width as number | undefined) ?? 0;
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
    // (Finding G: dimensions are now on style.width/height per RF12 contract.)
    const partyHeight = (party.style?.height as number | undefined) ?? 0;

    // Determine sibling order by y so the assertion is robust to insertion
    // order, then assert non-overlap.
    const [first, second, firstHeight] =
      partyY <= counterpartyY
        ? [partyY, counterpartyY, partyHeight]
        : [counterpartyY, partyY, (counterparty.style?.height as number | undefined) ?? 0];
    expect(second).toBeGreaterThanOrEqual(first + firstHeight);
  });
});

describe('layoutStructureGraph — data.instancePath injection (Phase 14d)', () => {
  // Phase 14d: per-instance expansion semantics. Layout exposes the chain of
  // React Flow instance ids of each node's ancestors via `data.instancePath`.
  // Renderers read this to scope row chevrons per-instance, so two visible
  // occurrences of the same type at different depths get distinct keys.

  it('root node has empty data.instancePath (root-level nodes have no ancestors)', () => {
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
            rows: [],
            expansions: new Map()
          }
        ]
      ])
    };
    const { nodes } = layoutStructureGraph(input);
    const root = nodes[0];
    expect((root.data as { instancePath?: ReadonlyArray<string> }).instancePath).toEqual([]);
  });

  it('expanded child has data.instancePath containing the parent rfId', () => {
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
              }
            ],
            expansions: new Map([['party', 'Party']])
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
            rows: [],
            expansions: new Map()
          }
        ]
      ])
    };
    const { nodes } = layoutStructureGraph(input);
    const party = nodes.find((n) => (n.data as { id?: string }).id === 'Party')!;
    expect(party).toBeDefined();
    // Party is reached via Trade.party, so its only ancestor's instance id is
    // the root's rfId ('Trade').
    expect((party.data as { instancePath?: ReadonlyArray<string> }).instancePath).toEqual(['Trade']);
  });

  it('deeper expansion accumulates ancestor instance ids in data.instancePath', () => {
    // Trade.party:Party, Party.address:Address. Address's path should include
    // both Trade and the Party instance id.
    //
    // Phase 14e: per-instance node ids are now produced by the adapter; the
    // fixture mirrors what the adapter would emit (one StructureNode entry per
    // visible occurrence, keyed by instance id).
    const partyInstanceId = 'Trade::party::Party';
    const addressInstanceId = `${partyInstanceId}::address::Address`;
    const input: StructureGraphInput = {
      rootNodeId: 'Trade',
      nodes: new Map([
        [
          'Trade',
          {
            id: 'Trade',
            instanceId: 'Trade',
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
              }
            ],
            expansions: new Map([['party', partyInstanceId]])
          }
        ],
        [
          partyInstanceId,
          {
            id: 'Party',
            instanceId: partyInstanceId,
            kind: 'data',
            name: 'Party',
            namespaceUri: 'cdm.trade',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [
              {
                attrName: 'address',
                typeName: 'Address',
                typeKind: 'Data',
                targetNodeId: 'Address',
                targetNamespaceUri: 'cdm.trade',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              }
            ],
            expansions: new Map([['address', addressInstanceId]])
          }
        ],
        [
          addressInstanceId,
          {
            id: 'Address',
            instanceId: addressInstanceId,
            kind: 'data',
            name: 'Address',
            namespaceUri: 'cdm.trade',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [],
            expansions: new Map()
          }
        ]
      ])
    };
    const { nodes } = layoutStructureGraph(input);
    const address = nodes.find((n) => (n.data as { id?: string }).id === 'Address')!;
    expect(address).toBeDefined();
    // Path: root Trade (rfId 'Trade'), then Party (rfId 'Trade::party::Party').
    expect((address.data as { instancePath?: ReadonlyArray<string> }).instancePath).toEqual([
      'Trade',
      'Trade::party::Party'
    ]);
  });

  it('sibling Party instances under the same parent share the same instancePath (canonical-path semantics)', () => {
    // buyer.Party and seller.Party both have the same parent rfId (Trade), so
    // their instancePath is identical (`[Trade]`). Per-instance disambiguation
    // at this level is provided by the DIFFERENT attrNames on the parent's
    // chevrons (`Trade.buyer` vs `Trade.seller`), not by the path itself.
    //
    // Phase 14e: per-instance materialization. Each visible Party occurrence
    // is its own StructureDataNode entry in `input.nodes`, keyed by its
    // instance id. The adapter pre-computes these; the fixture mirrors the
    // adapter's output.
    const buyerPartyId = 'Trade::buyer::Party';
    const sellerPartyId = 'Trade::seller::Party';
    const input: StructureGraphInput = {
      rootNodeId: 'Trade',
      nodes: new Map([
        [
          'Trade',
          {
            id: 'Trade',
            instanceId: 'Trade',
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
              ['buyer', buyerPartyId],
              ['seller', sellerPartyId]
            ])
          }
        ],
        [
          buyerPartyId,
          {
            id: 'Party',
            instanceId: buyerPartyId,
            kind: 'data',
            name: 'Party',
            namespaceUri: 'cdm.trade',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [],
            expansions: new Map()
          }
        ],
        [
          sellerPartyId,
          {
            id: 'Party',
            instanceId: sellerPartyId,
            kind: 'data',
            name: 'Party',
            namespaceUri: 'cdm.trade',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [],
            expansions: new Map()
          }
        ]
      ])
    };
    const { nodes } = layoutStructureGraph(input);
    const partyInstances = nodes.filter((n) => (n.data as { id?: string }).id === 'Party');
    expect(partyInstances).toHaveLength(2);
    for (const inst of partyInstances) {
      expect((inst.data as { instancePath?: ReadonlyArray<string> }).instancePath).toEqual(['Trade']);
    }
    // RfIds DO differ — that's how children of buyer.Party vs seller.Party get
    // distinct paths one level deeper.
    const rfIds = new Set(partyInstances.map((n) => n.id));
    expect(rfIds).toEqual(new Set(['Trade::buyer::Party', 'Trade::seller::Party']));
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
    //
    // Phase 14e: per-instance materialization. The adapter (and now this
    // fixture) emits one StructureDataNode per visible Party, keyed by its
    // pre-computed instance id.
    const buyerPartyId = 'Trade::buyer::Party';
    const sellerPartyId = 'Trade::seller::Party';
    const partyShape = (instanceId: string) => ({
      id: 'Party',
      instanceId,
      kind: 'data' as const,
      name: 'Party',
      namespaceUri: 'cdm.trade',
      extendsName: undefined,
      extendsNodeId: undefined,
      rows: [
        {
          attrName: 'value',
          typeName: 'string',
          typeKind: 'BasicType' as const,
          cardinality: '1..1',
          isOptional: false,
          isInherited: false
        }
      ],
      expansions: new Map<string, string>()
    });
    const input: StructureGraphInput = {
      rootNodeId: 'Trade',
      nodes: new Map([
        [
          'Trade',
          {
            id: 'Trade',
            instanceId: 'Trade',
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
              ['buyer', buyerPartyId],
              ['seller', sellerPartyId]
            ])
          }
        ],
        [buyerPartyId, partyShape(buyerPartyId)],
        [sellerPartyId, partyShape(sellerPartyId)]
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
    // (Finding G: dimensions are now on style.width/height per RF12 contract.)
    const tradeWidth = (trade.style?.width as number | undefined) ?? 0;
    const partyWidth = (party.style?.width as number | undefined) ?? 0;
    const baseWidth = (base.style?.width as number | undefined) ?? 0;
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
    const BASE_PADDING = 4;
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

    // BASE_PADDING must equal 4 — documents the CSS coupling in the test.
    // Stepped 16 → 8 → 4 across the structure-pane polish iterations to
    // progressively tighten the container around its inherited rows.
    // styles.css `--rune-base-padding` is the CSS mirror;
    // structure-css-ssot.test.ts asserts they stay synced.
    expect(BASE_PADDING).toBe(4);
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
    // (Finding G: dimensions are now on style.width/height per RF12 contract.)
    const tallHeight = (tall.style?.height as number | undefined) ?? 0;
    const parentHeight = (parent.style?.height as number | undefined) ?? 0;
    // Parent must enclose the child's bottom edge — would fail before the
    // sizing pass was taught to simulate placement's max(rowTop, yCursor).
    expect(parentHeight).toBeGreaterThanOrEqual(tallY + tallHeight);
  });
});

describe('layoutStructureGraph — per-instance sizing (Phase 14e successor to Codex P2 Finding 2)', () => {
  it('per-instance B placements use their own StructureNodes; placeholder sizes for cyclic-path only', () => {
    // Phase 14e: the original Codex P2 Finding 2 (path-aware sizing cache)
    // is superseded by full per-instance materialization. The ADAPTER now
    // emits one StructureNode per visible occurrence with pre-computed
    // instance ids; the LAYOUT no longer needs path-aware composite sizing
    // keys because each entry is unique by construction.
    //
    // This regression rewrites the original test as a per-instance scenario:
    // Root.a:A (expanded), A.b:B (cyclic — A is on path), Root.b:B (direct).
    // The fixture mirrors what the adapter produces: two separate B
    // StructureNodes, one for each visible placement. The cyclic B (inside A)
    // has B.a → A suppressed by the adapter; the direct B (under Root) gets
    // a full subtree including A as a completed sibling (with B placeholder
    // inside it via the same suppression).
    //
    // Sizing therefore differs naturally because the two B entries hold
    // different `expansions` maps — no path-aware key trickery needed.
    // Mirror what the adapter would produce post-Phase-14e:
    // - A under Root: instance `Root::a::A`
    // - B inside A: instance `Root::a::A::b::B` with EMPTY expansions
    //   (B.a → A suppressed by adapter cycle guard)
    // - B under Root: instance `Root::b::B` with `expansions: { a: <A inside B> }`
    //   where that A also has empty expansions (A.b → B suppressed because the
    //   A inside this B is on a different recursion path that would loop back).
    //
    // For simplicity, the fixture below tests only the basic per-instance
    // structural invariant — two B placements, distinct sizes follow from
    // distinct expansions on each StructureNode.
    const bInsideAId = 'Root::a::A::b::B';
    const bDirectId = 'Root::b::B';
    const aUnderRootId = 'Root::a::A';
    const aInsideBDirect = `${bDirectId}::a::A`;
    const input: StructureGraphInput = {
      rootNodeId: 'Root',
      nodes: new Map([
        [
          'Root',
          {
            id: 'Root',
            instanceId: 'Root',
            kind: 'data',
            name: 'Root',
            namespaceUri: 'ns',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [
              {
                attrName: 'a',
                typeName: 'A',
                typeKind: 'Data',
                targetNodeId: 'A',
                targetNamespaceUri: 'ns',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              },
              {
                attrName: 'b',
                typeName: 'B',
                typeKind: 'Data',
                targetNodeId: 'B',
                targetNamespaceUri: 'ns',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              }
            ],
            expansions: new Map([
              ['a', aUnderRootId],
              ['b', bDirectId]
            ])
          }
        ],
        [
          aUnderRootId,
          {
            id: 'A',
            instanceId: aUnderRootId,
            kind: 'data',
            name: 'A',
            namespaceUri: 'ns',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [
              {
                attrName: 'b',
                typeName: 'B',
                typeKind: 'Data',
                targetNodeId: 'B',
                targetNamespaceUri: 'ns',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              }
            ],
            expansions: new Map([['b', bInsideAId]])
          }
        ],
        [
          bInsideAId,
          {
            // Cyclic B — B.a → A suppressed (A on recursion path), so no expansions
            id: 'B',
            instanceId: bInsideAId,
            kind: 'data',
            name: 'B',
            namespaceUri: 'ns',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [
              {
                attrName: 'a',
                typeName: 'A',
                typeKind: 'Data',
                targetNodeId: 'A',
                targetNamespaceUri: 'ns',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              }
            ],
            expansions: new Map() // suppressed
          }
        ],
        [
          bDirectId,
          {
            // Direct B — B.a → A allowed (A is a completed sibling), gets a fresh A
            id: 'B',
            instanceId: bDirectId,
            kind: 'data',
            name: 'B',
            namespaceUri: 'ns',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [
              {
                attrName: 'a',
                typeName: 'A',
                typeKind: 'Data',
                targetNodeId: 'A',
                targetNamespaceUri: 'ns',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              }
            ],
            expansions: new Map([['a', aInsideBDirect]])
          }
        ],
        [
          aInsideBDirect,
          {
            id: 'A',
            instanceId: aInsideBDirect,
            kind: 'data',
            name: 'A',
            namespaceUri: 'ns',
            extendsName: undefined,
            extendsNodeId: undefined,
            rows: [
              {
                attrName: 'b',
                typeName: 'B',
                typeKind: 'Data',
                targetNodeId: 'B',
                targetNamespaceUri: 'ns',
                cardinality: '1..1',
                isOptional: false,
                isInherited: false
              }
            ],
            expansions: new Map() // A.b → B suppressed (the parent B is on path)
          }
        ]
      ])
    };

    const { nodes } = layoutStructureGraph(input);

    // Per-instance: two B placements visible.
    const bPlacements = nodes.filter((n) => (n.data as { id?: string }).id === 'B');
    expect(bPlacements).toHaveLength(2);

    const bInsideA = bPlacements.find((n) => n.id === bInsideAId);
    const bDirect = bPlacements.find((n) => n.id === bDirectId);
    expect(bInsideA).toBeDefined();
    expect(bDirect).toBeDefined();

    // The directly-placed B carries an expansion to its own A instance (which
    // itself has no expansions), so its sized envelope is taller than the
    // cyclic B (which has no expansions at all). Width does NOT grow under
    // the vertical-stack expansion layout — it's now `max(rowsColWidth,
    // childWidth)`, so a child sized to the same COL_WIDTH floor as the
    // parent doesn't widen the parent. (Pre-iteration the right-column
    // layout grew width with `rowsColWidth + COL_GAP + childrenWidth`,
    // which this test originally asserted via toBeGreaterThan(bInsideAWidth).)
    // (Finding G: dimensions are now on style.width/height per RF12 contract.)
    const bInsideAHeight = (bInsideA!.style?.height as number | undefined) ?? 0;
    const bDirectHeight = (bDirect!.style?.height as number | undefined) ?? 0;
    const bInsideAWidth = (bInsideA!.style?.width as number | undefined) ?? 0;
    const bDirectWidth = (bDirect!.style?.width as number | undefined) ?? 0;

    expect(bDirectHeight).toBeGreaterThan(bInsideAHeight);
    expect(bDirectWidth).toBeGreaterThanOrEqual(bInsideAWidth);
  });
});

describe('layoutStructureGraph — node dimensions on style (Finding G)', () => {
  // RF12 contract: `node.measured` holds post-mount dimensions. Pre-mount,
  // RF12 reads `initialWidth/initialHeight` for utilities like `getNodesBounds`
  // and static `fitView`. `style.width/height` is the CSS render hint that
  // drives the actual DOM size. We emit dimensions on BOTH `initialWidth/Height`
  // AND `style.width/height` so all consumers see consistent values:
  //   - exported `layoutStructureGraph()` callers using RF helpers pre-mount
  //     → read `initialWidth/Height`
  //   - browser CSS / auto-measure → reads `style.width/height`
  // Top-level `node.width/height` are now output-only (populated by RF after
  // measure), so we deliberately leave them unset.
  it('emits initialWidth/Height + style.width/height (not top-level width/height) on each node', () => {
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

    const { nodes } = layoutStructureGraph(input);
    expect(nodes).toHaveLength(1);
    const node = nodes[0];

    // Dimensions must be on style (CSS render hint).
    expect(typeof node.style?.width).toBe('number');
    expect(typeof node.style?.height).toBe('number');
    expect((node.style?.width as number) > 0).toBe(true);
    expect((node.style?.height as number) > 0).toBe(true);

    // Dimensions must ALSO be on initialWidth/initialHeight so RF12's pre-mount
    // dimension helpers (getNodesBounds, static fitView) see the right size.
    // Codex P2 on PR #197: omitting these made layoutStructureGraph callers see
    // zero-sized nodes when using RF utilities before the nodes mount.
    expect((node as { initialWidth?: number }).initialWidth).toBe(node.style?.width);
    expect((node as { initialHeight?: number }).initialHeight).toBe(node.style?.height);

    // Top-level width/height stay unset — RF12 populates them via measure on mount.
    expect(node.width).toBeUndefined();
    expect(node.height).toBeUndefined();
  });
});
