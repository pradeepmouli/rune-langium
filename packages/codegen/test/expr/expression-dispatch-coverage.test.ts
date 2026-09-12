// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
/** Dispatcher coverage: every fixture is parsed by the real Rune parser. */
import { describe, expect, it } from 'vitest';
import { parseExpression, type RosettaExpression } from '@rune-langium/core';
import { transpileExpression, type ExpressionTranspilerContext } from '../../src/expr/transpiler.js';

const fixtures = {
  RosettaBooleanLiteral: 'True',
  RosettaSymbolReference: 'true',
  RosettaIntLiteral: '1',
  RosettaNumberLiteral: '1.5',
  RosettaStringLiteral: '"x"',
  RosettaFeatureCall: 'a -> b',
  RosettaDeepFeatureCall: 'a ->> b',
  RosettaExistsExpression: 'a exists',
  RosettaAbsentExpression: 'a is absent',
  RosettaOnlyElement: 'a only-element',
  RosettaCountOperation: 'a count',
  FlattenOperation: 'a flatten',
  DistinctOperation: 'a distinct',
  ReverseOperation: 'a reverse',
  FirstOperation: 'a first',
  LastOperation: 'a last',
  SumOperation: 'a sum',
  OneOfOperation: 'a one-of',
  ChoiceOperation: 'required choice a, b',
  ToStringOperation: 'a to-string',
  ToNumberOperation: 'a to-number',
  ToIntOperation: 'a to-int',
  ToTimeOperation: 'a to-time',
  ToDateOperation: 'a to-date',
  ToDateTimeOperation: 'a to-date-time',
  ToZonedDateTimeOperation: 'a to-zoned-date-time',
  ToEnumOperation: 'a to-enum Color',
  DefaultOperation: 'a default b',
  JoinOperation: 'a join ","',
  RosettaContainsExpression: 'a contains b',
  RosettaDisjointExpression: 'a disjoint b',
  ArithmeticOperation: 'a + b',
  EqualityOperation: 'a = b',
  ComparisonOperation: 'a > b',
  LogicalOperation: 'a and b',
  RosettaConditionalExpression: 'if a exists then b else c',
  WithMetaOperation: 'a with-meta { scheme: "urn:x" }',
  ListLiteral: '[a, b]',
  FilterOperation: 'a filter [item exists]',
  MapOperation: 'a extract [item]',
  SortOperation: 'a sort',
  MinOperation: 'a min',
  MaxOperation: 'a max',
  ReduceOperation: 'a reduce x, y [x + y]',
  SwitchOperation: 'a switch true then b, default c',
  AsKeyOperation: 'a as-key',
  AsOperation: 'a as Foo',
  RosettaImplicitVariable: 'item',
  ThenOperation: 'a then item',
  RosettaOnlyExistsExpression: '(a, b) only exists',
  RosettaSuperCall: 'super(a)',
  RosettaConstructorExpression: 'Foo { a: b }'
} satisfies Record<RosettaExpression['$type'], string>;

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
