/**
 * Zustand editor store for the visual editor.
 *
 * Manages graph state (nodes, edges), UI state (selection, search, filters),
 * and domain state (parsed AST models).
 */

import { create } from 'zustand';
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
  updateCardinality(nodeId: string, attrName: string, cardinality: string): void;
  setInheritance(childId: string, parentId: string | null): void;
  validate(): ValidationError[];
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
  create<EditorStore>((set, get) => ({
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
      const nodes = visibleNodes.length > 0 ? computeLayout(visibleNodes, visibleEdges, opts) : [];

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
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: { ...n.data, name: newName }
              }
            : n
        )
      }));
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
          visibility.expandedNamespaces.has(n.data.namespace) && !visibility.hiddenNodeIds.has(n.id)
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
  }));

/**
 * Default store instance for use with RuneTypeGraph.
 */
export const useEditorStore = createEditorStore();
