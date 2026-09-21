// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { InstanceRecord } from '@rune-langium/codegen/instances';
import { withInstrumentation } from './instrumentation/core.js';

export interface PayloadGraphNode {
  id: string;
  instanceId: string;
  pointer: string;
  label: string;
}
export interface PayloadGraphEdge {
  id: string;
  source: string;
  target: string;
}
export interface PayloadGraph {
  nodes: PayloadGraphNode[];
  edges: PayloadGraphEdge[];
  truncated: boolean;
}

export const payloadNodeId = withInstrumentation(
  function payloadNodeId(instanceId: string, pointer: string): string {
    return JSON.stringify([instanceId, pointer]);
  },
  { op: 'payloadNodeId' }
);

function escapePointer(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}
function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return Array.isArray(value) || (typeof value === 'object' && value !== null);
}

export const buildPayloadGraph = withInstrumentation(
  function buildPayloadGraph(record: InstanceRecord, limit = 150): PayloadGraph {
    const nodes: PayloadGraphNode[] = [];
    const edges: PayloadGraphEdge[] = [];
    const queue: Array<{ value: unknown; pointer: string; label: string; parent?: string }> = [
      { value: record.data, pointer: '', label: record.name }
    ];
    let truncated = false;
    while (queue.length) {
      const current = queue.shift()!;
      if (!isContainer(current.value)) continue;
      if (nodes.length >= limit) {
        truncated = true;
        break;
      }
      const id = payloadNodeId(record.id, current.pointer);
      nodes.push({ id, instanceId: record.id, pointer: current.pointer, label: current.label });
      if (current.parent !== undefined)
        edges.push({
          id: JSON.stringify([record.id, current.parent, current.pointer]),
          source: payloadNodeId(record.id, current.parent),
          target: id
        });
      const entries = Array.isArray(current.value)
        ? current.value.map((value, index) => [String(index), value] as const)
        : Object.entries(current.value);
      for (const [key, value] of entries) {
        if (!isContainer(value)) continue;
        queue.push({ value, pointer: `${current.pointer}/${escapePointer(key)}`, label: key, parent: current.pointer });
      }
    }
    return { nodes, edges, truncated: truncated || queue.length > 0 };
  },
  { op: 'buildPayloadGraph' }
);
