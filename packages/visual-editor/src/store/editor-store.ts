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
  LayoutOptions
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

const initialState: EditorState = {
  nodes: [],
  edges: [],
  selectedNodeId: null,
  searchQuery: '',
  searchResults: [],
  activeFilters: {},
  detailPanelOpen: false,
  validationErrors: [],
  layoutOptions: { direction: 'TB', nodeSeparation: 50, rankSeparation: 100 }
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
      const nodes = computeLayout(rawNodes, edges, opts);

      set({
        nodes,
        edges,
        layoutOptions: opts,
        selectedNodeId: null,
        searchQuery: '',
        searchResults: []
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
    }
  }));

/**
 * Default store instance for use with RuneTypeGraph.
 */
export const useEditorStore = createEditorStore();
