// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';

import { resolveNodeKind } from '../../src/adapters/model-helpers.js';

describe('resolveNodeKind', () => {
  it('resolves a user-authored AST node via data.$type', () => {
    const node = { id: 'ns.Foo', type: 'data', data: { $type: 'Data', name: 'Foo' } };
    expect(resolveNodeKind(node)).toBe('data');
  });

  it('resolves a curated enum via data.$type (no typeKind fallback)', () => {
    const node = { id: 'ns.E', type: 'enum', data: { $type: 'RosettaEnumeration', name: 'E' } };
    expect(resolveNodeKind(node)).toBe('enum');
  });

  it('resolves a curated choice via data.$type', () => {
    const node = { id: 'ns.C', type: 'choice', data: { $type: 'Choice', name: 'C' } };
    expect(resolveNodeKind(node)).toBe('choice');
  });

  it("degrades to the 'data' default when $type is missing (node.type fallback retired)", () => {
    // Phase 3 prep: $type is guaranteed on every node since the typeKind→$type
    // unification, so the React-Flow node.type fallback arm was dead code and
    // is retired. $type-less inputs hit the last-resort default.
    const node = { id: 'ns.F', type: 'func', data: { name: 'F' } };
    expect(resolveNodeKind(node)).toBe('data');
  });

  it('accepts a raw data payload (without an enclosing React-Flow node wrapper)', () => {
    expect(resolveNodeKind({ $type: 'RosettaEnumeration', name: 'E' })).toBe('enum');
    expect(resolveNodeKind({ $type: 'Choice', name: 'C' })).toBe('choice');
  });

  it("returns 'data' for null / undefined / unrecognised inputs", () => {
    expect(resolveNodeKind(null)).toBe('data');
    expect(resolveNodeKind(undefined)).toBe('data');
    expect(resolveNodeKind({})).toBe('data');
    expect(resolveNodeKind({ data: { $type: 'NotARealType' } })).toBe('data');
  });

  it('resolves from data.$type only — node.type is never consulted', () => {
    // $type wins regardless of node.type
    expect(resolveNodeKind({ type: 'enum', data: { $type: 'Data' } })).toBe('data');
    // node.type fallback retired: $type-less data hits the default
    expect(resolveNodeKind({ type: 'enum', data: {} })).toBe('data');
  });
});
