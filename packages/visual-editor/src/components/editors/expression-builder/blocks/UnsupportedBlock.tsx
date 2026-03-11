/**
 * UnsupportedBlock — renders rawText with warning styling for unrecognized nodes.
 *
 * @module
 */

import type { ExpressionNode } from '../../../../schemas/expression-node-schema.js';

export interface UnsupportedBlockProps {
  node: ExpressionNode;
}

export function UnsupportedBlock({ node }: UnsupportedBlockProps) {
  const n = node as Record<string, unknown>;
  const rawText = (n['rawText'] as string) ?? '(unsupported)';

  return (
    <span
      className="inline-flex items-center gap-1 rounded border border-dashed border-warning/50 px-1 py-0.5 font-mono text-xs text-warning/80 bg-warning/5"
      data-block="unsupported"
      title="This expression type is not yet supported in the visual builder"
    >
      <span className="text-[10px]">⚠</span>
      <span className="max-w-[200px] truncate">{rawText}</span>
    </span>
  );
}
