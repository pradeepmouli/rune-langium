// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, expect, it } from 'vitest';
import { RUNTIME_HELPER_JS_SOURCE } from '../../src/helpers.js';
import { parseExpression } from '@rune-langium/core';
import { transpileExpression, type ExpressionTranspilerContext } from '../../src/expr/transpiler.js';

function evaluate(source: string, input: Record<string, unknown>) {
  const parsed = parseExpression(source);
  expect(parsed.hasErrors).toBe(false);
  const ctx: ExpressionTranspilerContext = {
    selfName: 'input',
    emitMode: 'zod-refine',
    conditionName: 'Test',
    typeName: 'Test',
    diagnostics: [],
    attributeTypes: new Map(Object.keys(input).map((name) => [name, 'unknown'])),
    localBindings: new Map(Object.keys(input).map((name) => [name, `input.${name}`]))
  };
  const text = transpileExpression(parsed.value, ctx);
  expect(ctx.diagnostics).toEqual([]);
  return Function('input', `${RUNTIME_HELPER_JS_SOURCE}\nreturn ${text}`)(input);
}

describe('collection expression execution', () => {
  it('contains every right-hand element and rejects empty operands', () => {
    expect(evaluate('items contains [1, 2]', { items: [1, 2, 3] })).toBe(true);
    expect(evaluate('items contains [1, 4]', { items: [1, 2, 3] })).toBe(false);
    expect(evaluate('items contains []', { items: [1] })).toBe(false);
  });
  it('compares collection objects by value', () => {
    expect(evaluate('items distinct', { items: [{ a: 1 }, { a: 1 }, { a: 2 }] })).toEqual([{ a: 1 }, { a: 2 }]);
    expect(evaluate('items disjoint others', { items: [{ a: 1 }], others: [{ a: 1 }] })).toBe(false);
  });
  it('normalizes property order while preserving primitive types and list order', () => {
    expect(evaluate('items distinct', { items: [{ a: 1, b: 2 }, { b: 2, a: 1 }, 1, '1', [1, 2], [2, 1]] })).toEqual([
      { a: 1, b: 2 },
      1,
      '1',
      [1, 2],
      [2, 1]
    ]);
  });
  it('sorts numbers numerically without mutating the input', () => {
    const items = [10, 2, 1];
    expect(evaluate('items sort', { items })).toEqual([1, 2, 10]);
    expect(items).toEqual([10, 2, 1]);
  });
  it('binds explicit sort keys', () => {
    expect(evaluate('items sort x [x -> score]', { items: [{ score: 10 }, { score: 2 }] })).toEqual([
      { score: 2 },
      { score: 10 }
    ]);
  });
  it('binds explicit map parameters and retains outer input references', () => {
    expect(evaluate('items extract x [x + offset]', { items: [1, 2], offset: 3 })).toEqual([4, 5]);
  });
  it('binds filter parameters', () => {
    expect(evaluate('items filter x [x > limit]', { items: [1, 2, 3], limit: 2 })).toEqual([3]);
  });
  it.each(['min', 'max'])('handles empty %s', (operation) => {
    expect(evaluate(`items ${operation}`, { items: [] })).toBeUndefined();
  });
  it('selects the item with the greatest key', () => {
    expect(evaluate('items max x [x -> score]', { items: [{ score: 2 }, { score: 10 }] })).toEqual({ score: 10 });
  });
  it('binds a pipeline value once', () => {
    let reads = 0;
    const input = {
      get amount() {
        reads++;
        return 3;
      }
    };
    expect(evaluate('amount then item + item', input)).toBe(6);
    expect(reads).toBe(1);
  });
});
