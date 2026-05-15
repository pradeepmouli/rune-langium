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
