// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * SwitchBlock — renders switch operation with cases.
 *
 * @module
 */

import type { ExpressionNode } from '../../../../schemas/expression-node-schema.js';

export interface SwitchBlockProps {
  node: ExpressionNode;
  renderChild: (child: ExpressionNode | undefined) => React.ReactNode;
}

interface SwitchCase {
  $type: string;
  expression: ExpressionNode;
  guard?: {
    $type: string;
    literalGuard?: unknown;
    referenceGuard?: string;
  };
}

export function SwitchBlock({ node, renderChild }: SwitchBlockProps) {
  const n = node as Record<string, unknown>;
  const argument = n['argument'] as ExpressionNode | undefined;
  const cases = (n['cases'] as SwitchCase[]) ?? [];

  return (
    <span
      className="inline-flex flex-col gap-1 rounded border border-[var(--color-expr-control)]/30 px-2 py-1 bg-[var(--color-expr-control-bg)]"
      data-block="switch"
    >
      <span className="inline-flex items-baseline gap-1">
        <span className="font-mono text-xs font-semibold text-[var(--color-expr-control)]">
          switch
        </span>
        {renderChild(argument)}
      </span>
      {cases.map((c, i) => {
        const guard = c.guard;
        const label = guard?.referenceGuard ?? guard?.literalGuard ?? 'default';
        return (
          <span key={i} className="ml-3 inline-flex items-baseline gap-1">
            <span className="font-mono text-xs opacity-70">{String(label)}:</span>
            {renderChild(c.expression)}
          </span>
        );
      })}
    </span>
  );
}
