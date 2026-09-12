// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import type { InlineFunction } from '@rune-langium/core';
import type { ExpressionTranspilerContext } from './transpiler.js';

export function freshLocal(ctx: ExpressionTranspilerContext, preferred: string): string {
  const names = new Set(ctx.localBindings?.values());
  names.add(ctx.selfName);
  let name = preferred;
  for (let suffix = 1; names.has(name); suffix++) name = `${preferred}${suffix}`;
  return name;
}

export function inlineContext(
  fn: InlineFunction,
  ctx: ExpressionTranspilerContext,
  names: readonly string[],
  implicitMetadata?: ExpressionTranspilerContext['implicitMetadata']
): ExpressionTranspilerContext {
  const bindings = new Map([...ctx.attributeTypes.keys()].map((name) => [name, `${ctx.selfName}.${name}`]));
  for (const [name, value] of ctx.localBindings ?? []) bindings.set(name, value);
  const localMetadata = new Map(ctx.localMetadata);
  fn.parameters.forEach((parameter, index) => {
    bindings.set(parameter.name, names[index] ?? names[0]!);
    localMetadata.set(parameter.name, implicitMetadata);
  });
  return { ...ctx, selfName: names[0]!, localBindings: bindings, localMetadata, implicitMetadata };
}

/** An object-valued arrow expression must not be parsed as a statement block. */
export function arrowBody(expression: string): string {
  return expression.trimStart().startsWith('{') ? `(${expression})` : expression;
}
