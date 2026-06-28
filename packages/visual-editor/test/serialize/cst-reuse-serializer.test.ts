// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { parsedAdapter } from '@rune-langium/core/adapters/parsed-adapter';
import { serializeNamespaceToSource } from '../../src/serialize/cst-reuse-serializer.js';
import { buildDirtyIndex } from '../../src/serialize/dirty-paths.js';
import type { Patches } from 'mutative';
import type { TypeGraphNode } from '../../src/types.js';

const SRC = `namespace test
version "1.0.0"

type Foo:
  bar string (1..1)
    [metadata scheme]
  baz int (0..1)

  condition NonEmpty:
    if bar exists then baz exists
`;

// Build a single graph node from the parsed Data element.
async function fooNode(): Promise<{ node: TypeGraphNode; nodeId: string }> {
  const { value } = await parse(SRC);
  const data = (value as unknown as { elements: unknown[] }).elements[0];
  const dehydrated = parsedAdapter.dehydrate(
    data as Parameters<typeof parsedAdapter.dehydrate>[0]
  );
  const nodeId = 'test.Foo';
  const node = {
    id: nodeId,
    data: dehydrated,
    meta: { namespace: 'test', deferred: false }
  } as unknown as TypeGraphNode;
  return { node, nodeId };
}

describe('cst-reuse serializer', () => {
  it('reuses the whole element verbatim when nothing is dirty', async () => {
    const { node } = await fooNode();
    const out = serializeNamespaceToSource({
      nodes: [node], originalSource: SRC, dirty: buildDirtyIndex([] as unknown as Patches)
    });
    expect(out).toBe(SRC); // byte-for-byte
  });

  it('regenerates only the edited attribute and PRESERVES the condition + metadata', async () => {
    const { node, nodeId } = await fooNode();
    // Simulate the inspector renaming attribute[0] bar -> barRenamed.
    (node.data as { attributes: Array<{ name: string }> }).attributes[0].name = 'barRenamed';
    const patches = [
      { op: 'replace', path: ['nodes', nodeId, 'data', 'attributes', 0, 'name'], value: 'barRenamed' }
    ] as unknown as Patches;

    const out = serializeNamespaceToSource({
      nodes: [node], originalSource: SRC, dirty: buildDirtyIndex(patches)
    });

    expect(out).toContain('barRenamed string (1..1)');
    // The lossy bug would have dropped these. They must survive:
    expect(out).toContain('[metadata scheme]');               // attr annotation preserved
    expect(out).toContain('condition NonEmpty:');             // condition preserved
    expect(out).toContain('if bar exists then baz exists');   // condition BODY, not `True`
    expect(out).toContain('baz int (0..1)');                  // sibling attribute untouched
  });
});
