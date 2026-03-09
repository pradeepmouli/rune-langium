/**
 * useDragDrop — native HTML drag-and-drop for expression blocks.
 *
 * Provides draggable and droppable behaviors for expression nodes.
 * Drag source extracts node ID; drop target replaces placeholder.
 *
 * @module
 */

import { useCallback, useRef, useState, type DragEvent } from 'react';

/** MIME type used to pass node IDs during drag operations. */
export const EXPRESSION_DRAG_TYPE = 'application/x-expression-node-id';

export interface UseDraggableOptions {
  nodeId: string;
  /** Called before drag starts; return false to prevent. */
  canDrag?: () => boolean;
}

export interface UseDraggableResult {
  draggable: true;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: (e: DragEvent) => void;
  isDragging: boolean;
}

/**
 * Makes a block draggable. Sets the node ID as transfer data.
 */
export function useDraggable({ nodeId, canDrag }: UseDraggableOptions): UseDraggableResult {
  const [isDragging, setIsDragging] = useState(false);

  const onDragStart = useCallback(
    (e: DragEvent) => {
      if (canDrag && !canDrag()) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData(EXPRESSION_DRAG_TYPE, nodeId);
      e.dataTransfer.effectAllowed = 'move';
      setIsDragging(true);
    },
    [nodeId, canDrag]
  );

  const onDragEnd = useCallback((_e: DragEvent) => {
    setIsDragging(false);
  }, []);

  return { draggable: true, onDragStart, onDragEnd, isDragging };
}

export interface UseDroppableOptions {
  nodeId: string;
  /** Called when a node is dropped. Receives the dragged node ID. */
  onDrop: (draggedNodeId: string, targetNodeId: string) => void;
  /** Whether this target accepts drops. */
  canDrop?: (draggedNodeId: string) => boolean;
}

export interface UseDroppableResult {
  onDragOver: (e: DragEvent) => void;
  onDragEnter: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  isDropTarget: boolean;
}

/**
 * Makes a placeholder a drop target for expression nodes.
 */
export function useDroppable({ nodeId, onDrop, canDrop }: UseDroppableOptions): UseDroppableResult {
  const [isDropTarget, setIsDropTarget] = useState(false);
  const enterCountRef = useRef(0);

  const handleDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes(EXPRESSION_DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  }, []);

  const handleDragEnter = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes(EXPRESSION_DRAG_TYPE)) {
      enterCountRef.current++;
      setIsDropTarget(true);
    }
  }, []);

  const handleDragLeave = useCallback((_e: DragEvent) => {
    enterCountRef.current--;
    if (enterCountRef.current <= 0) {
      enterCountRef.current = 0;
      setIsDropTarget(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      enterCountRef.current = 0;
      setIsDropTarget(false);

      const draggedNodeId = e.dataTransfer.getData(EXPRESSION_DRAG_TYPE);
      if (!draggedNodeId) return;
      if (draggedNodeId === nodeId) return; // Can't drop on self

      if (canDrop && !canDrop(draggedNodeId)) return;

      onDrop(draggedNodeId, nodeId);
    },
    [nodeId, onDrop, canDrop]
  );

  return {
    onDragOver: handleDragOver,
    onDragEnter: handleDragEnter,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
    isDropTarget
  };
}
