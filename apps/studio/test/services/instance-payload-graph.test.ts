// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import {
  buildPayloadGraph,
  payloadNodeId,
  payloadPointerToFieldPath
} from '../../src/services/instance-payload-graph.js';

describe('buildPayloadGraph', () => {
  it('converts escaped containment pointers to concrete form field paths', () => {
    expect(payloadPointerToFieldPath('/addresses/0/city')).toBe('addresses[0].city');
    expect(payloadPointerToFieldPath('/metadata/a~1b~0c')).toBe('metadata.a/b~c');
    expect(payloadPointerToFieldPath('')).toBeUndefined();
  });

  it('uses containment only and does not infer an edge from a matching identifier', () => {
    const graph = buildPayloadGraph({
      id: 'one',
      name: 'Party',
      typeFqn: 'test.Party',
      data: { externalId: 'two', address: { city: 'London' } },
      createdAt: 0,
      modifiedAt: 0
    });
    expect(graph.nodes.map((node) => node.pointer)).toEqual(['', '/address']);
    expect(graph.edges).toEqual([
      {
        id: JSON.stringify(['one', '', '/address']),
        source: payloadNodeId('one', ''),
        target: payloadNodeId('one', '/address')
      }
    ]);
  });

  it('escapes JSON Pointer segments and marks a capped traversal', () => {
    const graph = buildPayloadGraph(
      { id: 'one', name: 'Party', typeFqn: 'test.Party', data: { 'a/b': { '~key': {} } }, createdAt: 0, modifiedAt: 0 },
      2
    );
    expect(graph.nodes.map((node) => node.pointer)).toEqual(['', '/a~1b']);
    expect(graph.truncated).toBe(true);
  });
});
