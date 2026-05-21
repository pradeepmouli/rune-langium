// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * GraphContextMenu — Right-click context menu for graph nodes.
 *
 * Provides actions like "Show only this & neighbors", "Hide node",
 * and "Show all nodes" to control graph visibility.
 *
 * Uses the DS DropdownMenu primitive (Radix) anchored at cursor coordinates
 * via a fixed zero-size trigger span.
 */

import { useCallback } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@rune-langium/design-system/ui/dropdown-menu';
import { useEditorStore } from '../store/editor-store.js';
import type { LayoutEngine, TypeGraphNode } from '../types.js';

export interface ContextMenuState {
  /** Screen position for the menu. */
  x: number;
  y: number;
  /** The node that was right-clicked (null for pane context menu). */
  node: TypeGraphNode | null;
}

export interface GraphContextMenuProps {
  state: ContextMenuState | null;
  layoutEngine: LayoutEngine;
  onLayoutEngineChange?: (engine: LayoutEngine) => void;
  onClose: () => void;
}

export function GraphContextMenu({ state, layoutEngine, onLayoutEngineChange, onClose }: GraphContextMenuProps) {
  const isolateNode = useEditorStore((s) => s.isolateNode);
  const revealNeighbors = useEditorStore((s) => s.revealNeighbors);
  const showAllNodes = useEditorStore((s) => s.showAllNodes);
  const toggleNodeVisibility = useEditorStore((s) => s.toggleNodeVisibility);
  const selectNode = useEditorStore((s) => s.selectNode);

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

  const handleUseEngine = useCallback(
    (engine: LayoutEngine) => {
      onLayoutEngineChange?.(engine);
      onClose();
    },
    [onClose, onLayoutEngineChange]
  );

  const nodeName = state?.node?.data?.name ?? 'Unknown';

  return (
    <DropdownMenu
      open={state !== null}
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      {/*
       * Virtual trigger: a fixed zero-size element placed at cursor coordinates.
       * Radix anchors the content to this element, achieving "position at cursor"
       * without needing a real interactive button in the DOM flow.
       */}
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          style={{
            position: 'fixed',
            left: state?.x ?? 0,
            top: state?.y ?? 0,
            width: 0,
            height: 0,
            pointerEvents: 'none'
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={0} data-testid="graph-context-menu">
        {state?.node && (
          <>
            <DropdownMenuLabel className="truncate">{nodeName}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleRevealNeighbors}>
              <span className="w-4 text-center">◉</span>
              Show related nodes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleIsolate}>
              <span className="w-4 text-center">⊙</span>
              Focus on this &amp; neighbors
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleHideNode}>
              <span className="w-4 text-center">⊘</span>
              Hide this node
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={handleShowAll}>
          <span className="w-4 text-center">◎</span>
          Show all nodes
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleUseEngine('elk')} aria-pressed={layoutEngine === 'elk'}>
          <span className="w-4 text-center">{layoutEngine === 'elk' ? '●' : '○'}</span>
          Use ELK layout
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleUseEngine('dagre')} aria-pressed={layoutEngine === 'dagre'}>
          <span className="w-4 text-center">{layoutEngine === 'dagre' ? '●' : '○'}</span>
          Use Dagre layout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
