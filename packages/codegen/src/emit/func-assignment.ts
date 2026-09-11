// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { expressionMetadataKind } from '../expr/metadata-type.js';
import { freshLocal } from '../expr/inline-function.js';
import { isRosettaExpression, isListLiteral } from '@rune-langium/core';
import type { FuncBodyContext, RuneFuncAssignment } from '../types/func.js';

export function renderFuncAssignment(
  assignment: RuneFuncAssignment,
  ctx: FuncBodyContext,
  renderExpression: (expr: unknown) => string
): string[] {
  const root = ctx.localBindings?.get(assignment.target ?? '') ?? assignment.target ?? 'result';
  const path = assignment.path ?? [];
  const target = [root, ...path].join('.');
  const lines: string[] = [];
  const targetMany = assignment.targetMany ?? (path.length === 0 && ctx.outputAccumulator === 'array');
  let expr =
    !targetMany && isListLiteral(assignment.exprNode) && assignment.exprNode.elements.length === 0
      ? 'undefined'
      : renderExpression(assignment.exprNode);
  if (targetMany) {
    expr = `((value) => value == null ? [] : Array.isArray(value) ? value : [value])(${expr})`;
  }
  if (assignment.metadataKind) {
    const helper = assignment.metadataKind === 'reference' ? 'runeToReference' : 'runeToField';
    const sourceKind = isRosettaExpression(assignment.exprNode)
      ? expressionMetadataKind(assignment.exprNode)
      : undefined;
    if (sourceKind !== assignment.metadataKind) {
      expr = targetMany
        ? `${helper}(${expr}, ${JSON.stringify(sourceKind ?? 'value')})`
        : `((value) => value == null ? undefined : ${helper}(value, ${JSON.stringify(sourceKind ?? 'value')}))(${expr})`;
    }
  }

  if (path.length > 0) {
    for (let i = 0; i < path.length; i++) {
      const prefix = [root, ...path.slice(0, i)].join('.');
      lines.push(`  ${prefix} ??= {} as NonNullable<typeof ${prefix}>;`);
    }
  }

  if (assignment.kind === 'add') {
    const value = freshLocal(ctx, '__assignmentValue');
    if (path.length > 0) lines.push(`  ${target} ??= [];`);
    lines.push('  {');
    lines.push(`    const ${value} = ${expr};`);
    lines.push(`    if (Array.isArray(${value})) ${target}.push(...${value});`);
    lines.push(`    else if (${value} != null) ${target}.push(${value});`);
    lines.push('  }');
  } else {
    lines.push(`  ${target} = ${expr};`);
  }
  return lines;
}
