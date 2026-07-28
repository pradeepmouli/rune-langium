// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { parsedAdapter } from '@rune-langium/core';
import { buildSourceForNamespaces } from '../../src/hooks/useModelSourceSync.js';
import type { Patches } from 'mutative';
import type { TypeGraphNode, TypeGraphEdge } from '../../src/types.js';

const SRC = `namespace test
version "1.0.0"

type Base:
  x string (0..1)

type Sub:
  y string (0..1)
`;

describe('inheritance via edge', () => {
  it('regenerates Sub with extends when an extends edge is added', async () => {
    const { value } = await parse(SRC);
    const els = (value as unknown as { elements: unknown[] }).elements;
    const subData = parsedAdapter.dehydrate(els[1] as Parameters<typeof parsedAdapter.dehydrate>[0]);
    const sub = {
      id: 'test.Sub',
      data: subData,
      meta: { namespace: 'test', deferred: false }
    } as unknown as TypeGraphNode;
    const baseData = parsedAdapter.dehydrate(els[0] as Parameters<typeof parsedAdapter.dehydrate>[0]);
    const base = {
      id: 'test.Base',
      data: baseData,
      meta: { namespace: 'test', deferred: false }
    } as unknown as TypeGraphNode;

    const edges = [
      { id: 'e1', source: 'test.Sub', target: 'test.Base', data: { kind: 'extends' } }
    ] as unknown as TypeGraphEdge[];

    const out = buildSourceForNamespaces({
      nodes: [base, sub],
      edges,
      originalSourceByNamespace: new Map([['test', SRC]]),
      patches: [] as unknown as Patches
    });

    const text = out.get('test')!;
    expect(text).toContain('type Sub extends Base:');
    expect(text).toContain('y string (0..1)'); // child preserved
    expect(text).toContain('type Base:'); // Base untouched
  });
});
