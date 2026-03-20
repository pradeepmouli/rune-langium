// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * RuneTypeGraph — Main graph component for visualizing Rune DSL type hierarchies.
 *
 * Subscribes to the zustand editor store for node/edge data and visibility.
 * Local ReactFlow state preserves drag positions; store data is synced in.
 * All domain mutations go through the store — this component is view-only.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useCallback, useMemo } from 'react';
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
import { computeLayout } from '../layout/dagre-layout.js';
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

    // Derive visible nodes/edges from store
    const { visibleNodes, visibleEdges } = useMemo(() => {
      const { expandedNamespaces, hiddenNodeIds } = visibility;
      const vNodes = storeNodes.filter(
        (n) => expandedNamespaces.has(n.data.namespace) && !hiddenNodeIds.has(n.id)
      );
      const visibleIds = new Set(vNodes.map((n) => n.id));
      const vEdges = storeEdges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
      return { visibleNodes: vNodes, visibleEdges: vEdges };
    }, [storeNodes, storeEdges, visibility]);

    // Apply layout to visible nodes
    const layoutedNodes = useMemo(() => {
      if (visibleNodes.length === 0) return [];
      return computeLayout(visibleNodes, visibleEdges, mergedConfig.layout);
    }, [visibleNodes, visibleEdges, mergedConfig.layout]);

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
