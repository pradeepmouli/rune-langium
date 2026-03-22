// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * LiteralBlock — renders literal values (boolean, int, number, string).
 *
 * @module
 */

import type { ExpressionNode } from '../../../../schemas/expression-node-schema.js';

export interface LiteralBlockProps {
  node: ExpressionNode;
}

export function LiteralBlock({ node }: LiteralBlockProps) {
  const n = node as Record<string, unknown>;
  const value = n['value'];
  const $type = n['$type'] as string;

  let display: string;
  if ($type === 'RosettaBooleanLiteral') {
    display = String(value);
  } else if ($type === 'RosettaStringLiteral') {
    display = `"${String(value)}"`;
  } else {
    display = String(value);
  }

  return (
    <span
      className="inline-flex items-baseline rounded px-1 py-0.5 font-mono text-xs text-[var(--color-expr-literal)] bg-[var(--color-expr-literal-bg)]"
      data-block="literal"
    >
      {display}
    </span>
  );
}
