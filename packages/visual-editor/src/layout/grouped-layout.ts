// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Grouped tree layout engine.
 *
 * Groups nodes into inheritance trees (connected components via
 * extends/enum-extends edges), lays out each tree independently
 * with dagre, then arranges the groups in a compact grid.
 *
 * Orphan nodes (no inheritance edges) form individual single-node
 * groups via union-find and are arranged alongside other groups
 * in the final grid layout.
 */

import dagre from '@dagrejs/dagre';
import type { TypeGraphNode, TypeGraphEdge, LayoutOptions, EdgeData } from '../types.js';

const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 120;

const DEFAULT_LAYOUT_OPTIONS: Required<LayoutOptions> = {
  direction: 'TB',
  nodeSeparation: 50,
  rankSeparation: 100,
  groupByInheritance: true
};

/** Edge kinds that define inheritance (tree structure). */
const INHERITANCE_EDGE_KINDS = new Set(['extends', 'enum-extends']);

function estimateNodeHeight(node: TypeGraphNode): number {
  const d = node.data as Record<string, unknown>;
  const members = (d.attributes ?? d.enumValues ?? d.inputs ?? d.features ?? []) as unknown[];
  return Math.max(DEFAULT_NODE_HEIGHT, 40 + members.length * 24 + 16);
}

/** Union-Find for grouping connected components. */
class UnionFind {
  private parent = new Map<string, string>();
  private rank = new Map<string, number>();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
    let root = x;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    // Path compression
    let curr = x;
    while (curr !== root) {
      const next = this.parent.get(curr)!;
      this.parent.set(curr, root);
      curr = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    const rankA = this.rank.get(ra)!;
    const rankB = this.rank.get(rb)!;
    if (rankA < rankB) {
      this.parent.set(ra, rb);
    } else if (rankA > rankB) {
      this.parent.set(rb, ra);
    } else {
      this.parent.set(rb, ra);
      this.rank.set(ra, rankA + 1);
    }
  }
}

export interface GroupInfo {
  /** Group identifier (root node ID from union-find). */
  id: string;
  /** Nodes in this group. */
  nodes: TypeGraphNode[];
  /** Edges within this group (inheritance + reference). */
  edges: TypeGraphEdge[];
  /** Bounding box after layout. */
  width: number;
  height: number;
}

/**
 * Find inheritance-connected groups among the given nodes.
 */
export function findInheritanceGroups(nodes: TypeGraphNode[], edges: TypeGraphEdge[]): GroupInfo[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const uf = new UnionFind();

  // Initialize all nodes in union-find
  for (const id of nodeIds) uf.find(id);

  // Union nodes connected by inheritance edges
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    const kind = (edge.data as EdgeData)?.kind;
    if (INHERITANCE_EDGE_KINDS.has(kind)) {
      uf.union(edge.source, edge.target);
    }
  }

  // Group nodes by their root
  const groupMap = new Map<string, TypeGraphNode[]>();
  for (const node of nodes) {
    const root = uf.find(node.id);
    if (!groupMap.has(root)) groupMap.set(root, []);
    groupMap.get(root)!.push(node);
  }

  // Assign edges to groups (edge belongs to the group of its source)
  const nodeToGroup = new Map<string, string>();
  for (const node of nodes) {
    nodeToGroup.set(node.id, uf.find(node.id));
  }

  const groupEdgeMap = new Map<string, TypeGraphEdge[]>();
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    const srcGroup = nodeToGroup.get(edge.source);
    const tgtGroup = nodeToGroup.get(edge.target);
    // Only include intra-group edges
    if (srcGroup && srcGroup === tgtGroup) {
      if (!groupEdgeMap.has(srcGroup)) groupEdgeMap.set(srcGroup, []);
      groupEdgeMap.get(srcGroup)!.push(edge);
    }
  }

  // Build GroupInfo array, sorted by size (largest first for better packing)
  const groups: GroupInfo[] = [];
  for (const [root, groupNodes] of groupMap) {
    groups.push({
      id: root,
      nodes: groupNodes,
      edges: groupEdgeMap.get(root) ?? [],
      width: 0,
      height: 0
    });
  }

  groups.sort((a, b) => b.nodes.length - a.nodes.length);
  return groups;
}

/**
 * Layout each group independently with dagre, then arrange
 * groups in a grid pattern.
 */
export function computeGroupedLayout(
  nodes: TypeGraphNode[],
  edges: TypeGraphEdge[],
  options?: LayoutOptions
): TypeGraphNode[] {
  if (nodes.length === 0) return [];

  const opts = { ...DEFAULT_LAYOUT_OPTIONS, ...options };
  const groups = findInheritanceGroups(nodes, edges);

  // Layout each group independently
  const allPositioned: TypeGraphNode[] = [];
  const groupBounds: Array<{ width: number; height: number }> = [];

  for (const group of groups) {
    if (group.nodes.length === 1) {
      // Single node — no layout needed, just record dimensions
      const h = estimateNodeHeight(group.nodes[0]!);
      groupBounds.push({ width: DEFAULT_NODE_WIDTH, height: h });
      allPositioned.push({
        ...group.nodes[0]!,
        position: { x: 0, y: 0 }
      });
      continue;
    }

    // Run dagre on the group
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
      rankdir: opts.direction,
      nodesep: opts.nodeSeparation,
      ranksep: opts.rankSeparation,
      marginx: 20,
      marginy: 20
    });

    for (const node of group.nodes) {
      g.setNode(node.id, {
        width: DEFAULT_NODE_WIDTH,
        height: estimateNodeHeight(node)
      });
    }

    for (const edge of group.edges) {
      g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    // Extract positions and compute bounding box
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    const positioned: TypeGraphNode[] = [];
    for (const node of group.nodes) {
      const dn = g.node(node.id);
      if (!dn) {
        positioned.push(node);
        continue;
      }
      const x = dn.x - (dn.width ?? DEFAULT_NODE_WIDTH) / 2;
      const y = dn.y - (dn.height ?? DEFAULT_NODE_HEIGHT) / 2;
      const w = dn.width ?? DEFAULT_NODE_WIDTH;
      const h = dn.height ?? DEFAULT_NODE_HEIGHT;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
      positioned.push({ ...node, position: { x, y } });
    }

    // Normalize positions to start from (0,0)
    const offsetX = minX;
    const offsetY = minY;
    for (const node of positioned) {
      node.position = {
        x: node.position.x - offsetX,
        y: node.position.y - offsetY
      };
    }

    groupBounds.push({
      width: maxX - minX,
      height: maxY - minY
    });

    allPositioned.push(...positioned);
  }

  // Arrange groups in a grid pattern
  // Use a simple left-to-right, top-to-bottom flow with wrapping
  const GROUP_GAP = 80;
  const MAX_ROW_WIDTH = Math.max(
    2000,
    // Scale target width with number of groups for very large models
    Math.sqrt(groups.length) * 600
  );

  // Track where each group starts (by group index in the sorted order)
  let currentX = 0;
  let currentY = 0;
  let rowMaxHeight = 0;
  let nodeIndex = 0;

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi]!;
    const bounds = groupBounds[gi]!;

    // Wrap to next row if this group would exceed max width
    if (currentX > 0 && currentX + bounds.width > MAX_ROW_WIDTH) {
      currentX = 0;
      currentY += rowMaxHeight + GROUP_GAP;
      rowMaxHeight = 0;
    }

    // Offset all nodes in this group
    for (let ni = 0; ni < group.nodes.length; ni++) {
      const node = allPositioned[nodeIndex + ni]!;
      node.position = {
        x: node.position.x + currentX,
        y: node.position.y + currentY
      };
    }

    currentX += bounds.width + GROUP_GAP;
    rowMaxHeight = Math.max(rowMaxHeight, bounds.height);
    nodeIndex += group.nodes.length;
  }

  return allPositioned;
}
