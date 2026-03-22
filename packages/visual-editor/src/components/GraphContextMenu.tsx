/**
 * GraphContextMenu — Right-click context menu for graph nodes.
 *
 * Provides actions like "Show only this & neighbors", "Hide node",
 * and "Show all nodes" to control graph visibility.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '../store/editor-store.js';
import type { TypeGraphNode } from '../types.js';

export interface ContextMenuState {
  /** Screen position for the menu. */
  x: number;
  y: number;
  /** The node that was right-clicked (null for pane context menu). */
  node: TypeGraphNode | null;
}

export interface GraphContextMenuProps {
  state: ContextMenuState | null;
  onClose: () => void;
}

export function GraphContextMenu({ state, onClose }: GraphContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const isolateNode = useEditorStore((s) => s.isolateNode);
  const revealNeighbors = useEditorStore((s) => s.revealNeighbors);
  const showAllNodes = useEditorStore((s) => s.showAllNodes);
  const toggleNodeVisibility = useEditorStore((s) => s.toggleNodeVisibility);
  const selectNode = useEditorStore((s) => s.selectNode);

  // Close on click outside or Escape
  useEffect(() => {
    if (!state) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [state, onClose]);

  const handleIsolate = useCallback(() => {
    if (state?.node) {
      isolateNode(state.node.id);
      selectNode(state.node.id);
    }
    onClose();
  }, [state, isolateNode, selectNode, onClose]);

  const handleRevealNeighbors = useCallback(() => {
    if (state?.node) {
      revealNeighbors(state.node.id);
    }
    onClose();
  }, [state, revealNeighbors, onClose]);

  const handleHideNode = useCallback(() => {
    if (state?.node) {
      toggleNodeVisibility(state.node.id);
    }
    onClose();
  }, [state, toggleNodeVisibility, onClose]);

  const handleShowAll = useCallback(() => {
    showAllNodes();
    onClose();
  }, [showAllNodes, onClose]);

  if (!state) return null;

  const nodeName = state.node?.data?.name ?? 'Unknown';

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] rounded-md border border-border bg-popover/95 backdrop-blur-sm shadow-lg py-1 text-sm"
      style={{ left: state.x, top: state.y }}
      role="menu"
    >
      {state.node && (
        <>
          {/* Header */}
          <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground truncate border-b border-border mb-1">
            {nodeName}
          </div>
          <button
            className="flex items-center w-full px-3 py-1.5 hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={handleRevealNeighbors}
            role="menuitem"
          >
            <span className="w-4 mr-2 text-center">◉</span>
            Show related nodes
          </button>
          <button
            className="flex items-center w-full px-3 py-1.5 hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={handleIsolate}
            role="menuitem"
          >
            <span className="w-4 mr-2 text-center">⊙</span>
            Focus on this & neighbors
          </button>
          <button
            className="flex items-center w-full px-3 py-1.5 hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={handleHideNode}
            role="menuitem"
          >
            <span className="w-4 mr-2 text-center">⊘</span>
            Hide this node
          </button>
        </>
      )}
      <button
        className="flex items-center w-full px-3 py-1.5 hover:bg-accent hover:text-accent-foreground transition-colors"
        onClick={handleShowAll}
        role="menuitem"
      >
        <span className="w-4 mr-2 text-center">◎</span>
        Show all nodes
      </button>
    </div>
  );
}
