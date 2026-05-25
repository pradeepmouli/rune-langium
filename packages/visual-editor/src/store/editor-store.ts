// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Zustand editor store for the Rune DSL visual editor.
 *
 * @remarks
 * Manages three categories of state:
 * - **Graph state** — `nodes`, `edges` (typed `@xyflow/react` node/edge objects)
 * - **UI state** — selection, search query/results, active filters, panel visibility
 * - **Domain state** — validated `ValidationError[]`, layout options, namespace visibility
 *
 * State mutations go through `EditorActions`. The store is wrapped with `zundo`
 * temporal middleware — undo/redo is tracked via `useTemporalStore`.
 *
 * The default export `useEditorStore` is a singleton store.
 * Use `createEditorStore()` to create an isolated store instance for embedding
 * multiple independent graph panels.
 *
 * @pitfalls
 * - Do NOT share a single `useEditorStore` instance between two mounted
 *   `RuneTypeGraph` components — they will fight over layout state and selection.
 *   Create a separate store per graph using `createEditorStore()`.
 * - `loadModels()` triggers a full Dagre layout on every call — do not call it
 *   inside a render function or on every keystroke.
 */

import { create } from 'zustand';
import { temporal } from 'zundo';
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import type { NodeChange, EdgeChange } from '@xyflow/react';
import type {
  TypeGraphNode,
  TypeGraphEdge,
  GraphFilters,
  TypeKind,
  EdgeKind,
  ValidationError,
  EdgeData,
  LayoutOptions,
  LayoutEngine,
  VisibilityState,
  AnyGraphNode,
  GraphNode
} from '../types.js';
import type {
  Data,
  Choice,
  RosettaEnumeration,
  RosettaFunction,
  RosettaRecordType,
  Annotation
} from '@rune-langium/core';
import { astToModel } from '../adapters/ast-to-model.js';
import { computeLayout, clearLayoutCache } from '../layout/dagre-layout.js';
import { validateGraph } from '../validation/edit-validator.js';
import { AST_TYPE_TO_NODE_TYPE, NODE_TYPE_TO_AST_TYPE, formatCardinality } from '../adapters/model-helpers.js';
import type { TrackedState } from './history.js';

// ---------------------------------------------------------------------------
// Cross-namespace type-ref disambiguation (spec 020 Phase 13, Finding 3)
// ---------------------------------------------------------------------------

/**
 * Build the canonical `$refText` for a type drop, qualifying with the
 * namespace iff any OTHER node in the current store has the same bare name
 * (would resolve ambiguously). Otherwise returns the bare name verbatim.
 *
 * `targetTypeId` must be the canonical id (`namespace::Name`) of the actual
 * drop target — caller is expected to have validated existence already.
 *
 * The qualified form matches the grammar's `QualifiedName` token shape used
 * by the source-drop path (see structure-graph-adapter.ts findNodeByName
 * comment): `<namespace>.<TypeName>`. Resolution in both the adapter and the
 * Langium grammar treats a `$refText` with dots as authoritatively qualified.
 */
export function disambiguateTypeRef(
  targetTypeId: string,
  targetTypeName: string,
  targetNamespace: string,
  allNodes: ReadonlyArray<TypeGraphNode>
): string {
  // Look for ANY other node (different id) sharing the same bare name.
  // We don't need to enumerate them — the existence of a single sibling
  // collision is enough to require qualification.
  for (const n of allNodes) {
    if (n.id === targetTypeId) continue;
    const nName = (n.data as { name?: string }).name;
    if (nName === targetTypeName) {
      return `${targetNamespace}.${targetTypeName}`;
    }
  }
  return targetTypeName;
}

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

/**
 * Snapshot of visual editor state tracked by the zustand store.
 *
 * @config
 * Read-only from outside the store — use `EditorActions` methods to mutate.
 * Accessible via `useEditorStore(selector)`.
 *
 * @category Visual Editor
 */
export interface EditorState {
  // --- Graph state ---
  nodes: TypeGraphNode[];
  edges: TypeGraphEdge[];
  /**
   * Curated-bundle deferred-export entries, stored on the store so
   * `loadModels` can re-merge their placeholder graph nodes after
   * replacing `nodes` with new RosettaModel-derived nodes. Without this
   * state, every `loadModels` call (e.g. from EditorPage's linkDocument
   * callback) would silently lose the curated namespaces that
   * `loadDeferredExports` previously created.
   */
  deferredExports: DeferredExportEntry[];

  // --- UI state ---
  selectedNodeId: string | null;
  searchQuery: string;
  searchResults: string[];
  activeFilters: GraphFilters;
  detailPanelOpen: boolean;
  validationErrors: ValidationError[];

  // --- Layout options ---
  layoutOptions: LayoutOptions;

  // --- Focus mode ---
  /** When true, selecting a node auto-isolates its focused cluster. */
  focusMode: boolean;
  /** Node kinds excluded from focus-mode related clusters (selected node is always retained). */
  focusRelatedExcludedKinds: Set<TypeKind>;

  // --- Namespace visibility ---
  visibility: VisibilityState;

  // --- On-demand curated hydration ---
  /**
   * Namespaces queued for server-side hydration. An App.tsx effect watches
   * this list and re-parses with `hydrateNamespaces` set to the cumulative
   * union of these + `hydratedNamespaces` so the worker receives the full
   * closure. Cleared by `markNamespacesHydrated` once the parse completes.
   */
  pendingHydrationNamespaces: string[];
  /**
   * Namespaces that have already been hydrated in the current session.
   * Used by `requestNamespaceHydration` to deduplicate requests and by the
   * App.tsx re-parse effect to build the cumulative `hydrateNamespaces` set
   * (replacement-semantics worker hydration requires sending the full set).
   */
  hydratedNamespaces: string[];
}

export interface DeferredExportEntry {
  filePath: string;
  namespace: string;
  exports: Array<{ type: string; name: string }>;
}

export interface EditorActions {
  // --- Data loading ---
  loadModels(models: unknown | unknown[], layoutOpts?: LayoutOptions): void;
  /** Register deferred corpus types as graph nodes without full AST models. */
  loadDeferredExports(entries: DeferredExportEntry[]): void;

  // --- Navigation ---
  selectNode(nodeId: string | null, options?: { isolateInFocusMode?: boolean; reapplyFocusMode?: boolean }): void;
  setSearchQuery(query: string): void;
  setFilters(filters: GraphFilters): void;
  toggleDetailPanel(): void;

  // --- Layout ---
  relayout(options?: LayoutOptions): void;
  setLayoutEngine(engine: LayoutEngine): void;

  // --- Graph state access ---
  getNodes(): TypeGraphNode[];
  getEdges(): TypeGraphEdge[];

  // --- Namespace visibility ---
  toggleNamespace(namespace: string): void;
  toggleNodeVisibility(nodeId: string): void;
  expandAllNamespaces(): void;
  collapseAllNamespaces(): void;
  setInitialVisibility(totalNodeCount: number): void;
  toggleExplorer(): void;
  getVisibleNodes(): TypeGraphNode[];
  getVisibleEdges(): TypeGraphEdge[];

  // --- Kind-based visibility ---
  toggleNodeKind(kind: TypeKind): void;
  toggleEdgeKind(kind: EdgeKind): void;
  showAllNodeKinds(): void;
  showAllEdgeKinds(): void;

  // --- Isolation / focus ---
  /** Hide all nodes except the given node's focused cluster. */
  isolateNode(nodeId: string): void;
  /** Unhide a node's focused cluster (expand their namespaces too). */
  revealNeighbors(nodeId: string): void;
  /** Hide all nodes except the given set. */
  showOnly(nodeIds: Set<string>): void;
  /** Unhide all nodes (reset hiddenNodeIds). */
  showAllNodes(): void;
  /** Toggle focus mode (auto-isolate selected node + neighbors). */
  toggleFocusMode(): void;
  /** Toggle exclusion of a node kind from focus-mode related clusters. */
  toggleFocusRelatedExcludedKind(kind: TypeKind): void;

  // --- Editing (P2) ---
  createType(kind: TypeKind, name: string, namespace: string): string;
  deleteType(nodeId: string): void;
  renameType(nodeId: string, newName: string): void;
  addAttribute(nodeId: string, attrName: string, typeName: string, cardinality: string): void;
  removeAttribute(nodeId: string, attrName: string): void;
  renameAttribute(nodeId: string, oldName: string, newName: string): void;
  /**
   * Update the type ref on an attribute.
   *
   * @param targetTypeId Canonical node id of the resolved target
   *   (`namespace::Name`). The store validates the id against current nodes
   *   and writes a fully-qualified `$refText` when any other node shares the
   *   bare name across namespaces (spec 020 Phase 13, Finding 3).
   *   Stale or unknown ids are rejected (no-op).
   */
  updateAttributeType(nodeId: string, attrName: string, newTypeName: string, targetTypeId: string): void;
  updateAttribute(nodeId: string, oldName: string, newName: string, typeName: string, cardinality: string): void;
  reorderAttribute(nodeId: string, fromIndex: number, toIndex: number): void;
  updateCardinality(nodeId: string, attrName: string, cardinality: string): void;
  setInheritance(childId: string, parentId: string | null): void;
  validate(): ValidationError[];

  // --- Enum operations ---
  addEnumValue(nodeId: string, valueName: string, displayName?: string): void;
  removeEnumValue(nodeId: string, valueName: string): void;
  updateEnumValue(nodeId: string, oldName: string, newName: string, displayName?: string): void;
  reorderEnumValue(nodeId: string, fromIndex: number, toIndex: number): void;
  setEnumParent(nodeId: string, parentId: string | null): void;

  // --- Choice operations ---
  addChoiceOption(nodeId: string, typeName: string): void;
  removeChoiceOption(nodeId: string, typeName: string): void;

  // --- Function operations ---
  addInputParam(nodeId: string, paramName: string, typeName: string): void;
  removeInputParam(nodeId: string, paramName: string): void;
  updateOutputType(nodeId: string, typeName: string): void;
  updateExpression(nodeId: string, expressionText: string): void;

  // --- Condition operations ---
  addCondition(
    nodeId: string,
    condition: {
      name?: string;
      definition?: string;
      expressionText: string;
      isPostCondition?: boolean;
    }
  ): void;
  removeCondition(nodeId: string, index: number): void;
  updateCondition(
    nodeId: string,
    index: number,
    updates: {
      name?: string;
      definition?: string;
      expressionText?: string;
    }
  ): void;
  reorderCondition(nodeId: string, fromIndex: number, toIndex: number): void;

  // --- Metadata operations ---
  updateDefinition(nodeId: string, definition: string): void;
  updateComments(nodeId: string, comments: string): void;
  addSynonym(nodeId: string, synonym: string): void;
  removeSynonym(nodeId: string, index: number): void;

  // --- Annotation operations ---
  addAnnotation(nodeId: string, annotationName: string): void;
  removeAnnotation(nodeId: string, index: number): void;

  // --- ReactFlow integration ---
  applyReactFlowNodeChanges(changes: NodeChange<TypeGraphNode>[]): void;
  applyReactFlowEdgeChanges(changes: EdgeChange<TypeGraphEdge>[]): void;

  // --- On-demand curated hydration ---
  /**
   * Queue a namespace for server-side hydration. No-op if the namespace is
   * already hydrated or already pending. The App.tsx effect watches
   * `pendingHydrationNamespaces` and re-parses when this list is non-empty.
   */
  requestNamespaceHydration(ns: string): void;
  /**
   * Mark a set of namespaces as successfully hydrated: move them from
   * `pendingHydrationNamespaces` to `hydratedNamespaces`. Called by the
   * App.tsx effect after `applyParseResult` returns.
   */
  markNamespacesHydrated(names: string[]): void;
  /** Remove namespaces from the pending queue WITHOUT marking them hydrated —
   *  used when an on-demand hydration parse fails, so re-selecting re-queues. */
  dequeuePendingHydration(names: string[]): void;
  /**
   * Clear all hydration state. Called on workspace switch so stale browsed-
   * namespace names from the previous workspace don't carry over into the new
   * one (the on-demand effect won't re-fire for names already in
   * `hydratedNamespaces`, so they must be cleared on workspace load).
   */
  resetHydration(): void;
}

const INHERITANCE_EDGE_KINDS = new Set<EdgeKind>(['extends', 'enum-extends']);

function isInheritanceEdgeKind(kind: EdgeKind | undefined): boolean {
  return kind !== undefined && INHERITANCE_EDGE_KINDS.has(kind);
}

function getEdgeKind(edge: TypeGraphEdge): EdgeKind | undefined {
  return (edge.data as EdgeData | undefined)?.kind;
}

function buildNodeMap(nodes: TypeGraphNode[]): Map<string, TypeGraphNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

/**
 * Build placeholder TypeGraphNodes for deferred-export entries whose
 * full RosettaModel hasn't been materialized yet. Both `loadModels`
 * (post-replace merge) and `loadDeferredExports` (direct insert) share
 * this — keeps the placeholder shape in one place so a change to
 * `AnyGraphNode`'s required fields only happens once.
 *
 * Mutates `existingIds` by adding each newly-emitted node's id so
 * callers can use the same set to track de-duplication across
 * subsequent operations.
 */
function buildDeferredPlaceholderNodes(entries: DeferredExportEntry[], existingIds: Set<string>): TypeGraphNode[] {
  const out: TypeGraphNode[] = [];
  for (const entry of entries) {
    for (const exp of entry.exports) {
      // Only create graph nodes for top-level element kinds. Enum values
      // are index-only (for cross-file reference resolution).
      if (!(exp.type in AST_TYPE_TO_NODE_TYPE)) continue;
      const nodeType = AST_TYPE_TO_NODE_TYPE[exp.type]!;
      const nodeId = `${entry.namespace}::${exp.name}`;
      if (existingIds.has(nodeId)) continue;
      existingIds.add(nodeId);
      out.push({
        id: nodeId,
        type: nodeType,
        position: { x: 0, y: 0 },
        data: {
          $type: exp.type,
          name: exp.name,
          namespace: entry.namespace,
          position: { x: 0, y: 0 },
          errors: [],
          isReadOnly: true,
          hasExternalRefs: false,
          deferred: true
        } as unknown as AnyGraphNode
      });
    }
  }
  return out;
}

function collectFocusClusterNodeIds(
  nodeId: string,
  edges: TypeGraphEdge[],
  nodeMap: Map<string, TypeGraphNode>,
  excludedKinds: Set<TypeKind>
): Set<string> {
  const focusNodeIds = new Set<string>([nodeId]);
  const parentStack = [nodeId];

  while (parentStack.length > 0) {
    const currentId = parentStack.pop()!;
    for (const edge of edges) {
      if (!isInheritanceEdgeKind(getEdgeKind(edge)) || edge.source !== currentId) continue;
      if (focusNodeIds.has(edge.target)) continue;
      focusNodeIds.add(edge.target);
      parentStack.push(edge.target);
    }
  }

  for (const edge of edges) {
    const kind = getEdgeKind(edge);
    if (isInheritanceEdgeKind(kind)) continue;
    if (edge.source === nodeId) focusNodeIds.add(edge.target);
    if (edge.target === nodeId) focusNodeIds.add(edge.source);
  }

  if (excludedKinds.size > 0) {
    for (const id of Array.from(focusNodeIds)) {
      if (id === nodeId) continue;
      const node = nodeMap.get(id);
      if (!node) continue;
      if (excludedKinds.has(node.type as TypeKind)) {
        focusNodeIds.delete(id);
      }
    }
  }

  return focusNodeIds;
}

/**
 * Combined zustand store type (state + actions).
 *
 * @remarks
 * Use the `useEditorStore` hook to subscribe to this store in React components,
 * or `createEditorStore()` to create an isolated instance.
 *
 * @category Visual Editor
 */
export type EditorStore = EditorState & EditorActions;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nodeCounter = 0;

/** Sequence counter to cancel in-flight progressive namespace expansion. */
let expandSeq = 0;

function makeNodeId(namespace: string, name: string): string {
  return `${namespace}::${name}`;
}

function parseCardinalityString(card: string): { inf: number; sup?: number; unbounded: boolean } {
  const match = card.match(/\(?(\d+)\.\.(\*|\d+)\)?/);
  if (!match) return { inf: 1, sup: 1, unbounded: false };
  const inf = parseInt(match[1]!, 10);
  if (match[2] === '*') return { inf, unbounded: true };
  const sup = parseInt(match[2]!, 10);
  return { inf, sup, unbounded: false };
}

function formatCardinalityString(card: string): string {
  // Normalize to (inf..sup) format
  if (card.startsWith('(') && card.endsWith(')')) {
    return card;
  }
  return `(${card})`;
}

/**
 * Update typeCall.type.$refText references in a node's member arrays.
 * Returns the same object if nothing changed, or a new object with updates.
 */
function updateTypeRefsInNode(d: AnyGraphNode, oldName: string, newName: string): AnyGraphNode {
  let changed = false;

  function updateMemberRefs<T extends { typeCall?: { type?: { $refText?: string } } }>(members: T[]): T[] {
    const updated = members.map((m) => {
      if (m.typeCall?.type?.$refText === oldName) {
        changed = true;
        return {
          ...m,
          typeCall: {
            ...m.typeCall,
            type: { ...m.typeCall!.type, $refText: newName }
          }
        } as T;
      }
      return m;
    });
    return updated;
  }

  function updateRefText(ref: { $refText?: string } | undefined): { $refText?: string } | undefined {
    if (ref?.$refText === oldName) {
      changed = true;
      return { ...ref, $refText: newName };
    }
    return ref;
  }

  const result = { ...d } as Record<string, unknown>;

  switch (d.$type) {
    case 'Data': {
      const data = d as GraphNode<Data>;
      result.attributes = updateMemberRefs(data.attributes as any[]);
      result.superType = updateRefText(data.superType as any);
      break;
    }
    case 'Choice': {
      const choice = d as GraphNode<Choice>;
      result.attributes = updateMemberRefs(choice.attributes as any[]);
      break;
    }
    case 'RosettaFunction': {
      const func = d as GraphNode<RosettaFunction>;
      result.inputs = updateMemberRefs(func.inputs as any[]);
      if ((func.output as any)?.typeCall?.type?.$refText === oldName) {
        changed = true;
        const out = func.output as any;
        result.output = {
          ...out,
          typeCall: { ...out.typeCall, type: { ...out.typeCall.type, $refText: newName } }
        };
      }
      result.superFunction = updateRefText(func.superFunction as any);
      break;
    }
    case 'RosettaRecordType': {
      const record = d as GraphNode<RosettaRecordType>;
      result.features = updateMemberRefs(record.features as any[]);
      break;
    }
    case 'RosettaEnumeration': {
      const enumData = d as GraphNode<RosettaEnumeration>;
      result.parent = updateRefText(enumData.parent as any);
      break;
    }
    case 'Annotation': {
      const ann = d as GraphNode<Annotation>;
      result.attributes = updateMemberRefs(ann.attributes as any[]);
      break;
    }
  }

  return changed ? (result as unknown as AnyGraphNode) : d;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

/** Threshold above which namespaces start collapsed for performance. */
const LARGE_MODEL_THRESHOLD = 100;

/** All node kinds — default visibility. */
const ALL_NODE_KINDS = new Set<TypeKind>([
  'data',
  'choice',
  'enum',
  'func',
  'record',
  'typeAlias',
  'basicType',
  'annotation'
]);

/** All edge kinds — default visibility. */
const ALL_EDGE_KINDS = new Set<EdgeKind>([
  'extends',
  'attribute-ref',
  'choice-option',
  'enum-extends',
  'type-alias-ref'
]);

const initialState: EditorState = {
  nodes: [],
  edges: [],
  deferredExports: [],
  selectedNodeId: null,
  searchQuery: '',
  searchResults: [],
  activeFilters: {},
  detailPanelOpen: false,
  validationErrors: [],
  layoutOptions: { direction: 'LR', nodeSeparation: 50, rankSeparation: 100, engine: 'dagre' },
  focusMode: true,
  focusRelatedExcludedKinds: new Set<TypeKind>(['basicType']),
  visibility: {
    expandedNamespaces: new Set<string>(),
    hiddenNodeIds: new Set<string>(),
    explorerOpen: true,
    visibleNodeKinds: new Set(ALL_NODE_KINDS),
    visibleEdgeKinds: new Set(ALL_EDGE_KINDS)
  },
  pendingHydrationNamespaces: [],
  hydratedNamespaces: []
};

// ---------------------------------------------------------------------------
// Store creation
// ---------------------------------------------------------------------------

/**
 * Create an isolated zustand editor store instance.
 *
 * @remarks
 * Returns a new zustand `useStore` hook bound to a fresh store instance.
 * Use this when embedding multiple independent `RuneTypeGraph` components
 * in the same React tree — each graph must own a separate store.
 *
 * The store is wrapped with `zundo` temporal middleware for undo/redo support.
 * Access undo/redo via `useTemporalStore`.
 *
 * @useWhen
 * - Rendering two or more `RuneTypeGraph` components simultaneously (different
 *   namespaces, split-pane editors, etc.)
 * - Writing tests that need an isolated store per test case
 *
 * @avoidWhen
 * - You only need a single graph — use the pre-created `useEditorStore` singleton.
 *
 * @pitfalls
 * - Each `createEditorStore()` call allocates a new Zustand store + Zundo temporal
 *   tracker. Do NOT call this inside a render function — call once at module level
 *   or in a `useState` initializer.
 *
 * @param overrides - Optional partial initial state to override defaults.
 * @returns A zustand `useStore` hook bound to the new isolated store.
 *
 * @category Visual Editor
 */
export const createEditorStore = (overrides?: Partial<EditorState>) =>
  create<EditorStore>()(
    temporal(
      (set, get) => ({
        ...initialState,
        ...overrides,

        // -----------------------------------------------------------------------
        // Data loading
        // -----------------------------------------------------------------------

        loadModels(models, layoutOpts) {
          // Clear layout cache on full model reload
          clearLayoutCache();

          const opts = layoutOpts ?? get().layoutOptions;
          const filters = get().activeFilters;
          const { nodes: rawNodes, edges } = astToModel(models, { filters });

          // Merge deferred-export placeholder nodes for curated namespaces
          // that haven't been materialized yet. This is the atomic version
          // of "loadModels then loadDeferredExports" — keeps the API
          // single-call so callers can't forget the merge step. Existing
          // ids win (placeholders don't duplicate a now-materialized node).
          const existingIds = new Set(rawNodes.map((n) => n.id));
          const placeholders = buildDeferredPlaceholderNodes(get().deferredExports, existingIds);
          const mergedNodes: TypeGraphNode[] = placeholders.length > 0 ? [...rawNodes, ...placeholders] : rawNodes;

          // Determine initial visibility based on model size
          const allNamespaces = new Set(mergedNodes.map((n) => n.data.namespace));
          const shouldCollapse = mergedNodes.length > LARGE_MODEL_THRESHOLD;

          const expandedNamespaces = shouldCollapse ? new Set<string>() : new Set(allNamespaces);

          // Lay out the visible nodes so the graph renders in position
          // form. Previous code stored the layout result on an unused
          // local — review caught the wasted compute. Use the laid-out
          // nodes when available; fall back to mergedNodes when
          // shouldCollapse is true (large workspace: no layout yet).
          const visibleNodes = shouldCollapse ? [] : mergedNodes;
          const visibleEdges = shouldCollapse ? [] : edges;
          const laidOutNodes = visibleNodes.length > 0 ? computeLayout(visibleNodes, visibleEdges, opts) : mergedNodes;

          // Preserve the current selection if the selected node still exists
          // in the freshly-merged graph. EditorPage re-runs `loadModels` from
          // a `useEffect` keyed on `[models, deferredExports]`; any time the
          // server returns a new prop reference (debounced re-parse, async
          // hydration completing, transient deferredExports churn), the
          // effect re-fires. The previous unconditional `selectedNodeId:
          // null` reset clobbered user selection on every re-parse — the
          // explorer click would register, populate Inspector/Structure for
          // a frame, then a subsequent re-parse would wipe it. The user's
          // Form preview kept showing stale content because preview-store
          // doesn't clear on selection drop, but Structure/Inspector/Graph
          // (which read selectedNodeId directly) went empty. Only drop the
          // selection when the previously-selected id no longer matches a
          // node in the new graph (e.g. type was renamed or deleted).
          const previousSelection = get().selectedNodeId;
          const preservedSelection =
            previousSelection && laidOutNodes.some((n) => n.id === previousSelection) ? previousSelection : null;

          set({
            nodes: laidOutNodes,
            edges,
            layoutOptions: opts,
            selectedNodeId: preservedSelection,
            searchQuery: '',
            searchResults: [],
            visibility: {
              expandedNamespaces,
              hiddenNodeIds: new Set<string>(),
              explorerOpen: true,
              visibleNodeKinds: new Set(ALL_NODE_KINDS),
              visibleEdgeKinds: new Set(ALL_EDGE_KINDS)
            }
          });
        },

        loadDeferredExports(entries) {
          // Idempotence guard (Codex P1 review on PR #164): EditorPage's
          // effect re-fires whenever its `deferredExports` prop reference
          // changes. The prop default is an inline `[]` which is a fresh
          // array on every render → unconditional re-dispatch would
          // re-emit visibility state on every render and trigger a
          // subscriber re-render cascade. Short-circuit if entries is
          // the same reference or both-empty: the contract for "clear
          // stale state on workspace switch" only fires on a genuine
          // transition from non-empty to empty, which this guard preserves.
          const current = get().deferredExports;
          if (entries === current) return;
          if (entries.length === 0 && current.length === 0) return;
          // STATE-ONLY update (Codex P2 review on PR #164: "avoid recording
          // a stale mixed graph before reload"). Touching `nodes` here would
          // be tracked by zundo's temporal middleware — undo after a
          // workspace switch would restore the intermediate "old workspace
          // nodes + new curated placeholders" state. Instead, only stash
          // the entries; loadModels is the single source of node mutation
          // and reads these entries when it computes the merged graph.
          // `deferredExports` is NOT in TrackedState (see history.ts) so
          // this write doesn't pollute the undo history.
          set({ deferredExports: entries });
        },

        // -----------------------------------------------------------------------
        // Navigation
        // -----------------------------------------------------------------------

        selectNode(nodeId, options) {
          const nextDetailPanelOpen = nodeId !== null;
          const { selectedNodeId, detailPanelOpen, focusMode, edges, visibility, nodes, focusRelatedExcludedKinds } =
            get();
          const selectionChanged = selectedNodeId !== nodeId;
          if (selectionChanged || detailPanelOpen !== nextDetailPanelOpen) {
            set({ selectedNodeId: nodeId, detailPanelOpen: nextDetailPanelOpen });
          }
          if (nodeId === null && focusMode && visibility.hiddenNodeIds.size > 0) {
            get().showAllNodes();
            return;
          }
          const shouldApplyFocusMode =
            nodeId &&
            focusMode &&
            options?.isolateInFocusMode !== false &&
            (selectionChanged || options?.reapplyFocusMode);
          if (shouldApplyFocusMode) {
            const focusNodeIds = collectFocusClusterNodeIds(
              nodeId,
              edges,
              buildNodeMap(nodes),
              focusRelatedExcludedKinds
            );
            get().showOnly(focusNodeIds);
          }
        },

        setSearchQuery(query) {
          const nodes = get().nodes;
          const results: string[] = [];

          if (query.trim()) {
            const regex = new RegExp(query, 'i');
            for (const node of nodes) {
              if (regex.test(node.data.name)) {
                results.push(node.id);
              }
            }
          }

          set({ searchQuery: query, searchResults: results });
        },

        setFilters(filters) {
          set({ activeFilters: filters });
        },

        toggleDetailPanel() {
          set((state) => ({ detailPanelOpen: !state.detailPanelOpen }));
        },

        // -----------------------------------------------------------------------
        // Layout
        // -----------------------------------------------------------------------

        relayout(options) {
          const opts = options ?? get().layoutOptions;
          const nodes = computeLayout(get().nodes, get().edges, opts);
          set({ nodes, layoutOptions: opts });
        },

        setLayoutEngine(engine) {
          const opts = { ...get().layoutOptions, engine };
          const nodes = computeLayout(get().nodes, get().edges, opts);
          set({ nodes, layoutOptions: opts });
        },

        getNodes() {
          return get().nodes;
        },

        getEdges() {
          return get().edges;
        },

        // -----------------------------------------------------------------------
        // Editing commands (P2)
        // -----------------------------------------------------------------------

        createType(kind: TypeKind, name: string, namespace: string): string {
          const nodeId = makeNodeId(namespace, name);
          nodeCounter++;

          const $type = NODE_TYPE_TO_AST_TYPE[kind] ?? 'Data';

          // Build a minimal AstNodeModel shell for the new type.
          // Each kind gets its own empty member array field.
          const baseData: Record<string, unknown> = {
            $type,
            name,
            namespace,
            position: { x: nodeCounter * 50, y: nodeCounter * 50 },
            hasExternalRefs: false,
            errors: [],
            definition: undefined,
            annotations: [],
            synonyms: []
          };

          // Add kind-specific member arrays
          switch ($type) {
            case 'Data':
              baseData.attributes = [];
              baseData.conditions = [];
              break;
            case 'Choice':
              baseData.attributes = [];
              break;
            case 'RosettaEnumeration':
              baseData.enumValues = [];
              break;
            case 'RosettaFunction':
              baseData.inputs = [];
              baseData.conditions = [];
              baseData.postConditions = [];
              baseData.operations = [];
              baseData.shortcuts = [];
              break;
            case 'RosettaRecordType':
              baseData.features = [];
              break;
            case 'Annotation':
              baseData.attributes = [];
              break;
          }

          const newNode: TypeGraphNode = {
            id: nodeId,
            type: kind,
            position: { x: nodeCounter * 50, y: nodeCounter * 50 },
            data: baseData as unknown as AnyGraphNode
          };

          set((state) => ({
            nodes: [...state.nodes, newNode]
          }));

          return nodeId;
        },

        deleteType(nodeId: string) {
          set((state) => ({
            nodes: state.nodes.filter((n) => n.id !== nodeId),
            edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
            selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId
          }));
        },

        renameType(nodeId: string, newName: string) {
          set((state) => {
            const targetNode = state.nodes.find((n) => n.id === nodeId);
            if (!targetNode) return {};

            const oldName = (targetNode.data as AnyGraphNode).name as string;
            const namespace = (targetNode.data as AnyGraphNode).namespace as string;
            const newNodeId = makeNodeId(namespace, newName);

            // 1. Rename the target node and cascade type references in other nodes
            const updatedNodes = state.nodes.map((n) => {
              if (n.id === nodeId) {
                return { ...n, id: newNodeId, data: { ...n.data, name: newName } };
              }
              // Cascade: update typeCall.$refText references in member arrays
              const d = n.data as AnyGraphNode;
              const updated = updateTypeRefsInNode(d, oldName, newName);
              if (updated !== d) {
                return { ...n, data: updated };
              }
              return n;
            });

            // 2. Update all edges
            const updatedEdges = state.edges.map((e) => {
              const sourceChanged = e.source === nodeId;
              const targetChanged = e.target === nodeId;
              const labelChanged = e.data?.label === oldName;

              if (!sourceChanged && !targetChanged && !labelChanged) return e;

              const newSource = sourceChanged ? newNodeId : e.source;
              const newTarget = targetChanged ? newNodeId : e.target;
              const newLabel = labelChanged ? newName : e.data?.label;
              const newEdgeId = e.id.replace(nodeId, newNodeId).replace(oldName, newName);

              return {
                ...e,
                id: newEdgeId,
                source: newSource,
                target: newTarget,
                data: e.data ? { ...e.data, label: newLabel } : e.data
              };
            });

            // 3. Update selectedNodeId
            const updatedSelectedNodeId = state.selectedNodeId === nodeId ? newNodeId : state.selectedNodeId;

            return {
              nodes: updatedNodes,
              edges: updatedEdges,
              selectedNodeId: updatedSelectedNodeId
            };
          });
        },

        addAttribute(nodeId: string, attrName: string, typeName: string, cardinality: string) {
          const card = parseCardinalityString(cardinality);
          const newAttr = {
            $type: 'Attribute',
            name: attrName,
            override: false,
            typeCall: {
              $type: 'TypeCall',
              type: { $refText: typeName },
              arguments: []
            },
            card: { $type: 'RosettaCardinality', ...card },
            annotations: [],
            synonyms: []
          };

          set((state) => {
            const targetNodeId = state.nodes.find((n) => (n.data as AnyGraphNode).name === typeName)?.id;

            const updatedNodes = state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              // Data and Annotation use 'attributes'
              if (d.$type === 'Data' || d.$type === 'Annotation') {
                const attrs = [...((d as any).attributes ?? []), newAttr];
                return { ...n, data: { ...d, attributes: attrs } };
              }
              return n;
            });

            if (targetNodeId && targetNodeId !== nodeId) {
              const newEdge: TypeGraphEdge = {
                id: `${nodeId}--attribute-ref--${attrName}--${targetNodeId}`,
                source: nodeId,
                target: targetNodeId,
                type: 'attribute-ref',
                data: {
                  kind: 'attribute-ref' as const,
                  label: attrName,
                  cardinality: formatCardinalityString(cardinality)
                } as EdgeData
              };
              return { nodes: updatedNodes, edges: [...state.edges, newEdge] };
            }

            return { nodes: updatedNodes };
          });
        },

        removeAttribute(nodeId: string, attrName: string) {
          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              if (d.$type === 'Data' || d.$type === 'Annotation') {
                const attrs = ((d as any).attributes ?? []).filter((a: any) => a.name !== attrName);
                return { ...n, data: { ...d, attributes: attrs } };
              }
              return n;
            }),
            edges: state.edges.filter(
              (e) => !(e.source === nodeId && e.data?.kind === 'attribute-ref' && e.data?.label === attrName)
            )
          }));
        },

        updateAttributeType(nodeId: string, attrName: string, newTypeName: string, targetTypeId: string) {
          const current = get();
          const node = current.nodes.find((n) => n.id === nodeId);
          if (!node) return;
          const d0 = node.data as AnyGraphNode;
          // Allow Data, Annotation, AND Choice through — Choice arms are stored in
          // `attributes` (typeCall.type.$refText), not in a separate array.
          // Other $types (Enum, RosettaFunction, etc.) are still unsupported.
          if (d0.$type !== 'Data' && d0.$type !== 'Annotation' && d0.$type !== 'Choice') return;

          const isChoice = d0.$type === 'Choice';
          const attrs0 = ((d0 as any).attributes ?? []) as any[];

          // Data/Annotation arms are matched by `name`; Choice arms are matched
          // by `typeCall.type.$refText` because they have no distinct `.name` field.
          const firstMatch = isChoice
            ? attrs0.find((a: any) => (a.typeCall?.type?.$refText ?? a.typeCall) === attrName)
            : attrs0.find((a: any) => a.name === attrName);
          if (!firstMatch) return;

          // Choice arms carry no cardinality; only preserve it for Data/Annotation.
          const preservedCardinality = isChoice ? undefined : formatCardinality(firstMatch.card);

          // Phase 13 / Finding 3: validate that the canonical targetTypeId exists
          // in the current store and pick a $refText that disambiguates against
          // same-named types in other namespaces. Reject (no-op) stale or unknown
          // ids — a drag payload pointing at a deleted node must NOT corrupt the AST.
          const target = current.nodes.find((n) => n.id === targetTypeId);
          if (!target) return; // stale payload — abort
          const targetData = target.data as AnyGraphNode;
          const targetNamespace = (targetData as { namespace?: string }).namespace;
          if (!targetNamespace) return; // malformed target
          const refText = disambiguateTypeRef(targetTypeId, newTypeName, targetNamespace, current.nodes);

          set((state) => {
            const updatedNodes = state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              if (d.$type !== 'Data' && d.$type !== 'Annotation' && d.$type !== 'Choice') return n;
              const attrs = ((d as any).attributes ?? []) as any[];
              const next = isChoice
                ? attrs.map((a: any) =>
                    (a.typeCall?.type?.$refText ?? a.typeCall) === attrName
                      ? {
                          ...a,
                          typeCall: {
                            ...(a.typeCall ?? { $type: 'TypeCall', arguments: [] }),
                            type: { $refText: refText }
                          }
                        }
                      : a
                  )
                : attrs.map((a: any) =>
                    a.name === attrName
                      ? {
                          ...a,
                          typeCall: {
                            ...(a.typeCall ?? { $type: 'TypeCall', arguments: [] }),
                            type: { $refText: refText }
                          }
                        }
                      : a
                  );
              return { ...n, data: { ...d, attributes: next } };
            });

            // For Choice arms, remove the old choice-option edge (keyed by old type name).
            // For Data/Annotation, remove the old attribute-ref edge.
            const filteredEdges = isChoice
              ? state.edges.filter(
                  (e) => !(e.source === nodeId && e.data?.kind === 'choice-option' && e.data.label === attrName)
                )
              : state.edges.filter(
                  (e) => !(e.source === nodeId && e.data?.kind === 'attribute-ref' && e.data.label === attrName)
                );

            if (targetTypeId === nodeId) {
              return { nodes: updatedNodes, edges: filteredEdges };
            }

            // Choice arms use choice-option edges; Data/Annotation use attribute-ref edges.
            const newEdge: TypeGraphEdge = isChoice
              ? {
                  id: `${nodeId}--choice-option--${refText}--${targetTypeId}`,
                  source: nodeId,
                  target: targetTypeId,
                  type: 'choice-option',
                  data: { kind: 'choice-option' as const, label: refText } as EdgeData
                }
              : {
                  id: `${nodeId}--attribute-ref--${attrName}--${targetTypeId}`,
                  source: nodeId,
                  target: targetTypeId,
                  type: 'attribute-ref',
                  data: {
                    kind: 'attribute-ref' as const,
                    label: attrName,
                    cardinality: preservedCardinality
                  } as EdgeData
                };
            return { nodes: updatedNodes, edges: [...filteredEdges, newEdge] };
          });
        },

        renameAttribute(nodeId: string, oldName: string, newName: string) {
          const current = get();
          const node = current.nodes.find((n) => n.id === nodeId);
          if (!node) return;
          const d0 = node.data as AnyGraphNode;
          if (d0.$type !== 'Data' && d0.$type !== 'Annotation') return;
          const attrs0 = ((d0 as any).attributes ?? []) as any[];
          if (!attrs0.some((a) => a.name === oldName)) return;

          set((state) => {
            const updatedNodes = state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              if (d.$type !== 'Data' && d.$type !== 'Annotation') return n;
              const attrs = ((d as any).attributes ?? []) as any[];
              const next = attrs.map((a) => (a.name === oldName ? { ...a, name: newName } : a));
              return { ...n, data: { ...d, attributes: next } };
            });
            const updatedEdges = state.edges.map((e) => {
              if (e.source !== nodeId || e.data?.kind !== 'attribute-ref' || e.data.label !== oldName) {
                return e;
              }
              return {
                ...e,
                id: e.id.replace(`--attribute-ref--${oldName}--`, `--attribute-ref--${newName}--`),
                data: { ...e.data, label: newName }
              };
            });
            return { nodes: updatedNodes, edges: updatedEdges };
          });
        },

        updateCardinality(nodeId: string, attrName: string, cardinality: string) {
          const card = parseCardinalityString(cardinality);
          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              if (d.$type === 'Data' || d.$type === 'Annotation') {
                const attrs = ((d as any).attributes ?? []).map((a: any) =>
                  a.name === attrName ? { ...a, card: { $type: 'RosettaCardinality', ...card } } : a
                );
                return { ...n, data: { ...d, attributes: attrs } };
              }
              return n;
            })
          }));
        },

        setInheritance(childId: string, parentId: string | null) {
          set((state) => {
            const filteredEdges = state.edges.filter((e) => !(e.source === childId && e.data?.kind === 'extends'));

            // Phase 13 / Finding 3: validate `parentId` exists; reject stale
            // payloads (drag target deleted between drag and drop). When
            // resolving the superType $refText, qualify against the
            // namespace if any same-named sibling exists across namespaces
            // — otherwise multi-namespace workspaces silently link to the
            // first-by-name Party (or whichever node) regardless of intent.
            const parentNode = parentId ? state.nodes.find((n) => n.id === parentId) : null;
            if (parentId && !parentNode) {
              // Stale parentId — abort the mutation, preserve existing
              // inheritance untouched. We still filtered the old edges out
              // above; restore them by returning unchanged state.
              return state;
            }
            const parentName = (parentNode?.data as AnyGraphNode)?.name as string | undefined;
            const parentNamespace = (parentNode?.data as { namespace?: string } | undefined)?.namespace;
            const superRefText =
              parentName && parentNamespace && parentNode
                ? disambiguateTypeRef(parentNode.id, parentName, parentNamespace, state.nodes)
                : parentName;

            const updatedNodes = state.nodes.map((n) => {
              if (n.id !== childId) return n;
              const d = n.data as AnyGraphNode;
              const superRef = superRefText
                ? ({ ref: { name: parentName }, $refText: superRefText } as any)
                : undefined;
              if (d.$type === 'Data') {
                return { ...n, data: { ...d, superType: superRef } } as TypeGraphNode;
              }
              return n;
            });

            if (parentId) {
              const newEdge: TypeGraphEdge = {
                id: `${childId}--extends--${parentId}`,
                source: childId,
                target: parentId,
                type: 'inheritance',
                data: {
                  kind: 'extends' as const,
                  label: 'extends'
                } as EdgeData
              };
              return { nodes: updatedNodes, edges: [...filteredEdges, newEdge] };
            }

            return { nodes: updatedNodes, edges: filteredEdges };
          });
        },

        validate(): ValidationError[] {
          const errors = validateGraph(get().nodes, get().edges);
          set({ validationErrors: errors });
          return errors;
        },

        // -----------------------------------------------------------------------
        // Attribute operations
        // -----------------------------------------------------------------------

        updateAttribute(nodeId: string, oldName: string, newName: string, typeName: string, cardinality: string) {
          const card = parseCardinalityString(cardinality);
          set((state) => {
            const updatedNodes = state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              if (d.$type === 'Data' || d.$type === 'Annotation') {
                const attrs = ((d as any).attributes ?? []).map((a: any) =>
                  a.name === oldName
                    ? {
                        ...a,
                        name: newName,
                        typeCall: {
                          ...a.typeCall,
                          $type: 'TypeCall',
                          type: { $refText: typeName }
                        },
                        card: { $type: 'RosettaCardinality', ...card }
                      }
                    : a
                );
                return { ...n, data: { ...d, attributes: attrs } };
              }
              return n;
            });

            // Remove old attribute-ref edge for the old attribute name
            const filteredEdges = state.edges.filter(
              (e) => !(e.source === nodeId && e.data?.kind === 'attribute-ref' && e.data?.label === oldName)
            );

            // Add new attribute-ref edge if target exists
            const targetNodeId = state.nodes.find((n) => (n.data as AnyGraphNode).name === typeName)?.id;
            if (targetNodeId && targetNodeId !== nodeId) {
              const newEdge: TypeGraphEdge = {
                id: `${nodeId}--attribute-ref--${newName}--${targetNodeId}`,
                source: nodeId,
                target: targetNodeId,
                type: 'attribute-ref',
                data: {
                  kind: 'attribute-ref' as const,
                  label: newName,
                  cardinality: formatCardinalityString(cardinality)
                } as EdgeData
              };
              return { nodes: updatedNodes, edges: [...filteredEdges, newEdge] };
            }

            return { nodes: updatedNodes, edges: filteredEdges };
          });
        },

        reorderAttribute(nodeId: string, fromIndex: number, toIndex: number) {
          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              if (d.$type === 'Data' || d.$type === 'Annotation') {
                const attrs = [...((d as any).attributes ?? [])];
                const [moved] = attrs.splice(fromIndex, 1);
                if (moved) {
                  attrs.splice(toIndex, 0, moved);
                }
                return { ...n, data: { ...d, attributes: attrs } };
              }
              return n;
            })
          }));
        },

        // -----------------------------------------------------------------------
        // Enum operations
        // -----------------------------------------------------------------------

        addEnumValue(nodeId: string, valueName: string, displayName?: string) {
          const newValue = {
            $type: 'RosettaEnumValue',
            name: valueName,
            display: displayName,
            annotations: [],
            enumSynonyms: []
          };

          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              if (d.$type === 'RosettaEnumeration') {
                const vals = [...((d as any).enumValues ?? []), newValue];
                return { ...n, data: { ...d, enumValues: vals } };
              }
              return n;
            })
          }));
        },

        removeEnumValue(nodeId: string, valueName: string) {
          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              if (d.$type === 'RosettaEnumeration') {
                const vals = ((d as any).enumValues ?? []).filter((v: any) => v.name !== valueName);
                return { ...n, data: { ...d, enumValues: vals } };
              }
              return n;
            })
          }));
        },

        updateEnumValue(nodeId: string, oldName: string, newName: string, displayName?: string) {
          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              if (d.$type === 'RosettaEnumeration') {
                const vals = ((d as any).enumValues ?? []).map((v: any) =>
                  v.name === oldName ? { ...v, name: newName, display: displayName } : v
                );
                return { ...n, data: { ...d, enumValues: vals } };
              }
              return n;
            })
          }));
        },

        reorderEnumValue(nodeId: string, fromIndex: number, toIndex: number) {
          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              if (d.$type === 'RosettaEnumeration') {
                const vals = [...((d as any).enumValues ?? [])];
                const [moved] = vals.splice(fromIndex, 1);
                if (moved) {
                  vals.splice(toIndex, 0, moved);
                }
                return { ...n, data: { ...d, enumValues: vals } };
              }
              return n;
            })
          }));
        },

        setEnumParent(nodeId: string, parentId: string | null) {
          set((state) => {
            const filteredEdges = state.edges.filter((e) => !(e.source === nodeId && e.data?.kind === 'enum-extends'));

            const parentNode = parentId ? state.nodes.find((n) => n.id === parentId) : null;
            const parentName = (parentNode?.data as AnyGraphNode)?.name as string | undefined;
            const parentRef = parentName ? ({ ref: { name: parentName }, $refText: parentName } as any) : undefined;

            const updatedNodes = state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              if (d.$type === 'RosettaEnumeration') {
                return { ...n, data: { ...d, parent: parentRef } } as TypeGraphNode;
              }
              return n;
            });

            if (parentId) {
              const newEdge: TypeGraphEdge = {
                id: `${nodeId}--enum-extends--${parentId}`,
                source: nodeId,
                target: parentId,
                type: 'enum-extends',
                data: {
                  kind: 'enum-extends' as const,
                  label: 'extends'
                } as EdgeData
              };
              return { nodes: updatedNodes, edges: [...filteredEdges, newEdge] };
            }

            return { nodes: updatedNodes, edges: filteredEdges };
          });
        },

        // -----------------------------------------------------------------------
        // Choice operations
        // -----------------------------------------------------------------------

        addChoiceOption(nodeId: string, typeName: string) {
          const newOption = {
            $type: 'ChoiceOption',
            typeCall: {
              $type: 'TypeCall',
              type: { $refText: typeName },
              arguments: []
            },
            annotations: [],
            synonyms: []
          };

          set((state) => {
            const targetNodeId = state.nodes.find((n) => (n.data as AnyGraphNode).name === typeName)?.id;

            const updatedNodes = state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              if (d.$type === 'Choice') {
                const attrs = [...((d as any).attributes ?? []), newOption];
                return { ...n, data: { ...d, attributes: attrs } };
              }
              return n;
            });

            if (targetNodeId) {
              const newEdge: TypeGraphEdge = {
                id: `${nodeId}--choice-option--${typeName}--${targetNodeId}`,
                source: nodeId,
                target: targetNodeId,
                type: 'choice-option',
                data: { kind: 'choice-option' as const, label: typeName } as EdgeData
              };
              return { nodes: updatedNodes, edges: [...state.edges, newEdge] };
            }

            return { nodes: updatedNodes };
          });
        },

        removeChoiceOption(nodeId: string, typeName: string) {
          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              if (d.$type === 'Choice') {
                const attrs = ((d as any).attributes ?? []).filter((a: any) => a.typeCall?.type?.$refText !== typeName);
                return { ...n, data: { ...d, attributes: attrs } };
              }
              return n;
            }),
            edges: state.edges.filter(
              (e) => !(e.source === nodeId && e.data?.kind === 'choice-option' && e.data?.label === typeName)
            )
          }));
        },

        // -----------------------------------------------------------------------
        // Function operations
        // -----------------------------------------------------------------------

        addInputParam(nodeId: string, paramName: string, typeName: string) {
          const newInput = {
            $type: 'Attribute',
            name: paramName,
            override: false,
            typeCall: {
              $type: 'TypeCall',
              type: { $refText: typeName },
              arguments: []
            },
            card: { $type: 'RosettaCardinality', inf: 1, sup: 1, unbounded: false },
            annotations: [],
            synonyms: []
          };

          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              if (d.$type === 'RosettaFunction') {
                const inputs = [...((d as any).inputs ?? []), newInput];
                return { ...n, data: { ...d, inputs } };
              }
              return n;
            })
          }));
        },

        removeInputParam(nodeId: string, paramName: string) {
          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              if (d.$type === 'RosettaFunction') {
                const inputs = ((d as any).inputs ?? []).filter((i: any) => i.name !== paramName);
                return { ...n, data: { ...d, inputs } };
              }
              return n;
            })
          }));
        },

        updateOutputType(nodeId: string, typeName: string) {
          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              if (d.$type === 'RosettaFunction') {
                const output = (d as any).output ?? {
                  $type: 'Attribute',
                  name: 'output',
                  override: false,
                  card: { $type: 'RosettaCardinality', inf: 1, sup: 1, unbounded: false }
                };
                return {
                  ...n,
                  data: {
                    ...d,
                    output: {
                      ...output,
                      typeCall: {
                        $type: 'TypeCall',
                        type: { $refText: typeName },
                        arguments: []
                      }
                    }
                  }
                };
              }
              return n;
            })
          }));
        },

        updateExpression(nodeId: string, expressionText: string) {
          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              if (d.$type === 'RosettaFunction') {
                // Function body is in operations[0].expression
                const operations = [...((d as any).operations ?? [])];
                if (operations.length === 0) {
                  operations.push({
                    $type: 'Operation',
                    operator: 'set',
                    expression: { $cstText: expressionText }
                  });
                } else {
                  operations[0] = {
                    ...operations[0],
                    expression: {
                      ...operations[0].expression,
                      $cstText: expressionText
                    }
                  };
                }
                return { ...n, data: { ...d, operations, expressionText } };
              }
              // For Data/TypeAlias, store as a display field
              return { ...n, data: { ...d, expressionText } };
            })
          }));
        },

        // -----------------------------------------------------------------------
        // Condition operations
        // -----------------------------------------------------------------------

        addCondition(
          nodeId: string,
          condition: {
            name?: string;
            definition?: string;
            expressionText: string;
            isPostCondition?: boolean;
          }
        ) {
          const newCondition = {
            $type: 'Condition',
            name: condition.name,
            definition: condition.definition,
            expression: { $cstText: condition.expressionText },
            postCondition: condition.isPostCondition ?? false
          };

          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              if (condition.isPostCondition) {
                const postConditions = [...((d as any).postConditions ?? []), newCondition];
                return { ...n, data: { ...d, postConditions } };
              }
              const conditions = [...((d as any).conditions ?? []), newCondition];
              return { ...n, data: { ...d, conditions } };
            })
          }));
        },

        removeCondition(nodeId: string, index: number) {
          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              const allConditions = [...((d as any).conditions ?? []), ...((d as any).postConditions ?? [])];
              allConditions.splice(index, 1);
              const conditions = allConditions.filter((c: any) => !c.postCondition);
              const postConditions = allConditions.filter((c: any) => c.postCondition);
              return { ...n, data: { ...d, conditions, postConditions } };
            })
          }));
        },

        updateCondition(
          nodeId: string,
          index: number,
          updates: { name?: string; definition?: string; expressionText?: string }
        ) {
          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              const allConditions = [...((d as any).conditions ?? []), ...((d as any).postConditions ?? [])];
              if (index < 0 || index >= allConditions.length) return n;
              const cond = allConditions[index];
              allConditions[index] = {
                ...cond,
                ...(updates.name !== undefined ? { name: updates.name } : {}),
                ...(updates.definition !== undefined ? { definition: updates.definition } : {}),
                ...(updates.expressionText !== undefined
                  ? { expression: { ...cond.expression, $cstText: updates.expressionText } }
                  : {})
              };
              const conditions = allConditions.filter((c: any) => !c.postCondition);
              const postConditions = allConditions.filter((c: any) => c.postCondition);
              return { ...n, data: { ...d, conditions, postConditions } };
            })
          }));
        },

        reorderCondition(nodeId: string, fromIndex: number, toIndex: number) {
          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              const conditions = [...((d as any).conditions ?? [])];
              const [moved] = conditions.splice(fromIndex, 1);
              if (moved) {
                conditions.splice(toIndex, 0, moved);
              }
              return { ...n, data: { ...d, conditions } };
            })
          }));
        },

        // -----------------------------------------------------------------------
        // Metadata operations
        // -----------------------------------------------------------------------

        updateDefinition(nodeId: string, definition: string) {
          set((state) => ({
            nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, definition } } : n))
          }));
        },

        updateComments(nodeId: string, comments: string) {
          set((state) => ({
            nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, comments } } : n))
          }));
        },

        addSynonym(nodeId: string, synonym: string) {
          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              // Data/Choice use RosettaClassSynonym, Enum uses RosettaSynonym
              if (d.$type === 'Data' || d.$type === 'Choice') {
                const newSyn = { $type: 'RosettaClassSynonym', value: { name: synonym } };
                const synonyms = [...((d as any).synonyms ?? []), newSyn];
                return { ...n, data: { ...d, synonyms } };
              }
              if (d.$type === 'RosettaEnumeration') {
                const newSyn = { $type: 'RosettaSynonym', body: { values: [{ name: synonym }] } };
                const synonyms = [...((d as any).synonyms ?? []), newSyn];
                return { ...n, data: { ...d, synonyms } };
              }
              return n;
            })
          }));
        },

        removeSynonym(nodeId: string, index: number) {
          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              const synonyms = ((d as any).synonyms ?? []).filter((_: any, i: number) => i !== index);
              return { ...n, data: { ...d, synonyms } };
            })
          }));
        },

        // -----------------------------------------------------------------------
        // Annotation operations
        // -----------------------------------------------------------------------

        addAnnotation(nodeId: string, annotationName: string) {
          const newAnnotationRef = {
            $type: 'AnnotationRef',
            annotation: { $refText: annotationName }
          };

          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              const annotations = [...((d as any).annotations ?? []), newAnnotationRef];
              return { ...n, data: { ...d, annotations } };
            })
          }));
        },

        removeAnnotation(nodeId: string, index: number) {
          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as AnyGraphNode;
              const annotations = ((d as any).annotations ?? []).filter((_: any, i: number) => i !== index);
              return { ...n, data: { ...d, annotations } };
            })
          }));
        },

        // -----------------------------------------------------------------------
        // ReactFlow integration
        // -----------------------------------------------------------------------

        // -----------------------------------------------------------------------
        // On-demand curated hydration
        // -----------------------------------------------------------------------

        requestNamespaceHydration(ns: string) {
          set((s) => {
            if (s.hydratedNamespaces.includes(ns) || s.pendingHydrationNamespaces.includes(ns)) return s;
            return { pendingHydrationNamespaces: [...s.pendingHydrationNamespaces, ns] };
          });
        },

        markNamespacesHydrated(names: string[]) {
          set((s) => ({
            hydratedNamespaces: [...new Set([...s.hydratedNamespaces, ...names])],
            pendingHydrationNamespaces: s.pendingHydrationNamespaces.filter((n) => !names.includes(n))
          }));
        },

        dequeuePendingHydration: (names) =>
          set((s) => ({
            pendingHydrationNamespaces: s.pendingHydrationNamespaces.filter((n) => !names.includes(n))
          })),

        resetHydration() {
          set({ pendingHydrationNamespaces: [], hydratedNamespaces: [] });
        },

        // -----------------------------------------------------------------------
        // ReactFlow integration
        // -----------------------------------------------------------------------

        applyReactFlowNodeChanges(changes: NodeChange<TypeGraphNode>[]) {
          // Filter out intermediate drag states to avoid polluting undo history.
          // Only apply position changes when dragging is complete.
          const meaningful = changes.filter((c) => {
            if (c.type === 'position' && c.dragging) return false;
            return true;
          });
          if (meaningful.length === 0) return;
          set((state) => ({
            nodes: applyNodeChanges(meaningful, state.nodes)
          }));
        },

        applyReactFlowEdgeChanges(changes: EdgeChange<TypeGraphEdge>[]) {
          set((state) => ({
            edges: applyEdgeChanges(changes, state.edges)
          }));
        },

        // -----------------------------------------------------------------------
        // Namespace visibility
        // -----------------------------------------------------------------------

        toggleNamespace(namespace: string) {
          set((state) => {
            const next = new Set(state.visibility.expandedNamespaces);
            if (next.has(namespace)) {
              next.delete(namespace);
            } else {
              next.add(namespace);
            }
            return {
              visibility: { ...state.visibility, expandedNamespaces: next }
            };
          });
        },

        toggleNodeVisibility(nodeId: string) {
          set((state) => {
            const next = new Set(state.visibility.hiddenNodeIds);
            if (next.has(nodeId)) {
              next.delete(nodeId);
            } else {
              next.add(nodeId);
            }
            return {
              visibility: { ...state.visibility, hiddenNodeIds: next }
            };
          });
        },

        expandAllNamespaces() {
          const nodes = get().nodes;
          const allNs = [...new Set(nodes.map((n) => n.data.namespace))];

          // For small models, expand all at once
          if (nodes.length <= LARGE_MODEL_THRESHOLD) {
            set((state) => ({
              visibility: {
                ...state.visibility,
                expandedNamespaces: new Set(allNs),
                hiddenNodeIds: new Set<string>()
              }
            }));
            return;
          }

          // Progressive expand: batch namespaces to keep each frame under ~100 nodes.
          // Sort namespaces by node count (smallest first) for faster visual feedback.
          const nsCountMap = new Map<string, number>();
          for (const n of nodes) {
            nsCountMap.set(n.data.namespace, (nsCountMap.get(n.data.namespace) ?? 0) + 1);
          }
          const nsByCount = allNs
            .map((ns) => ({ ns, count: nsCountMap.get(ns) ?? 0 }))
            .sort((a, b) => a.count - b.count);

          const BATCH_NODE_LIMIT = 100;
          const batches: string[][] = [];
          let currentBatch: string[] = [];
          let currentCount = 0;

          for (const { ns, count } of nsByCount) {
            if (currentCount + count > BATCH_NODE_LIMIT && currentBatch.length > 0) {
              batches.push(currentBatch);
              currentBatch = [ns];
              currentCount = count;
            } else {
              currentBatch.push(ns);
              currentCount += count;
            }
          }
          if (currentBatch.length > 0) batches.push(currentBatch);

          // Clear hidden nodes immediately
          set((state) => ({
            visibility: { ...state.visibility, hiddenNodeIds: new Set<string>() }
          }));

          // Expand batches progressively using requestAnimationFrame
          const seq = ++expandSeq;
          let batchIndex = 0;
          const expandNextBatch = () => {
            if (expandSeq !== seq || batchIndex >= batches.length) return;
            const batch = batches[batchIndex++]!;
            set((state) => {
              const next = new Set(state.visibility.expandedNamespaces);
              for (const ns of batch) next.add(ns);
              return {
                visibility: { ...state.visibility, expandedNamespaces: next }
              };
            });
            if (batchIndex < batches.length) {
              requestAnimationFrame(expandNextBatch);
            }
          };
          requestAnimationFrame(expandNextBatch);
        },

        collapseAllNamespaces() {
          expandSeq++; // Cancel any in-flight progressive expansion
          set((state) => ({
            visibility: {
              ...state.visibility,
              expandedNamespaces: new Set<string>(),
              hiddenNodeIds: new Set<string>()
            }
          }));
        },

        setInitialVisibility(totalNodeCount: number) {
          set((state) => {
            const shouldCollapse = totalNodeCount > LARGE_MODEL_THRESHOLD;
            const allNs = new Set(state.nodes.map((n) => n.data.namespace));
            return {
              focusMode: true,
              visibility: {
                ...state.visibility,
                expandedNamespaces: shouldCollapse ? new Set<string>() : allNs,
                hiddenNodeIds: new Set<string>()
              }
            };
          });
        },

        toggleExplorer() {
          set((state) => ({
            visibility: {
              ...state.visibility,
              explorerOpen: !state.visibility.explorerOpen
            }
          }));
        },

        getVisibleNodes(): TypeGraphNode[] {
          const { nodes, visibility } = get();
          return nodes.filter(
            (n) =>
              visibility.expandedNamespaces.has(n.data.namespace) &&
              !visibility.hiddenNodeIds.has(n.id) &&
              visibility.visibleNodeKinds.has(n.type as TypeKind)
          );
        },

        getVisibleEdges(): TypeGraphEdge[] {
          const { edges, visibility } = get();
          const visibleNodeIds = new Set(
            get()
              .getVisibleNodes()
              .map((n) => n.id)
          );
          return edges.filter(
            (e) =>
              visibleNodeIds.has(e.source) &&
              visibleNodeIds.has(e.target) &&
              visibility.visibleEdgeKinds.has((e.data as EdgeData).kind)
          );
        },

        // -----------------------------------------------------------------------
        // Kind-based visibility
        // -----------------------------------------------------------------------

        toggleNodeKind(kind: TypeKind) {
          set((state) => {
            const next = new Set(state.visibility.visibleNodeKinds);
            if (next.has(kind)) {
              next.delete(kind);
            } else {
              next.add(kind);
            }
            return {
              visibility: { ...state.visibility, visibleNodeKinds: next }
            };
          });
        },

        toggleEdgeKind(kind: EdgeKind) {
          set((state) => {
            const next = new Set(state.visibility.visibleEdgeKinds);
            if (next.has(kind)) {
              next.delete(kind);
            } else {
              next.add(kind);
            }
            return {
              visibility: { ...state.visibility, visibleEdgeKinds: next }
            };
          });
        },

        showAllNodeKinds() {
          set((state) => ({
            visibility: {
              ...state.visibility,
              visibleNodeKinds: new Set(ALL_NODE_KINDS)
            }
          }));
        },

        showAllEdgeKinds() {
          set((state) => ({
            visibility: {
              ...state.visibility,
              visibleEdgeKinds: new Set(ALL_EDGE_KINDS)
            }
          }));
        },

        // -----------------------------------------------------------------------
        // Isolation / focus
        // -----------------------------------------------------------------------

        toggleFocusRelatedExcludedKind(kind: TypeKind) {
          const { selectedNodeId, focusMode, edges, nodes } = get();
          let nextExcludedKinds: Set<TypeKind> | null = null;

          set((state) => {
            nextExcludedKinds = new Set(state.focusRelatedExcludedKinds);
            if (nextExcludedKinds.has(kind)) {
              nextExcludedKinds.delete(kind);
            } else {
              nextExcludedKinds.add(kind);
            }

            return {
              focusRelatedExcludedKinds: nextExcludedKinds
            };
          });

          if (focusMode && selectedNodeId && nextExcludedKinds) {
            const focusNodeIds = collectFocusClusterNodeIds(
              selectedNodeId,
              edges,
              buildNodeMap(nodes),
              nextExcludedKinds
            );
            get().showOnly(focusNodeIds);
          }
        },

        isolateNode(nodeId: string) {
          const { edges, nodes, focusRelatedExcludedKinds } = get();
          const focusNodeIds = collectFocusClusterNodeIds(
            nodeId,
            edges,
            buildNodeMap(nodes),
            focusRelatedExcludedKinds
          );
          get().showOnly(focusNodeIds);
        },

        revealNeighbors(nodeId: string) {
          const { nodes, edges, visibility, focusRelatedExcludedKinds } = get();
          const focusNodeIds = collectFocusClusterNodeIds(
            nodeId,
            edges,
            buildNodeMap(nodes),
            focusRelatedExcludedKinds
          );
          const nodeMap = buildNodeMap(nodes);
          const hiddenNodeIds = new Set(visibility.hiddenNodeIds);
          const expandedNamespaces = new Set(visibility.expandedNamespaces);
          for (const id of focusNodeIds) {
            hiddenNodeIds.delete(id);
            const node = nodeMap.get(id);
            if (node) expandedNamespaces.add(node.data.namespace);
          }
          set((state) => ({
            visibility: {
              ...state.visibility,
              hiddenNodeIds,
              expandedNamespaces
            }
          }));
        },

        showOnly(nodeIds: Set<string>) {
          const { nodes } = get();
          const nodeMap = buildNodeMap(nodes);
          const hiddenNodeIds = new Set<string>();
          for (const n of nodes) {
            if (!nodeIds.has(n.id)) hiddenNodeIds.add(n.id);
          }
          const expandedNamespaces = new Set(get().visibility.expandedNamespaces);
          for (const id of nodeIds) {
            const node = nodeMap.get(id);
            if (node) expandedNamespaces.add(node.data.namespace);
          }
          set((state) => ({
            visibility: {
              ...state.visibility,
              hiddenNodeIds,
              expandedNamespaces
            }
          }));
        },

        showAllNodes() {
          set((state) => ({
            visibility: {
              ...state.visibility,
              hiddenNodeIds: new Set<string>()
            }
          }));
        },

        toggleFocusMode() {
          const next = !get().focusMode;
          set({ focusMode: next });
          if (next) {
            const { selectedNodeId, edges, nodes, focusRelatedExcludedKinds } = get();
            if (selectedNodeId) {
              const focusNodeIds = collectFocusClusterNodeIds(
                selectedNodeId,
                edges,
                buildNodeMap(nodes),
                focusRelatedExcludedKinds
              );
              if (focusNodeIds.size > 1) {
                get().showOnly(focusNodeIds);
              } else {
                get().showAllNodes();
              }
            }
          } else {
            get().showAllNodes();
          }
        }
      }),
      {
        partialize: (state): TrackedState => ({
          nodes: state.nodes,
          edges: state.edges
        }),
        limit: 50
      }
    )
  );

/**
 * Default store instance for use with RuneTypeGraph.
 */
export const useEditorStore = createEditorStore();
