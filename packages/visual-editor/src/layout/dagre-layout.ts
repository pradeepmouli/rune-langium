/**
 * Dagre-based auto-layout engine for ReactFlow graphs.
 *
 * Computes hierarchical node positions using @dagrejs/dagre.
 * Includes a position cache to avoid re-running dagre when
 * re-expanding previously collapsed namespaces.
 */

import dagre from '@dagrejs/dagre';
import type { TypeGraphNode, TypeGraphEdge, LayoutOptions } from '../types.js';
import { computeGroupedLayout } from './grouped-layout.js';

/** Default node dimensions for layout calculation. */
const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 120;

/** Default layout options. */
const DEFAULT_LAYOUT_OPTIONS: Required<LayoutOptions> = {
  direction: 'TB',
  nodeSeparation: 50,
  rankSeparation: 100,
  groupByInheritance: false
};

/**
 * Estimate node height based on number of members.
 */
function estimateNodeHeight(node: TypeGraphNode): number {
  // Count members based on the AST type's field name
  const d = node.data as Record<string, unknown>;
  const members = (d.attributes ?? d.enumValues ?? d.inputs ?? d.features ?? []) as unknown[];
  const memberCount = members.length;
  const headerHeight = 40;
  const memberHeight = 24;
  const padding = 16;
  return Math.max(DEFAULT_NODE_HEIGHT, headerHeight + memberCount * memberHeight + padding);
}

// ---------------------------------------------------------------------------
// Layout position cache
// ---------------------------------------------------------------------------

/** Cached position for a previously laid-out node. */
interface CachedPosition {
  x: number;
  y: number;
}

/**
 * Global layout position cache.
 * Maps node ID → last computed position from dagre.
 * Cleared on full model reload, reused across namespace toggles.
 */
const positionCache = new Map<string, CachedPosition>();

/** Clear the entire position cache (call on model reload). */
export function clearLayoutCache(): void {
  positionCache.clear();
}

/** Get the current cache size (for diagnostics). */
export function getLayoutCacheSize(): number {
  return positionCache.size;
}

/**
 * Compute layout positions for ReactFlow nodes using dagre.
 *
 * Returns a new array of nodes with updated positions.
 * Does not mutate the input.
 */
export function computeLayout(
  nodes: TypeGraphNode[],
  edges: TypeGraphEdge[],
  options?: LayoutOptions
): TypeGraphNode[] {
  if (nodes.length === 0) return [];

  // Delegate to grouped layout if requested
  if (options?.groupByInheritance) {
    const result = computeGroupedLayout(nodes, edges, options);
    // Update cache with grouped positions
    for (const node of result) {
      positionCache.set(node.id, node.position);
    }
    return result;
  }

  const opts = { ...DEFAULT_LAYOUT_OPTIONS, ...options };

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: opts.direction,
    nodesep: opts.nodeSeparation,
    ranksep: opts.rankSeparation,
    marginx: 20,
    marginy: 20
  });

  // Add nodes with estimated dimensions
  for (const node of nodes) {
    const height = estimateNodeHeight(node);
    g.setNode(node.id, {
      width: DEFAULT_NODE_WIDTH,
      height
    });
  }

  // Add edges
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  // Compute layout
  dagre.layout(g);

  // Apply positions — dagre centers nodes, ReactFlow uses top-left
  // Also update the position cache for future reuse
  return nodes.map((node) => {
    const dagreNode = g.node(node.id);
    if (!dagreNode) return node;

    const pos = {
      x: dagreNode.x - (dagreNode.width ?? DEFAULT_NODE_WIDTH) / 2,
      y: dagreNode.y - (dagreNode.height ?? DEFAULT_NODE_HEIGHT) / 2
    };

    // Cache the computed position
    positionCache.set(node.id, pos);

    return { ...node, position: pos };
  });
}

/**
 * Compute layout with cache-first strategy.
 *
 * For incremental visibility changes (toggling a single namespace),
 * nodes with cached positions reuse them. Only nodes without cached
 * positions trigger a full dagre run.
 *
 * When the ratio of uncached nodes is small (<30%), we place cached
 * nodes at their old positions and only run dagre for the new ones,
 * offsetting them near related cached nodes.
 *
 * When the ratio is large (>=30%), we run a full dagre layout and
 * update the cache.
 */
export function computeLayoutIncremental(
  nodes: TypeGraphNode[],
  edges: TypeGraphEdge[],
  options?: LayoutOptions
): TypeGraphNode[] {
  if (nodes.length === 0) return [];

  // Check how many nodes have cached positions
  const uncached: TypeGraphNode[] = [];
  const cached: TypeGraphNode[] = [];
  for (const node of nodes) {
    if (positionCache.has(node.id)) {
      cached.push(node);
    } else {
      uncached.push(node);
    }
  }

  // If all nodes are cached, just apply cached positions (no dagre needed)
  if (uncached.length === 0) {
    return nodes.map((node) => ({
      ...node,
      position: positionCache.get(node.id)!
    }));
  }

  // If >30% are uncached or total nodes are small, run full dagre
  if (uncached.length / nodes.length > 0.3 || nodes.length < 50) {
    return computeLayout(nodes, edges, options);
  }

  // Incremental: place cached nodes at old positions, run dagre only for uncached
  const result: TypeGraphNode[] = cached.map((node) => ({
    ...node,
    position: positionCache.get(node.id)!
  }));

  // For uncached nodes, run dagre on just the uncached set with their edges
  const uncachedIds = new Set(uncached.map((n) => n.id));
  const uncachedEdges = edges.filter((e) => uncachedIds.has(e.source) || uncachedIds.has(e.target));

  // Run dagre on the uncached subset
  const layouted = computeLayout(uncached, uncachedEdges, options);

  // Offset uncached nodes to avoid overlapping with cached nodes
  // Find the bounding box of cached nodes to place new ones below
  let maxY = 0;
  for (const node of result) {
    const h = estimateNodeHeight(node);
    maxY = Math.max(maxY, node.position.y + h);
  }

  for (const node of layouted) {
    result.push({
      ...node,
      position: { x: node.position.x, y: node.position.y + maxY + 50 }
    });
    // Update cache with offset position
    positionCache.set(node.id, { x: node.position.x, y: node.position.y + maxY + 50 });
  }

  return result;
}
