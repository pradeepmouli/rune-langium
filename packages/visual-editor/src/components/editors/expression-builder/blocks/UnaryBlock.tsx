/**
 * UnaryBlock — renders postfix unary operations.
 *
 * Shows argument followed by operator label.
 *
 * @module
 */

import type { ExpressionNode } from '../../../../schemas/expression-node-schema.js';

/** Human-readable operator labels. */
const OPERATOR_LABELS: Record<string, string> = {
  exists: 'exists',
  'is absent': 'is absent',
  'only-element': 'only-element',
  'only exists': 'only exists',
  count: 'count',
  flatten: 'flatten',
  distinct: 'distinct',
  reverse: 'reverse',
  first: 'first',
  last: 'last',
  sum: 'sum',
  'one-of': 'one-of',
  'to-string': 'to-string',
  'to-number': 'to-number',
  'to-int': 'to-int',
  'to-time': 'to-time',
  'to-enum': 'to-enum',
  'to-date': 'to-date',
  'to-date-time': 'to-date-time',
  'to-zonedDateTime': 'to-zonedDateTime',
  'as-key': 'as-key',
  'with meta': 'with meta',
  choice: 'choice'
};

function categoryClass($type: string): string {
  if ($type.startsWith('To') && $type.endsWith('Operation')) {
    return 'text-[var(--color-expr-collection)] bg-[var(--color-expr-collection-bg)]';
  }
  if (
    $type === 'FlattenOperation' ||
    $type === 'DistinctOperation' ||
    $type === 'ReverseOperation' ||
    $type === 'FirstOperation' ||
    $type === 'LastOperation' ||
    $type === 'SumOperation' ||
    $type === 'OneOfOperation' ||
    $type === 'RosettaCountOperation' ||
    $type === 'ChoiceOperation'
  ) {
    return 'text-[var(--color-expr-collection)] bg-[var(--color-expr-collection-bg)]';
  }
  return 'text-[var(--color-expr-comparison)] bg-[var(--color-expr-comparison-bg)]';
}

export interface UnaryBlockProps {
  node: ExpressionNode;
  renderChild: (child: ExpressionNode | undefined) => React.ReactNode;
}

export function UnaryBlock({ node, renderChild }: UnaryBlockProps) {
  const n = node as Record<string, unknown>;
  const operator = (n['operator'] as string) ?? (n['$type'] as string);
  const argument = n['argument'] as ExpressionNode | undefined;
  const label = OPERATOR_LABELS[operator] ?? operator;

  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded px-1 py-0.5 ${categoryClass(n['$type'] as string)}`}
      data-block="unary"
    >
      {renderChild(argument)}
      <span className="font-mono text-xs font-semibold opacity-90">{label}</span>
    </span>
  );
}
