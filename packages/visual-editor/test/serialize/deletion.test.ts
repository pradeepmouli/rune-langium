// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { parsedAdapter } from '@rune-langium/core';
import { renderNamespace } from '../../src/serialize/cst-reuse-renderer.js';
import { buildSourceForNamespaces } from '../../src/hooks/useModelSourceSync.js';
import { buildDirtyIndex } from '../../src/serialize/dirty-paths.js';
import type { Patches } from 'mutative';
import type { TypeGraphNode, TypeGraphEdge } from '../../src/types.js';

// ---------------------------------------------------------------------------
// (A) Deletion: removed element ranges are excluded from the assembled output
// ---------------------------------------------------------------------------

const SRC = `namespace test
version "1.0.0"

type Foo:
  bar string (1..1)

type Bar:
  baz int (0..1)
`;

// Build two nodes from a parse so they carry $cstRange.
async function makeNodes(): Promise<TypeGraphNode[]> {
  const { value } = await parse(SRC);
  const els = (value as unknown as { elements: unknown[] }).elements;
  return els.map((e) => ({
    id: `test.${(e as { name: string }).name}`,
    data: parsedAdapter.dehydrate(e as Parameters<typeof parsedAdapter.dehydrate>[0]),
    meta: { namespace: 'test', deferred: false }
  })) as unknown as TypeGraphNode[];
}

describe('deletion drops the removed element range', () => {
  it('removes type Bar from source when its remove range is supplied', async () => {
    const all = await makeNodes();
    const bar = all.find((n) => (n.data as { name: string }).name === 'Bar')!;
    const barRange = (bar.data as { $cstRange: { offset: number; end: number } }).$cstRange;
    const remaining = all.filter((n) => (n.data as { name: string }).name !== 'Bar');
    const out = renderNamespace({
      nodes: remaining,
      originalSource: SRC,
      dirty: buildDirtyIndex([] as unknown as Patches),
      removedRanges: [barRange]
    });
    expect(out).toContain('type Foo:');
    expect(out).toContain('bar string (1..1)');
    expect(out).not.toContain('type Bar:');
    expect(out).not.toContain('baz int (0..1)');
  });

  it('rename-safe: renaming Bar to Baz does not drop the element range from the output', async () => {
    // Simulate a renameType: the inverse patch carries Bar's $cstRange, but
    // the "new" node (now named Baz) still occupies the same range.
    // The occupied-range guard must recognize the range as still in use and
    // NOT exclude it from the output.
    const all = await makeNodes();
    const bar = all.find((n) => (n.data as { name: string }).name === 'Bar')!;
    const barRange = (bar.data as { $cstRange: { offset: number; end: number } }).$cstRange;

    // The renamed node keeps the same $cstRange but gets a new id/name.
    const renamed = {
      ...bar,
      id: 'test.Baz',
      data: { ...(bar.data as Record<string, unknown>), name: 'Baz' }
    } as unknown as TypeGraphNode;
    const foo = all.find((n) => (n.data as { name: string }).name === 'Foo')!;
    const currentNodes = [foo, renamed];

    // Inverse patch for the old 'test.Bar' node — same $cstRange as the renamed node.
    const inversePatches = [
      { op: 'remove', path: ['nodes', 'test.Bar'], value: bar }
    ] as unknown as Patches;

    const out = buildSourceForNamespaces({
      nodes: currentNodes,
      edges: [],
      originalSourceByNamespace: new Map([['test', SRC]]),
      patches: [] as unknown as Patches,
      inversePatches
    });
    const text = out.get('test')!;
    // Foo must be present (not dropped by the deletion guard).
    expect(text).toContain('type Foo:');
    expect(text).toContain('bar string (1..1)');
    // The renamed node's range must NOT be excluded — its content (from the
    // source slice at barRange) must still appear.  With no dirty patch the
    // renderer reuses the slice verbatim, which still says "Bar" until a
    // further regeneration pass; what matters here is that the range was NOT
    // dropped (rename-safety), so the line-count is preserved.
    expect(text).toContain('baz int (0..1)');
    // barRange itself is not in removalsByNs — verify by checking offset range.
    expect(text.length).toBeGreaterThanOrEqual(barRange.end);
  });
});

// ---------------------------------------------------------------------------
// (B1) Inheritance edge change A→B: node is force-regenerated with new parent
// ---------------------------------------------------------------------------

const SRC_INHERIT = `namespace test
version "1.0.0"

type Base:
  x string (0..1)

type Alt:
  z string (0..1)

type Sub extends Base:
  y string (0..1)
`;

describe('inheritance edge change A→B', () => {
  it('regenerates Sub with the new parent when the extends edge changes from Base to Alt', async () => {
    const { value } = await parse(SRC_INHERIT);
    const els = (value as unknown as { elements: unknown[] }).elements;
    const dehydrate = (e: unknown) =>
      parsedAdapter.dehydrate(e as Parameters<typeof parsedAdapter.dehydrate>[0]);

    const base = { id: 'test.Base', data: dehydrate(els[0]), meta: { namespace: 'test', deferred: false } } as unknown as TypeGraphNode;
    const alt  = { id: 'test.Alt',  data: dehydrate(els[1]), meta: { namespace: 'test', deferred: false } } as unknown as TypeGraphNode;
    const sub  = { id: 'test.Sub',  data: dehydrate(els[2]), meta: { namespace: 'test', deferred: false } } as unknown as TypeGraphNode;

    // Edge now points to Alt instead of Base.
    const edges = [
      { id: 'e1', source: 'test.Sub', target: 'test.Alt', data: { kind: 'extends' } }
    ] as unknown as TypeGraphEdge[];

    const out = buildSourceForNamespaces({
      nodes: [base, alt, sub],
      edges,
      originalSourceByNamespace: new Map([['test', SRC_INHERIT]]),
      patches: [] as unknown as Patches
    });

    const text = out.get('test')!;
    expect(text).toContain('type Sub extends Alt:');
    expect(text).not.toContain('type Sub extends Base:');
    expect(text).toContain('y string (0..1)');
  });
});

// ---------------------------------------------------------------------------
// (B2) Cross-namespace extends: output must use the QUALIFIED ref `<ns>.<Name>`
// ---------------------------------------------------------------------------

const SRC_NS_A = `namespace nsA
version "1.0.0"

type Parent:
  x string (0..1)
`;

const SRC_NS_B = `namespace nsB
version "1.0.0"

type Child:
  y string (0..1)
`;

describe('cross-namespace inheritance edge', () => {
  it('qualifies the extends ref when the parent is in a different namespace', async () => {
    const { value: valA } = await parse(SRC_NS_A);
    const { value: valB } = await parse(SRC_NS_B);
    const elsA = (valA as unknown as { elements: unknown[] }).elements;
    const elsB = (valB as unknown as { elements: unknown[] }).elements;
    const dehydrate = (e: unknown) =>
      parsedAdapter.dehydrate(e as Parameters<typeof parsedAdapter.dehydrate>[0]);

    const parent = { id: 'nsA.Parent', data: dehydrate(elsA[0]), meta: { namespace: 'nsA', deferred: false } } as unknown as TypeGraphNode;
    const child  = { id: 'nsB.Child',  data: dehydrate(elsB[0]), meta: { namespace: 'nsB', deferred: false } } as unknown as TypeGraphNode;

    const edges = [
      { id: 'e1', source: 'nsB.Child', target: 'nsA.Parent', data: { kind: 'extends' } }
    ] as unknown as TypeGraphEdge[];

    const out = buildSourceForNamespaces({
      nodes: [parent, child],
      edges,
      originalSourceByNamespace: new Map([['nsA', SRC_NS_A], ['nsB', SRC_NS_B]]),
      patches: [] as unknown as Patches
    });

    const textB = out.get('nsB')!;
    expect(textB).toContain('extends nsA.Parent');
    // Must NOT use just the bare name.
    expect(textB).not.toMatch(/extends Parent(?!\s*\.)/);
  });
});
