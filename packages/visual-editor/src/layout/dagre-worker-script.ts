// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Web Worker entry point for dagre layout computation.
 *
 * Receives a serialised graph (nodes + edges + options) via postMessage,
 * runs dagre.layout(), and posts back the computed positions.
 *
 * This file is imported via `new Worker(new URL(...), { type: 'module' })`
 * by bundlers that support it (Vite, webpack 5, etc.).
 */

import dagre from '@dagrejs/dagre';

const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 120;

export interface WorkerRequest {
  id: number;
  nodes: Array<{ id: string; width: number; height: number }>;
  edges: Array<{ source: string; target: string }>;
  direction: string;
  nodeSeparation: number;
  rankSeparation: number;
}

export interface WorkerResponse {
  id: number;
  positions: Record<string, { x: number; y: number }>;
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, nodes, edges, direction, nodeSeparation, rankSeparation } = e.data;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: nodeSeparation,
    ranksep: rankSeparation,
    marginx: 20,
    marginy: 20
  });

  for (const node of nodes) {
    g.setNode(node.id, { width: node.width, height: node.height });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of nodes) {
    const dagreNode = g.node(node.id);
    if (dagreNode) {
      positions[node.id] = {
        x: dagreNode.x - (dagreNode.width ?? DEFAULT_NODE_WIDTH) / 2,
        y: dagreNode.y - (dagreNode.height ?? DEFAULT_NODE_HEIGHT) / 2
      };
    }
  }

  const response: WorkerResponse = { id, positions };
  self.postMessage(response);
};
