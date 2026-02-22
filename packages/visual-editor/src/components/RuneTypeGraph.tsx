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
import { validateGraph } from '../validation/edit-validator.js';
import { createEditorStore } from '../store/editor-store.js';
import type {
  RuneTypeGraphProps,
  RuneTypeGraphRef,
  TypeNodeData,
  TypeGraphNode,
  TypeGraphEdge,
  GraphFilters,
  LayoutOptions,
  TypeKind,
  ValidationError,
  MemberDisplay
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

    // Detect node-data mutations and notify the parent so bound forms
    // stay in sync (fixes stale selectedNodeData after edits).
    const prevNodeDataRef = useRef<Map<string, TypeNodeData>>(new Map());

    useEffect(() => {
      const prevMap = prevNodeDataRef.current;
      const newMap = new Map<string, TypeNodeData>();

      for (const node of nodes) {
        newMap.set(node.id, node.data);
        // Only notify after initial population (prevMap non-empty)
        if (prevMap.size > 0) {
          const prevData = prevMap.get(node.id);
          if (prevData && prevData !== node.data) {
            callbacks?.onNodeDataChanged?.(node.id, node.data);
          }
        }
      }

      prevNodeDataRef.current = newMap;
    }, [nodes, callbacks]);

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
        },

        // --- Editor form ref API (T026) ---

        getNodeData(nodeId: string): TypeNodeData | null {
          const node = nodes.find((n) => n.id === nodeId);
          return node?.data ?? null;
        },

        getNodes(): TypeGraphNode[] {
          return nodes;
        },

        renameType(nodeId: string, newName: string) {
          if (mergedConfig.readOnly) return;
          const node = nodes.find((n) => n.id === nodeId);
          if (!node) return;
          const oldName = node.data.name;
          const newId = `${node.data.namespace}::${newName}`;

          setNodes((prev) =>
            prev.map((n) => {
              if (n.id === nodeId) {
                return { ...n, id: newId, data: { ...n.data, name: newName } };
              }
              // Cascade: update member references
              const updatedMembers = n.data.members.map((m) => ({
                ...m,
                typeName: m.typeName === oldName ? newName : m.typeName,
                ...(n.data.parentName === oldName ? {} : {})
              }));
              const updatedParent = n.data.parentName === oldName ? newName : n.data.parentName;
              return {
                ...n,
                data: { ...n.data, members: updatedMembers, parentName: updatedParent }
              };
            })
          );

          setEdges((prev) =>
            prev.map((e) => ({
              ...e,
              id: e.id.replace(nodeId, newId),
              source: e.source === nodeId ? newId : e.source,
              target: e.target === nodeId ? newId : e.target,
              data: e.data
                ? {
                    ...e.data,
                    label: e.data.label === oldName ? newName : e.data.label
                  }
                : e.data
            }))
          );
        },

        updateAttribute(
          nodeId: string,
          oldName: string,
          newName: string,
          typeName: string,
          cardinality: string
        ) {
          if (mergedConfig.readOnly) return;
          setNodes((prev) =>
            prev.map((n) =>
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
                              cardinality: cardinality.includes('(')
                                ? cardinality
                                : `(${cardinality})`
                            }
                          : m
                      )
                    }
                  }
                : n
            )
          );
        },

        addAttribute(nodeId: string, attrName: string, typeName: string, cardinality: string) {
          if (mergedConfig.readOnly) return;
          const newMember: MemberDisplay = {
            name: attrName,
            typeName,
            cardinality: cardinality.includes('(') ? cardinality : `(${cardinality})`,
            isOverride: false
          };
          setNodes((prev) =>
            prev.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, members: [...n.data.members, newMember] } }
                : n
            )
          );
        },

        removeAttribute(nodeId: string, attrName: string) {
          if (mergedConfig.readOnly) return;
          setNodes((prev) =>
            prev.map((n) =>
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
          );
        },

        reorderAttribute(nodeId: string, fromIndex: number, toIndex: number) {
          if (mergedConfig.readOnly) return;
          setNodes((prev) =>
            prev.map((n) => {
              if (n.id !== nodeId) return n;
              const members = [...n.data.members];
              const [moved] = members.splice(fromIndex, 1);
              if (moved) members.splice(toIndex, 0, moved);
              return { ...n, data: { ...n.data, members } };
            })
          );
        },

        setInheritance(childId: string, parentId: string | null) {
          if (mergedConfig.readOnly) return;
          const childNode = nodes.find((n) => n.id === childId);
          if (!childNode) return;

          // Remove old extends edge
          setEdges((prev) =>
            prev.filter(
              (e) =>
                !(
                  e.source === childId &&
                  (e.data?.kind === 'extends' || e.data?.kind === 'enum-extends')
                )
            )
          );

          if (parentId) {
            const parentNode = nodes.find((n) => n.id === parentId);
            if (parentNode) {
              setNodes((prev) =>
                prev.map((n) =>
                  n.id === childId
                    ? { ...n, data: { ...n.data, parentName: parentNode.data.name } }
                    : n
                )
              );
              const edgeKind = childNode.data.kind === 'enum' ? 'enum-extends' : 'extends';
              setEdges((prev) => [
                ...prev,
                {
                  id: `${childId}-${edgeKind}-${parentId}`,
                  source: childId,
                  target: parentId,
                  type: 'inheritance',
                  data: { kind: edgeKind }
                }
              ]);
            }
          } else {
            setNodes((prev) =>
              prev.map((n) =>
                n.id === childId ? { ...n, data: { ...n.data, parentName: undefined } } : n
              )
            );
          }
        },

        updateDefinition(nodeId: string, definition: string) {
          if (mergedConfig.readOnly) return;
          setNodes((prev) =>
            prev.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, definition } } : n))
          );
        },

        updateComments(nodeId: string, comments: string) {
          if (mergedConfig.readOnly) return;
          setNodes((prev) =>
            prev.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, comments } } : n))
          );
        },

        addSynonym(nodeId: string, synonym: string) {
          if (mergedConfig.readOnly) return;
          setNodes((prev) =>
            prev.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, synonyms: [...(n.data.synonyms ?? []), synonym] } }
                : n
            )
          );
        },

        removeSynonym(nodeId: string, index: number) {
          if (mergedConfig.readOnly) return;
          setNodes((prev) =>
            prev.map((n) =>
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
          );
        },

        addAnnotation(nodeId: string, annotationName: string) {
          if (mergedConfig.readOnly) return;
          setNodes((prev) =>
            prev.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      annotations: [...(n.data.annotations ?? []), { name: annotationName }]
                    }
                  }
                : n
            )
          );
        },

        removeAnnotation(nodeId: string, index: number) {
          if (mergedConfig.readOnly) return;
          setNodes((prev) =>
            prev.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      annotations: (n.data.annotations ?? []).filter((_, i) => i !== index)
                    }
                  }
                : n
            )
          );
        },

        validate(): ValidationError[] {
          return validateGraph(nodes, edges);
        },

        updateCardinality(nodeId: string, attrName: string, cardinality: string) {
          if (mergedConfig.readOnly) return;
          setNodes((prev) =>
            prev.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      members: n.data.members.map((m) =>
                        m.name === attrName
                          ? {
                              ...m,
                              cardinality: cardinality.includes('(')
                                ? cardinality
                                : `(${cardinality})`
                            }
                          : m
                      )
                    }
                  }
                : n
            )
          );
        },

        addEnumValue(nodeId: string, valueName: string, displayName?: string) {
          if (mergedConfig.readOnly) return;
          const newMember: MemberDisplay = {
            name: valueName,
            isOverride: false,
            displayName
          };
          setNodes((prev) =>
            prev.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, members: [...n.data.members, newMember] } }
                : n
            )
          );
        },

        removeEnumValue(nodeId: string, valueName: string) {
          if (mergedConfig.readOnly) return;
          setNodes((prev) =>
            prev.map((n) =>
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
          );
        },

        updateEnumValue(nodeId: string, oldName: string, newName: string, displayName?: string) {
          if (mergedConfig.readOnly) return;
          setNodes((prev) =>
            prev.map((n) =>
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
          );
        },

        reorderEnumValue(nodeId: string, fromIndex: number, toIndex: number) {
          if (mergedConfig.readOnly) return;
          setNodes((prev) =>
            prev.map((n) => {
              if (n.id !== nodeId) return n;
              const members = [...n.data.members];
              const [moved] = members.splice(fromIndex, 1);
              if (moved) members.splice(toIndex, 0, moved);
              return { ...n, data: { ...n.data, members } };
            })
          );
        },

        setEnumParent(nodeId: string, parentId: string | null) {
          // Delegate to setInheritance — same logic applies
          this.setInheritance(nodeId, parentId);
        },

        addChoiceOption(nodeId: string, typeName: string) {
          if (mergedConfig.readOnly) return;
          const newMember: MemberDisplay = {
            name: typeName.toLowerCase(),
            typeName,
            isOverride: false
          };
          setNodes((prev) =>
            prev.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, members: [...n.data.members, newMember] } }
                : n
            )
          );
          // Add choice-option edge
          const targetNode = nodes.find((n) => n.data.name === typeName);
          if (targetNode) {
            setEdges((prev) => [
              ...prev,
              {
                id: `${nodeId}-choice-${targetNode.id}`,
                source: nodeId,
                target: targetNode.id,
                type: 'choice',
                data: { kind: 'choice-option' as const, label: typeName }
              }
            ]);
          }
        },

        removeChoiceOption(nodeId: string, typeName: string) {
          if (mergedConfig.readOnly) return;
          setNodes((prev) =>
            prev.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      members: n.data.members.filter((m) => m.typeName !== typeName)
                    }
                  }
                : n
            )
          );
          setEdges((prev) =>
            prev.filter(
              (e) =>
                !(
                  e.source === nodeId &&
                  e.data?.kind === 'choice-option' &&
                  e.data?.label === typeName
                )
            )
          );
        },

        addInputParam(nodeId: string, paramName: string, typeName: string) {
          if (mergedConfig.readOnly) return;
          setNodes((prev) =>
            prev.map((n) =>
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
          );
        },

        removeInputParam(nodeId: string, paramName: string) {
          if (mergedConfig.readOnly) return;
          setNodes((prev) =>
            prev.map((n) =>
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
          );
        },

        updateOutputType(nodeId: string, typeName: string) {
          if (mergedConfig.readOnly) return;
          setNodes((prev) =>
            prev.map((n) =>
              n.id === nodeId ? { ...n, data: { ...n.data, outputType: typeName } } : n
            )
          );
        },

        updateExpression(nodeId: string, expressionText: string) {
          if (mergedConfig.readOnly) return;
          setNodes((prev) =>
            prev.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, expressionText } } : n))
          );
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
