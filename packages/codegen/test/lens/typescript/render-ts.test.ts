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
});
