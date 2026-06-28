// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for the graceful-skip hotfix: `renderNamespace` must not
 * throw when it encounters a brand-new node whose `$type` is unimplemented by
 * the emit-core AND that has no `$cstRange` to fall back to. Similarly,
 * `buildSourceForNamespaces` must never propagate an unexpected serializer
 * error to the `useModelSourceSync` effect — it skips the failing namespace.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { parsedAdapter } from '@rune-langium/core';
import { renderNamespace } from '../../src/serialize/cst-reuse-renderer.js';
import { buildSourceForNamespaces } from '../../src/hooks/useModelSourceSync.js';
import { buildDirtyIndex } from '../../src/serialize/dirty-paths.js';
import type { Patches } from 'mutative';
import type { TypeGraphNode, TypeGraphEdge } from '../../src/types.js';

// Source that has an existing condition so we can verify it is preserved
// byte-intact when a new unemittable condition is added.
const SRC = `namespace test
version "1.0.0"

type Foo:
  bar string (1..1)
    [metadata scheme]
  baz int (0..1)

  condition NonEmpty:
    if bar exists then baz exists
`;

function makeNode(data: unknown, id: string, ns = 'test'): TypeGraphNode {
  return { id, data, meta: { namespace: ns, deferred: false } } as unknown as TypeGraphNode;
}

describe('graceful skip — unemittable new nodes', () => {
  it('does NOT throw when a new Condition (no $cstRange) is added to a Data node', async () => {
    // Parse the source to get a dehydrated Data node whose children all have $cstRange.
    const { value } = await parse(SRC);
    const raw = (value as unknown as { elements: unknown[] }).elements[0];
    const d = parsedAdapter.dehydrate(raw as Parameters<typeof parsedAdapter.dehydrate>[0]);

    // Inject a brand-new Condition without $cstRange — simulates the inspector
    // appending a condition that the emit-core cannot yet regenerate.
    const newCond = {
      $type: 'Condition',
      name: 'NewCond',
      expression: { $type: 'RosettaBooleanLiteral', value: true }
      // deliberately NO $cstRange
    };
    (d as unknown as { conditions: unknown[] }).conditions.push(newCond);

    const patches = [
      { op: 'add', path: ['nodes', 'test.Foo', 'data', 'conditions', 1], value: newCond }
    ] as unknown as Patches;

    // Must not throw — the unemittable condition is silently skipped.
    let out = '';
    expect(() => {
      out = renderNamespace({
        nodes: [makeNode(d, 'test.Foo')],
        originalSource: SRC,
        dirty: buildDirtyIndex(patches)
      });
    }).not.toThrow();

    // Existing attributes and their decorators are preserved.
    expect(out).toContain('bar string (1..1)');
    expect(out).toContain('[metadata scheme]');
    expect(out).toContain('baz int (0..1)');

    // Existing condition is preserved byte-intact.
    expect(out).toContain('condition NonEmpty:');
    expect(out).toContain('if bar exists then baz exists');

    // The new unemittable condition must not appear in the output.
    expect(out).not.toContain('NewCond');
  });

  it('backstop: buildSourceForNamespaces does not throw and still returns good namespaces when one namespace serializer fails unexpectedly', async () => {
    // Construct a "poison" node whose $cstRange getter throws inside
    // renderNamespace (which is the first cstRange() call for this
    // node).  $type is readable (returns 'Condition') so the earlier inheritance
    // mapping in buildSourceForNamespaces doesn't throw — only the per-namespace
    // try/catch block is tested here.  This exercises Fix #2 (the backstop
    // try/catch) against an UNEXPECTED propagation that Fix #1 doesn't intercept.
    const poisonData: Record<string, unknown> = { $type: 'Condition' };
    Object.defineProperty(poisonData, '$cstRange', {
      get() { throw new Error('deliberate serializer error for backstop test'); },
      enumerable: true
    });
    const poisonNode = makeNode(poisonData, 'bad.Poison', 'bad');

    // A normal parseable node in the 'test' namespace.
    const { value } = await parse(SRC);
    const goodRaw = (value as unknown as { elements: unknown[] }).elements[0];
    const goodData = parsedAdapter.dehydrate(
      goodRaw as Parameters<typeof parsedAdapter.dehydrate>[0]
    );
    const goodNode = makeNode(goodData, 'test.Foo', 'test');

    let result: Map<string, string> = new Map();
    expect(() => {
      result = buildSourceForNamespaces({
        nodes: [goodNode, poisonNode],
        edges: [] as unknown as TypeGraphEdge[],
        originalSourceByNamespace: new Map([
          ['test', SRC],
          ['bad', 'namespace bad\nversion "0.0.0"\n']
        ]),
        patches: [] as unknown as Patches
      });
    }).not.toThrow();

    // The good namespace must still be serialized.
    expect(result.has('test')).toBe(true);
    expect(result.get('test')).toContain('type Foo:');

    // The bad namespace was skipped (try/catch) — must not be present in the output.
    expect(result.has('bad')).toBe(false);
  });
});
