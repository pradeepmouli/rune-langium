// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * ReferenceBlock — renders symbol references and implicit variables.
 *
 * @module
 */

import type { ExpressionNode } from '../../../../schemas/expression-node-schema.js';

export interface ReferenceBlockProps {
  node: ExpressionNode;
}

export function ReferenceBlock({ node }: ReferenceBlockProps) {
  const n = node as Record<string, unknown>;
  const $type = n['$type'] as string;

  let name: string;
  if ($type === 'RosettaImplicitVariable') {
    name = (n['name'] as string) ?? 'item';
  } else if ($type === 'RosettaSuperCall') {
    name = (n['name'] as string) ?? 'super';
  } else {
    name = (n['symbol'] as string) ?? '?';
  }

  return (
    <span
      className="inline-flex items-baseline gap-1 rounded px-1 py-0.5 font-mono text-xs text-[var(--color-expr-reference)] bg-[var(--color-expr-reference-bg)]"
      data-block="reference"
    >
      <span className="font-medium">{name}</span>
      {$type === 'RosettaImplicitVariable' && (
        <span className="text-[10px] opacity-50">implicit</span>
      )}
    </span>
  );
}
