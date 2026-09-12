// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Render the two expression forms that carry metadata through a Rune func.
 *
 * `with-meta` must retain both the argument value and every evaluated entry.
 * `as-key` creates a reference-metadata object carrying the source global and
 * external keys. Returning the argument directly loses that information.
 */
import { isAsKeyOperation, isWithMetaOperation, type RosettaExpression } from '@rune-langium/core';
import { expressionMetadataKind } from './metadata-type.js';
import type { ExpressionTranspilerContext } from './transpiler.js';

type Render = (expr: RosettaExpression, ctx: ExpressionTranspilerContext) => string;

/**
 * Render `with-meta` and `as-key`, or return `undefined` for another node.
 *
 * The runtime helper names are intentionally stable and target-neutral. The
 * TypeScript emitter owns their definitions, while this expression seam owns
 * only the AST-to-source shape and evaluation order.
 */
export function renderMetadataOperation(
  expr: RosettaExpression,
  ctx: ExpressionTranspilerContext,
  render: Render
): string | undefined {
  if (isWithMetaOperation(expr)) {
    const argument = render(expr.argument, ctx);
    const entries = expr.entries
      .map((entry) => {
        const key = entry.key?.ref && 'name' in entry.key.ref ? entry.key.ref.name : entry.key?.$refText;
        if (!key) {
          ctx.diagnostics.push({
            severity: 'error',
            code: 'unresolved-metadata-key',
            message: 'with-meta entry has no resolvable metadata key'
          });
        }
        return `${JSON.stringify(key ?? '?')}: ${render(entry.value, ctx)}`;
      })
      .join(', ');
    return `runeWithMeta(${argument}, { ${entries} }, ${JSON.stringify(expressionMetadataKind(expr.argument) ?? 'value')})`;
  }

  if (isAsKeyOperation(expr)) {
    return `runeAsKey(${render(expr.argument, ctx)}, ${JSON.stringify(expressionMetadataKind(expr.argument) ?? 'value')})`;
  }

  return undefined;
}
