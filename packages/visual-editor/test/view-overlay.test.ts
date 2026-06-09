// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, expectTypeOf } from 'vitest';
import type { ViewMetadata, ViewOverlay } from '../src/view-overlay.js';

describe('ViewOverlay', () => {
  it('keys view metadata by node id with position/errors/isReadOnly only', () => {
    const overlay: ViewOverlay = {
      'ns.Foo': { position: { x: 1, y: 2 }, errors: [], isReadOnly: false }
    };
    expect(overlay['ns.Foo'].position).toEqual({ x: 1, y: 2 });
    expect(overlay['ns.Foo'].errors).toEqual([]);
    expect(overlay['ns.Foo'].isReadOnly).toBe(false);
  });

  it('ViewMetadata has exactly position/errors/isReadOnly (no namespace, no domain fields)', () => {
    expectTypeOf<keyof ViewMetadata>().toEqualTypeOf<'position' | 'errors' | 'isReadOnly'>();
  });
});
