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
    const out = renderNamespace({
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

    const out = renderNamespace({
      nodes: [node], originalSource: SRC, dirty: buildDirtyIndex(patches)
    });

    expect(out).toContain('barRenamed string (1..1)');
    // The lossy bug would have dropped these. They must survive:
    expect(out).toContain('[metadata scheme]');               // attr annotation preserved
    expect(out).toContain('condition NonEmpty:');             // condition preserved
    expect(out).toContain('if bar exists then baz exists');   // condition BODY, not `True`
    expect(out).toContain('baz int (0..1)');                  // sibling attribute untouched
  });

  it('preserves BYTE-EXACT indentation of a reused multi-line condition (no +2 drift)', async () => {
    // Finding B: a reused multi-line child (the condition body) is a verbatim CST
    // slice whose continuation lines carry ABSOLUTE source indentation. The
    // per-construct emitter wraps it in `indentBlock`, which used to add the
    // parent level (+2) on TOP of that absolute indent, over-indenting the body
    // by 2 spaces on every edit. `toContain` (whitespace-blind) masked it.
    const { node, nodeId } = await fooNode();
    (node.data as { attributes: Array<{ name: string }> }).attributes[0].name = 'barRenamed';
    const patches = [
      { op: 'replace', path: ['nodes', nodeId, 'data', 'attributes', 0, 'name'], value: 'barRenamed' }
    ] as unknown as Patches;

    const out = renderNamespace({
      nodes: [node], originalSource: SRC, dirty: buildDirtyIndex(patches)
    });

    // The ONLY change vs the baseline is the renamed attribute — everything else
    // (the metadata block, the sibling attribute, and the multi-line condition
    // with its exact 2-/4-space indentation) must be byte-for-byte identical.
    const expected = SRC.replace('bar string (1..1)', 'barRenamed string (1..1)');
    expect(out).toBe(expected);

    // Explicitly pin the condition block's continuation indent at 4 spaces (not 6).
    expect(out).toContain('  condition NonEmpty:\n    if bar exists then baz exists');
    expect(out).not.toContain('      if bar exists then baz exists'); // the +2-drift form
  });
});
