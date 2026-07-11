// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parseTs } from '../../../src/lens/typescript/parse-ts.js';

describe('parseTs', () => {
  it('parses a comparison', async () => {
    const r = await parseTs('value >= 0');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.node.$type).toBe('ComparisonOperation');
  });

  it('parses `!= null` as an exists check, not equality', async () => {
    const r = await parseTs('currency != null');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.node.$type).toBe('RosettaExistsExpression');
  });

  it('parses `== null` as an absent check', async () => {
    const r = await parseTs('currency == null');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.node.$type).toBe('RosettaAbsentExpression');
  });

  it('parses logical and/or with correct precedence', async () => {
    const r = await parseTs('a && (b || c)');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.node.$type).toBe('LogicalOperation');
  });

  it('parses optional-chained feature paths', async () => {
    const r = await parseTs('trade?.quantity');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.node.$type).toBe('RosettaFeatureCall');
  });

  it('parses chained optional feature paths', async () => {
    const r = await parseTs('trade?.quantity?.amount');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.node.$type).toBe('RosettaFeatureCall');
      expect((r.node as unknown as { receiver: { $type: string } }).receiver.$type).toBe('RosettaFeatureCall');
    }
  });

  it('refuses a syntactically invalid buffer', async () => {
    const r = await parseTs('value >=');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('syntax-error');
  });

  it('refuses an assignment (out of subset)', async () => {
    const r = await parseTs('value = 3');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  it('refuses a method call (out of subset)', async () => {
    const r = await parseTs('value.toFixed(2)');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  it('refuses unguarded property access (no null-safety guarantee)', async () => {
    const r = await parseTs('trade.quantity');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  it('refuses a non-expression statement', async () => {
    const r = await parseTs('for (;;) {}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('syntax-error');
  });

  it('parses a plain decimal int literal', async () => {
    const r = await parseTs('value >= 42');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const right = (r.node as unknown as { right: { $type: string; value: number } }).right;
      expect(right.$type).toBe('RosettaIntLiteral');
      expect(right.value).toBe(42);
    }
  });

  it('parses a plain decimal number literal', async () => {
    const r = await parseTs('value >= 3.5');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const right = (r.node as unknown as { right: { $type: string; value: number } }).right;
      expect(right.$type).toBe('RosettaNumberLiteral');
      expect(right.value).toBe(3.5);
    }
  });

  it('refuses exponential notation number literals (would silently truncate)', async () => {
    const r = await parseTs('value >= 1e5');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  it('refuses hex literals (would silently truncate to 0)', async () => {
    const r = await parseTs('value >= 0xFF');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  it('refuses numeric-separator literals (would silently truncate)', async () => {
    const r = await parseTs('value >= 1_000');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });
});
