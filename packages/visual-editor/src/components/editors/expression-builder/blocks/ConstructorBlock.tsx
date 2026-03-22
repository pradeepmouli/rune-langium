// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * ConstructorBlock — renders constructor expressions with type + key-value pairs.
 *
 * @module
 */

import type { ExpressionNode } from '../../../../schemas/expression-node-schema.js';

export interface ConstructorBlockProps {
  node: ExpressionNode;
  renderChild: (child: ExpressionNode | undefined) => React.ReactNode;
}

interface ConstructorKVP {
  $type: string;
  key: string;
  value: ExpressionNode;
}

export function ConstructorBlock({ node, renderChild }: ConstructorBlockProps) {
  const n = node as Record<string, unknown>;
  const typeRef = n['typeRef'] as Record<string, unknown> | undefined;
  const values = (n['values'] as ConstructorKVP[]) ?? [];
  const typeName = typeRef
    ? ((typeRef['name'] as string) ?? (typeRef['symbol'] as string) ?? '?')
    : '?';

  return (
    <span
      className="inline-flex flex-col gap-1 rounded border border-[var(--color-expr-reference)]/30 px-2 py-1 bg-[var(--color-expr-reference-bg)]"
      data-block="constructor"
    >
      <span className="font-mono text-xs font-semibold text-[var(--color-expr-reference)]">
        {typeName} {'{}'}
      </span>
      {values.map((kvp, i) => (
        <span key={i} className="ml-3 inline-flex items-baseline gap-1">
          <span className="font-mono text-xs opacity-70">{kvp.key}:</span>
          {renderChild(kvp.value)}
        </span>
      ))}
    </span>
  );
}
