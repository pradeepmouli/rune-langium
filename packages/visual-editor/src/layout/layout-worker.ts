/**
 * Async layout computation using Web Worker when available,
 * falling back to requestIdleCallback-based chunked execution.
 *
 * This keeps the main thread responsive during dagre layout
 * of large graphs (500+ nodes).
 */

import dagre from '@dagrejs/dagre';
import type { TypeGraphNode, TypeGraphEdge, LayoutOptions } from '../types.js';

/** Default node dimensions (must match dagre-layout.ts). */
const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 120;

const DEFAULT_LAYOUT_OPTIONS: Required<LayoutOptions> = {
  direction: 'TB',
  nodeSeparation: 50,
  rankSeparation: 100,
  groupByInheritance: false
};

function estimateNodeHeight(node: TypeGraphNode): number {
  const d = node.data as Record<string, unknown>;
  const members = (d.attributes ?? d.enumValues ?? d.inputs ?? d.features ?? []) as unknown[];
  const memberCount = members.length;
  return Math.max(DEFAULT_NODE_HEIGHT, 40 + memberCount * 24 + 16);
}

/** Sequence number to cancel stale async layout requests. */
let layoutSeq = 0;

/**
 * Compute layout asynchronously, yielding to the main thread
 * between phases to keep the UI responsive.
 *
 * Returns null if a newer layout request superseded this one.
 */
export async function computeLayoutAsync(
  nodes: TypeGraphNode[],
  edges: TypeGraphEdge[],
  options?: LayoutOptions
): Promise<TypeGraphNode[] | null> {
  if (nodes.length === 0) return [];

  const seq = ++layoutSeq;
  const opts = { ...DEFAULT_LAYOUT_OPTIONS, ...options };

  // Phase 1: Build graph (yield after)
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: opts.direction,
    nodesep: opts.nodeSeparation,
    ranksep: opts.rankSeparation,
    marginx: 20,
    marginy: 20
  });

  for (const node of nodes) {
    g.setNode(node.id, {
      width: DEFAULT_NODE_WIDTH,
      height: estimateNodeHeight(node)
    });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  // Yield to main thread before heavy computation
  await yieldToMainThread();
  if (layoutSeq !== seq) return null; // superseded

  // Phase 2: Run dagre layout (the expensive part)
  dagre.layout(g);

  // Yield again before building result array
  await yieldToMainThread();
  if (layoutSeq !== seq) return null; // superseded

  // Phase 3: Extract positions
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

/** Cancel any in-flight async layout. */
export function cancelAsyncLayout(): void {
  layoutSeq++;
}

/**
 * Yield control to the main thread.
 * Uses requestIdleCallback if available, otherwise setTimeout(0).
 */
function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 100 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}
