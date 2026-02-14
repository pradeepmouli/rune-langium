/**
 * RuneTypeGraph — Main graph component for visualizing Rune DSL type hierarchies.
 *
 * Wraps ReactFlow with custom node/edge types, auto-layout, and panel integration.
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
import { edgeTypes } from './edges/index.js';
import { astToGraph } from '../adapters/ast-to-graph.js';
import { computeLayout } from '../layout/dagre-layout.js';
import { graphToModels } from '../adapters/graph-to-ast.js';
import type {
  SyntheticElement,
  SyntheticData,
  SyntheticChoice,
  SyntheticEnum
} from '../adapters/graph-to-ast.js';
import { createEditorStore } from '../store/editor-store.js';
import type {
  RuneTypeGraphProps,
  RuneTypeGraphRef,
  TypeNodeData,
  TypeGraphNode,
  TypeGraphEdge,
  GraphFilters,
  LayoutOptions,
  TypeKind
} from '../types.js';

// ---------------------------------------------------------------------------
// Lightweight inline serializer for synthetic models
// ---------------------------------------------------------------------------

function serializeSyntheticElement(el: SyntheticElement): string {
  if (el.$type === 'Data') {
    return serializeSyntheticData(el as SyntheticData);
  }
  if (el.$type === 'Choice') {
    return serializeSyntheticChoice(el as SyntheticChoice);
  }
  if (el.$type === 'RosettaEnumeration') {
    return serializeSyntheticEnum(el as SyntheticEnum);
  }
  return '';
}

function serializeSyntheticData(data: SyntheticData): string {
  const lines: string[] = [];
  let header = `type ${data.name}`;
  const parent = data.superType?.ref?.name ?? data.superType?.$refText;
  if (parent) header += ` extends ${parent}`;
  header += ':';
  lines.push(header);
  for (const attr of data.attributes) {
    const typeName = attr.typeCall?.type?.$refText ?? 'string';
    const card = attr.card;
    const cardStr = card.unbounded ? `(${card.inf}..*)` : `(${card.inf}..${card.sup ?? card.inf})`;
    const prefix = attr.override ? 'override ' : '';
    lines.push(`  ${prefix}${attr.name} ${typeName} ${cardStr}`);
  }
  return lines.join('\n');
}

function serializeSyntheticChoice(choice: SyntheticChoice): string {
  const lines: string[] = [];
  lines.push(`choice ${choice.name}:`);
  for (const opt of choice.attributes) {
    const typeName = opt.typeCall?.type?.$refText ?? 'unknown';
    lines.push(`  ${typeName}`);
  }
  return lines.join('\n');
}

function serializeSyntheticEnum(en: SyntheticEnum): string {
  const lines: string[] = [];
  let header = `enum ${en.name}`;
  const parent = en.parent?.ref?.name ?? en.parent?.$refText;
  if (parent) header += ` extends ${parent}`;
  header += ':';
  lines.push(header);
  for (const val of en.enumValues) {
    lines.push(`  ${val.name}`);
  }
  return lines.join('\n');
}

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

/**
 * Serialize a Set to a stable string key for use in dependency arrays.
 */
function setKey(s: Set<string>): string {
  return [...s].sort().join('\0');
}

const RuneTypeGraphInner = forwardRef<RuneTypeGraphRef, RuneTypeGraphProps>(
  function RuneTypeGraphInner({ models, config, callbacks, className, visibilityState }, ref) {
    const mergedConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);
    const { fitView, setCenter } = useReactFlow();

    // Derive full graph from AST models (unfiltered)
    const { allNodes, allEdges } = useMemo(() => {
      const modelArray = Array.isArray(models) ? models : [models];
      const { nodes: rawNodes, edges } = astToGraph(modelArray, {
        filters: mergedConfig.initialFilters
      });
      return { allNodes: rawNodes, allEdges: edges };
    }, [models, mergedConfig.initialFilters]);

    // Derive visible nodes/edges based on visibility state
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const expandedKey = visibilityState ? setKey(visibilityState.expandedNamespaces) : 'all';
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const hiddenKey = visibilityState ? setKey(visibilityState.hiddenNodeIds) : 'none';

    const { initialNodes, initialEdges } = useMemo(() => {
      let visibleNodes: TypeGraphNode[];
      let visibleEdges: TypeGraphEdge[];

      if (visibilityState) {
        const { expandedNamespaces, hiddenNodeIds } = visibilityState;
        visibleNodes = allNodes.filter(
          (n) => expandedNamespaces.has(n.data.namespace) && !hiddenNodeIds.has(n.id)
        );
        const visibleIds = new Set(visibleNodes.map((n) => n.id));
        visibleEdges = allEdges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
      } else {
        visibleNodes = allNodes;
        visibleEdges = allEdges;
      }

      const layoutOpts = mergedConfig.layout;
      const nodes =
        visibleNodes.length > 0 ? computeLayout(visibleNodes, visibleEdges, layoutOpts) : [];
      return { initialNodes: nodes, initialEdges: visibleEdges };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allNodes, allEdges, expandedKey, hiddenKey, mergedConfig.layout]);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    // Track current filters
    const filtersRef = useRef<GraphFilters>(mergedConfig.initialFilters ?? {});

    // Sync when models/config/visibility change
    useEffect(() => {
      setNodes(initialNodes);
      setEdges(initialEdges);
      // Auto fit-view when visibility changes
      if (initialNodes.length > 0) {
        setTimeout(() => fitView({ duration: 200 }), 50);
      }
    }, [initialNodes, initialEdges, setNodes, setEdges, fitView]);

    // Selection handler
    const handleSelectionChange = useCallback(
      ({ nodes: selectedNodes }: OnSelectionChangeParams) => {
        if (selectedNodes.length > 0) {
          const node = selectedNodes[0] as TypeGraphNode;
          callbacks?.onNodeSelect?.(node.id, node.data);
        } else {
          callbacks?.onSelectionClear?.();
        }
      },
      [callbacks]
    );

    // Node double-click handler
    const handleNodeDoubleClick = useCallback(
      (_event: React.MouseEvent, node: TypeGraphNode) => {
        callbacks?.onNodeDoubleClick?.(node.id, node.data);
      },
      [callbacks]
    );

    // Imperative ref API
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
          }
        },

        search(query: string): string[] {
          const results: string[] = [];
          if (!query.trim()) return results;
          const regex = new RegExp(query, 'i');
          for (const node of nodes) {
            if (regex.test(node.data.name)) {
              results.push(node.id);
            }
          }
          return results;
        },

        setFilters(filters: GraphFilters) {
          filtersRef.current = filters;
          const modelArray = Array.isArray(models) ? models : [models];
          const { nodes: rawNodes, edges: newEdges } = astToGraph(modelArray, { filters });
          const layoutOpts = mergedConfig.layout;
          const layoutedNodes = computeLayout(rawNodes, newEdges, layoutOpts);
          setNodes(layoutedNodes);
          setEdges(newEdges);
        },

        getFilters(): GraphFilters {
          return { ...filtersRef.current };
        },

        relayout(options?: LayoutOptions) {
          const opts = options ?? mergedConfig.layout;
          const layoutedNodes = computeLayout(nodes, edges, opts);
          setNodes(layoutedNodes);
        },

        async exportImage(_format: 'svg' | 'png'): Promise<Blob> {
          // TODO: Implement with html-to-image
          return new Blob([''], { type: 'text/plain' });
        },

        createType(kind: TypeKind, name: string, namespace: string): string {
          if (mergedConfig.readOnly) return '';
          const nodeId = `${namespace}::${name}`;
          const newNode: TypeGraphNode = {
            id: nodeId,
            type: kind,
            position: { x: 100, y: 100 },
            data: {
              kind,
              name,
              namespace,
              members: [],
              hasExternalRefs: false,
              errors: []
            } as TypeNodeData
          };
          setNodes((prev) => [...prev, newNode]);
          callbacks?.onTypeCreated?.(nodeId, kind, name);
          return nodeId;
        },

        deleteType(nodeId: string) {
          if (mergedConfig.readOnly) return;
          setNodes((prev) => prev.filter((n) => n.id !== nodeId));
          setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
          callbacks?.onTypeDeleted?.(nodeId);
        },

        undo() {
          // zundo temporal store integration — placeholder
        },

        redo() {
          // zundo temporal store integration — placeholder
        },

        exportRosetta(): Map<string, string> {
          const models = graphToModels(nodes, edges);
          const result = new Map<string, string>();
          for (const model of models) {
            try {
              // Dynamic import would be preferred but synchronous API needed here
              // Use the lightweight serializer from graph-to-ast synthetic models
              const lines: string[] = [];
              lines.push(`namespace ${model.name}`);
              lines.push(`version "${model.version}"`);
              for (const el of model.elements) {
                lines.push('');
                lines.push(serializeSyntheticElement(el));
              }
              lines.push('');
              result.set(model.name, lines.join('\n'));
            } catch {
              result.set(model.name, `// Error serializing ${model.name}`);
            }
          }
          callbacks?.onModelChanged?.(result);
          return result;
        }
      }),
      [nodes, edges, models, mergedConfig, fitView, setCenter, setNodes, setEdges, callbacks]
    );

    return (
      <div className={`rune-type-graph ${className ?? ''}`}>
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
