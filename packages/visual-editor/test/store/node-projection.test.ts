// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { makeNodeId, nameFromNodeId, splitNodeId } from '../../src/store/node-projection.js';
import { makeEdgeId, parseEdgeId } from '../../src/store/node-projection.js';

describe('node-projection id builders (V1)', () => {
  it('makeNodeId joins namespace and name with the :: separator', () => {
    expect(makeNodeId('cdm.base', 'Foo')).toBe('cdm.base::Foo');
  });
  it('nameFromNodeId returns the trailing name', () => {
    expect(nameFromNodeId('cdm.base::Foo')).toBe('Foo');
    expect(nameFromNodeId('Foo')).toBe('Foo'); // no separator → whole string
  });
  it('splitNodeId returns namespace + name', () => {
    expect(splitNodeId('cdm.base::Foo')).toEqual({ namespace: 'cdm.base', name: 'Foo' });
    expect(splitNodeId('Foo')).toEqual({ namespace: '', name: 'Foo' });
  });
});

describe('node-projection edge-id builders (V3)', () => {
  it('builds and parses a label-bearing edge id (attribute-ref)', () => {
    const id = makeEdgeId('attribute-ref', { source: 'ns::A', target: 'ns::B', label: 'foo' });
    expect(id).toBe('ns::A--attribute-ref--foo--ns::B');
    expect(parseEdgeId(id)).toEqual({ kind: 'attribute-ref', source: 'ns::A', target: 'ns::B', label: 'foo' });
  });
  it('builds and parses a label-less edge id (extends)', () => {
    const id = makeEdgeId('extends', { source: 'ns::Child', target: 'ns::Parent' });
    expect(id).toBe('ns::Child--extends--ns::Parent');
    expect(parseEdgeId(id)).toEqual({ kind: 'extends', source: 'ns::Child', target: 'ns::Parent' });
  });
  it('returns null for a non-edge string', () => {
    expect(parseEdgeId('ns::A')).toBeNull();
  });
});
