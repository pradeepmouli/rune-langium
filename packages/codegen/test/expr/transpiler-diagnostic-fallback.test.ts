// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import {
  transpileCondition,
  transpileExpression,
  type ExpressionTranspilerContext
} from '../../src/expr/transpiler.js';

function context(emitMode: ExpressionTranspilerContext['emitMode']): ExpressionTranspilerContext {
  return {
    selfName: 'input',
    emitMode,
    conditionName: 'Check',
    typeName: 'Trade',
    attributeTypes: new Map(),
    diagnostics: []
  };
}

describe('invalid expression diagnostics', () => {
  it.each(['ts-method', 'ts-expression', 'zod-refine', 'zod-superRefine'] as const)(
    'throws for unknown expressions in %s',
    (mode) => {
      const ctx = context(mode);
      const output = transpileExpression({ $type: 'FutureExpression' } as never, ctx);
      expect(() => Function(`return ${output}`)()).toThrow("Unknown expression type 'FutureExpression'");
      expect(ctx.diagnostics[0]?.code).toBe('unknown-expression-type');
    }
  );

  it('throws for an empty function condition', () => {
    const ctx = context('ts-method');
    const output = transpileCondition({ name: 'Check', expression: undefined } as never, ctx);
    expect(() => Function(`return ${output}`)()).toThrow("Condition 'Check' has no expression");
    expect(ctx.diagnostics[0]?.code).toBe('empty-condition');
  });
});
