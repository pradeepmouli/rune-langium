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

  it('parses negative integer literals via unary_operator', async () => {
    const r = await parsePy('value > -1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const right = (r.node as any).right;
      expect(right.$type).toBe('RosettaIntLiteral');
      expect(right.value).toBe(-1n);
    }
  });

  it('parses negative decimal literals via unary_operator (argument.type is "float", not "integer")', async () => {
    const r = await parsePy('value > -1.5');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const right = (r.node as any).right;
      expect(right.$type).toBe('RosettaNumberLiteral');
      expect(right.value).toBe('-1.5');
    }
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

  // Fix 1 (P1): `expression_statement`'s grammar production also accepts a
  // bare comma-separated expression list (`seq(commaSep1($.expression),
  // optional(','))`), giving it MULTIPLE children — `a, b` produces
  // `identifier "a"`, `,`, `identifier "b"` (3 children). The old code only
  // read `exprStatement.child(0)`, silently ignoring the `, b` part, so this
  // used to return `ok: true` with a RosettaSymbolReference for just `a`,
  // silently dropping `b`.
  it('refuses a comma-separated expression list (silent-truncation guard)', async () => {
    const r = await parsePy('a, b');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('syntax-error');
  });

  it('refuses a trailing-comma expression list', async () => {
    const r = await parsePy('a,');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('syntax-error');
  });

  it('still parses a plain single expression (no regression from the comma-list fix)', async () => {
    const r = await parsePy('a');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.node.$type).toBe('RosettaSymbolReference');
  });

  // Fix 2 (P2): a getattr feature name must be a legal Rune ID
  // (`/\^?[a-zA-Z_][a-zA-Z_0-9]*/`, whole-string). None of these can ever be
  // rescued by `^`-escaping (that only handles reserved-keyword collisions,
  // not illegal characters).
  it('refuses a getattr feature name containing a hyphen', async () => {
    const r = await parsePy('getattr(trade, "bad-name", None)');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  it('refuses a getattr feature name containing a dot', async () => {
    const r = await parsePy('getattr(trade, "a.b", None)');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  it('refuses a getattr feature name with a leading digit', async () => {
    const r = await parsePy('getattr(trade, "9bad", None)');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  // Fix 3 (P2 sibling case): the plainer, more fundamental `identifier`
  // case (producing a bare RosettaSymbolReference, not a RosettaFeatureCall)
  // had the same gap as Fix 2's getattr feature-name check. Python's
  // tree-sitter `identifier` token allows Unicode (XID_Start/XID_Continue),
  // but Rune's ID terminal is ASCII-only
  // (`/\^?[a-zA-Z_][a-zA-Z_0-9]*/`, packages/core/src/grammar/rune-dsl.langium:7)
  // — this used to be silently accepted and committed as invalid Rune text.
  it('refuses a bare identifier containing a non-ASCII character', async () => {
    const r = await parsePy('π > 0');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });
});
