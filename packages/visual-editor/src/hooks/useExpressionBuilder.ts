// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * useExpressionBuilder — orchestration hook wiring store to slot props.
 *
 * Initializes store from value prop, syncs scope, and wires onChange/onBlur.
 *
 * @module
 */

import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useStore } from 'zustand';
import {
  createExpressionStore,
  type FunctionScope,
  type ExpressionBuilderState
} from '../store/expression-store.js';
import type { ExpressionNode } from '../schemas/expression-node-schema.js';
import { expressionNodeToDslPreview } from '../adapters/expression-node-to-dsl.js';

export interface UseExpressionBuilderOptions {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  scope: FunctionScope;
  initialTree?: ExpressionNode;
  defaultMode?: 'builder' | 'text';
}

export function useExpressionBuilder({
  value,
  onChange,
  onBlur,
  scope,
  initialTree,
  defaultMode = 'builder'
}: UseExpressionBuilderOptions) {
  const defaultTree = useMemo<ExpressionNode>(
    () =>
      initialTree ??
      ({ $type: 'Placeholder', id: crypto.randomUUID() } as unknown as ExpressionNode),
    [initialTree]
  );

  const storeRef = useRef<ReturnType<typeof createExpressionStore> | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createExpressionStore(defaultTree, scope, defaultMode);
  }
  const store = storeRef.current;

  // Selector hooks
  const tree = useStore(store, (s: ExpressionBuilderState) => s.tree);
  const mode = useStore(store, (s: ExpressionBuilderState) => s.mode);
  const selectedNodeId = useStore(store, (s: ExpressionBuilderState) => s.selectedNodeId);
  const paletteOpen = useStore(store, (s: ExpressionBuilderState) => s.paletteOpen);
  const paletteAnchorId = useStore(store, (s: ExpressionBuilderState) => s.paletteAnchorId);

  // Actions
  const replaceNode = useStore(store, (s: ExpressionBuilderState) => s.replaceNode);
  const removeNode = useStore(store, (s: ExpressionBuilderState) => s.removeNode);
  const updateLiteral = useStore(store, (s: ExpressionBuilderState) => s.updateLiteral);
  const selectNode = useStore(store, (s: ExpressionBuilderState) => s.selectNode);
  const setMode = useStore(store, (s: ExpressionBuilderState) => s.setMode);
  const openPalette = useStore(store, (s: ExpressionBuilderState) => s.openPalette);
  const closePalette = useStore(store, (s: ExpressionBuilderState) => s.closePalette);
  const setTree = useStore(store, (s: ExpressionBuilderState) => s.setTree);

  // Serialize on tree change
  const prevTreeRef = useRef(tree);
  useEffect(() => {
    if (tree !== prevTreeRef.current) {
      prevTreeRef.current = tree;
      try {
        const dsl = expressionNodeToDslPreview(tree);
        onChange(dsl);
      } catch {
        // Serialization failed (e.g., all placeholders) — don't update
      }
    }
  }, [tree, onChange]);

  const handleBlur = useCallback(() => {
    onBlur?.();
  }, [onBlur]);

  return {
    tree,
    mode,
    selectedNodeId,
    paletteOpen,
    paletteAnchorId,
    replaceNode,
    removeNode,
    updateLiteral,
    selectNode,
    setMode,
    openPalette,
    closePalette,
    setTree,
    handleBlur,
    store
  };
}
