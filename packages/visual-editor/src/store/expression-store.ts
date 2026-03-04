/**
 * expression-store — Zustand store for expression builder state.
 *
 * Scoped to a single expression being edited. Uses zundo temporal
 * middleware for undo/redo of tree mutations.
 *
 * @module
 */

import { createStore, type StoreApi } from 'zustand';
import { temporal } from 'zundo';
import type { ExpressionNode } from '../schemas/expression-node-schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FunctionScopeEntry {
  name: string;
  typeName?: string;
  cardinality?: string;
}

export interface FunctionScope {
  inputs: FunctionScopeEntry[];
  output: FunctionScopeEntry | null;
  aliases: FunctionScopeEntry[];
}

export interface ExpressionBuilderState {
  /** The expression tree being edited. */
  tree: ExpressionNode;

  /** Current editor mode. */
  mode: 'builder' | 'text';

  /** Currently selected node ID (null = none). */
  selectedNodeId: string | null;

  /** Whether the operator palette is open. */
  paletteOpen: boolean;

  /** Node ID the palette is anchored to. */
  paletteAnchorId: string | null;

  /** Function scope for reference resolution. */
  scope: FunctionScope;

  /** Clipboard (deep clone of a sub-tree). */
  clipboard: ExpressionNode | null;

  // ---- Actions ----

  /** Replace a node by ID with a new node. */
  replaceNode: (nodeId: string, newNode: ExpressionNode) => void;

  /** Remove a node (replace with Placeholder). */
  removeNode: (nodeId: string) => void;

  /** Update a literal node's value. */
  updateLiteral: (nodeId: string, value: unknown) => void;

  /** Select a node. */
  selectNode: (nodeId: string | null) => void;

  /** Set editor mode. */
  setMode: (mode: 'builder' | 'text') => void;

  /** Open operator palette on a node. */
  openPalette: (nodeId: string) => void;

  /** Close operator palette. */
  closePalette: () => void;

  /** Replace entire tree. */
  setTree: (tree: ExpressionNode) => void;

  /** Copy a node to clipboard. */
  copyNode: (nodeId: string) => void;

  /** Paste clipboard at target (replaces target). */
  pasteNode: (targetId: string) => void;
}

// ---------------------------------------------------------------------------
// Tree traversal helpers
// ---------------------------------------------------------------------------

/**
 * Deep-clone an ExpressionNode tree, replacing any node matching
 * the target ID with the replacement node.
 */
function replaceInTree(
  tree: ExpressionNode,
  targetId: string,
  replacement: ExpressionNode
): ExpressionNode {
  if (tree.id === targetId) return replacement;
  return mapChildren(tree, (child) => replaceInTree(child, targetId, replacement));
}

/**
 * Deep-clone an ExpressionNode tree, updating a literal node's value.
 */
function updateLiteralInTree(
  tree: ExpressionNode,
  targetId: string,
  value: unknown
): ExpressionNode {
  if (tree.id === targetId) {
    return { ...tree, value } as ExpressionNode;
  }
  return mapChildren(tree, (child) => updateLiteralInTree(child, targetId, value));
}

/**
 * Find a node by ID in the tree.
 */
function findNode(tree: ExpressionNode, nodeId: string): ExpressionNode | null {
  if (tree.id === nodeId) return tree;
  const children = getChildren(tree);
  for (const child of children) {
    const found = findNode(child, nodeId);
    if (found) return found;
  }
  return null;
}

/**
 * Deep-clone a tree, assigning new IDs to every node.
 */
function deepCloneWithNewIds(tree: ExpressionNode): ExpressionNode {
  const newId = crypto.randomUUID();
  const cloned = mapChildren({ ...tree, id: newId } as ExpressionNode, (child) =>
    deepCloneWithNewIds(child)
  );
  return cloned;
}

/**
 * Get direct child expression nodes.
 */
function getChildren(node: ExpressionNode): ExpressionNode[] {
  const children: ExpressionNode[] = [];
  const n = node as Record<string, unknown>;

  // Binary: left, right
  if (n.left && typeof n.left === 'object' && '$type' in (n.left as object))
    children.push(n.left as ExpressionNode);
  if (n.right && typeof n.right === 'object' && '$type' in (n.right as object))
    children.push(n.right as ExpressionNode);

  // Unary: argument
  if (n.argument && typeof n.argument === 'object' && '$type' in (n.argument as object))
    children.push(n.argument as ExpressionNode);

  // Conditional: if, ifthen, elsethen
  if (n.if && typeof n.if === 'object' && '$type' in (n.if as object))
    children.push(n.if as ExpressionNode);
  if (n.ifthen && typeof n.ifthen === 'object' && '$type' in (n.ifthen as object))
    children.push(n.ifthen as ExpressionNode);
  if (n.elsethen && typeof n.elsethen === 'object' && '$type' in (n.elsethen as object))
    children.push(n.elsethen as ExpressionNode);

  // Navigation: receiver
  if (n.receiver && typeof n.receiver === 'object' && '$type' in (n.receiver as object))
    children.push(n.receiver as ExpressionNode);

  // Lambda: function.body
  const fn = n.function as Record<string, unknown> | undefined;
  if (fn?.body && typeof fn.body === 'object' && '$type' in (fn.body as object))
    children.push(fn.body as ExpressionNode);

  // Switch: cases[].expression
  if (Array.isArray(n.cases)) {
    for (const c of n.cases as Record<string, unknown>[]) {
      if (c.expression && typeof c.expression === 'object' && '$type' in (c.expression as object))
        children.push(c.expression as ExpressionNode);
    }
  }

  // Constructor: values[].value
  if (Array.isArray(n.values)) {
    for (const v of n.values as Record<string, unknown>[]) {
      if (v.value && typeof v.value === 'object' && '$type' in (v.value as object))
        children.push(v.value as ExpressionNode);
    }
  }

  // List: elements[]
  if (Array.isArray(n.elements)) {
    for (const e of n.elements) {
      if (e && typeof e === 'object' && '$type' in (e as object))
        children.push(e as ExpressionNode);
    }
  }

  // rawArgs[]
  if (Array.isArray(n.rawArgs)) {
    for (const a of n.rawArgs) {
      if (a && typeof a === 'object' && '$type' in (a as object))
        children.push(a as ExpressionNode);
    }
  }

  return children;
}

/**
 * Map all child expression nodes, returning a new node.
 */
function mapChildren(
  node: ExpressionNode,
  fn: (child: ExpressionNode) => ExpressionNode
): ExpressionNode {
  const n = { ...node } as Record<string, unknown>;

  // Binary
  if (n.left && typeof n.left === 'object' && '$type' in (n.left as object))
    n.left = fn(n.left as ExpressionNode);
  if (n.right && typeof n.right === 'object' && '$type' in (n.right as object))
    n.right = fn(n.right as ExpressionNode);

  // Unary
  if (n.argument && typeof n.argument === 'object' && '$type' in (n.argument as object))
    n.argument = fn(n.argument as ExpressionNode);

  // Conditional
  if (n.if && typeof n.if === 'object' && '$type' in (n.if as object))
    n.if = fn(n.if as ExpressionNode);
  if (n.ifthen && typeof n.ifthen === 'object' && '$type' in (n.ifthen as object))
    n.ifthen = fn(n.ifthen as ExpressionNode);
  if (n.elsethen && typeof n.elsethen === 'object' && '$type' in (n.elsethen as object))
    n.elsethen = fn(n.elsethen as ExpressionNode);

  // Navigation
  if (n.receiver && typeof n.receiver === 'object' && '$type' in (n.receiver as object))
    n.receiver = fn(n.receiver as ExpressionNode);

  // Lambda
  if (n.function && typeof n.function === 'object') {
    const func = { ...(n.function as Record<string, unknown>) };
    if (func.body && typeof func.body === 'object' && '$type' in (func.body as object)) {
      func.body = fn(func.body as ExpressionNode);
    }
    n.function = func;
  }

  // Switch cases
  if (Array.isArray(n.cases)) {
    n.cases = (n.cases as Record<string, unknown>[]).map((c) => {
      const newCase = { ...c };
      if (
        newCase.expression &&
        typeof newCase.expression === 'object' &&
        '$type' in (newCase.expression as object)
      ) {
        newCase.expression = fn(newCase.expression as ExpressionNode);
      }
      return newCase;
    });
  }

  // Constructor values
  if (Array.isArray(n.values)) {
    n.values = (n.values as Record<string, unknown>[]).map((v) => {
      const newVal = { ...v };
      if (newVal.value && typeof newVal.value === 'object' && '$type' in (newVal.value as object)) {
        newVal.value = fn(newVal.value as ExpressionNode);
      }
      return newVal;
    });
  }

  // List elements
  if (Array.isArray(n.elements)) {
    n.elements = (n.elements as unknown[]).map((e) => {
      if (e && typeof e === 'object' && '$type' in (e as object)) {
        return fn(e as ExpressionNode);
      }
      return e;
    });
  }

  // rawArgs
  if (Array.isArray(n.rawArgs)) {
    n.rawArgs = (n.rawArgs as unknown[]).map((a) => {
      if (a && typeof a === 'object' && '$type' in (a as object)) {
        return fn(a as ExpressionNode);
      }
      return a;
    });
  }

  return n as unknown as ExpressionNode;
}

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

/**
 * Create an expression builder store instance.
 * Each expression editor gets its own store.
 */
export function createExpressionStore(
  initialTree: ExpressionNode,
  scope: FunctionScope
): StoreApi<ExpressionBuilderState> {
  return createStore<ExpressionBuilderState>()(
    temporal(
      (set, get) => ({
        tree: initialTree,
        mode: 'builder',
        selectedNodeId: null,
        paletteOpen: false,
        paletteAnchorId: null,
        scope,
        clipboard: null,

        replaceNode: (nodeId, newNode) => {
          const tree = get().tree;
          const newTree = replaceInTree(tree, nodeId, newNode);
          // Only update if tree actually changed (node was found)
          if (newTree !== tree) {
            set({ tree: newTree, paletteOpen: false, paletteAnchorId: null });
          }
        },

        removeNode: (nodeId) => {
          const placeholder: ExpressionNode = {
            $type: 'Placeholder',
            id: crypto.randomUUID()
          } as unknown as ExpressionNode;
          const tree = get().tree;
          set({ tree: replaceInTree(tree, nodeId, placeholder) });
        },

        updateLiteral: (nodeId, value) => {
          set({ tree: updateLiteralInTree(get().tree, nodeId, value) });
        },

        selectNode: (nodeId) => {
          set({ selectedNodeId: nodeId });
        },

        setMode: (mode) => {
          set({ mode });
        },

        openPalette: (nodeId) => {
          set({ paletteOpen: true, paletteAnchorId: nodeId, selectedNodeId: nodeId });
        },

        closePalette: () => {
          set({ paletteOpen: false, paletteAnchorId: null });
        },

        setTree: (tree) => {
          set({ tree });
        },

        copyNode: (nodeId) => {
          const node = findNode(get().tree, nodeId);
          if (node) {
            set({ clipboard: structuredClone(node) });
          }
        },

        pasteNode: (targetId) => {
          const { clipboard, tree } = get();
          if (!clipboard) return;
          const cloned = deepCloneWithNewIds(clipboard);
          set({ tree: replaceInTree(tree, targetId, cloned) });
        }
      }),
      {
        // Only track tree changes for undo/redo (not UI state)
        partialize: (state) => ({ tree: state.tree }),
        limit: 50
      }
    )
  );
}
