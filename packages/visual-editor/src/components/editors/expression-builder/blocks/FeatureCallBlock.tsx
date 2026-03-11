/**
 * FeatureCallBlock — renders receiver -> feature navigation.
 *
 * @module
 */

import type { ExpressionNode } from '../../../../schemas/expression-node-schema.js';

export interface FeatureCallBlockProps {
  node: ExpressionNode;
  renderChild: (child: ExpressionNode | undefined) => React.ReactNode;
}

export function FeatureCallBlock({ node, renderChild }: FeatureCallBlockProps) {
  const n = node as Record<string, unknown>;
  const receiver = n['receiver'] as ExpressionNode | undefined;
  const feature = (n['feature'] as string) ?? '?';
  const arrow = n['$type'] === 'RosettaDeepFeatureCall' ? '->>' : '->';

  return (
    <span
      className="inline-flex items-baseline gap-1 rounded px-1 py-0.5 text-[var(--color-expr-navigation)] bg-[var(--color-expr-navigation-bg)]"
      data-block="feature-call"
    >
      {renderChild(receiver)}
      <span className="font-mono text-xs opacity-70">{arrow}</span>
      <span className="font-mono text-xs font-medium">{feature}</span>
    </span>
  );
}
