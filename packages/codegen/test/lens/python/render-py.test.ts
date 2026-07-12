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
