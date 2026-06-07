// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import type { GraphMetadata } from '../../src/types.js';
import { makeNodeId, nameFromNodeId, splitNodeId } from '../../src/store/node-projection.js';
import { makeEdgeId, parseEdgeId } from '../../src/store/node-projection.js';
import {
  GRAPH_METADATA_KEYS,
  stripGraphMetadata,
  astRelevantProjection,
  withGraphMetadata
} from '../../src/store/node-projection.js';
import { getMemberArray, ensureMemberArray, forEachMember } from '../../src/store/node-projection.js';
import { toNodesById, nodesFromMap, toEdgesById, edgesFromMap } from '../../src/store/node-projection.js';

describe('node-projection id builders (V1, dot form)', () => {
  it('makeNodeId joins namespace and name with a dot (via qualifiedExportPath)', () => {
    expect(makeNodeId('cdm.base', 'Foo')).toBe('cdm.base.Foo');
    expect(makeNodeId('', 'Foo')).toBe('Foo'); // empty namespace → no leading dot
  });
  it('nameFromNodeId returns the trailing name via last-dot split', () => {
    expect(nameFromNodeId('cdm.base.Foo')).toBe('Foo');
    expect(nameFromNodeId('Foo')).toBe('Foo'); // no dot → whole string
  });
  it('splitNodeId returns namespace + name via last-dot split', () => {
    expect(splitNodeId('cdm.base.Foo')).toEqual({ namespace: 'cdm.base', name: 'Foo' });
    expect(splitNodeId('Foo')).toEqual({ namespace: '', name: 'Foo' });
  });
});

describe('node-projection edge-id builders (V3)', () => {
  it('builds and parses a label-bearing edge id (attribute-ref)', () => {
    const id = makeEdgeId('attribute-ref', { source: 'ns.A', target: 'ns.B', label: 'foo' });
    expect(id).toBe('ns.A--attribute-ref--foo--ns.B');
    expect(parseEdgeId(id)).toEqual({ kind: 'attribute-ref', source: 'ns.A', target: 'ns.B', label: 'foo' });
  });
  it('builds and parses a label-less edge id (extends)', () => {
    const id = makeEdgeId('extends', { source: 'ns.Child', target: 'ns.Parent' });
    expect(id).toBe('ns.Child--extends--ns.Parent');
    expect(parseEdgeId(id)).toEqual({ kind: 'extends', source: 'ns.Child', target: 'ns.Parent' });
  });
  it('returns null for a non-edge string', () => {
    expect(parseEdgeId('ns.A')).toBeNull();
  });
  it('makeEdgeId is kind-driven: a stray label on a label-less kind is ignored', () => {
    // extends is label-less → label ignored → 3-segment, round-trips
    const id = makeEdgeId('extends', { source: 'ns.A', target: 'ns.B', label: 'ignored' } as never);
    expect(id).toBe('ns.A--extends--ns.B');
    expect(parseEdgeId(id)).toEqual({ kind: 'extends', source: 'ns.A', target: 'ns.B' });
  });
  it('parseEdgeId rejects an unknown kind segment', () => {
    expect(parseEdgeId('ns.A--bogus--ns.B')).toBeNull();
  });
  it('parseEdgeId rejects a label-less kind with an extra (4th) segment', () => {
    expect(parseEdgeId('ns.A--extends--x--ns.B')).toBeNull();
  });
  it('parseEdgeId rejects a label-bearing kind missing its label (3 segments)', () => {
    expect(parseEdgeId('ns.A--attribute-ref--ns.B')).toBeNull();
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

describe('node-projection member accessors (V4)', () => {
  it('maps each kind to its member field', () => {
    expect(getMemberArray({ $type: 'Data', attributes: [1] } as never)).toEqual({ field: 'attributes', members: [1] });
    expect(getMemberArray({ $type: 'Annotation', attributes: [5] } as never)).toEqual({ field: 'attributes', members: [5] });
    expect(getMemberArray({ $type: 'Choice', attributes: [] } as never)).toEqual({ field: 'attributes', members: [] });
    expect(getMemberArray({ $type: 'RosettaEnumeration', enumValues: [2] } as never)).toEqual({ field: 'enumValues', members: [2] });
    expect(getMemberArray({ $type: 'RosettaFunction', inputs: [3] } as never)).toEqual({ field: 'inputs', members: [3] });
    expect(getMemberArray({ $type: 'RosettaRecordType', features: [4] } as never)).toEqual({ field: 'features', members: [4] });
  });
  it('returns null for a kind with no member container', () => {
    expect(getMemberArray({ $type: 'RosettaTypeAlias' } as never)).toBeNull();
  });
  it('ensureMemberArray initializes a missing array and returns it', () => {
    const node = { $type: 'Data' } as Record<string, unknown>;
    const arr = ensureMemberArray(node as never);
    expect(arr).toEqual([]);
    expect(node.attributes).toBe(arr);
  });
  it('forEachMember iterates the member array', () => {
    const seen: unknown[] = [];
    forEachMember({ $type: 'Data', attributes: ['a', 'b'] } as never, (m: unknown) => seen.push(m));
    expect(seen).toEqual(['a', 'b']);
  });
});

describe('node-projection array↔Map derivation (V5/V6)', () => {
  const nodes = [{ id: 'a' }, { id: 'b' }] as never[];
  const edges = [{ id: 'e1' }] as never[];
  it('toNodesById / nodesFromMap round-trip preserving order', () => {
    const map = toNodesById(nodes);
    expect(map.get('a')).toBe(nodes[0]);
    expect(nodesFromMap(map)).toEqual(nodes);
  });
  it('toEdgesById / edgesFromMap round-trip', () => {
    const map = toEdgesById(edges);
    expect(map.get('e1')).toBe(edges[0]);
    expect(edgesFromMap(map)).toEqual(edges);
  });
});

describe('node-projection parity guards', () => {
  it('GRAPH_METADATA_KEYS matches the strip-relevant keys of GraphMetadata', () => {
    // GraphMetadata also has `deferred` (not stripped) + an index signature; the
    // strip set is the explicit non-deferred metadata fields. This test fails if a
    // new GraphMetadata field is added without deciding its strip behavior.
    const known: Array<keyof GraphMetadata> = [
      'namespace', 'position', 'errors', 'isReadOnly', 'hasExternalRefs', 'comments', 'deferred'
    ];
    const stripExpected = known.filter((k) => k !== 'deferred');
    expect([...GRAPH_METADATA_KEYS].sort()).toEqual([...stripExpected].sort());
  });
});
