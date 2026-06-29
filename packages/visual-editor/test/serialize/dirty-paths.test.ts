// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import type { Patches } from 'mutative';
import { buildDirtyIndex, isNodeDirty, isSubtreeDirty } from '../../src/serialize/dirty-paths.js';

const granularPatches = [
  { op: 'replace', path: ['nodes', 'test.Foo', 'data', 'attributes', 0, 'name'], value: 'x' }
] as unknown as Patches;

describe('dirty-paths – granular patch (addAttribute/removeAttribute)', () => {
  const idx = buildDirtyIndex(granularPatches);

  it('marks the owning node dirty', () => {
    expect(isNodeDirty(idx, 'test.Foo')).toBe(true);
    expect(isNodeDirty(idx, 'test.Bar')).toBe(false);
  });

  it('marks the edited attribute subtree dirty', () => {
    expect(isSubtreeDirty(idx, 'test.Foo', ['attributes', 0])).toBe(true);
    expect(isSubtreeDirty(idx, 'test.Foo', ['attributes', 0, 'name'])).toBe(true);
  });

  it('leaves a sibling attribute clean', () => {
    expect(isSubtreeDirty(idx, 'test.Foo', ['attributes', 1])).toBe(false);
  });

  it('marks an ancestor (the whole data) dirty', () => {
    expect(isSubtreeDirty(idx, 'test.Foo', [])).toBe(true);
  });

  it('leaves conditions clean when only an attribute changed', () => {
    expect(isSubtreeDirty(idx, 'test.Foo', ['conditions', 0])).toBe(false);
  });
});

describe('dirty-paths – whole-node replace (renameType Map.set patch shape)', () => {
  const wholeNodePatches = [
    { op: 'replace', path: ['nodes', 'test.Foo'], value: {} }
  ] as unknown as Patches;
  const idx = buildDirtyIndex(wholeNodePatches);

  it('marks the owning node dirty', () => {
    expect(isNodeDirty(idx, 'test.Foo')).toBe(true);
  });

  it('makes isSubtreeDirty true for the whole data subtree (dataPath=[])', () => {
    expect(isSubtreeDirty(idx, 'test.Foo', [])).toBe(true);
  });

  it('makes isSubtreeDirty true for a deep attribute path', () => {
    expect(isSubtreeDirty(idx, 'test.Foo', ['attributes', 0])).toBe(true);
  });

  it('does not mark a different node dirty (no cross-node false positive)', () => {
    expect(isNodeDirty(idx, 'test.Bar')).toBe(false);
    expect(isSubtreeDirty(idx, 'test.Bar', [])).toBe(false);
  });
});
