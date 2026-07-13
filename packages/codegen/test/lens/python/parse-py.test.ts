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

  // Round 7 Finding 1 (P2): tree-sitter-python lexes `async`/`await` as a
  // plain `identifier` node in some grammar positions (e.g. a comparison
  // operand) even though they're Python 3 hard keywords. The old code only
  // checked character-shape validity (isRuneValidId), not reserved-word
  // membership, so this used to return `ok: true` with a
  // RosettaSymbolReference — but renderPy already refuses to render a
  // RosettaSymbolReference whose $refText is in PY_RESERVED_WORDS, breaking
  // the Python→Rune→Python round-trip fixed point.
  it('refuses a bare identifier that is the Python reserved word `async`', async () => {
    const r = await parsePy('async > 0');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  it('refuses a bare identifier that is the Python reserved word `await`', async () => {
    const r = await parsePy('await > 0');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  // Round 7 Finding 2 (P2): tree-sitter-python's `integer` token includes
  // Python 2's legacy long-integer `L`/`l` suffix in the token text
  // (`"1L"`), which the grammar still lexes as a valid `integer` node even
  // though it's not valid Python 3 syntax. The old refused-character regex
  // didn't include `L`/`l`, so execution fell through to `BigInt(text)`,
  // which threw a raw, uncaught SyntaxError instead of resolving with the
  // normal `LensResult` refusal contract. Assert the promise resolves
  // normally with `ok: false`, not that it throws/rejects.
  it('refuses a long-integer literal with the Python 2 `L` suffix (no throw)', async () => {
    const r = await parsePy('value > 1L');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  it('refuses a negative long-integer literal with the Python 2 `L` suffix (unary_operator path, no throw)', async () => {
    const r = await parsePy('value > -1L');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  // Round 8 Finding 1 (P2): tree-sitter-python's Python-2-compatible
  // `integer` token still lexes a leading-zero decimal form like `"01"` as
  // a valid `integer` node, even though a leading zero on a decimal
  // integer literal with more than one digit is a SyntaxError in real
  // Python 3 ("leading zeros in decimal integer literals are not
  // permitted; use an 0o prefix for octal integers"). The old refused-
  // character regex had no forbidden CHARACTER to catch here — `"01"` is
  // an invalid decimal SHAPE, not an invalid character — so execution fell
  // through to `BigInt("01")`, which happily returns `1n`, silently
  // normalizing invalid Python input into valid Rune instead of refusing
  // it.
  it('refuses a decimal integer literal with a leading zero', async () => {
    const r = await parsePy('value > 01');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  it('refuses a negative decimal integer literal with a leading zero (unary_operator path)', async () => {
    const r = await parsePy('value > -01');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  it('refuses a run of leading zeros, not just a single one', async () => {
    const r = await parsePy('value > 00');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  it('still parses a bare single zero (no regression from the leading-zero fix)', async () => {
    const r = await parsePy('value > 0');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const right = (r.node as any).right;
      expect(right.$type).toBe('RosettaIntLiteral');
      expect(right.value).toBe(0n);
    }
  });

  it('still parses a leading zero before a decimal point (no regression from the leading-zero fix)', async () => {
    const r = await parsePy('value > 0.5');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const right = (r.node as any).right;
      expect(right.$type).toBe('RosettaNumberLiteral');
      expect(right.value).toBe('0.5');
    }
  });

  // Round 11 Finding 1 (P2): `stringNodeToRosetta` decoded a Python
  // double-quoted string via `JSON.parse`, which recognizes `\/` as an
  // escape sequence that decodes to a single `/`, DROPPING the backslash.
  // Real Python has no `\/` escape — an unrecognized escape keeps BOTH the
  // backslash and the following character literally (a 2-character
  // result). Without this check, `parsePy` used to silently commit a
  // `RosettaStringLiteral` with the WRONG value (JSON's decoding, not
  // Python's) instead of refusing — this is a Python-only bug: real
  // TypeScript/JavaScript's `\/` escape decodes to `/` just like JSON, so
  // parse-ts.ts's identical-looking `stringNodeToRosetta` does not need
  // (and must not get) a matching guard.
  it('refuses a string containing the JSON-only `\\/` escape', async () => {
    const r = await parsePy('value == "\\/"');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  it('refuses the `\\/` escape embedded mid-string, not just at the start', async () => {
    const r = await parsePy('value == "a\\/b"');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  // False-positive guard: an ESCAPED backslash immediately followed by a
  // literal slash (Python source `"\\/"`, i.e. `\\` then `/`) is NOT the
  // JSON-only `\/` escape — both JSON and real Python decode `\\` to a
  // single backslash, then take the `/` literally, agreeing on the
  // 2-character result `\` + `/`. A naive substring search for `\/` would
  // wrongly flag this; the scan must track escape state char-by-char so it
  // only flags an UNESCAPED backslash directly before a slash.
  it('does not flag an escaped backslash followed by a literal slash (no false positive)', async () => {
    const r = await parsePy('value == "\\\\/"');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const right = (r.node as any).right;
      expect(right.$type).toBe('RosettaStringLiteral');
      expect(right.value).toBe('\\/');
      expect(right.value).toHaveLength(2);
    }
  });
});
