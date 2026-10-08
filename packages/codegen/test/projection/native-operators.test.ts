// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { parseExpression } from '@rune-langium/core';
import { transpileExpression, type ExpressionTranspilerContext } from '../../src/expr/transpiler.js';
import { RUNTIME_HELPER_JS_SOURCE } from '../../src/helpers.js';

const context: ExpressionTranspilerContext = {
  selfName: 'data',
  emitMode: 'ts-expression',
  typeName: 'Test',
  conditionName: 'rule',
  attributeTypes: new Map(),
  diagnostics: []
};
function render(text: string) {
  const parsed = parseExpression(text);
  expect(parsed.hasErrors).toBe(false);
  return transpileExpression(parsed.value, context);
}
function evaluate(text: string, data: unknown = {}) {
  return new Function('data', RUNTIME_HELPER_JS_SOURCE + '\nreturn (' + render(text) + ');')(data);
}

describe('native operators in the canonical emitter', () => {
  it('uses strict scalar equality and direct numeric comparisons', () => {
    expect(render('"a" = "b"')).toBe("('a' === 'b')");
    expect(render('True <> False')).toBe('(true !== false)');
    expect(render('1 < 2')).toBe('(1 < 2)');
    expect(render('1 + 2')).toBe('(1 + 2)');
    expect(evaluate('1 + 2 * 3')).toBe(7);
    expect(evaluate('(1 + 2) * 3')).toBe(9);
  });
  it('retains collection and unresolved structured value semantics', () => {
    expect(evaluate('[1, 2] = [1, 2]')).toBe(true);
    expect(evaluate('[1, 2] = [2, 1]')).toBe(false);
    expect(evaluate('a = b', { a: { value: 1 }, b: { value: 1 } })).toBe(true);
    expect(evaluate('a = b', { a: undefined, b: null })).toBe(true);
    expect(render('a = b')).toContain('runeValueEquals');
  });
});
