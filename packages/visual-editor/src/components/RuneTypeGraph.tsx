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
  ReactFlowProvider,
  type Node
} from '@xyflow/react';
import type { OnSelectionChangeParams } from '@xyflow/react';
import { cn } from '@rune-langium/design-system/utils';
import { nodeTypes } from './nodes/index.js';
import { NavigationContext } from './nodes/NavigationContext.js';
import { edgeTypes } from './edges/index.js';
import { GraphContextMenu } from './GraphContextMenu.js';
import type { ContextMenuState } from './GraphContextMenu.js';
import { computeLayout, computeLayoutIncremental } from '../layout/dagre-layout.js';
import { computeLayoutAsync, cancelAsyncLayout } from '../layout/layout-worker.js';
import { findInheritanceGroups } from '../layout/grouped-layout.js';
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
  AnyGraphNode,
  EdgeData
} from '../types.js';
import type { GroupContainerData, GroupContainerNodeType } from './nodes/GroupContainerNode.js';

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: {
  layout: LayoutOptions;
  showMinimap: boolean;
  showControls: boolean;
  readOnly: boolean;
} = {
  layout: { direction: 'TB' as const, nodeSeparation: 50, rankSeparation: 100 },
  showMinimap: false,
  showControls: true,
  readOnly: true
};

const VIEWPORT_STORAGE_KEY = 'rune-type-graph:viewport';
const GROUP_HORIZONTAL_PADDING = 26;
const GROUP_TOP_PADDING = 40;
const GROUP_BOTTOM_PADDING = 18;
const ESTIMATED_NODE_WIDTH = 220;
const ESTIMATED_NODE_MIN_HEIGHT = 120;

type DisplayGraphNode = TypeGraphNode | GroupContainerNodeType;

interface InheritanceDisplayModel {
  nodes: DisplayGraphNode[];
  groupLabelsByNodeId: Map<string, string>;
}

function isGroupContainerNode(node: DisplayGraphNode): node is GroupContainerNodeType {
  return node.type === 'groupContainer';
}

function isTypeGraphNode(node: DisplayGraphNode): node is TypeGraphNode {
  return !isGroupContainerNode(node);
}

function estimateNodeHeight(node: TypeGraphNode): number {
  const d = node.data as Record<string, unknown>;
  const members = (d.attributes ?? d.enumValues ?? d.inputs ?? d.features ?? []) as unknown[];
  return Math.max(ESTIMATED_NODE_MIN_HEIGHT, 40 + members.length * 24 + 16);
}

function buildInheritanceDisplayNodes(
  nodes: TypeGraphNode[],
  edges: TypeGraphEdge[]
): InheritanceDisplayModel {
  const groups = findInheritanceGroups(nodes, edges).filter((group) => group.nodes.length > 1);
  if (groups.length === 0) return { nodes, groupLabelsByNodeId: new Map() };

  const groupedNodeIds = new Set<string>();
  const groupedNodes: DisplayGraphNode[] = [];
  const groupLabelsByNodeId = new Map<string, string>();

  for (const group of groups) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of group.nodes) {
      const height = estimateNodeHeight(node);
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + ESTIMATED_NODE_WIDTH);
      maxY = Math.max(maxY, node.position.y + height);
      groupedNodeIds.add(node.id);
    }

    const groupPosition = {
      x: minX - GROUP_HORIZONTAL_PADDING,
      y: minY - GROUP_TOP_PADDING
    };
    const groupWidth = maxX - minX + GROUP_HORIZONTAL_PADDING * 2;
    const groupHeight = maxY - minY + GROUP_TOP_PADDING + GROUP_BOTTOM_PADDING;
    const groupNodeId = `__group__inheritance__${group.id}`;
    const rootName = group.nodes[0]?.data.name ?? 'Inheritance cluster';
    const groupNode: GroupContainerNodeType = {
      id: groupNodeId,
      type: 'groupContainer',
      position: groupPosition,
      data: {
        label: rootName,
        description: 'Inheritance cluster',
        nodeCount: group.nodes.length,
        scope: 'inheritance'
      } satisfies GroupContainerData,
      style: {
        width: groupWidth,
        height: groupHeight
      },
      draggable: false,
      selectable: false,
      deletable: false,
      connectable: false
    };

    groupedNodes.push(groupNode);
    for (const node of group.nodes) {
      groupLabelsByNodeId.set(node.id, rootName);
      groupedNodes.push({
        ...node,
        parentId: groupNodeId,
        extent: 'parent',
        position: {
          x: node.position.x - groupPosition.x,
          y: node.position.y - groupPosition.y
        }
      });
    }
  }

  for (const node of nodes) {
    if (!groupedNodeIds.has(node.id)) {
      groupedNodes.push(node);
    }
  }

  return { nodes: groupedNodes, groupLabelsByNodeId };
}

// ---------------------------------------------------------------------------
// Inner component (needs ReactFlowProvider context)
// ---------------------------------------------------------------------------

const RuneTypeGraphInner = forwardRef<RuneTypeGraphRef, RuneTypeGraphProps>(
  function RuneTypeGraphInner({ config, callbacks, className }, ref) {
    const mergedConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);
    const { fitView, setCenter, setViewport } = useReactFlow();

    // Subscribe to store state
    const storeNodes = useEditorStore((s) => s.nodes);
    const storeEdges = useEditorStore((s) => s.edges);
    const visibility = useEditorStore((s) => s.visibility);
    const selectNode = useEditorStore((s) => s.selectNode);
    const selectedNodeId = useEditorStore((s) => s.selectedNodeId);

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

    const [nodes, setNodes, onNodesChange] = useNodesState<DisplayGraphNode>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<TypeGraphEdge>([]);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
    const [zoomLevel, setZoomLevel] = useState(1);

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
              const rawViewport = window.localStorage.getItem(VIEWPORT_STORAGE_KEY);
              if (rawViewport) {
                const viewport = JSON.parse(rawViewport) as {
                  x: number;
                  y: number;
                  zoom: number;
                };
                void setViewport(viewport, { duration: 180 });
              } else {
                fitView({ duration: 200, padding: 0.16 });
              }
            } catch {
              /* SSR/test guard */
            }
          }, 50);
        }
        return;
      }

      // Merge: preserve local positions, update data from store
      setNodes((localNodes: DisplayGraphNode[]) => {
        const localTypeNodes = localNodes.filter(isTypeGraphNode);
        const storeMap = new Map(layoutedNodes.map((n) => [n.id, n]));
        const merged: DisplayGraphNode[] = [];
        for (const n of localTypeNodes) {
          const sn = storeMap.get(n.id);
          if (!sn) continue;
          // Preserve position from local state, update data from store
          merged.push(sn.data === n.data ? n : { ...n, data: sn.data });
        }

        // Add new nodes not yet in local state
        const localIds = new Set(localTypeNodes.map((n) => n.id));
        for (const sn of layoutedNodes) {
          if (!localIds.has(sn.id)) merged.push(sn);
        }
        return merged;
      });
      setEdges(visibleEdges);
    }, [layoutedNodes, visibleEdges, setNodes, setEdges, fitView, setViewport]);

    const graphNodes = useMemo(() => nodes.filter(isTypeGraphNode), [nodes]);

    const hoveredEdge = useMemo(
      () => (hoveredEdgeId ? (edges.find((edge) => edge.id === hoveredEdgeId) ?? null) : null),
      [edges, hoveredEdgeId]
    );

    const focusNodeId = hoveredNodeId ?? selectedNodeId;
    const emphasis = useMemo(() => {
      if (hoveredEdge) {
        return {
          focusedNodeIds: new Set<string>([hoveredEdge.source, hoveredEdge.target]),
          focusedEdgeIds: new Set<string>([hoveredEdge.id])
        };
      }
      if (!focusNodeId) return null;
      const focusedNodeIds = new Set<string>([focusNodeId]);
      const focusedEdgeIds = new Set<string>();
      for (const edge of edges) {
        if (edge.source === focusNodeId || edge.target === focusNodeId) {
          focusedNodeIds.add(edge.source);
          focusedNodeIds.add(edge.target);
          focusedEdgeIds.add(edge.id);
        }
      }
      return { focusedNodeIds, focusedEdgeIds };
    }, [edges, focusNodeId, hoveredEdge]);

    const inheritanceDisplay = useMemo<InheritanceDisplayModel>(
      () =>
        mergedConfig.layout.groupByInheritance
          ? buildInheritanceDisplayNodes(graphNodes, edges)
          : { nodes: graphNodes, groupLabelsByNodeId: new Map() },
      [graphNodes, edges, mergedConfig.layout.groupByInheritance]
    );

    const baseDisplayNodes = inheritanceDisplay.nodes;

    const displayNodes = useMemo(
      () =>
        baseDisplayNodes.map((node) => {
          if (node.type === 'groupContainer') {
            return {
              ...node,
              className: cn(
                'rune-graph-group-shell',
                emphasis && 'rune-graph-group-shell--contextual'
              )
            };
          }
          const isFocus = focusNodeId === node.id;
          const isRelated = emphasis?.focusedNodeIds.has(node.id) ?? false;
          const isDimmed = emphasis ? !isRelated : false;
          return {
            ...node,
            className: cn(
              'rune-flow-node-shell',
              isFocus && 'rune-flow-node-shell--focus',
              isRelated && !isFocus && 'rune-flow-node-shell--related',
              isDimmed && 'rune-flow-node-shell--dimmed'
            )
          };
        }),
      [baseDisplayNodes, emphasis, focusNodeId]
    );

    const displayEdges = useMemo(
      () =>
        edges.map((edge): TypeGraphEdge => {
          const edgeData = edge.data as EdgeData;
          const isRelated = emphasis?.focusedEdgeIds.has(edge.id) ?? false;
          const isDimmed = emphasis ? !isRelated : false;
          const shouldShowLabel = zoomLevel >= 0.9 || isRelated;
          return {
            ...edge,
            data: {
              ...edgeData,
              showLabel: shouldShowLabel
            },
            style: {
              ...edge.style,
              opacity: isDimmed ? 0.16 : 1,
              strokeWidth: isRelated ? 2.35 : edge.style?.strokeWidth
            }
          };
        }),
      [edges, emphasis, zoomLevel]
    );

    const activeNode = useMemo(
      () => graphNodes.find((node) => node.id === (hoveredNodeId ?? selectedNodeId)) ?? null,
      [graphNodes, hoveredNodeId, selectedNodeId]
    );

    const breadcrumbItems = useMemo(() => {
      if (!activeNode) return [];
      const items: Array<{ key: string; label: string }> = [];
      const groupLabel = inheritanceDisplay.groupLabelsByNodeId.get(activeNode.id);
      if (groupLabel) {
        items.push({ key: 'group', label: groupLabel });
      }
      items.push({ key: 'node', label: activeNode.data.name as string });
      const neighborCount = edges.filter(
        (edge) => edge.source === activeNode.id || edge.target === activeNode.id
      ).length;
      if (neighborCount > 0) {
        items.push({
          key: 'neighbors',
          label: `${neighborCount} related ${neighborCount === 1 ? 'edge' : 'edges'}`
        });
      }
      return items;
    }, [activeNode, inheritanceDisplay.groupLabelsByNodeId, edges]);

    // Selection handler — writes to store
    const handleSelectionChange = useCallback(
      ({ nodes: selectedNodes }: OnSelectionChangeParams) => {
        if (selectedNodes.length > 0) {
          const node = selectedNodes[0] as Node;
          if (node.type === 'groupContainer') return;
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
      return {
        onNavigateToType: callbacks?.onNavigateToType,
        allNodeIds,
        layoutDirection: mergedConfig.layout.direction ?? 'TB'
      };
    }, [storeNodes, callbacks?.onNavigateToType, mergedConfig.layout.direction]);

    // Node double-click handler
    const handleNodeDoubleClick = useCallback(
      (_event: React.MouseEvent, node: TypeGraphNode | GroupContainerNodeType) => {
        if (isGroupContainerNode(node)) return;
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
          const node = graphNodes.find((n) => n.id === nodeId);
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
          for (const node of graphNodes) {
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
          const layouted = computeLayout(graphNodes, edges, opts);
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
      [
        graphNodes,
        edges,
        storeNodes,
        storeEdges,
        mergedConfig,
        fitView,
        setCenter,
        setNodes,
        callbacks
      ]
    );

    // Context menu state
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

    const handleNodeContextMenu = useCallback(
      (event: React.MouseEvent, node: TypeGraphNode | GroupContainerNodeType) => {
        if (isGroupContainerNode(node)) return;
        event.preventDefault();
        setContextMenu({ x: event.clientX, y: event.clientY, node });
      },
      []
    );

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
      setHoveredNodeId(null);
      setHoveredEdgeId(null);
    }, []);

    const handleNodeMouseEnter = useCallback(
      (_event: React.MouseEvent, node: TypeGraphNode | GroupContainerNodeType) => {
        if (node.type === 'groupContainer') return;
        setHoveredNodeId(node.id);
      },
      []
    );

    const handleMove = useCallback(
      (
        _event: MouseEvent | TouchEvent | null,
        viewport: { x: number; y: number; zoom: number }
      ) => {
        setZoomLevel((prev) => (Math.abs(prev - viewport.zoom) > 0.02 ? viewport.zoom : prev));
      },
      []
    );

    const densityClass =
      zoomLevel < 0.58
        ? 'rune-type-graph--zoom-low'
        : zoomLevel < 0.86
          ? 'rune-type-graph--zoom-mid'
          : 'rune-type-graph--zoom-full';

    const handleNodeMouseLeave = useCallback(() => {
      setHoveredNodeId(null);
    }, []);

    const handleEdgeMouseEnter = useCallback((_event: React.MouseEvent, edge: TypeGraphEdge) => {
      setHoveredEdgeId(edge.id);
    }, []);

    const handleEdgeMouseLeave = useCallback(() => {
      setHoveredEdgeId(null);
    }, []);

    const handleEdgeClick = useCallback(
      (_event: React.MouseEvent, edge: TypeGraphEdge) => {
        if (!edge.data) return;
        callbacks?.onEdgeSelect?.(edge.id, edge.data);
      },
      [callbacks]
    );

    const handleMoveEnd = useCallback(
      (
        _event: MouseEvent | TouchEvent | null,
        viewport: { x: number; y: number; zoom: number }
      ) => {
        try {
          window.localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(viewport));
        } catch {
          /* storage unavailable */
        }
      },
      []
    );

    return (
      <div className={cn('rune-type-graph', densityClass, className)}>
        {breadcrumbItems.length > 0 && (
          <div className="rune-graph-breadcrumbs" aria-label="Graph navigation context">
            {breadcrumbItems.map((item, index) => (
              <span key={item.key} className="rune-graph-breadcrumbs__item">
                {index > 0 && <span className="rune-graph-breadcrumbs__sep">/</span>}
                <span>{item.label}</span>
              </span>
            ))}
          </div>
        )}
        <NavigationContext.Provider value={navigationCtx}>
          <ReactFlow<DisplayGraphNode, TypeGraphEdge>
            // Display nodes include synthetic group containers; domain nodes remain in the store.
            nodes={displayNodes}
            edges={displayEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onSelectionChange={handleSelectionChange}
            onNodeDoubleClick={handleNodeDoubleClick}
            onNodeContextMenu={handleNodeContextMenu}
            onNodeMouseEnter={handleNodeMouseEnter}
            onNodeMouseLeave={handleNodeMouseLeave}
            onEdgeMouseEnter={handleEdgeMouseEnter}
            onEdgeMouseLeave={handleEdgeMouseLeave}
            onEdgeClick={handleEdgeClick}
            onPaneContextMenu={handlePaneContextMenu}
            onPaneClick={handlePaneClick}
            onMove={handleMove}
            onMoveEnd={handleMoveEnd}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            onlyRenderVisibleElements
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
