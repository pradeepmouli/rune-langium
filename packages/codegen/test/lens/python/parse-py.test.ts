// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parsePy } from '../../../src/lens/python/parse-py.js';

describe('parsePy', () => {
  it('parses literals', async () => {
    const r1 = await parsePy('True');
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.node).toMatchObject({ $type: 'RosettaBooleanLiteral', value: true });

    const r2 = await parsePy('3');
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.node).toMatchObject({ $type: 'RosettaIntLiteral', value: 3n });
  });

  it('parses is not None / is None as exists/absent', async () => {
    const r1 = await parsePy('currency is not None');
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.node.$type).toBe('RosettaExistsExpression');

    const r2 = await parsePy('currency is None');
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.node.$type).toBe('RosettaAbsentExpression');
  });

  it('parses a 3-arg getattr call as a feature call', async () => {
    const r = await parsePy('getattr(trade, "quantity", None)');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.node.$type).toBe('RosettaFeatureCall');
      expect((r.node as any).feature.$refText).toBe('quantity');
    }
  });

  it('refuses the 2-arg getattr form (no default)', async () => {
    const r = await parsePy('getattr(trade, "quantity")');
    expect(r.ok).toBe(false);
  });

  it('refuses a non-getattr call', async () => {
    const r = await parsePy('len(trade)');
    expect(r.ok).toBe(false);
  });

  it('refuses plain attribute access', async () => {
    const r = await parsePy('trade.quantity');
    expect(r.ok).toBe(false);
  });

  it('refuses chained comparisons', async () => {
    const r = await parsePy('a < b < c');
    expect(r.ok).toBe(false);
  });

  it('refuses ** and //', async () => {
    expect((await parsePy('a ** 2')).ok).toBe(false);
    expect((await parsePy('a // b')).ok).toBe(false);
  });

  it('refuses not', async () => {
    expect((await parsePy('not x')).ok).toBe(false);
  });

  it('parses negative numeric literals via unary_operator', async () => {
    const r = await parsePy('value > -1');
    expect(r.ok).toBe(true);
  });

  it('refuses exponent-without-decimal, same Rune BigDecimal grammar constraint as parse-ts.ts', async () => {
    const r = await parsePy('value > 1e5');
    expect(r.ok).toBe(false);
  });

  it('refuses complex number literals', async () => {
    expect((await parsePy('value > 1j')).ok).toBe(false);
  });

  it('refuses single-quoted strings', async () => {
    const r = await parsePy("value == 'USD'");
    expect(r.ok).toBe(false);
  });

  it('accepts double-quoted strings', async () => {
    const r = await parsePy('value == "USD"');
    expect(r.ok).toBe(true);
  });
});
