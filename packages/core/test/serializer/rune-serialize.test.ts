// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { RUNE_SERIALIZE_OPTIONS, runeBigIntReplacer, serializeRuneModel } from '../../src/serializer/rune-serialize.js';

describe('runeBigIntReplacer', () => {
  it('converts bigint to Number (canonical policy)', () => {
    expect(runeBigIntReplacer('k', 5n)).toBe(5);
    expect(typeof runeBigIntReplacer('k', 5n)).toBe('number');
  });
  it('passes non-bigint values through unchanged', () => {
    expect(runeBigIntReplacer('k', 'x')).toBe('x');
    expect(runeBigIntReplacer('k', 42)).toBe(42);
  });
  it('makes JSON.stringify bigint-safe and agrees with the serializer policy', () => {
    expect(JSON.stringify({ n: 7n }, runeBigIntReplacer)).toBe('{"n":7}');
  });
});

describe('RUNE_SERIALIZE_OPTIONS', () => {
  it('requests refText + textRegions and carries a bigint replacer', () => {
    expect(RUNE_SERIALIZE_OPTIONS.refText).toBe(true);
    expect(RUNE_SERIALIZE_OPTIONS.textRegions).toBe(true);
    expect(typeof RUNE_SERIALIZE_OPTIONS.replacer).toBe('function');
  });
});

describe('serializeRuneModel', () => {
  it('delegates to the serializer with RUNE_SERIALIZE_OPTIONS', () => {
    const calls: unknown[] = [];
    const fakeSerializer = {
      serialize(model: unknown, opts: unknown) {
        calls.push({ model, opts });
        return '{"ok":true}';
      }
    };
    const out = serializeRuneModel(fakeSerializer as never, { $type: 'RosettaModel' } as never);
    expect(out).toBe('{"ok":true}');
    expect(calls).toHaveLength(1);
    expect((calls[0] as { opts: { refText: boolean } }).opts.refText).toBe(true);
  });
});
