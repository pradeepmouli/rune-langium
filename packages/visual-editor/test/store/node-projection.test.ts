// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { makeNodeId, nameFromNodeId, splitNodeId } from '../../src/store/node-projection.js';
import { makeEdgeId, parseEdgeId } from '../../src/store/node-projection.js';
import {
  GRAPH_METADATA_KEYS,
  stripGraphMetadata,
  astRelevantProjection,
  withGraphMetadata
} from '../../src/store/node-projection.js';

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

describe('node-projection metadata projection (V2)', () => {
  const data = {
    $type: 'Data', name: 'Foo', attributes: [],
    namespace: 'ns', position: { x: 1, y: 2 }, errors: [], isReadOnly: false, hasExternalRefs: false, comments: 'c'
  } as Record<string, unknown>;

  it('GRAPH_METADATA_KEYS is the strip set (no `deferred`)', () => {
    expect([...GRAPH_METADATA_KEYS].sort()).toEqual(
      ['comments', 'errors', 'hasExternalRefs', 'isReadOnly', 'namespace', 'position'].sort()
    );
    expect(GRAPH_METADATA_KEYS.has('deferred')).toBe(false);
  });
  it('stripGraphMetadata removes only metadata keys, keeps AST fields', () => {
    const out = stripGraphMetadata(data as never);
    expect(out).toEqual({ $type: 'Data', name: 'Foo', attributes: [] });
  });
  it('astRelevantProjection excludes position/errors/hasExternalRefs but keeps namespace/comments', () => {
    const out = astRelevantProjection(data as never) as Record<string, unknown>;
    expect('position' in out).toBe(false);
    expect('errors' in out).toBe(false);
    expect('hasExternalRefs' in out).toBe(false);
    expect(out.namespace).toBe('ns');
    expect(out.comments).toBe('c');
  });
  it('withGraphMetadata merges AST data + metadata', () => {
    const node = withGraphMetadata({ $type: 'Data', name: 'Foo' } as never, {
      namespace: 'ns', position: { x: 0, y: 0 }, errors: [], hasExternalRefs: false
    });
    expect((node as Record<string, unknown>).name).toBe('Foo');
    expect((node as Record<string, unknown>).namespace).toBe('ns');
  });
});
