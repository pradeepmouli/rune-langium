/**
 * Dagre-based auto-layout engine for ReactFlow graphs.
 *
 * Computes hierarchical node positions using @dagrejs/dagre.
 */

import dagre from '@dagrejs/dagre';
import type { TypeGraphNode, TypeGraphEdge, LayoutOptions } from '../types.js';

/** Default node dimensions for layout calculation. */
const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 120;

/** Default layout options. */
const DEFAULT_LAYOUT_OPTIONS: Required<LayoutOptions> = {
  direction: 'TB',
  nodeSeparation: 50,
  rankSeparation: 100
};

/**
 * Estimate node height based on number of members.
 */
function estimateNodeHeight(node: TypeGraphNode): number {
  const memberCount = node.data.members.length;
  const headerHeight = 40;
  const memberHeight = 24;
  const padding = 16;
  return Math.max(DEFAULT_NODE_HEIGHT, headerHeight + memberCount * memberHeight + padding);
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
  return nodes.map((node) => {
    const dagreNode = g.node(node.id);
    if (!dagreNode) return node;

    return {
      ...node,
      position: {
        x: dagreNode.x - (dagreNode.width ?? DEFAULT_NODE_WIDTH) / 2,
        y: dagreNode.y - (dagreNode.height ?? DEFAULT_NODE_HEIGHT) / 2
      }
    };
  });
}
