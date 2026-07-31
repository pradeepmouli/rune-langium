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
    literalGuard?: ExpressionNode;
    referenceGuard?: string;
  };
}

export function SwitchBlock({ node, renderChild }: SwitchBlockProps) {
  const n = node as Record<string, unknown>;
  const argument = n['argument'] as ExpressionNode | undefined;
  const cases = (n['cases'] as SwitchCase[]) ?? [];

  return (
    <span
      className="inline-flex flex-col gap-1 rounded border border-(--color-expr-control)/30 px-2 py-1 bg-(--color-expr-control-bg)"
      data-block="switch"
    >
      <span className="inline-flex items-baseline gap-1">
        <span className="font-mono text-xs font-semibold text-(--color-expr-control)">switch</span>
        {renderChild(argument)}
      </span>
      {cases.map((c, i) => {
        const guard = c.guard;
        // literalGuard is a converted ExpressionNode (synthetic id, uniform
        // handling — see ast-to-expression-node.ts's convertSwitchCase);
        // render it via renderChild like any other nested expression rather
        // than stringifying, which would print `[object Object]`.
        // The case's own body expression always carries a synthetic id
        // (convertChildRequired never omits one) — key on THAT first, not
        // referenceGuard: the grammar allows two cases to share the same
        // referenceGuard text (invalid or in-progress source can reach this
        // renderer), which would collide two cases onto one React key and
        // let updates reuse the wrong subtree (Codex review). referenceGuard
        // is kept as a fallback only for the theoretical case where the body
        // expression has no id; index is the last resort and, unlike the
        // other two, is NOT stable across reorder.
        const key = (c.expression as unknown as { id?: string }).id ?? guard?.referenceGuard ?? String(i);
        return (
          <span key={key} className="ml-3 inline-flex items-baseline gap-1">
            <span className="font-mono text-xs opacity-70">
              {guard?.referenceGuard ?? (guard?.literalGuard ? renderChild(guard.literalGuard) : 'default')}:
            </span>
            {renderChild(c.expression)}
          </span>
        );
      })}
    </span>
  );
}
