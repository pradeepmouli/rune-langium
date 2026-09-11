// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { expressionMetadataKind } from '../expr/metadata-type.js';
import { freshLocal } from '../expr/inline-function.js';
import { isRosettaExpression, isListLiteral } from '@rune-langium/core';
import type { FuncBodyContext, RuneFuncAssignment, RuneFuncParam } from '../types/func.js';

/** Shared runtime bounds for function outputs and nested assignment values. */
export function renderCardinalityChecks(
  value: string,
  cardinality: RuneFuncParam['cardinality'],
  many: boolean,
  minimumError: string,
  maximumError: string,
  arraySize = `${value}.length`
): string[] {
  const checks: string[] = [];
  if (cardinality.lower > 0) {
    const missing = many ? `${arraySize} < ${cardinality.lower}` : `${value} == null`;
    checks.push(`if (${missing}) throw new Error(${JSON.stringify(minimumError)});`);
  }
  const excess =
    cardinality.upper === null
      ? undefined
      : many
        ? `${arraySize} > ${cardinality.upper}`
        : cardinality.upper === 0
          ? `${value} != null`
          : undefined;
  if (excess) checks.push(`if (${excess}) throw new Error(${JSON.stringify(maximumError)});`);
  return checks;
}

export function renderFuncAssignment(
  assignment: RuneFuncAssignment,
  ctx: FuncBodyContext,
  renderExpression: (expr: unknown) => string
): string[] {
  const root = ctx.localBindings?.get(assignment.target ?? '') ?? assignment.target ?? 'result';
  const path = assignment.path ?? [];
  let target = root;
  const lines: string[] = [];
  const targetMany = assignment.targetMany ?? (path.length === 0 && ctx.outputAccumulator === 'array');
  let expr =
    !targetMany && isListLiteral(assignment.exprNode) && assignment.exprNode.elements.length === 0
      ? 'undefined'
      : renderExpression(assignment.exprNode);
  if (targetMany) {
    expr = `((value) => value == null ? [] : Array.isArray(value) ? value : [value])(${expr})`;
  }
  const bounds = assignment.targetCardinality;
  const checksFor = (value: string, arraySize?: string) =>
    bounds
      ? renderCardinalityChecks(
          value,
          bounds,
          targetMany,
          targetMany ? 'Cannot assign too few values to a field' : 'Cannot assign an absent value to a required field',
          'Cannot assign too many values to a field',
          arraySize
        )
      : [];
  if (assignment.kind === 'set') {
    const checks = checksFor('value');
    if (checks.length) expr = `((value) => { ${checks.join(' ')} return value; })(${expr})`;
  }
  if (assignment.metadataKind) {
    const helper = assignment.metadataKind === 'reference' ? 'runeToReference' : 'runeToField';
    const sourceKind = isRosettaExpression(assignment.exprNode)
      ? expressionMetadataKind(assignment.exprNode)
      : undefined;
    if (sourceKind !== assignment.metadataKind) {
      expr =
        targetMany || (bounds && bounds.lower > 0)
          ? `${helper}(${expr}, ${JSON.stringify(sourceKind ?? 'value')})`
          : `((value) => value == null ? undefined : ${helper}(value, ${JSON.stringify(sourceKind ?? 'value')}))(${expr})`;
    }
  }

  if (path.length > 0) {
    let many = assignment.rootMany ?? ctx.outputAccumulator === 'array';
    let metadataKind = assignment.rootMetadataKind;
    for (const [index, segment] of path.entries()) {
      const initial = metadataKind === 'field' ? '{ meta: {} }' : '{}';
      if (many) {
        lines.push(`  ${target} ??= [];`);
        const item = freshLocal(ctx, `__assignmentItem${index}`);
        lines.push(`  const ${item} = ${target}[0] ??= ${initial} as NonNullable<(typeof ${target})[number]>;`);
        target = item;
      } else {
        lines.push(`  ${target} ??= ${initial} as NonNullable<typeof ${target}>;`);
      }
      if (metadataKind) {
        target += '.value';
        lines.push(`  ${target} ??= {} as NonNullable<typeof ${target}>;`);
      }
      if (segment.choiceOption) {
        const choice = freshLocal(ctx, `__assignmentChoice${index}`);
        lines.push(`  const ${choice} = ${target} as Extract<typeof ${target}, { ${segment.name}: unknown }>;`);
        target = choice;
      }
      target += `.${segment.name}`;
      many = segment.many;
      metadataKind = segment.metadataKind;
    }
  }

  if (assignment.kind === 'add') {
    const value = freshLocal(ctx, '__assignmentValue');
    if (path.length > 0) lines.push(`  ${target} ??= [];`);
    lines.push('  {');
    lines.push(`    const ${value} = ${expr};`);
    if (bounds && targetMany) {
      lines.push(...checksFor(value, `${target}.length + ${value}.length`).map((check) => `    ${check}`));
    }
    lines.push(`    if (Array.isArray(${value})) ${target}.push(...${value});`);
    lines.push(`    else if (${value} != null) ${target}.push(${value});`);
    lines.push('  }');
  } else {
    lines.push(`  ${target} = ${expr};`);
  }
  return path.length > 0 ? ['  {', ...lines.map((line) => `  ${line}`), '  }'] : lines;
}
