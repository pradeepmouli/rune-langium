// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * LambdaBlock — renders lambda operations (filter, map, reduce, sort, etc.).
 *
 * Shows operator, optional argument, parameter names, and body.
 *
 * @module
 */

import type { ExpressionNode } from '../../../../schemas/expression-node-schema.js';

export interface LambdaBlockProps {
  node: ExpressionNode;
  renderChild: (child: ExpressionNode | undefined) => React.ReactNode;
}

interface InlineFunction {
  $type: string;
  body: ExpressionNode;
  parameters?: Array<{ $type: string; name: string }>;
}

export function LambdaBlock({ node, renderChild }: LambdaBlockProps) {
  const n = node as Record<string, unknown>;
  const operator = (n['operator'] as string) ?? (n['$type'] as string);
  const argument = n['argument'] as ExpressionNode | undefined;
  const fn = n['function'] as InlineFunction | undefined;

  const params = fn?.parameters?.map((p) => p.name).join(', ');

  return (
    <span
      className="inline-flex flex-col gap-1 rounded border border-[var(--color-expr-collection)]/30 px-2 py-1 bg-[var(--color-expr-collection-bg)]"
      data-block="lambda"
    >
      <span className="inline-flex items-baseline gap-1">
        {renderChild(argument)}
        <span className="font-mono text-xs font-semibold text-[var(--color-expr-collection)]">
          {operator}
        </span>
        {params && <span className="font-mono text-xs opacity-70">[{params}]</span>}
      </span>
      {fn?.body && <span className="ml-3">{renderChild(fn.body)}</span>}
    </span>
  );
}
