/**
 * PlaceholderBlock — renders dashed border placeholder with expected type hint.
 *
 * Accepts onActivate callback (wired to palette in US2).
 *
 * @module
 */

import { useCallback } from 'react';
import type { ExpressionNode } from '../../../../schemas/expression-node-schema.js';

export interface PlaceholderBlockProps {
  node: ExpressionNode;
  onActivate?: (nodeId: string) => void;
}

export function PlaceholderBlock({ node, onActivate }: PlaceholderBlockProps) {
  const n = node as Record<string, unknown>;
  const expectedType = n['expectedType'] as string | undefined;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onActivate?.(n['id'] as string);
    },
    [onActivate, n['id']]
  );

  return (
    <span
      className="inline-flex cursor-pointer items-center rounded border border-dashed border-[var(--color-expr-placeholder)] px-2 py-0.5 text-xs text-[var(--color-expr-placeholder)] bg-[var(--color-expr-placeholder-bg)] hover:border-solid hover:opacity-80"
      data-block="placeholder"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={expectedType ? `Add ${expectedType} expression` : 'Add expression'}
    >
      {expectedType ? `+ ${expectedType}` : '+ expression'}
    </span>
  );
}
