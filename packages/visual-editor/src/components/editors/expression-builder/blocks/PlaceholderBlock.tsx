/**
 * PlaceholderBlock — renders dashed border placeholder with expected type hint.
 *
 * Accepts onActivate callback (wired to palette) and onDragNode for drop targets.
 *
 * @module
 */

import { useCallback, useState, type DragEvent } from 'react';
import type { ExpressionNode } from '../../../../schemas/expression-node-schema.js';
import { EXPRESSION_DRAG_TYPE } from '../../../../hooks/useDragDrop.js';

export interface PlaceholderBlockProps {
  node: ExpressionNode;
  onActivate?: (nodeId: string) => void;
  onDragNode?: (draggedNodeId: string, targetNodeId: string) => void;
}

export function PlaceholderBlock({ node, onActivate, onDragNode }: PlaceholderBlockProps) {
  const n = node as Record<string, unknown>;
  const nodeId = n['id'] as string;
  const expectedType = n['expectedType'] as string | undefined;
  const [isDropTarget, setIsDropTarget] = useState(false);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onActivate?.(nodeId);
    },
    [onActivate, nodeId]
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes(EXPRESSION_DRAG_TYPE)) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
    }
  }, []);

  const handleDragEnter = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes(EXPRESSION_DRAG_TYPE)) {
      e.stopPropagation();
      setIsDropTarget(true);
    }
  }, []);

  const handleDragLeave = useCallback((_e: DragEvent) => {
    setIsDropTarget(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDropTarget(false);

      const draggedNodeId = e.dataTransfer.getData(EXPRESSION_DRAG_TYPE);
      if (!draggedNodeId || draggedNodeId === nodeId) return;

      onDragNode?.(draggedNodeId, nodeId);
    },
    [nodeId, onDragNode]
  );

  return (
    <span
      className={`inline-flex cursor-pointer items-center rounded border border-dashed px-2 py-0.5 text-xs transition-colors ${
        isDropTarget
          ? 'border-solid border-ring bg-accent text-accent-foreground'
          : 'border-[var(--color-expr-placeholder)] text-[var(--color-expr-placeholder)] bg-[var(--color-expr-placeholder-bg)] hover:border-solid hover:opacity-80'
      }`}
      data-block="placeholder"
      data-drop-target={isDropTarget || undefined}
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      aria-label={expectedType ? `Add ${expectedType} expression` : 'Add expression'}
    >
      {expectedType ? `+ ${expectedType}` : '+ expression'}
    </span>
  );
}
