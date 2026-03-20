// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * ListBlock — renders list literals with element child slots.
 *
 * @module
 */

import type { ExpressionNode } from '../../../../schemas/expression-node-schema.js';

export interface ListBlockProps {
  node: ExpressionNode;
  renderChild: (child: ExpressionNode | undefined) => React.ReactNode;
}

export function ListBlock({ node, renderChild }: ListBlockProps) {
  const n = node as Record<string, unknown>;
  const elements = (n['elements'] as ExpressionNode[]) ?? [];

  return (
    <span
      className="inline-flex items-baseline gap-1 rounded px-1 py-0.5 text-[var(--color-expr-collection)] bg-[var(--color-expr-collection-bg)]"
      data-block="list"
    >
      <span className="font-mono text-xs opacity-70">[</span>
      {elements.map((el, i) => (
        <span
          key={((el as Record<string, unknown>)['id'] as string) ?? i}
          className="inline-flex items-baseline gap-1"
        >
          {i > 0 && <span className="font-mono text-xs opacity-50">,</span>}
          {renderChild(el)}
        </span>
      ))}
      <span className="font-mono text-xs opacity-70">]</span>
    </span>
  );
}
