// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { selectNodeRepository } from '../../src/store/node-repository.js';
import type { TypeGraphNode } from '../../src/types.js';

const node = (id: string, $type: string, name: string): TypeGraphNode =>
  ({
    id,
    type: 'data',
    position: { x: 0, y: 0 },
    data: { $type, name, attributes: [] } as unknown as TypeGraphNode['data'],
    meta: { namespace: 'a', errors: [], hasExternalRefs: false }
  }) as TypeGraphNode;

describe('selectNodeRepository', () => {
  it('byId returns the node (id = qualified name)', () => {
    const map = new Map([['a.Foo', node('a.Foo', 'Data', 'Foo')]]);
    const repo = selectNodeRepository(map);
    expect(repo.byId('a.Foo')?.id).toBe('a.Foo');
    expect(repo.byId('a.Bar')).toBeUndefined();
  });

  it('byType buckets nodes by data.$type', () => {
    const map = new Map([
      ['a.Foo', node('a.Foo', 'Data', 'Foo')],
      ['a.E', node('a.E', 'RosettaEnumeration', 'E')]
    ]);
    const repo = selectNodeRepository(map);
    expect(repo.byType('Data').map((n) => n.id)).toEqual(['a.Foo']);
  });

  it('returns the SAME repository instance for the same Map reference (memoized)', () => {
    const map = new Map([['a.Foo', node('a.Foo', 'Data', 'Foo')]]);
    expect(selectNodeRepository(map)).toBe(selectNodeRepository(map));
  });

  it('rebuilds when the Map reference changes', () => {
    const a = new Map([['a.Foo', node('a.Foo', 'Data', 'Foo')]]);
    const b = new Map([['a.Foo', node('a.Foo', 'Data', 'Foo')]]);
    expect(selectNodeRepository(a)).not.toBe(selectNodeRepository(b));
  });
});

describe('selectNodeRepository — byNamespace / namespaces', () => {
  const nodeNs = (id: string, $type: string, name: string, ns: string): TypeGraphNode =>
    ({
      id,
      type: 'data',
      position: { x: 0, y: 0 },
      data: { $type, name, attributes: [] } as unknown as TypeGraphNode['data'],
      meta: { namespace: ns, errors: [], hasExternalRefs: false },
    }) as TypeGraphNode;

  it('byNamespace returns the nodes in that namespace (meta.namespace axis)', () => {
    const map = new Map([
      ['a.Foo', nodeNs('a.Foo', 'Data', 'Foo', 'a')],
      ['a.Bar', nodeNs('a.Bar', 'Data', 'Bar', 'a')],
      ['b.Baz', nodeNs('b.Baz', 'Data', 'Baz', 'b')],
    ]);
    const repo = selectNodeRepository(map);
    expect(repo.byNamespace('a').map((n) => n.id)).toEqual(['a.Foo', 'a.Bar']);
    expect(repo.byNamespace('b').map((n) => n.id)).toEqual(['b.Baz']);
  });

  it('byNamespace returns an empty array for an unknown namespace', () => {
    const repo = selectNodeRepository(new Map([['a.Foo', nodeNs('a.Foo', 'Data', 'Foo', 'a')]]));
    expect(repo.byNamespace('zzz')).toEqual([]);
  });

  it('namespaces() returns each distinct namespace once', () => {
    const map = new Map([
      ['a.Foo', nodeNs('a.Foo', 'Data', 'Foo', 'a')],
      ['a.Bar', nodeNs('a.Bar', 'Data', 'Bar', 'a')],
      ['b.Baz', nodeNs('b.Baz', 'Data', 'Baz', 'b')],
    ]);
    expect([...selectNodeRepository(map).namespaces()].sort()).toEqual(['a', 'b']);
  });

  it('byNamespace/namespaces share the same memoized instance as byId', () => {
    const map = new Map([['a.Foo', nodeNs('a.Foo', 'Data', 'Foo', 'a')]]);
    expect(selectNodeRepository(map)).toBe(selectNodeRepository(map));
  });
});
