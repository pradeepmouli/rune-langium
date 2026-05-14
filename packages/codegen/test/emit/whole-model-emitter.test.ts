// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for the WholeModelEmitter contract (018 Phase 0 Task 0.2).
 *
 * The contract exists alongside the existing per-namespace
 * NamespaceEmitter; `isWholeModelEmitter` discriminates between them
 * at runtime so `generator.ts:runGenerate` (Task 0.4) can route each
 * target through the appropriate pipeline.
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  isWholeModelEmitter,
  type NamespaceEmitterConstructor,
  type WholeModelEmitter,
  type WholeModelEmitterConstructor
} from '../../src/emit/namespace-emitter.js';
import type { GeneratorOptions, GeneratorOutput } from '../../src/types.js';
import type { NamespaceRegistry } from '../../src/emit/namespace-registry.js';
import type { NamespaceWalkResult } from '../../src/emit/namespace-walker.js';

class FakeWhole implements WholeModelEmitter {
  async emit(
    _walks: ReadonlyMap<string, NamespaceWalkResult>,
    _registry: NamespaceRegistry,
    _options: GeneratorOptions
  ): Promise<GeneratorOutput[]> {
    return [];
  }
}

class FakeNs {
  emitData(): void {}
  emitEnumeration(): void {}
  emitTypeAlias(): void {}
  finalize(): GeneratorOutput {
    return { relativePath: 'x', content: '', sourceMap: [], diagnostics: [], funcs: [] };
  }
}

describe('isWholeModelEmitter', () => {
  it('returns true for a WholeModelEmitter constructor', () => {
    const c: WholeModelEmitterConstructor = FakeWhole;
    expect(isWholeModelEmitter(c)).toBe(true);
  });

  it('returns false for a NamespaceEmitter constructor', () => {
    const c = FakeNs as unknown as NamespaceEmitterConstructor;
    expect(isWholeModelEmitter(c)).toBe(false);
  });

  it('returns false for a class with no methods at all', () => {
    class Empty {}
    expect(isWholeModelEmitter(Empty as unknown as NamespaceEmitterConstructor)).toBe(false);
  });
});

describe('WholeModelEmitter type', () => {
  it('has an async emit method', () => {
    expectTypeOf<WholeModelEmitter['emit']>().toBeFunction();
  });
});
