// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { metadataPropertyPath } from '../expr/metadata-runtime.js';
import { expressionMetadataKind } from '../expr/metadata-type.js';
import { renderCardinalityChecks } from '../expr/cardinality.js';
import { freshLocal } from '../expr/inline-function.js';
import { isRosettaExpression } from '@rune-langium/core';
import type { FuncBodyContext, RuneFuncAssignment } from '../types/func.js';

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
  let expr = `${targetMany ? 'runeList' : 'runeSingle'}(${renderExpression(assignment.exprNode)})`;
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
      if (segment.metadataEntry) {
        const path = metadataPropertyPath(segment.metadataEntry);
        for (const [index, name] of path.entries()) {
          target += `.${name}`;
          if (index < path.length - 1) lines.push(`  ${target} ??= {};`);
        }
        metadataKind = undefined;
        many = false;
        continue;
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
