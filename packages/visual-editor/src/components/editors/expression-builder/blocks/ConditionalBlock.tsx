// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * ConditionalBlock — renders if/then/else conditional expressions.
 *
 * @module
 */

import type { ExpressionNode } from '../../../../schemas/expression-node-schema.js';

export interface ConditionalBlockProps {
  node: ExpressionNode;
  renderChild: (child: ExpressionNode | undefined) => React.ReactNode;
}

export function ConditionalBlock({ node, renderChild }: ConditionalBlockProps) {
  const n = node as Record<string, unknown>;
  const ifExpr = n['if'] as ExpressionNode | undefined;
  const thenExpr = n['ifthen'] as ExpressionNode | undefined;
  const elseExpr = n['elsethen'] as ExpressionNode | undefined;

  return (
    <span
      className="inline-flex flex-col gap-1 rounded border border-[var(--color-expr-control)]/30 px-2 py-1 bg-[var(--color-expr-control-bg)]"
      data-block="conditional"
    >
      <span className="inline-flex items-baseline gap-1">
        <span className="font-mono text-xs font-semibold text-[var(--color-expr-control)]">if</span>
        {renderChild(ifExpr)}
      </span>
      <span className="inline-flex items-baseline gap-1">
        <span className="font-mono text-xs font-semibold text-[var(--color-expr-control)]">
          then
        </span>
        {renderChild(thenExpr)}
      </span>
      {elseExpr && (
        <span className="inline-flex items-baseline gap-1">
          <span className="font-mono text-xs font-semibold text-[var(--color-expr-control)]">
            else
          </span>
          {renderChild(elseExpr)}
        </span>
      )}
    </span>
  );
}
