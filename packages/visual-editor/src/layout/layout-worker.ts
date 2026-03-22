/**
 * Async layout computation with Web Worker support.
 *
 * Attempts to run dagre layout in a dedicated Web Worker for true
 * off-main-thread execution. Falls back to requestIdleCallback-based
 * yielding when Workers are unavailable (e.g. SSR, unsupported bundler).
 *
 * For grouped layout (groupByInheritance), delegates to the grouped
 * layout engine on the main thread with yielding.
 */

import dagre from '@dagrejs/dagre';
import type { TypeGraphNode, TypeGraphEdge, LayoutOptions } from '../types.js';
import { computeGroupedLayout } from './grouped-layout.js';
import type { WorkerRequest, WorkerResponse } from './dagre-worker-script.js';

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

// ---------------------------------------------------------------------------
// Web Worker management
// ---------------------------------------------------------------------------

let worker: Worker | null = null;
let workerFailed = false;
const pendingRequests = new Map<number, {
  resolve: (positions: Record<string, { x: number; y: number }>) => void;
  reject: (err: Error) => void;
}>();
let requestId = 0;

function getWorker(): Worker | null {
  if (workerFailed) return null;
  if (worker) return worker;

  try {
    worker = new Worker(
      new URL('./dagre-worker-script.js', import.meta.url),
      { type: 'module' }
    );
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const pending = pendingRequests.get(e.data.id);
      if (pending) {
        pendingRequests.delete(e.data.id);
        pending.resolve(e.data.positions);
      }
    };
    worker.onerror = () => {
      // Worker failed to load — fall back permanently
      workerFailed = true;
      worker = null;
      // Reject all pending requests so they can retry via fallback
      for (const [id, pending] of pendingRequests) {
        pendingRequests.delete(id);
        pending.reject(new Error('Worker failed'));
      }
    };
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

function runInWorker(
  nodes: TypeGraphNode[],
  edges: TypeGraphEdge[],
  opts: Required<LayoutOptions>
): Promise<Record<string, { x: number; y: number }>> {
  const w = getWorker();
  if (!w) return Promise.reject(new Error('No worker'));

  const id = ++requestId;
  const request: WorkerRequest = {
    id,
    nodes: nodes.map((n) => ({
      id: n.id,
      width: DEFAULT_NODE_WIDTH,
      height: estimateNodeHeight(n)
    })),
    edges: edges.map((e) => ({ source: e.source, target: e.target })),
    direction: opts.direction,
    nodeSeparation: opts.nodeSeparation,
    rankSeparation: opts.rankSeparation
  };

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    w.postMessage(request);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute layout asynchronously.
 *
 * Prefers a Web Worker for true off-main-thread execution.
 * Falls back to requestIdleCallback-based yielding on the main thread.
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

  // Delegate to grouped layout if requested (main thread with yielding)
  if (opts.groupByInheritance) {
    await yieldToMainThread();
    if (layoutSeq !== seq) return null;
    return computeGroupedLayout(nodes, edges, options);
  }

  // Try Web Worker first
  try {
    const positions = await runInWorker(nodes, edges, opts);
    if (layoutSeq !== seq) return null;
    return nodes.map((node) => {
      const pos = positions[node.id];
      return pos ? { ...node, position: pos } : node;
    });
  } catch {
    // Worker unavailable — fall through to main-thread fallback
  }

  if (layoutSeq !== seq) return null;

  // Fallback: main-thread dagre with yielding
  return computeLayoutMainThread(nodes, edges, opts, seq);
}

/** Cancel any in-flight async layout. */
export function cancelAsyncLayout(): void {
  layoutSeq++;
}

// ---------------------------------------------------------------------------
// Main-thread fallback with yielding
// ---------------------------------------------------------------------------

async function computeLayoutMainThread(
  nodes: TypeGraphNode[],
  edges: TypeGraphEdge[],
  opts: Required<LayoutOptions>,
  seq: number
): Promise<TypeGraphNode[] | null> {
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

  await yieldToMainThread();
  if (layoutSeq !== seq) return null;

  dagre.layout(g);

  await yieldToMainThread();
  if (layoutSeq !== seq) return null;

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
