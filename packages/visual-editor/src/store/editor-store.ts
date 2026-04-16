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
import {
  getTypeRefText,
  AST_TYPE_TO_NODE_TYPE,
  NODE_TYPE_TO_AST_TYPE
} from '../adapters/model-helpers.js';
import type { TrackedState } from './history.js';

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

  // --- UI state ---
  selectedNodeId: string | null;
  searchQuery: string;
  searchResults: string[];
  activeFilters: GraphFilters;
  detailPanelOpen: boolean;
  validationErrors: ValidationError[];

  // --- Layout options ---
  layoutOptions: LayoutOptions;

  // --- Namespace visibility ---
  visibility: VisibilityState;
}

export interface EditorActions {
  // --- Data loading ---
  loadModels(models: unknown | unknown[], layoutOpts?: LayoutOptions): void;

  // --- Navigation ---
  selectNode(nodeId: string | null): void;
  setSearchQuery(query: string): void;
  setFilters(filters: GraphFilters): void;
  toggleDetailPanel(): void;

  // --- Layout ---
  relayout(options?: LayoutOptions): void;

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
  /** Hide all nodes except the given node and its directly connected neighbors. */
  isolateNode(nodeId: string): void;
  /** Unhide the direct neighbors of a node (expand their namespaces too). */
  revealNeighbors(nodeId: string): void;
  /** Hide all nodes except the given set. */
  showOnly(nodeIds: Set<string>): void;
  /** Unhide all nodes (reset hiddenNodeIds). */
  showAllNodes(): void;

  // --- Editing (P2) ---
  createType(kind: TypeKind, name: string, namespace: string): string;
  deleteType(nodeId: string): void;
  renameType(nodeId: string, newName: string): void;
  addAttribute(nodeId: string, attrName: string, typeName: string, cardinality: string): void;
  removeAttribute(nodeId: string, attrName: string): void;
  updateAttribute(
    nodeId: string,
    oldName: string,
    newName: string,
    typeName: string,
    cardinality: string
  ): void;
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

  function updateMemberRefs<T extends { typeCall?: { type?: { $refText?: string } } }>(
    members: T[]
  ): T[] {
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

  function updateRefText(
    ref: { $refText?: string } | undefined
  ): { $refText?: string } | undefined {
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
  selectedNodeId: null,
  searchQuery: '',
  searchResults: [],
  activeFilters: {},
  detailPanelOpen: false,
  validationErrors: [],
  layoutOptions: { direction: 'TB', nodeSeparation: 50, rankSeparation: 100 },
  visibility: {
    expandedNamespaces: new Set<string>(),
    hiddenNodeIds: new Set<string>(),
    explorerOpen: true,
    visibleNodeKinds: new Set(ALL_NODE_KINDS),
    visibleEdgeKinds: new Set(ALL_EDGE_KINDS)
  }
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

          // Determine initial visibility based on model size
          const allNamespaces = new Set(rawNodes.map((n) => n.data.namespace));
          const shouldCollapse = rawNodes.length > LARGE_MODEL_THRESHOLD;

          const expandedNamespaces = shouldCollapse ? new Set<string>() : new Set(allNamespaces);

          // Only layout visible nodes
          const visibleNodes = shouldCollapse ? [] : rawNodes;
          const visibleEdges = shouldCollapse ? [] : edges;
          const nodes =
            visibleNodes.length > 0 ? computeLayout(visibleNodes, visibleEdges, opts) : [];

          set({
            nodes: rawNodes,
            edges,
            layoutOptions: opts,
            selectedNodeId: null,
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

        // -----------------------------------------------------------------------
        // Navigation
        // -----------------------------------------------------------------------

        selectNode(nodeId) {
          set({ selectedNodeId: nodeId, detailPanelOpen: nodeId !== null });
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
            const updatedSelectedNodeId =
              state.selectedNodeId === nodeId ? newNodeId : state.selectedNodeId;

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
            const targetNodeId = state.nodes.find(
              (n) => (n.data as AnyGraphNode).name === typeName
            )?.id;

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
              (e) =>
                !(
                  e.source === nodeId &&
                  e.data?.kind === 'attribute-ref' &&
                  e.data?.label === attrName
                )
            )
          }));
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
            const filteredEdges = state.edges.filter(
              (e) => !(e.source === childId && e.data?.kind === 'extends')
            );

            const parentNode = parentId ? state.nodes.find((n) => n.id === parentId) : null;
            const parentName = (parentNode?.data as AnyGraphNode)?.name as string | undefined;

            const updatedNodes = state.nodes.map((n) => {
              if (n.id !== childId) return n;
              const d = n.data as AnyGraphNode;
              const superRef = parentName
                ? ({ ref: { name: parentName }, $refText: parentName } as any)
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

        updateAttribute(
          nodeId: string,
          oldName: string,
          newName: string,
          typeName: string,
          cardinality: string
        ) {
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
              (e) =>
                !(
                  e.source === nodeId &&
                  e.data?.kind === 'attribute-ref' &&
                  e.data?.label === oldName
                )
            );

            // Add new attribute-ref edge if target exists
            const targetNodeId = state.nodes.find(
              (n) => (n.data as AnyGraphNode).name === typeName
            )?.id;
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
            const filteredEdges = state.edges.filter(
              (e) => !(e.source === nodeId && e.data?.kind === 'enum-extends')
            );

            const parentNode = parentId ? state.nodes.find((n) => n.id === parentId) : null;
            const parentName = (parentNode?.data as AnyGraphNode)?.name as string | undefined;
            const parentRef = parentName
              ? ({ ref: { name: parentName }, $refText: parentName } as any)
              : undefined;

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
            const targetNodeId = state.nodes.find(
              (n) => (n.data as AnyGraphNode).name === typeName
            )?.id;

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
                const attrs = ((d as any).attributes ?? []).filter(
                  (a: any) => a.typeCall?.type?.$refText !== typeName
                );
                return { ...n, data: { ...d, attributes: attrs } };
              }
              return n;
            }),
            edges: state.edges.filter(
              (e) =>
                !(
                  e.source === nodeId &&
                  e.data?.kind === 'choice-option' &&
                  e.data?.label === typeName
                )
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
              const allConditions = [
                ...((d as any).conditions ?? []),
                ...((d as any).postConditions ?? [])
              ];
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
              const allConditions = [
                ...((d as any).conditions ?? []),
                ...((d as any).postConditions ?? [])
              ];
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
            nodes: state.nodes.map((n) =>
              n.id === nodeId ? { ...n, data: { ...n.data, definition } } : n
            )
          }));
        },

        updateComments(nodeId: string, comments: string) {
          set((state) => ({
            nodes: state.nodes.map((n) =>
              n.id === nodeId ? { ...n, data: { ...n.data, comments } } : n
            )
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
              const synonyms = ((d as any).synonyms ?? []).filter(
                (_: any, i: number) => i !== index
              );
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
              const annotations = ((d as any).annotations ?? []).filter(
                (_: any, i: number) => i !== index
              );
              return { ...n, data: { ...d, annotations } };
            })
          }));
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

        isolateNode(nodeId: string) {
          const { nodes, edges } = get();
          // Find directly connected neighbors via all edge types
          const neighbors = new Set<string>([nodeId]);
          for (const edge of edges) {
            if (edge.source === nodeId) neighbors.add(edge.target);
            if (edge.target === nodeId) neighbors.add(edge.source);
          }
          // Hide everything except neighbors
          const hiddenNodeIds = new Set<string>();
          for (const n of nodes) {
            if (!neighbors.has(n.id)) hiddenNodeIds.add(n.id);
          }
          // Ensure namespaces of visible nodes are expanded
          const expandedNamespaces = new Set(get().visibility.expandedNamespaces);
          for (const id of neighbors) {
            const node = nodes.find((n) => n.id === id);
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

        revealNeighbors(nodeId: string) {
          const { nodes, edges, visibility } = get();
          // Find directly connected neighbors
          const neighbors = new Set<string>([nodeId]);
          for (const edge of edges) {
            if (edge.source === nodeId) neighbors.add(edge.target);
            if (edge.target === nodeId) neighbors.add(edge.source);
          }
          // Unhide neighbors and expand their namespaces
          const hiddenNodeIds = new Set(visibility.hiddenNodeIds);
          const expandedNamespaces = new Set(visibility.expandedNamespaces);
          for (const id of neighbors) {
            hiddenNodeIds.delete(id);
            const node = nodes.find((n) => n.id === id);
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
          const hiddenNodeIds = new Set<string>();
          for (const n of nodes) {
            if (!nodeIds.has(n.id)) hiddenNodeIds.add(n.id);
          }
          const expandedNamespaces = new Set(get().visibility.expandedNamespaces);
          for (const id of nodeIds) {
            const node = nodes.find((n) => n.id === id);
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
