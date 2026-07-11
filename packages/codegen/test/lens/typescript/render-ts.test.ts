// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parseExpression } from '@rune-langium/core';
import { renderTs } from '../../../src/lens/typescript/render-ts.js';

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
});
