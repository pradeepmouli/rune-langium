// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * `RuneTypeGraph` — Main React graph component for visualizing Rune DSL (CDM/DRR)
 * type hierarchies using `@xyflow/react`.
 *
 * @remarks
 * Subscribes to the zustand `editorStore` for node/edge data and visibility state.
 * Local ReactFlow state preserves drag positions across renders; store data is
 * synced in on each store update. All domain mutations (add/remove types,
 * attribute edits) go through the store — this component is intentionally read-only
 * from a domain perspective.
 *
 * The component renders inside a `ReactFlowProvider` wrapper so it can host its own
 * ReactFlow instance. The `ref` prop exposes imperative handles for programmatic
 * control (`fitView`, `navigateToNode`, `getSelection`).
 *
 * @useWhen
 * - Embedding a Rune DSL type hierarchy viewer or editor in a React app
 * - Visualizing CDM/DRR model graphs alongside a text editor
 *
 * @avoidWhen
 * - Mounting multiple `RuneTypeGraph` instances pointing at the **same** zustand
 *   store — both will compete for node position state and layout triggers, causing
 *   visual inconsistencies and duplicate re-renders. Each graph instance should
 *   own its own store (use `createEditorStore()` to create isolated instances).
 * - Using in a server-side rendering (SSR) context — `@xyflow/react` is browser-only.
 *
 * @pitfalls
 * - Do NOT mount this component before the Rune DSL workspace has been loaded into
 *   the store — the graph will render empty and the layout engine will produce
 *   zero-node output with no visible error.
 * - Do NOT share a single `editorStore` instance between multiple mounted graphs —
 *   concurrent Dagre layout computations will overwrite each other's node positions.
 * - Async layout (`computeLayoutAsync`) uses a Web Worker; if the worker is cancelled
 *   mid-run (e.g., rapid model updates), the graph may remain in a transitional
 *   layout state. The next model change triggers a fresh layout.
 *
 * @category Visual Editor
 * @see {@link RuneTypeGraphProps}
 * @see {@link RuneTypeGraphRef}
 * @see {@link createEditorStore}
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useCallback,
  useMemo,
  useState
} from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider
} from '@xyflow/react';
import type { OnSelectionChangeParams } from '@xyflow/react';
import { nodeTypes } from './nodes/index.js';
import { NavigationContext } from './nodes/NavigationContext.js';
import { edgeTypes } from './edges/index.js';
import { GraphContextMenu } from './GraphContextMenu.js';
import type { ContextMenuState } from './GraphContextMenu.js';
import { computeLayout, computeLayoutIncremental } from '../layout/dagre-layout.js';
import { computeLayoutAsync, cancelAsyncLayout } from '../layout/layout-worker.js';
import { modelsToAst } from '../adapters/model-to-ast.js';
import { validateGraph } from '../validation/edit-validator.js';
import { useEditorStore } from '../store/editor-store.js';
import type {
  RuneTypeGraphProps,
  RuneTypeGraphRef,
  TypeGraphNode,
  TypeGraphEdge,
  GraphFilters,
  LayoutOptions,
  ValidationError,
  AnyGraphNode
} from '../types.js';

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  layout: { direction: 'TB' as const, nodeSeparation: 50, rankSeparation: 100 },
  showMinimap: false,
  showControls: true,
  readOnly: true
};

// ---------------------------------------------------------------------------
// Inner component (needs ReactFlowProvider context)
// ---------------------------------------------------------------------------

const RuneTypeGraphInner = forwardRef<RuneTypeGraphRef, RuneTypeGraphProps>(
  function RuneTypeGraphInner({ config, callbacks, className }, ref) {
    const mergedConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);
    const { fitView, setCenter } = useReactFlow();

    // Subscribe to store state
    const storeNodes = useEditorStore((s) => s.nodes);
    const storeEdges = useEditorStore((s) => s.edges);
    const visibility = useEditorStore((s) => s.visibility);
    const selectNode = useEditorStore((s) => s.selectNode);

    // Derive visible nodes/edges from store, respecting namespace, kind, and individual visibility
    const { visibleNodes, visibleEdges } = useMemo(() => {
      const { expandedNamespaces, hiddenNodeIds, visibleNodeKinds, visibleEdgeKinds } = visibility;
      const vNodes = storeNodes.filter(
        (n) =>
          expandedNamespaces.has(n.data.namespace) &&
          !hiddenNodeIds.has(n.id) &&
          visibleNodeKinds.has(n.type as import('../types.js').TypeKind)
      );
      const visibleIds = new Set(vNodes.map((n) => n.id));
      const vEdges = storeEdges.filter(
        (e) =>
          visibleIds.has(e.source) &&
          visibleIds.has(e.target) &&
          visibleEdgeKinds.has((e.data as import('../types.js').EdgeData).kind)
      );
      return { visibleNodes: vNodes, visibleEdges: vEdges };
    }, [storeNodes, storeEdges, visibility]);

    // Apply layout to visible nodes.
    // Small graphs (<500 nodes): synchronous incremental layout (cache-first).
    // Large graphs (>=500 nodes): async layout off the main thread.
    const isInitialLoad = useRef(true);
    const ASYNC_LAYOUT_THRESHOLD = 500;
    const [asyncLayoutResult, setAsyncLayoutResult] = useState<TypeGraphNode[]>([]);

    // Synchronous path for small/medium graphs
    const syncLayoutedNodes = useMemo(() => {
      if (visibleNodes.length === 0 || visibleNodes.length >= ASYNC_LAYOUT_THRESHOLD) return [];
      if (isInitialLoad.current) {
        isInitialLoad.current = false;
        return computeLayout(visibleNodes, visibleEdges, mergedConfig.layout);
      }
      return computeLayoutIncremental(visibleNodes, visibleEdges, mergedConfig.layout);
    }, [visibleNodes, visibleEdges, mergedConfig.layout]);

    // Async path for large graphs
    useEffect(() => {
      if (visibleNodes.length < ASYNC_LAYOUT_THRESHOLD) return;
      cancelAsyncLayout();
      computeLayoutAsync(visibleNodes, visibleEdges, mergedConfig.layout).then((result) => {
        if (result) {
          setAsyncLayoutResult(result);
          isInitialLoad.current = false;
        }
      });
      return () => cancelAsyncLayout();
    }, [visibleNodes, visibleEdges, mergedConfig.layout]);

    const layoutedNodes =
      visibleNodes.length >= ASYNC_LAYOUT_THRESHOLD ? asyncLayoutResult : syncLayoutedNodes;

    const [nodes, setNodes, onNodesChange] = useNodesState<TypeGraphNode>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<TypeGraphEdge>([]);

    // Track current filters
    const filtersRef = useRef<GraphFilters>(mergedConfig.initialFilters ?? {});

    // Sync store data into local ReactFlow state, preserving drag positions
    const prevVisibleRef = useRef<TypeGraphNode[]>([]);
    useEffect(() => {
      const prev = prevVisibleRef.current;
      prevVisibleRef.current = layoutedNodes;

      if (prev.length === 0) {
        // Initial load — set everything
        setNodes(layoutedNodes);
        setEdges(visibleEdges);
        if (layoutedNodes.length > 0) {
          setTimeout(() => {
            try {
              fitView({ duration: 200 });
            } catch {
              /* SSR/test guard */
            }
          }, 50);
        }
        return;
      }

      // Merge: preserve local positions, update data from store
      setNodes((localNodes: TypeGraphNode[]) => {
        const storeMap = new Map(layoutedNodes.map((n) => [n.id, n]));
        const merged: TypeGraphNode[] = [];
        for (const n of localNodes) {
          const sn = storeMap.get(n.id);
          if (!sn) continue;
          // Preserve position from local state, update data from store
          merged.push(sn.data === n.data ? n : { ...n, data: sn.data });
        }

        // Add new nodes not yet in local state
        const localIds = new Set(localNodes.map((n) => n.id));
        for (const sn of layoutedNodes) {
          if (!localIds.has(sn.id)) merged.push(sn);
        }
        return merged;
      });
      setEdges(visibleEdges);

      // Auto fit-view when visibility changes
      if (layoutedNodes.length > 0 && layoutedNodes.length !== prev.length) {
        setTimeout(() => {
          try {
            fitView({ duration: 200 });
          } catch {
            /* SSR/test guard */
          }
        }, 50);
      }
    }, [layoutedNodes, visibleEdges, setNodes, setEdges, fitView]);

    // Selection handler — writes to store
    const handleSelectionChange = useCallback(
      ({ nodes: selectedNodes }: OnSelectionChangeParams) => {
        if (selectedNodes.length > 0) {
          const node = selectedNodes[0] as TypeGraphNode;
          selectNode(node.id);
        } else {
          callbacks?.onSelectionClear?.();
        }
      },
      [selectNode, callbacks]
    );

    // Navigation context value for clickable type references in nodes
    const navigationCtx = useMemo(() => {
      const allNodeIds = new Set(storeNodes.map((n) => n.id));
      return { onNavigateToType: callbacks?.onNavigateToType, allNodeIds };
    }, [storeNodes, callbacks?.onNavigateToType]);

    // Node double-click handler
    const handleNodeDoubleClick = useCallback(
      (_event: React.MouseEvent, node: TypeGraphNode) => {
        callbacks?.onNodeDoubleClick?.(node.id, node.data);
      },
      [callbacks]
    );

    // Imperative ref API — view operations only
    useImperativeHandle(
      ref,
      () => ({
        fitView() {
          fitView({ duration: 200 });
        },

        focusNode(nodeId: string) {
          const node = nodes.find((n) => n.id === nodeId);
          if (node) {
            setCenter(node.position.x + 110, node.position.y + 60, { zoom: 1.5, duration: 300 });
            // Programmatically select the target node in React Flow
            setNodes((prev) =>
              prev.map((n) => ({
                ...n,
                selected: n.id === nodeId
              }))
            );
          }
        },

        search(query: string): string[] {
          const results: string[] = [];
          if (!query.trim()) return results;
          const regex = new RegExp(query, 'i');
          for (const node of nodes) {
            if (regex.test((node.data as AnyGraphNode).name as string)) {
              results.push(node.id);
            }
          }
          return results;
        },

        setFilters(filters: GraphFilters) {
          filtersRef.current = filters;
        },

        getFilters(): GraphFilters {
          return { ...filtersRef.current };
        },

        relayout(options?: LayoutOptions) {
          const opts = options ?? mergedConfig.layout;
          const layouted = computeLayout(nodes, edges, opts);
          setNodes(layouted);
        },

        async exportImage(_format: 'svg' | 'png'): Promise<Blob> {
          // TODO: Implement with html-to-image
          return new Blob([''], { type: 'text/plain' });
        },

        exportRosetta(): Map<string, string> {
          const outputModels = modelsToAst(storeNodes, storeEdges);
          const result = new Map<string, string>();
          for (const model of outputModels) {
            try {
              result.set(model.name, `// ${model.name} (${model.elements.length} elements)`);
            } catch {
              result.set(model.name, `// Error serializing ${model.name}`);
            }
          }
          callbacks?.onModelChanged?.(result);
          return result;
        },

        getNodeData(nodeId: string): AnyGraphNode | null {
          const node = storeNodes.find((n) => n.id === nodeId);
          return node?.data ?? null;
        },

        getNodes(): TypeGraphNode[] {
          return storeNodes;
        },

        validate(): ValidationError[] {
          return validateGraph(storeNodes, storeEdges);
        }
      }),
      [nodes, edges, storeNodes, storeEdges, mergedConfig, fitView, setCenter, setNodes, callbacks]
    );

    // Context menu state
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

    const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: TypeGraphNode) => {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, node });
    }, []);

    const handlePaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, node: null });
    }, []);

    const handleCloseContextMenu = useCallback(() => {
      setContextMenu(null);
    }, []);

    // Close context menu on pane click
    const handlePaneClick = useCallback(() => {
      setContextMenu(null);
    }, []);

    return (
      <div className={`rune-type-graph ${className ?? ''}`}>
        <NavigationContext.Provider value={navigationCtx}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onSelectionChange={handleSelectionChange}
            onNodeDoubleClick={handleNodeDoubleClick}
            onNodeContextMenu={handleNodeContextMenu}
            onPaneContextMenu={handlePaneContextMenu}
            onPaneClick={handlePaneClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            nodesDraggable={!mergedConfig.readOnly}
            nodesConnectable={!mergedConfig.readOnly}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
          >
            {mergedConfig.showControls && <Controls />}
            {mergedConfig.showMinimap && <MiniMap />}
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          </ReactFlow>
        </NavigationContext.Provider>
        <GraphContextMenu state={contextMenu} onClose={handleCloseContextMenu} />
      </div>
    );
  }
);

// ---------------------------------------------------------------------------
// Public component (wraps with ReactFlowProvider)
// ---------------------------------------------------------------------------

export const RuneTypeGraph = forwardRef<RuneTypeGraphRef, RuneTypeGraphProps>(
  function RuneTypeGraph(props, ref) {
    return (
      <ReactFlowProvider>
        <RuneTypeGraphInner {...props} ref={ref} />
      </ReactFlowProvider>
    );
  }
);
