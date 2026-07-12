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

  it('refuses strict `!== null` (not the same semantic as `!= null`)', async () => {
    const r = await parseTs('currency !== null');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  it('refuses strict `=== null` (not the same semantic as `== null`)', async () => {
    const r = await parseTs('currency === null');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
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

  it('parses a plain decimal int literal as a bigint', async () => {
    const r = await parseTs('value >= 42');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const right = (r.node as unknown as { right: { $type: string; value: bigint } }).right;
      expect(right.$type).toBe('RosettaIntLiteral');
      expect(right.value).toBe(42n);
    }
  });

  it('round-trips a large integer beyond Number.MAX_SAFE_INTEGER exactly', async () => {
    const r = await parseTs('value >= 9007199254740993');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const right = (r.node as unknown as { right: { $type: string; value: bigint } }).right;
      expect(right.$type).toBe('RosettaIntLiteral');
      expect(right.value).toBe(9007199254740993n);
    }
  });

  it('parses a plain decimal number literal as its raw text (BigDecimal is a string type)', async () => {
    const r = await parseTs('value >= 3.5');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const right = (r.node as unknown as { right: { $type: string; value: string } }).right;
      expect(right.$type).toBe('RosettaNumberLiteral');
      expect(right.value).toBe('3.5');
    }
  });

  it('parses a leading-dot decimal literal', async () => {
    const r = await parseTs('value >= .5');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const right = (r.node as unknown as { right: { $type: string; value: string } }).right;
      expect(right.$type).toBe('RosettaNumberLiteral');
      expect(right.value).toBe('.5');
    }
  });

  it('parses exponential notation as a RosettaNumberLiteral (render-ts.ts can legitimately produce these)', async () => {
    const r = await parseTs('value >= 1e5');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const right = (r.node as unknown as { right: { $type: string; value: string } }).right;
      expect(right.$type).toBe('RosettaNumberLiteral');
      expect(right.value).toBe('1e5');
    }
  });

  it('refuses hex literals (no faithful Rune representation)', async () => {
    const r = await parseTs('value >= 0xFF');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  it('refuses binary literals (no faithful Rune representation)', async () => {
    const r = await parseTs('value >= 0b101');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  it('refuses octal literals (no faithful Rune representation)', async () => {
    const r = await parseTs('value >= 0o17');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  it('refuses numeric-separator literals (no faithful Rune representation)', async () => {
    const r = await parseTs('value >= 1_000');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  it('parses a double-quoted string literal', async () => {
    const r = await parseTs('"USD"');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.node.$type).toBe('RosettaStringLiteral');
      expect((r.node as unknown as { value: string }).value).toBe('USD');
    }
  });

  it('refuses a single-quoted string literal', async () => {
    const r = await parseTs("'USD'");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  it('decodes a string escape sequence rather than storing it literally', async () => {
    const r = await parseTs('"a\\nb"');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.node.$type).toBe('RosettaStringLiteral');
      expect((r.node as unknown as { value: string }).value).toBe('a\nb');
    }
  });

  // Root cause C (task1 investigation): tree-sitter always parses a leading
  // `-` before a numeric literal as a `unary_expression` wrapping a `number`
  // node, never a single negative `number` token — `render-ts.ts` correctly
  // emits `-1`, but `toRosetta` had no `unary_expression` case, so this text
  // fell to the `default:` branch and was refused.
  it('parses a negative integer literal (unary_expression wrapping a number)', async () => {
    const r = await parseTs('value > -1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const right = (r.node as unknown as { right: { $type: string; value: bigint } }).right;
      expect(right.$type).toBe('RosettaIntLiteral');
      expect(right.value).toBe(-1n);
    }
  });

  it('parses a negative decimal literal, preserving raw text', async () => {
    const r = await parseTs('value > -1.5');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const right = (r.node as unknown as { right: { $type: string; value: string } }).right;
      expect(right.$type).toBe('RosettaNumberLiteral');
      expect(right.value).toBe('-1.5');
    }
  });

  it('round-trips the corpus finding: a chained comparison against a negative literal', async () => {
    const r = await parseTs('correlationStrikePrice?.value > -1 && correlationStrikePrice?.value < 1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.node.$type).toBe('LogicalOperation');
  });

  it('refuses unary negation of a non-numeric-literal operand (e.g. an identifier)', async () => {
    const r = await parseTs('value > -x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  it('refuses logical NOT (no Rune equivalent)', async () => {
    const r = await parseTs('!value');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });
});
