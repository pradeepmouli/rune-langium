// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
/** Dispatcher coverage: every fixture is parsed by the real Rune parser. */
import { describe, expect, it } from 'vitest';
import { parseExpression } from '@rune-langium/core';
import { transpileExpression, type ExpressionTranspilerContext } from '../../src/expr/transpiler.js';

import { expressionKindFixtures as fixtures } from '../fixtures/expression-kinds.js';

function context(): ExpressionTranspilerContext {
  return {
    selfName: 'data',
    emitMode: 'zod-refine',
    conditionName: 'Coverage',
    typeName: 'Fixture',
    attributeTypes: new Map([
      ['a', 'unknown'],
      ['b', 'unknown'],
      ['c', 'unknown'],
      ['item', 'unknown']
    ]),
    diagnostics: []
  };
}

describe('expression dispatcher coverage', () => {
  it.each(Object.entries(fixtures))('routes %s without unknown-expression-type', (type, source) => {
    const parsed = parseExpression(source);
    expect(parsed.hasErrors, source).toBe(false);
    expect(parsed.value.$type).toBe(type);
    const ctx = context();
    transpileExpression(parsed.value, ctx);
    expect(
      ctx.diagnostics.filter((d) => d.code === 'unknown-expression-type'),
      source
    ).toEqual([]);
  });
});
