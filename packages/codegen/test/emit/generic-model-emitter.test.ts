// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for {@link GenericModelEmitter} (019 Phase 0.5.1).
 *
 * Each test uses a stub `NamespaceEmitter` + stub `LanguageProfile` so
 * the wrapper is exercised in isolation — no real codegen pipeline,
 * no Langium services. Real emitter integration lands in Phases
 * 0.5.2 (Zod), 0.5.3 (TypeScript), 0.5.4 (JSON Schema).
 */

import { describe, it, expect, vi } from 'vitest';
import type { LangiumDocument } from 'langium';
import { GenericModelEmitter } from '../../src/emit/generic-model-emitter.js';
import type { LanguageProfile } from '../../src/emit/language-profile.js';
import type {
  NamespaceEmitter,
  NamespaceEmitterConstructor,
  NamespaceEmitterOptions
} from '../../src/emit/namespace-emitter.js';
import type { NamespaceRegistry } from '../../src/emit/namespace-registry.js';
import type { NamespaceWalkResult } from '../../src/emit/namespace-walker.js';
import type { GeneratorOutput } from '../../src/types.js';

// Smallest possible walk result — emitter fixtures only need `namespace`
// to differentiate outputs across the per-namespace loop.
function fakeWalk(namespace: string): NamespaceWalkResult {
  return {
    docs: [] as unknown as LangiumDocument[],
    namespace,
    dataByName: new Map(),
    enumByName: new Map(),
    typeAliasByName: new Map(),
    rulesByName: new Map(),
    reportsByName: new Map(),
    annotationsByName: new Map(),
    libraryFuncsByName: new Map(),
    choiceByName: new Map(),
    emitOrder: [],
    cyclicTypes: new Set(),
    graph: { dependencies: new Map() } as unknown as NamespaceWalkResult['graph']
  };
}

const fakeRegistry = {} as NamespaceRegistry;

/**
 * Stub NamespaceEmitter constructor that records its options and emits
 * a deterministic output keyed by the walk's namespace. Captures the
 * effective options each construction was given so tests can assert
 * `suppressBoilerplate` was threaded.
 */
function makeStubEmitter(): {
  ctor: NamespaceEmitterConstructor;
  receivedOptions: NamespaceEmitterOptions[];
} {
  const receivedOptions: NamespaceEmitterOptions[] = [];
  class StubEmitter implements NamespaceEmitter {
    constructor(model: NamespaceWalkResult, options: NamespaceEmitterOptions) {
      receivedOptions.push(options);
      this.model = model;
      this.options = options;
    }
    private model: NamespaceWalkResult;
    private options: NamespaceEmitterOptions;
    emitEnumeration() {}
    emitTypeAlias() {}
    emitData() {}
    finalize(): GeneratorOutput {
      return {
        relativePath: `${this.model.namespace}.stub`,
        content: this.options.suppressBoilerplate ? 'lean' : 'with-helpers',
        sourceMap: [],
        diagnostics: [],
        funcs: []
      };
    }
  }
  return { ctor: StubEmitter as unknown as NamespaceEmitterConstructor, receivedOptions };
}

function makeStubProfile(overrides: Partial<LanguageProfile> = {}): LanguageProfile {
  return {
    target: 'zod',
    extension: '.zod.ts',
    makeBarrel: vi.fn((perNs) => ({
      relativePath: 'index.zod.ts',
      content: `export {${perNs.map((o) => o.relativePath).join(',')}}`,
      sourceMap: [],
      diagnostics: [],
      funcs: []
    })),
    concatenate: vi.fn((perNs) => ({
      relativePath: 'model.zod.ts',
      content: perNs.map((o) => o.content).join('\n'),
      sourceMap: [],
      diagnostics: [],
      funcs: []
    })),
    makeSharedArtifacts: vi.fn(() => [
      {
        relativePath: 'runtime.zod.ts',
        content: 'export const runeCheckOneOf = () => true;',
        sourceMap: [],
        diagnostics: [],
        funcs: []
      }
    ]),
    ...overrides
  };
}

describe('GenericModelEmitter', () => {
  it('threads suppressBoilerplate: true to every per-namespace emit', async () => {
    const { ctor, receivedOptions } = makeStubEmitter();
    const profile = makeStubProfile();
    const walks = new Map([
      ['ns.a', fakeWalk('ns.a')],
      ['ns.b', fakeWalk('ns.b')]
    ]);
    const emitter = new GenericModelEmitter(ctor, profile);

    await emitter.emit(walks, fakeRegistry, { target: 'zod', zod: { layout: 'barrel' } });

    expect(receivedOptions).toHaveLength(2);
    for (const opts of receivedOptions) {
      expect(opts.suppressBoilerplate).toBe(true);
    }
  });

  it("'barrel' layout returns per-namespace outputs + barrel + sidecars (sorted)", async () => {
    const { ctor } = makeStubEmitter();
    const profile = makeStubProfile();
    const walks = new Map([
      ['z.last', fakeWalk('z.last')],
      ['a.first', fakeWalk('a.first')]
    ]);
    const emitter = new GenericModelEmitter(ctor, profile);

    const outputs = await emitter.emit(walks, fakeRegistry, {
      target: 'zod',
      zod: { layout: 'barrel' }
    });

    const paths = outputs.map((o) => o.relativePath);
    expect(paths).toEqual(['a.first.stub', 'z.last.stub', 'index.zod.ts', 'runtime.zod.ts']);
    expect(profile.makeBarrel).toHaveBeenCalledOnce();
    expect(profile.makeSharedArtifacts).toHaveBeenCalledOnce();
    expect(profile.concatenate).not.toHaveBeenCalled();
  });

  it("'single-file' layout returns the concatenated output + sidecars; barrel not called", async () => {
    const { ctor } = makeStubEmitter();
    const profile = makeStubProfile();
    const walks = new Map([
      ['ns.a', fakeWalk('ns.a')],
      ['ns.b', fakeWalk('ns.b')]
    ]);
    const emitter = new GenericModelEmitter(ctor, profile);

    const outputs = await emitter.emit(walks, fakeRegistry, {
      target: 'zod',
      zod: { layout: 'single-file' }
    });

    const paths = outputs.map((o) => o.relativePath);
    expect(paths).toEqual(['model.zod.ts', 'runtime.zod.ts']);
    expect(profile.concatenate).toHaveBeenCalledOnce();
    expect(profile.makeBarrel).not.toHaveBeenCalled();
  });

  it("'single-file' returns a fatal diagnostic when maxNamespaces is exceeded", async () => {
    const { ctor } = makeStubEmitter();
    const profile = makeStubProfile({ singleFileLimits: { maxNamespaces: 2 } });
    const walks = new Map([
      ['ns.a', fakeWalk('ns.a')],
      ['ns.b', fakeWalk('ns.b')],
      ['ns.c', fakeWalk('ns.c')]
    ]);
    const emitter = new GenericModelEmitter(ctor, profile);

    const outputs = await emitter.emit(walks, fakeRegistry, {
      target: 'zod',
      zod: { layout: 'single-file' }
    });

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.diagnostics[0]).toMatchObject({
      severity: 'error',
      code: 'single-file-too-large'
    });
    expect(outputs[0]?.diagnostics[0]?.message).toContain('3 > 2');
    expect(profile.concatenate).not.toHaveBeenCalled();
  });

  it("'single-file' returns a fatal diagnostic when maxBytes is exceeded", async () => {
    const { ctor } = makeStubEmitter();
    // GenericModelEmitter forces suppressBoilerplate: true → stub emits
    // 'lean' (4 bytes) per namespace. 3 namespaces = 12 bytes. Cap at 10.
    const profile = makeStubProfile({ singleFileLimits: { maxBytes: 10 } });
    const walks = new Map([
      ['ns.a', fakeWalk('ns.a')],
      ['ns.b', fakeWalk('ns.b')],
      ['ns.c', fakeWalk('ns.c')]
    ]);
    const emitter = new GenericModelEmitter(ctor, profile);

    const outputs = await emitter.emit(walks, fakeRegistry, {
      target: 'zod',
      zod: { layout: 'single-file' }
    });

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.diagnostics[0]?.code).toBe('single-file-too-large');
  });

  it('defaults to barrel layout when no target option block is provided', async () => {
    const { ctor } = makeStubEmitter();
    const profile = makeStubProfile();
    const walks = new Map([['ns.a', fakeWalk('ns.a')]]);
    const emitter = new GenericModelEmitter(ctor, profile);

    await emitter.emit(walks, fakeRegistry, { target: 'zod' });

    expect(profile.makeBarrel).toHaveBeenCalled();
    expect(profile.concatenate).not.toHaveBeenCalled();
  });

  it('skips the barrel output when the profile returns undefined', async () => {
    const { ctor } = makeStubEmitter();
    const profile = makeStubProfile({ makeBarrel: vi.fn(() => undefined) });
    const walks = new Map([
      ['ns.a', fakeWalk('ns.a')],
      ['ns.b', fakeWalk('ns.b')]
    ]);
    const emitter = new GenericModelEmitter(ctor, profile);

    const outputs = await emitter.emit(walks, fakeRegistry, {
      target: 'zod',
      zod: { layout: 'barrel' }
    });

    const paths = outputs.map((o) => o.relativePath);
    expect(paths).toEqual(['ns.a.stub', 'ns.b.stub', 'runtime.zod.ts']);
    expect(paths).not.toContain('index.zod.ts');
  });
});
