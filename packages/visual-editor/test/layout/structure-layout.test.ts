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
  it('produces a base groupContainer with the derived data as its child', () => {
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
    expect(base.type).toBe('groupContainer');
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
    expect(economics.parentId).toBe('Trade');
    expect(economics.extent).toBe('parent');
    // Economics' x should be in the right column.
    expect((economics.position as { x: number; y: number }).x).toBeGreaterThanOrEqual(260);
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
