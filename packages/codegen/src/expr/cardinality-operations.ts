// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Cardinality-sensitive expression operations.
 *
 * The Java reference maps binary comparisons to `areEqual`/`greaterThan`
 * etc. with CardinalityOperator (ALL/ANY), and maps `single exists` and
 * `multiple exists` to the corresponding runtime predicates.  Keep this
 * logic separate from the expression dispatcher so the dispatcher can share
 * it between conditions and nested expressions.
 */
import {
  isComparisonOperation,
  isEqualityOperation,
  isRosettaExistsExpression,
  type RosettaExpression
} from '@rune-langium/core';
import { expressionIsMany } from './navigation.js';
import type { ExpressionTranspilerContext } from './transpiler.js';

type Render = (expr: RosettaExpression, ctx: ExpressionTranspilerContext) => string;

/** Handle `all`/`any` comparisons and `single`/`multiple exists`. */
export function renderCardinalityOperation(
  expr: RosettaExpression,
  ctx: ExpressionTranspilerContext,
  render: Render
): string | undefined {
  if (isRosettaExistsExpression(expr) && expr.modifier) {
    const value = expr.argument ? render(expr.argument, ctx) : ctx.selfName;
    const mode = expr.modifier === 'single' ? '=== 1' : '> 1';
    // Java's singleExists/multipleExists operate on a multi-valued mapper.
    return `((__exists) => Array.isArray(__exists) ? __exists.length ${mode} : ${expr.modifier === 'single' ? '__exists != null' : 'false'})(${value})`;
  }

  const binary = isComparisonOperation(expr) || isEqualityOperation(expr) ? expr : undefined;
  if (!binary) return undefined;
  const needsCollectionSemantics = (node: RosettaExpression | undefined): boolean => {
    if (!node) return false;
    if (expressionIsMany(node)) return true;
    if (node.$type === 'RosettaSymbolReference') {
      const name = node.symbol.$refText ?? '';
      const type = ctx.attributeTypes.get(name) ?? '';
      return type.includes('[]') || type.includes('undefined');
    }
    return false;
  };
  if (!binary.cardMod && !needsCollectionSemantics(binary.left) && !needsCollectionSemantics(binary.right))
    return undefined;

  const left = binary.left ? render(binary.left, ctx) : ctx.selfName;
  const right = render(binary.right, ctx);
  const op = binary.operator;
  const compare = (left: string, right: string) => `${op === '<>' ? '!' : ''}runeValueEquals(${left}, ${right})`;
  const quantifier = binary.cardMod ?? (binary.operator === '<>' ? 'any' : 'all');
  // Mapper runtime evaluates operands once and for
  // ordered comparisons reduces the RHS to its extremum before comparing all
  // or any LHS items. Equality compares paired items (or broadcasts scalar).
  const rv = isEqualityOperation(binary)
    ? '__r'
    : `r.reduce((a,b) => ${binary.operator === '>' || binary.operator === '>=' ? (quantifier === 'all' ? '(a > b ? a : b)' : '(a < b ? a : b)') : quantifier === 'all' ? '(a < b ? a : b)' : '(a > b ? a : b)'})`;
  const result = isEqualityOperation(binary)
    ? quantifier === 'all'
      ? `(!Array.isArray(__l) ? r.every((b) => ${compare('__l', 'b')}) : !Array.isArray(__r) ? l.every((a) => ${compare('a', '__r')}) : ${op === '<>' ? 'l.every((a,i) => i >= r.length || ' + compare('a', 'r[i]') + ')' : 'l.length === r.length && l.every((a,i) => ' + compare('a', 'r[i]') + ')'})`
      : `(!Array.isArray(__l) ? r.some((b) => ${compare('__l', 'b')}) : !Array.isArray(__r) ? l.some((a) => ${compare('a', '__r')}) : ${op === '<>' ? 'l.length !== r.length || ' : ''}l.some((a,i) => i < r.length && ${compare('a', 'r[i]')}))`
    : quantifier === 'all'
      ? `l.every((a) => a ${op} rv)`
      : `l.some((a) => a ${op} rv)`;
  const emptyEqual = 'Array.isArray(__l) === Array.isArray(__r) && l.length === r.length';
  const emptyResult = isEqualityOperation(binary) ? (op === '<>' ? `!(${emptyEqual})` : emptyEqual) : 'false';
  return `((__l, __r) => { const l = Array.isArray(__l) ? __l : __l == null ? [] : [__l]; const r = Array.isArray(__r) ? __r : __r == null ? [] : [__r]; if (l.length === 0 || r.length === 0) return ${emptyResult}; const rv = ${rv}; return ${result}; })(${left}, ${right})`;
}
