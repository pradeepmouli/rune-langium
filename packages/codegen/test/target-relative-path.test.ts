// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * 018 Phase 0 Task 0.5 — getTargetRelativePath must source extensions
 * from TARGET_DESCRIPTORS and emit bundled paths for whole-model targets.
 *
 * These tests pin the path layout that the studio's downloadTarget service
 * (Task 0.12) and the per-target test fixtures both depend on.
 */

import { describe, it, expect } from 'vitest';
import { getTargetRelativePath } from '../src/emit/namespace-walker.js';
import { TARGET_DESCRIPTORS, type Target } from '../src/types.js';

const NS = 'cdm.base.math';

describe('getTargetRelativePath (Task 0.5)', () => {
  it('maps namespace targets to per-namespace dotted paths', () => {
    expect(getTargetRelativePath(NS, 'zod')).toBe('cdm/base/math.zod.ts');
    expect(getTargetRelativePath(NS, 'typescript')).toBe('cdm/base/math.ts');
    expect(getTargetRelativePath(NS, 'json-schema')).toBe('cdm/base/math.schema.json');
    expect(getTargetRelativePath(NS, 'sql')).toBe('cdm/base/math.sql');
    expect(getTargetRelativePath(NS, 'markdown')).toBe('cdm/base/math.md');
  });

  it('maps whole-model targets to a single bundled "model<ext>" path', () => {
    expect(getTargetRelativePath(NS, 'excel')).toBe('model.xlsx');
    expect(getTargetRelativePath(NS, 'graphql')).toBe('model.graphql');
  });

  it('ignores the namespace argument for whole-model targets', () => {
    expect(getTargetRelativePath('a.b.c', 'excel')).toBe(getTargetRelativePath('x.y.z', 'excel'));
    expect(getTargetRelativePath('a.b.c', 'graphql')).toBe(getTargetRelativePath('x.y.z', 'graphql'));
  });

  it('handles a single-segment namespace (no dots) for namespace targets', () => {
    expect(getTargetRelativePath('root', 'zod')).toBe('root.zod.ts');
    expect(getTargetRelativePath('root', 'sql')).toBe('root.sql');
  });

  it('uses every TARGET_DESCRIPTORS extension verbatim (no drift)', () => {
    // Exhaustiveness: every target the registry knows about must produce
    // a path that ends with that target's declared extension.
    for (const target of Object.keys(TARGET_DESCRIPTORS) as Target[]) {
      const ext = TARGET_DESCRIPTORS[target].extension;
      const path = getTargetRelativePath(NS, target);
      expect(path.endsWith(ext)).toBe(true);
    }
  });
});
