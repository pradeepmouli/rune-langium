// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { parse } from '../../src/index.js';
import { parsedAdapter } from '../../src/adapters/parsed-adapter.js';
import type { Data } from '../../src/generated/ast.js';

const SRC = `namespace test
version "1.0.0"

type Foo:
  bar string (0..1)
`;

describe('$cstRange stamping', () => {
  it('stamps offset/end from $cstNode onto the dehydrated node', async () => {
    const { value } = await parse(SRC);
    const data = (value as unknown as { elements: Data[] }).elements[0];
    expect(data.$cstNode).toBeDefined();

    const dehydrated = parsedAdapter.dehydrate(data) as unknown as {
      $cstRange?: { offset: number; end: number };
    };

    expect(dehydrated.$cstRange).toEqual({
      offset: data.$cstNode!.offset,
      end: data.$cstNode!.end
    });
  });

  it('stamps $cstRange on a nested attribute too', async () => {
    const { value } = await parse(SRC);
    const data = (value as unknown as { elements: Data[] }).elements[0];
    const attr = data.attributes[0];

    const dehydrated = parsedAdapter.dehydrate(data) as unknown as {
      attributes: Array<{ $cstRange?: { offset: number; end: number } }>;
    };

    expect(dehydrated.attributes[0].$cstRange).toEqual({
      offset: attr.$cstNode!.offset,
      end: attr.$cstNode!.end
    });
  });
});
