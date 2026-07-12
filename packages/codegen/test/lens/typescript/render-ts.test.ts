// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parseExpression, type RosettaExpression } from '@rune-langium/core';
import { renderTs } from '../../../src/lens/typescript/render-ts.js';

/** A well-formed `RosettaSymbolReference`-shaped leaf, for use as a valid child operand. */
function symbolRef(name: string): RosettaExpression {
  return {
    $type: 'RosettaSymbolReference',
    symbol: { $refText: name },
    rawArgs: []
  } as unknown as RosettaExpression;
}

function render(rune: string): string | null {
  const { value, hasErrors } = parseExpression(rune);
  expect(hasErrors, `must parse: ${rune}`).toBe(false);
  return renderTs(value);
}

describe('renderTs', () => {
  it('renders a comparison', () => {
    expect(render('value >= 0')).toBe('value >= 0');
  });
  it('renders exists as a null check', () => {
    expect(render('currency exists')).toBe('currency != null');
  });
  it('renders absent as a null-equality check', () => {
    expect(render('currency is absent')).toBe('currency == null');
  });
  it('preserves precedence/parenthesization', () => {
    expect(render('a and (b or c)')).toBe('a && (b || c)');
  });
  it('renders equality/inequality with the TS operators', () => {
    expect(render('a = b')).toBe('a === b');
    expect(render('a <> b')).toBe('a !== b');
  });
  it('renders a feature-call path with optional chaining', () => {
    expect(render('trade -> quantity')).toBe('trade?.quantity');
  });
  it('renders arithmetic', () => {
    expect(render('(a + b) * c')).toBe('(a + b) * c');
  });
  it('renders string/number/boolean literals', () => {
    expect(render('"USD"')).toBe('"USD"');
    expect(render('3.5')).toBe('3.5');
    expect(render('True')).toBe('true');
  });
  it('returns null outside the subset', () => {
    expect(render('items count')).toBe(null);
  });

  it('returns null for a RosettaSymbolReference with no $refText', () => {
    const node = {
      $type: 'RosettaSymbolReference',
      symbol: { $refText: undefined },
      rawArgs: []
    } as unknown as RosettaExpression;
    expect(renderTs(node)).toBe(null);
  });

  it('returns null for a RosettaSymbolReference with no symbol at all', () => {
    const node = {
      $type: 'RosettaSymbolReference',
      symbol: undefined,
      rawArgs: []
    } as unknown as RosettaExpression;
    expect(renderTs(node)).toBe(null);
  });

  it('returns null for a RosettaFeatureCall with no $refText on its feature', () => {
    const node = {
      $type: 'RosettaFeatureCall',
      receiver: symbolRef('trade'),
      feature: { $refText: undefined }
    } as unknown as RosettaExpression;
    expect(renderTs(node)).toBe(null);
  });

  it('returns null for an ArithmeticOperation with an unmapped operator', () => {
    const node = {
      $type: 'ArithmeticOperation',
      left: symbolRef('a'),
      right: symbolRef('b'),
      operator: '???'
    } as unknown as RosettaExpression;
    expect(renderTs(node)).toBe(null);
  });

  it('returns null for a ComparisonOperation with an unmapped operator', () => {
    const node = {
      $type: 'ComparisonOperation',
      left: symbolRef('a'),
      right: symbolRef('b'),
      operator: '???'
    } as unknown as RosettaExpression;
    expect(renderTs(node)).toBe(null);
  });

  it('returns null for an EqualityOperation with an unmapped operator', () => {
    const node = {
      $type: 'EqualityOperation',
      left: symbolRef('a'),
      right: symbolRef('b'),
      operator: '???'
    } as unknown as RosettaExpression;
    expect(renderTs(node)).toBe(null);
  });

  it('returns null for a LogicalOperation with an unmapped operator', () => {
    const node = {
      $type: 'LogicalOperation',
      left: symbolRef('a'),
      right: symbolRef('b'),
      operator: '???'
    } as unknown as RosettaExpression;
    expect(renderTs(node)).toBe(null);
  });

  it('does not parenthesize a same-tier left child of a LogicalOperation chain', () => {
    // a && b && c parses left-nested: LogicalOperation{ left: LogicalOperation{a,b}, right: c }
    expect(render('a and b and c')).toBe('a && b && c');
  });

  it('parenthesizes a lower-tier left child of an ArithmeticOperation', () => {
    // (a + b) * c: the '+' left child binds looser than '*' and must keep its parens
    expect(render('(a + b) * c')).toBe('(a + b) * c');
  });

  // Root cause A (task1 investigation): the old guard only checked
  // `rawArgs.length > 0`, which misses zero-arg explicit calls and silently
  // downgrades them to a bare identifier reference — dropping call syntax.
  it('refuses a zero-arg explicit function call rather than downgrading to a bare identifier', () => {
    expect(render('EmptyTransferHistory()')).toBe(null);
  });

  it('refuses a qualified zero-arg explicit function call (import-alias form)', () => {
    expect(render('dep.MyFunc()')).toBe(null);
  });

  // Root cause B: ComparisonOperation/EqualityOperation never checked the
  // optional `cardMod` ('all'/'any' list-quantifier) field, silently
  // stripping a real semantic quantifier instead of refusing.
  it('refuses an `all`-quantified inequality (EqualityOperation cardMod)', () => {
    expect(render('whoToDetermine all <> disputingParty')).toBe(null);
  });

  it('refuses an `all`-quantified comparison (ComparisonOperation cardMod)', () => {
    expect(render('quantity all > 0')).toBe(null);
  });

  it('refuses an `all`-quantified comparison nested inside a LogicalOperation', () => {
    expect(render('(quantity all > 0) and (quantity all < 100)')).toBe(null);
  });
});
