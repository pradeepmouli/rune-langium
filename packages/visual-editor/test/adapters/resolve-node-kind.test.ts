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

  it('falls back to React-Flow node.type when $type is missing', () => {
    const node = { id: 'ns.F', type: 'func', data: { name: 'F' } };
    expect(resolveNodeKind(node)).toBe('func');
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

  it('prefers data.$type over node.type (priority order)', () => {
    // $type wins over node.type
    expect(resolveNodeKind({ type: 'enum', data: { $type: 'Data' } })).toBe('data');
    // node.type used when $type missing
    expect(resolveNodeKind({ type: 'enum', data: {} })).toBe('enum');
  });
});
