// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parseExpression } from '@rune-langium/core';
import { renderPy } from '../../../src/lens/python/render-py.js';

function render(rune: string): string | null {
  const p = parseExpression(rune);
  if (p.hasErrors) throw new Error(`must parse: ${rune}`);
  return renderPy(p.value);
}

describe('renderPy', () => {
  it('renders literals', () => {
    expect(render('True')).toBe('True');
    expect(render('3')).toBe('3');
    expect(render('3.5')).toBe('3.5');
    expect(render('"USD"')).toBe('"USD"');
  });

  it('renders exists/absent as is not None / is None', () => {
    expect(render('currency exists')).toBe('currency is not None');
    expect(render('currency is absent')).toBe('currency is None');
  });

  it('renders a feature call as a 3-arg getattr with None default', () => {
    expect(render('trade -> quantity')).toBe('getattr(trade, "quantity", None)');
  });

  it('renders a multi-hop feature call as nested getattr calls', () => {
    expect(render('trade -> quantity -> amount')).toBe('getattr(getattr(trade, "quantity", None), "amount", None)');
  });

  it('renders equality using Python == / !=, not TS === / !==', () => {
    expect(render('value = 0')).toBe('value == 0');
    expect(render('value <> 0')).toBe('value != 0');
  });

  it('renders logical operators using Python and/or keywords', () => {
    expect(render('a and b')).toBe('a and b');
    expect(render('a or b')).toBe('a or b');
  });

  it('preserves precedence with minimal parenthesization, same tier-aware rule as render-ts.ts', () => {
    expect(render('(a + b) * c')).toBe('(a + b) * c');
    expect(render('a * b + c')).toBe('a * b + c');
    expect(render('a and b and c')).toBe('a and b and c'); // same-tier left chain — no spurious parens
  });

  it('parenthesizes a nested comparison under another comparison (Python chains unparenthesized comparisons)', () => {
    // Rune: (a < b) = c  ->  Python must NOT read as a chained comparison
    expect(render('(a < b) = c')).toBe('(a < b) == c');
  });

  it('parenthesizes a nested comparison under exists', () => {
    // Rune: (a < b) exists
    expect(render('(a < b) exists')).toBe('(a < b) is not None');
  });

  it('parenthesizes a nested exists under an equality comparison', () => {
    // Rune: (currency exists) = flag
    expect(render('(currency exists) = flag')).toBe('(currency is not None) == flag');
  });

  it('parenthesizes a nested absent under exists', () => {
    // Rune: (currency is absent) exists -- yes, this is a weird/unusual Rune
    // tree, but the AST shape is what render-py.ts must handle correctly
    // regardless.
    expect(render('(currency is absent) exists')).toBe('(currency is None) is not None');
  });

  it('parenthesizes exists/absent when nested under an ArithmeticOperation parent', () => {
    // exists/absent used to be treated as atomic (default: return null in
    // precedenceTier), so this rendered unparenthesized as
    // "currency is not None + 1" -- wrong grouping, since Python's '+' binds
    // tighter than 'is not'.
    expect(render('(currency exists) + 1')).toBe('(currency is not None) + 1');
    expect(render('(currency is absent) + 1')).toBe('(currency is None) + 1');
  });

  it('does not add spurious parens for exists nested under a LogicalOperation', () => {
    // Python's 'is not' already binds tighter than 'and', so no parens are
    // needed here -- confirms the ArithmeticOperation fix above didn't
    // regress this case.
    expect(render('(currency exists) and flag')).toBe('currency is not None and flag');
  });

  it('refuses a qualified (dotted) symbol reference', () => {
    const node = {
      $type: 'RosettaSymbolReference',
      explicitArguments: false,
      rawArgs: [],
      symbol: { $refText: 'foo.bar' }
    } as any;
    expect(renderPy(node)).toBeNull();
  });

  it('refuses a ^-escaped (reserved-keyword) symbol reference', () => {
    const node = {
      $type: 'RosettaSymbolReference',
      explicitArguments: false,
      rawArgs: [],
      symbol: { $refText: '^class' }
    } as any;
    expect(renderPy(node)).toBeNull();
  });

  it('refuses a bare $refText that collides with a Python reserved keyword', () => {
    // $refText === 'from' with no dot and no caret -- this is what a Rune
    // field named `^from` in source looks like AFTER Langium's convertID
    // strips the `^`-escape, per escapeId()'s doc comment. It was never a
    // Rune reserved word, but 'from' is a Python hard keyword and would be a
    // SyntaxError if emitted verbatim as an identifier.
    const node = {
      $type: 'RosettaSymbolReference',
      explicitArguments: false,
      rawArgs: [],
      symbol: { $refText: 'from' }
    } as any;
    expect(renderPy(node)).toBeNull();
  });

  it('refuses a `single`-modified exists rather than dropping the modifier', () => {
    // Pre-fix: rendered 'items is not None', silently dropping 'single'
    // (which checks cardinality-exactly-one, not just presence) -- real
    // semantic data loss on round-trip. Must refuse instead.
    expect(render('items single exists')).toBeNull();
  });

  it('refuses a `multiple`-modified exists rather than dropping the modifier', () => {
    expect(render('items multiple exists')).toBeNull();
  });

  it('refuses an argument-less RosettaExistsExpression rather than throwing', () => {
    // The grammar's "without left" form (RHS of a then-chain) has no
    // `argument`. Pre-fix: `node['argument']` was undefined and
    // `rComparisonFamily` crashed with a raw, uncaught TypeError -- not
    // caught by renderPy's try/catch (which only catches
    // UnsupportedInChild). Must refuse gracefully instead.
    const node = {
      $type: 'RosettaExistsExpression',
      operator: 'exists',
      explicitArguments: false,
      rawArgs: []
    } as any;
    expect(() => renderPy(node)).not.toThrow();
    expect(renderPy(node)).toBeNull();
  });

  it('refuses an argument-less RosettaAbsentExpression rather than throwing', () => {
    const node = {
      $type: 'RosettaAbsentExpression',
      operator: 'absent',
      explicitArguments: false,
      rawArgs: []
    } as any;
    expect(() => renderPy(node)).not.toThrow();
    expect(renderPy(node)).toBeNull();
  });

  it('refuses a leading-+ decimal literal rather than silently dropping the sign', () => {
    // Round 6 stripped the '+' here, which fixed render-succeeds-but-
    // doesn't-round-trip but introduced a WORSE bug: opening the lens on
    // 'value > +1.5' and blurring WITHOUT editing anything silently
    // mutated the underlying Rune AST from '+1.5' to '1.5' -- a real
    // Rune->Python->Rune tree-equivalence loss on a no-op. Python has no
    // syntax that round-trips a '+'-prefixed literal (a bare unary '+'
    // parses to a different, already-refused AST shape), so refuse
    // outright instead.
    expect(render('value > +1.5')).toBeNull();
  });

  it('refuses a function-call symbol reference (explicitArguments)', () => {
    // parseExpression on a call form — construct the node directly since
    // Rune's own grammar for a bare call reference may not parse standalone;
    // verify against the real AST shape from packages/core before finalizing
    // this test (see Task 3 of the merged Phase 1 plan for the analogous
    // precedent — RosettaSymbolReference's explicitArguments field).
    const node = {
      $type: 'RosettaSymbolReference',
      explicitArguments: true,
      rawArgs: [],
      symbol: { $refText: 'EmptyTransferHistory' }
    } as any;
    expect(renderPy(node)).toBeNull();
  });
});
