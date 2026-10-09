// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { unwrapMetadata } from './metadata-runtime.js';
import { expressionMetadataKind } from './metadata-type.js';
import { inlineContext, freshLocal, arrowBody } from './inline-function.js';

import {
  isFilterOperation,
  isMapOperation,
  isMaxOperation,
  isMinOperation,
  isSortOperation,
  type RosettaExpression
} from '@rune-langium/core';
import type { ExpressionTranspilerContext } from './transpiler.js';

type Render = (expr: RosettaExpression, ctx: ExpressionTranspilerContext) => string;

/** Renders collection operations whose inline function is part of the operation's semantics. */
export function renderCollectionOperation(
  expr: RosettaExpression,
  ctx: ExpressionTranspilerContext,
  render: Render
): string | undefined {
  const owned =
    isFilterOperation(expr) ||
    isMapOperation(expr) ||
    isSortOperation(expr) ||
    isMinOperation(expr) ||
    isMaxOperation(expr);
  if (!owned) return undefined;
  const argumentCtx =
    isMapOperation(expr) && expr.function && ctx.emitMode.startsWith('ts-') ? { ...ctx, preserveMetadata: true } : ctx;
  const argument = expr.argument ? render(expr.argument, argumentCtx) : ctx.selfName;
  const kind = argumentCtx.preserveMetadata
    ? expr.argument
      ? expressionMetadataKind(expr.argument)
      : ctx.implicitMetadata?.kind
    : undefined;
  const metadata = kind ? { kind, many: false } : undefined;
  const fn = 'function' in expr ? expr.function : undefined;
  const param = freshLocal(ctx, fn?.parameters?.[0]?.name ?? 'item');
  const valueCtx = { ...ctx, preserveMetadata: false };
  const key = (name: string) =>
    fn ? render(fn.body, inlineContext(fn, valueCtx, [name], metadata)) : metadata ? unwrapMetadata(name, false) : name;
  if (isFilterOperation(expr) || isMapOperation(expr)) {
    const body = isFilterOperation(expr)
      ? key(param)
      : fn
        ? render(fn.body, inlineContext(fn, ctx, [param], metadata))
        : param;
    return isFilterOperation(expr)
      ? `rune.list(${argument}).filter((${param}) => ${arrowBody(body)})`
      : `rune.list(${argument}).flatMap((${param}) => rune.list(${body}))`;
  }
  if (isSortOperation(expr)) {
    const a = freshLocal(ctx, '__sortA');
    const b = freshLocal(ctx, '__sortB');
    const keyA = freshLocal(ctx, '__keyA');
    const keyB = freshLocal(ctx, '__keyB');
    const ka = key(a);
    const kb = key(b);
    return `rune.list(${argument}).slice().sort((${a}, ${b}) => { const ${keyA} = (${ka}); const ${keyB} = (${kb}); return rune.order(${keyA}, ${keyB}, (a, b) => a < b ? -1 : a > b ? 1 : 0); })`;
  }
  if (isMinOperation(expr) || isMaxOperation(expr)) {
    const item = freshLocal(ctx, '__item');
    const best = freshLocal(ctx, '__best');
    const values = freshLocal(ctx, '__values');
    const itemKey = key(item);
    const bestKey = key(best);
    const sign = isMinOperation(expr) ? '<' : '>';
    return `(() => { const ${values} = rune.list(${argument}); if (${values}.length === 0) return undefined; return ${values}.slice(1).reduce((${best}, ${item}) => rune.order((${itemKey}), (${bestKey}), (a, b) => a < b ? -1 : a > b ? 1 : 0, ${isMinOperation(expr)}) ${sign} 0 ? ${item} : ${best}, ${values}[0]); })()`;
  }
  return undefined;
}
