// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { parsedAdapter } from '@rune-langium/core';
import { renderNamespace } from '../../src/serialize/cst-reuse-renderer.js';
import { buildDirtyIndex } from '../../src/serialize/dirty-paths.js';
import type { Patches } from 'mutative';
import type { TypeGraphNode } from '../../src/types.js';

const SRC = `namespace test
version "1.0.0"

type Uses:
  field Target (0..1)
`;

function node(data: unknown, id: string): TypeGraphNode {
  return { id, data, meta: { namespace: 'test', deferred: false } } as unknown as TypeGraphNode;
}

describe('cst-reuse — cascade + degraded', () => {
  it('regenerates a referencing attribute when its $refText was cascaded', async () => {
    const { value } = await parse(SRC);
    const data = (value as unknown as { elements: unknown[] }).elements[0];
    const d = parsedAdapter.dehydrate(data as Parameters<typeof parsedAdapter.dehydrate>[0]);
    // Cascade: rename Target -> Target2 rewrote the attribute's typeCall ref.
    (
      d as unknown as { attributes: Array<{ typeCall: { type: { $refText: string } } }> }
    ).attributes[0].typeCall.type.$refText = 'Target2';
    const patches = [
      {
        op: 'replace',
        path: ['nodes', 'test.Uses', 'data', 'attributes', 0, 'typeCall', 'type', '$refText'],
        value: 'Target2'
      }
    ] as unknown as Patches;

    const out = renderNamespace({
      nodes: [node(d, 'test.Uses')],
      originalSource: SRC,
      dirty: buildDirtyIndex(patches)
    });
    expect(out).toContain('field Target2 (0..1)');
    expect(out).not.toContain('field Target (0..1)');
  });

  it('regenerates the whole node on a whole-node replace patch (renameType shape)', async () => {
    // renameType emits a whole-node patch — path = ['nodes', nodeId] (only 2 segments)
    // rather than a granular sub-field path.  The bidirectional prefix check in
    // isSubtreeDirty must mark the ENTIRE subtree dirty so the node is fully
    // regenerated rather than sliced verbatim from the stale CST baseline.
    const { value } = await parse(SRC);
    const data = (value as unknown as { elements: unknown[] }).elements[0];
    const d = parsedAdapter.dehydrate(data as Parameters<typeof parsedAdapter.dehydrate>[0]);
    // Simulate the rename: update the node's name in the dehydrated data.
    (d as unknown as { name: string }).name = 'Renamed';
    const patches = [
      // Whole-node replace: path has only 2 segments — ['nodes', id].
      { op: 'replace', path: ['nodes', 'test.Uses'], value: {} }
    ] as unknown as Patches;

    const out = renderNamespace({
      nodes: [node(d, 'test.Uses')],
      originalSource: SRC,
      dirty: buildDirtyIndex(patches)
    });
    // The node must be regenerated using the updated dehydrated data (name = Renamed),
    // not sliced from the stale CST (which still has 'type Uses:').
    expect(out).toContain('type Renamed:');
    expect(out).not.toContain('type Uses:');
    // The attribute body must also survive in the regenerated output.
    expect(out).toContain('field Target (0..1)');
  });

  it('falls back to whole-element reuse when a dirty node still has its $cstRange (degraded render)', async () => {
    // If renderNode were to return null for an edited-but-unimplemented node that
    // still carries a $cstRange, the renderer slices rather than dropping it.
    const { value } = await parse(SRC);
    const data = (value as unknown as { elements: unknown[] }).elements[0];
    const d = parsedAdapter.dehydrate(data as Parameters<typeof parsedAdapter.dehydrate>[0]);
    // Force the "unimplemented" branch by masking $type (simulates a future node
    // kind the render-core hasn't learned yet) while keeping the original $cstRange.
    // Use a placeholder type that renderNode provably returns null for.
    (d as { $type: string }).$type = '__UnimplementedFutureNodeKind__';
    const patches = [{ op: 'replace', path: ['nodes', 'test.Uses', 'data', 'name'], value: 'x' }] as unknown as Patches;
    const out = renderNamespace({
      nodes: [node(d, 'test.Uses')],
      originalSource: SRC,
      dirty: buildDirtyIndex(patches)
    });
    expect(out).toContain('type Uses:'); // sliced from CST, not dropped
    // T7-Minor-2: the degraded fallback slices the whole element verbatim, so the
    // rename ('x') is NOT applied and the output is BYTE-EXACT the baseline — the
    // emit-core never touched it. Pin BOTH header and body so a truncated slice cannot pass.
    expect(out).toContain('field Target (0..1)'); // element body survives verbatim
    expect(out).toBe(SRC);
  });
});
