// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { indexById, fromIndex } from '../../src/collections/index-by-id.js';

describe('indexById / fromIndex', () => {
  it('indexes by .id preserving insertion order', () => {
    const items = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }];
    const map = indexById(items);
    expect(map.get('a')).toBe(items[0]);
    expect([...map.keys()]).toEqual(['a', 'b']);
  });
  it('fromIndex returns values in insertion order', () => {
    const map = new Map([['a', { id: 'a' }], ['b', { id: 'b' }]]);
    expect(fromIndex(map)).toEqual([{ id: 'a' }, { id: 'b' }]);
  });
  it('round-trips', () => {
    const items = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];
    expect(fromIndex(indexById(items))).toEqual(items);
  });
  it('a custom key selector overrides .id', () => {
    const items = [{ key: 'k1' }, { key: 'k2' }];
    expect([...indexById(items, (i) => i.key).keys()]).toEqual(['k1', 'k2']);
  });
});
