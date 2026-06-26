// SPDX-License-Identifier: MIT
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  createRepository,
  createDomainRepository,
  DuplicateKeyError,
  type AnyDomain,
} from '@rune-langium/core';
import type { Dehydrated, Data as DataT } from '@rune-langium/core';

// Minimal AnyDomain-shaped fixtures ($type + name + $namespace are all that the repo reads).
const data = (ns: string, name: string) =>
  ({ $type: 'Data', $namespace: ns, name, attributes: [] }) as unknown as AnyDomain;
const enumEl = (ns: string, name: string) =>
  ({ $type: 'RosettaEnumeration', $namespace: ns, name, enumValues: [] }) as unknown as AnyDomain;

describe('createRepository', () => {
  it('byId returns the element for an exact key, undefined otherwise', () => {
    const repo = createRepository([data('a', 'Foo')], { key: (e) => `${e.$namespace}.${e.name}`, type: (e) => e.$type });
    expect(repo.byId('a.Foo')?.name).toBe('Foo');
    expect(repo.byId('a.Bar')).toBeUndefined();
  });

  it('byType buckets by the type selector and preserves insertion order', () => {
    const repo = createRepository([data('a', 'Foo'), enumEl('a', 'E'), data('a', 'Bar')], {
      key: (e) => `${e.$namespace}.${e.name}`,
      type: (e) => e.$type,
    });
    expect(repo.byType('Data').map((e) => e.name)).toEqual(['Foo', 'Bar']);
    expect(repo.byType('RosettaEnumeration').map((e) => e.name)).toEqual(['E']);
    expect(repo.byType('Nope')).toEqual([]);
  });

  it('all() returns every item in insertion order', () => {
    const repo = createRepository([data('a', 'Foo'), data('a', 'Bar')], { key: (e) => e.name, type: (e) => e.$type });
    expect(repo.all().map((e) => e.name)).toEqual(['Foo', 'Bar']);
  });

  it('throws DuplicateKeyError on a duplicate key', () => {
    expect(() =>
      createRepository([data('a', 'Foo'), data('a', 'Foo')], { key: (e) => `${e.$namespace}.${e.name}`, type: (e) => e.$type }),
    ).toThrow(DuplicateKeyError);
  });

  it('handles an empty collection', () => {
    const repo = createRepository<AnyDomain>([], { key: (e) => e.name, type: (e) => e.$type });
    expect(repo.all()).toEqual([]);
    expect(repo.byId('x')).toBeUndefined();
    expect(repo.byType('Data')).toEqual([]);
  });
});

describe('createDomainRepository', () => {
  it('keys by qualified name by default', () => {
    const repo = createDomainRepository([data('com.foo', 'Money')]);
    expect(repo.byId('com.foo.Money')?.name).toBe('Money');
  });

  it('falls back to the bare name when $namespace is absent', () => {
    const bare = { $type: 'Data', name: 'Loose', attributes: [] } as unknown as AnyDomain;
    const repo = createDomainRepository([bare]);
    expect(repo.byId('Loose')?.name).toBe('Loose');
  });

  it('byType returns the typed bucket', () => {
    const repo = createDomainRepository([data('a', 'Foo'), enumEl('a', 'E')]);
    expect(repo.byType('Data').map((e) => e.name)).toEqual(['Foo']);
  });

  it('byType is type-safe via Extract<AnyDomain, { $type: K }>', () => {
    const repo = createDomainRepository([]);
    // Extract narrows AnyDomain to the Data arm; assignability is the practical check.
    expectTypeOf(repo.byType('Data')[0]).toExtend<Dehydrated<DataT> | undefined>();
  });
});
