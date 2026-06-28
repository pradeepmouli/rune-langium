// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { parsedAdapter } from '@rune-langium/core';
import { serializeNamespaceToSource } from '../../src/serialize/cst-reuse-serializer.js';
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
    (d as { attributes: Array<{ typeCall: { type: { $refText: string } } }> })
      .attributes[0].typeCall.type.$refText = 'Target2';
    const patches = [
      { op: 'replace',
        path: ['nodes', 'test.Uses', 'data', 'attributes', 0, 'typeCall', 'type', '$refText'],
        value: 'Target2' }
    ] as unknown as Patches;

    const out = serializeNamespaceToSource({
      nodes: [node(d, 'test.Uses')], originalSource: SRC, dirty: buildDirtyIndex(patches)
    });
    expect(out).toContain('field Target2 (0..1)');
    expect(out).not.toContain('field Target (0..1)');
  });

  it('falls back to whole-element reuse when a dirty node still has its $cstRange (degraded emit)', async () => {
    // If emitNode were to return null for an edited-but-unimplemented node that
    // still carries a $cstRange, the serializer slices rather than dropping it.
    const { value } = await parse(SRC);
    const data = (value as unknown as { elements: unknown[] }).elements[0];
    const d = parsedAdapter.dehydrate(data as Parameters<typeof parsedAdapter.dehydrate>[0]);
    // Force the "unimplemented" branch by masking $type (simulates a future node
    // kind the emit-core hasn't learned yet) while keeping the original $cstRange.
    (d as { $type: string }).$type = 'RosettaFunction';
    const patches = [
      { op: 'replace', path: ['nodes', 'test.Uses', 'data', 'name'], value: 'x' }
    ] as unknown as Patches;
    const out = serializeNamespaceToSource({
      nodes: [node(d, 'test.Uses')], originalSource: SRC, dirty: buildDirtyIndex(patches)
    });
    expect(out).toContain('type Uses:'); // sliced from CST, not dropped
  });
});
