/**
 * ExpressionBuilder — root component for the visual expression editor.
 *
 * Renders function sections (inputs, output, conditions, operations) with
 * labeled headers per FR-010. Expression slots use BlockRenderer for each
 * expression body.
 *
 * @module
 */

import { useMemo } from 'react';
import type { ExpressionEditorSlotProps } from '../../../types.js';
import type { ExpressionNode } from '../../../schemas/expression-node-schema.js';
import type { FunctionScope } from '../../../store/expression-store.js';
import { BlockRenderer } from './BlockRenderer.js';
import { astToExpressionNode } from '../../../adapters/ast-to-expression-node.js';

export interface ExpressionBuilderProps extends ExpressionEditorSlotProps {
  scope: FunctionScope;
  defaultMode?: 'builder' | 'text';
}

export function ExpressionBuilder({
  value,
  onChange,
  scope,
  placeholder,
  error
}: ExpressionBuilderProps) {
  const tree = useMemo<ExpressionNode>(() => {
    if (!value) {
      return { $type: 'Placeholder', id: 'root-placeholder' } as unknown as ExpressionNode;
    }
    try {
      const parsed = JSON.parse(value);
      return astToExpressionNode(parsed, value);
    } catch {
      return {
        $type: 'Unsupported',
        id: 'parse-error',
        rawText: value
      } as unknown as ExpressionNode;
    }
  }, [value]);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      {/* Section: Expression */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Expression</span>
        <div className="min-h-[32px] rounded border border-border/50 bg-background/50 p-2">
          <BlockRenderer node={tree} />
        </div>
      </div>

      {/* Scope info */}
      {scope.inputs.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Inputs</span>
          <div className="flex flex-wrap gap-1">
            {scope.inputs.map((input) => (
              <span
                key={input.name}
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                {input.name}
                {input.typeName && `: ${input.typeName}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {scope.output && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Output</span>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {scope.output.name}
            {scope.output.typeName && `: ${scope.output.typeName}`}
          </span>
        </div>
      )}

      {error && <span className="text-xs text-destructive">{error}</span>}

      {!value && placeholder && (
        <span className="text-xs text-muted-foreground">{placeholder}</span>
      )}
    </div>
  );
}
