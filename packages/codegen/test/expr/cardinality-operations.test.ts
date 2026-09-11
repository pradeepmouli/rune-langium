// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, expect, it } from 'vitest';
import { parseExpression } from '@rune-langium/core';
import { RUNTIME_HELPER_JS_SOURCE } from '../../src/helpers.js';
import { transpileExpression } from '../../src/expr/transpiler.js';
import type { ExpressionTranspilerContext } from '../../src/expr/transpiler.js';

const ctx: ExpressionTranspilerContext = {
  selfName: 'data',
  emitMode: 'ts-expression',
  conditionName: 'Test',
  typeName: 'Test',
  attributeTypes: new Map([
    ['items', 'unknown[]'],
    ['value', 'unknown'],
    ['other', 'unknown[]']
  ]),
  diagnostics: []
};
function emit(source: string): string {
  const parsed = parseExpression(source);
  expect(parsed.hasErrors).toBe(false);
  return transpileExpression(parsed.value, ctx);
}
function run(source: string, data: unknown): unknown {
  return Function('data', `${RUNTIME_HELPER_JS_SOURCE}\nreturn ${emit(source)}`)(data);
}

describe('cardinality operations', () => {
  it.each([
    ['items = other', { items: [], other: [] }, true],
    ['items <> other', { items: [], other: [1] }, true],
    ['items all = other', { items: [{ a: 1 }], other: [{ a: 1 }] }, true],
    ['items all > 0', { items: [1, 2] }, true],
    ['items all > 0', { items: [0, 2] }, false],
    ['items any > 2', { items: [1, 3] }, true],
    ['items any > 3', { items: [1, 3] }, false],
    ['items all > 0', { items: [] }, false],
    ['items any = 2', { items: [1, 2] }, true],
    ['items any = 2', { items: [1, 3] }, false],
    ['items all = 2', { items: [2, 2] }, true],
    ['items all = 2', { items: [2, 3] }, false]
  ])('%s', (source, data, expected) => expect(run(source, data)).toBe(expected));

  it.each([
    ['items single exists', { items: [1] }, true],
    ['items single exists', { items: [1, 2] }, false],
    ['items multiple exists', { items: [1, 2] }, true],
    ['items multiple exists', { items: [1] }, false],
    ['value single exists', { value: 1 }, true],
    ['value multiple exists', { value: 1 }, false]
  ])('%s', (source, data, expected) => expect(run(source, data)).toBe(expected));
});
