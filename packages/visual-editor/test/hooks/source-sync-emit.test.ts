// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { buildSourceForNamespaces } from '../../src/hooks/useModelSourceSync.js';
import type { Patches } from 'mutative';
import type { TypeGraphNode } from '../../src/types.js';

describe('buildSourceForNamespaces', () => {
  it('returns one entry per namespace, reusing source when clean', () => {
    const src = 'namespace test\nversion "1.0.0"\n\ntype Foo:\n  bar string (0..1)\n';
    const node = {
      id: 'test.Foo',
      meta: { namespace: 'test', deferred: false },
      data: { $type: 'Data', name: 'Foo', $cstRange: { offset: src.indexOf('type Foo'), end: src.length - 1 },
              attributes: [], conditions: [], annotations: [], references: [], synonyms: [] }
    } as unknown as TypeGraphNode;

    const out = buildSourceForNamespaces({
      nodes: [node], edges: [],
      originalSourceByNamespace: new Map([['test', src]]),
      patches: [] as unknown as Patches
    });

    expect(out.get('test')).toBe(src);
  });
});
