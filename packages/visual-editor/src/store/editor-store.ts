/**
 * Zustand editor store for the visual editor.
 *
 * Manages graph state (nodes, edges), UI state (selection, search, filters),
 * and domain state (parsed AST models).
 */

import { create } from 'zustand';
import { temporal } from 'zundo';
import type {
  TypeGraphNode,
  TypeGraphEdge,
  GraphFilters,
  TypeKind,
  ValidationError,
  TypeNodeData,
  EdgeData,
  MemberDisplay,
  LayoutOptions,
  VisibilityState
} from '../types.js';
import { astToGraph } from '../adapters/ast-to-graph.js';
import { computeLayout } from '../layout/dagre-layout.js';
import { validateGraph } from '../validation/edit-validator.js';
import type { TrackedState } from './history.js';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

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

  // --- Metadata operations ---
  updateDefinition(nodeId: string, definition: string): void;
  updateComments(nodeId: string, comments: string): void;
  addSynonym(nodeId: string, synonym: string): void;
  removeSynonym(nodeId: string, index: number): void;
}

export type EditorStore = EditorState & EditorActions;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nodeCounter = 0;

function makeNodeId(namespace: string, name: string): string {
  return `${namespace}::${name}`;
}

function formatCardinalityString(card: string): string {
  // Normalize to (inf..sup) format
  if (card.startsWith('(') && card.endsWith(')')) {
    return card;
  }
  return `(${card})`;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

/** Threshold above which namespaces start collapsed for performance. */
const LARGE_MODEL_THRESHOLD = 100;

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
    explorerOpen: true
  }
};

// ---------------------------------------------------------------------------
// Store creation
// ---------------------------------------------------------------------------

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
          const opts = layoutOpts ?? get().layoutOptions;
          const filters = get().activeFilters;
          const { nodes: rawNodes, edges } = astToGraph(models, { filters });

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
              explorerOpen: true
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

          const newNode: TypeGraphNode = {
            id: nodeId,
            type: kind,
            position: { x: nodeCounter * 50, y: nodeCounter * 50 },
            data: {
              kind,
              name,
              namespace,
              members: [],
              hasExternalRefs: false,
              errors: []
            } as TypeNodeData
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

            const oldName = targetNode.data.name;
            const namespace = targetNode.data.namespace;
            const newNodeId = makeNodeId(namespace, newName);

            // 1. Rename the target node: update name and ID
            const updatedNodes = state.nodes.map((n) => {
              if (n.id === nodeId) {
                return { ...n, id: newNodeId, data: { ...n.data, name: newName } };
              }
              // 2. Update other nodes' member typeName and parentName references
              let changed = false;
              const updatedMembers = n.data.members.map((m) => {
                if (m.typeName === oldName) {
                  changed = true;
                  return { ...m, typeName: newName };
                }
                return m;
              });
              const updatedParentName = n.data.parentName === oldName ? newName : n.data.parentName;
              if (changed || updatedParentName !== n.data.parentName) {
                return {
                  ...n,
                  data: { ...n.data, members: updatedMembers, parentName: updatedParentName }
                };
              }
              return n;
            });

            // 3. Update all edges that reference the old node ID
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

            // 4. Update selectedNodeId if it was the renamed node
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
          const newMember: MemberDisplay = {
            name: attrName,
            typeName,
            cardinality: formatCardinalityString(cardinality),
            isOverride: false
          };

          set((state) => ({
            nodes: state.nodes.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      members: [...n.data.members, newMember]
                    }
                  }
                : n
            )
          }));
        },

        removeAttribute(nodeId: string, attrName: string) {
          set((state) => ({
            nodes: state.nodes.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      members: n.data.members.filter((m) => m.name !== attrName)
                    }
                  }
                : n
            )
          }));
        },

        updateCardinality(nodeId: string, attrName: string, cardinality: string) {
          set((state) => ({
            nodes: state.nodes.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      members: n.data.members.map((m) =>
                        m.name === attrName
                          ? {
                              ...m,
                              cardinality: formatCardinalityString(cardinality)
                            }
                          : m
                      )
                    }
                  }
                : n
            )
          }));
        },

        setInheritance(childId: string, parentId: string | null) {
          set((state) => {
            // Remove existing inheritance edges from the child
            const filteredEdges = state.edges.filter(
              (e) => !(e.source === childId && e.data?.kind === 'extends')
            );

            // Update parentName on the child node
            const parentNode = parentId ? state.nodes.find((n) => n.id === parentId) : null;
            const parentName = parentNode?.data.name ?? undefined;

            const updatedNodes = state.nodes.map((n) =>
              n.id === childId ? { ...n, data: { ...n.data, parentName } } : n
            );

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
              return {
                nodes: updatedNodes,
                edges: [...filteredEdges, newEdge]
              };
            }

            return {
              nodes: updatedNodes,
              edges: filteredEdges
            };
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
          set((state) => ({
            nodes: state.nodes.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      members: n.data.members.map((m) =>
                        m.name === oldName
                          ? {
                              ...m,
                              name: newName,
                              typeName,
                              cardinality: formatCardinalityString(cardinality)
                            }
                          : m
                      )
                    }
                  }
                : n
            )
          }));
        },

        reorderAttribute(nodeId: string, fromIndex: number, toIndex: number) {
          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const members = [...n.data.members];
              const [moved] = members.splice(fromIndex, 1);
              if (moved) {
                members.splice(toIndex, 0, moved);
              }
              return { ...n, data: { ...n.data, members } };
            })
          }));
        },

        // -----------------------------------------------------------------------
        // Enum operations
        // -----------------------------------------------------------------------

        addEnumValue(nodeId: string, valueName: string, displayName?: string) {
          const newMember: MemberDisplay = {
            name: valueName,
            displayName,
            isOverride: false
          };

          set((state) => ({
            nodes: state.nodes.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, members: [...n.data.members, newMember] } }
                : n
            )
          }));
        },

        removeEnumValue(nodeId: string, valueName: string) {
          set((state) => ({
            nodes: state.nodes.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      members: n.data.members.filter((m) => m.name !== valueName)
                    }
                  }
                : n
            )
          }));
        },

        updateEnumValue(nodeId: string, oldName: string, newName: string, displayName?: string) {
          set((state) => ({
            nodes: state.nodes.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      members: n.data.members.map((m) =>
                        m.name === oldName ? { ...m, name: newName, displayName } : m
                      )
                    }
                  }
                : n
            )
          }));
        },

        reorderEnumValue(nodeId: string, fromIndex: number, toIndex: number) {
          set((state) => ({
            nodes: state.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const members = [...n.data.members];
              const [moved] = members.splice(fromIndex, 1);
              if (moved) {
                members.splice(toIndex, 0, moved);
              }
              return { ...n, data: { ...n.data, members } };
            })
          }));
        },

        setEnumParent(nodeId: string, parentId: string | null) {
          set((state) => {
            // Remove existing enum-extends edges from this node
            const filteredEdges = state.edges.filter(
              (e) => !(e.source === nodeId && e.data?.kind === 'enum-extends')
            );

            const parentNode = parentId ? state.nodes.find((n) => n.id === parentId) : null;
            const parentName = parentNode?.data.name ?? undefined;

            const updatedNodes = state.nodes.map((n) =>
              n.id === nodeId ? { ...n, data: { ...n.data, parentName } } : n
            );

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
          const newMember: MemberDisplay = {
            name: typeName,
            typeName,
            isOverride: false
          };

          set((state) => {
            const targetNodeId = state.nodes.find((n) => n.data.name === typeName)?.id;

            const updatedNodes = state.nodes.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, members: [...n.data.members, newMember] } }
                : n
            );

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
            nodes: state.nodes.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      members: n.data.members.filter((m) => m.typeName !== typeName)
                    }
                  }
                : n
            ),
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
          set((state) => ({
            nodes: state.nodes.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      members: [
                        ...n.data.members,
                        { name: paramName, typeName, cardinality: '(1..1)', isOverride: false }
                      ]
                    }
                  }
                : n
            )
          }));
        },

        removeInputParam(nodeId: string, paramName: string) {
          set((state) => ({
            nodes: state.nodes.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      members: n.data.members.filter((m) => m.name !== paramName)
                    }
                  }
                : n
            )
          }));
        },

        updateOutputType(nodeId: string, typeName: string) {
          set((state) => ({
            nodes: state.nodes.map((n) =>
              n.id === nodeId ? { ...n, data: { ...n.data, outputType: typeName } } : n
            )
          }));
        },

        updateExpression(nodeId: string, expressionText: string) {
          set((state) => ({
            nodes: state.nodes.map((n) =>
              n.id === nodeId ? { ...n, data: { ...n.data, expressionText } } : n
            )
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
            nodes: state.nodes.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      synonyms: [...(n.data.synonyms ?? []), synonym]
                    }
                  }
                : n
            )
          }));
        },

        removeSynonym(nodeId: string, index: number) {
          set((state) => ({
            nodes: state.nodes.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      synonyms: (n.data.synonyms ?? []).filter((_, i) => i !== index)
                    }
                  }
                : n
            )
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
          set((state) => {
            const allNs = new Set(state.nodes.map((n) => n.data.namespace));
            return {
              visibility: {
                ...state.visibility,
                expandedNamespaces: allNs,
                hiddenNodeIds: new Set<string>()
              }
            };
          });
        },

        collapseAllNamespaces() {
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
              !visibility.hiddenNodeIds.has(n.id)
          );
        },

        getVisibleEdges(): TypeGraphEdge[] {
          const { edges } = get();
          const visibleNodeIds = new Set(
            get()
              .getVisibleNodes()
              .map((n) => n.id)
          );
          return edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));
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
