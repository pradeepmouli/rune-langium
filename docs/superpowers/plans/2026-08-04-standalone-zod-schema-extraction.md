# Standalone Zod Schema Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `emitStandaloneZodSchema(documents, targetId)` to `packages/codegen`, producing one target type's real Zod schema as a single self-contained, import-free script suitable for evaluation via `new Function()`.

**Architecture:** Compute the transitive closure of every type a target depends on (reusing `resolveTypeCallTarget` for attribute/option/declaration-RHS references and direct AST access for `superType`), assemble a synthetic single-namespace `NamespaceWalkResult` over those real AST nodes, and run the existing, unmodified `emitNamespace()` (zod target) against it.

**Tech Stack:** TypeScript, Langium, `packages/codegen`'s existing emitter/graph infrastructure (`type-ref-resolver.ts`, `cycle-detector.ts`, `topo-sort.ts`, `namespace-walker.ts`, `preview-schema.ts`'s `buildNamespaceIndexes`).

## Global Constraints

- **Prerequisite: PR #469 (`unified-type-reference-resolution`) must be merged, or this branch rebased onto its tip, before Task 1 begins.** This plan's entire design depends on `resolveTypeCallTarget()`/`TypeIndexLookup`/`TypeIndexEntry`/`TypeResolutionVisitor` from `packages/codegen/src/emit/type-ref-resolver.ts`, which does not exist on `master` as of this plan's writing (PR #469 is open, unmerged). Before dispatching Task 1, confirm `packages/codegen/src/emit/type-ref-resolver.ts` exists on whatever base this plan's worktree is built from — if not, stop and rebase first.
- No changes to `packages/codegen/src/emit/zod-emitter.ts` itself — the whole point of the synthetic-namespace approach is reusing its existing, unmodified `emitNamespace()` entry point.
- The returned script must contain zero `import` statements for any target reachable from the closure — this is the entire reason the synthetic-namespace approach exists, not an incidental property to verify once.
- Bare-name keying throughout (no namespace-qualified graph node IDs) — this inherits the SAME global-name-uniqueness assumption `base-namespace-emitter.ts`'s existing `buildCrossNsImportLines` already relies on for real per-namespace cross-namespace imports (`imports: Map<string, Set<string>>`, keyed by symbol name). This plan does not introduce a new assumption or attempt to fix that one.
- Runtime helper bundling (`RUNTIME_HELPER_JS_SOURCE`) is explicitly the caller's responsibility, not this function's — it is already separately exported from `@rune-langium/codegen/export`.

---

### Task 1: Global type index + target lookup

**Files:**
- Modify: `packages/codegen/src/emit/type-ref-resolver.ts` — export the existing private `nodeSourceUri` helper (currently unexported, ~line 60-63) instead of duplicating its 2-line body in the new module.
- Create: `packages/codegen/src/emit/standalone-schema.ts`
- Test: `packages/codegen/test/emit/standalone-schema.test.ts`

**Interfaces:**
- Consumes: `resolveTypeCallTarget`, `TypeIndexLookup`, `TypeIndexEntry<N>` (`./type-ref-resolver.js`); `buildNamespaceIndexes`, `NamespaceIndex` (`../preview-schema.js`, already exported there — `dataByName`/`enumByName`/`choiceByName`/`typeAliasByName` are `Map<string, {node: N; sourceUri: string}>`, structurally identical to `TypeIndexEntry<N>`, no adapter needed).
- Produces (for Task 2/3): `export interface ResolvedTarget { kind: 'data' | 'choice' | 'enum' | 'typeAlias'; node: Data | Choice | RosettaEnumeration | RosettaTypeAlias; sourceUri: string }`; `export function buildGlobalTypeIndex(namespaceIndexes: NamespaceIndex[]): TypeIndexLookup`; `export function findTargetNode(namespaceIndexes: NamespaceIndex[], targetId: string): ResolvedTarget | undefined`.

- [ ] **Step 1: Export `nodeSourceUri` from `type-ref-resolver.ts`**

Read the current private function first (`packages/codegen/src/emit/type-ref-resolver.ts`, ~line 60):

```ts
function nodeSourceUri(node: { $container?: unknown } | undefined, fallback: string): string {
  const withDoc = node as { $container?: { $document?: { uri?: { toString(): string } } } } | undefined;
  return withDoc?.$container?.$document?.uri?.toString() ?? fallback;
}
```

Change `function nodeSourceUri` to `export function nodeSourceUri`. No other change — this function's internal callers are unaffected by exporting it.

- [ ] **Step 2: Run the existing type-ref-resolver test suite to confirm the export is a no-op change**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/emit/type-ref-resolver.test.ts`
Expected: PASS, unchanged (exporting a function doesn't change its behavior)

- [ ] **Step 3: Write the failing tests for `buildGlobalTypeIndex`/`findTargetNode`**

```ts
// packages/codegen/test/emit/standalone-schema.test.ts
import { describe, it, expect } from 'vitest';
import { parseHelper } from 'langium/test';
import { createRuneServices } from '@rune-langium/core';
import { NodeFileSystem } from 'langium/node';
import { buildNamespaceIndexes } from '../../src/preview-schema.js';
import { buildGlobalTypeIndex, findTargetNode } from '../../src/emit/standalone-schema.js';

async function parseModels(sources: readonly string[]) {
  const services = createRuneServices(NodeFileSystem).Rune;
  const parse = parseHelper(services);
  const docs = [];
  for (const source of sources) {
    const doc = await parse(source, { validation: false });
    docs.push(doc);
  }
  await services.shared.workspace.DocumentBuilder.build(docs, { validation: false });
  return docs;
}

describe('buildGlobalTypeIndex', () => {
  it('merges per-namespace indexes into one flat lookup, findable by bare name', async () => {
    const docs = await parseModels([
      `namespace test.alpha
       type Foo:
         x string (0..1)`,
      `namespace test.beta
       type Bar:
         y string (0..1)`
    ]);
    const namespaceIndexes = buildNamespaceIndexes(docs);
    const globalIndex = buildGlobalTypeIndex(namespaceIndexes);
    expect(globalIndex.dataByName.has('Foo')).toBe(true);
    expect(globalIndex.dataByName.has('Bar')).toBe(true);
  });
});

describe('findTargetNode', () => {
  it('resolves a namespace-qualified targetId to its real AST node', async () => {
    const docs = await parseModels([
      `namespace test.alpha
       type Foo:
         x string (0..1)`
    ]);
    const namespaceIndexes = buildNamespaceIndexes(docs);
    const target = findTargetNode(namespaceIndexes, 'test.alpha.Foo');
    expect(target?.kind).toBe('data');
    expect(target?.node.name).toBe('Foo');
  });

  it('returns undefined for an unknown targetId', async () => {
    const docs = await parseModels([
      `namespace test.alpha
       type Foo:
         x string (0..1)`
    ]);
    const namespaceIndexes = buildNamespaceIndexes(docs);
    expect(findTargetNode(namespaceIndexes, 'test.alpha.DoesNotExist')).toBeUndefined();
  });
});
```

(Read `packages/codegen/test/preview-schema.test.ts` first to confirm the exact `parseModels`/`parseModel` helper convention already established in this test suite — reuse it verbatim rather than reinventing a parse helper; adjust the snippet above to match if the real helper's signature differs.)

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/emit/standalone-schema.test.ts`
Expected: FAIL — `standalone-schema.ts` doesn't exist yet

- [ ] **Step 5: Implement `standalone-schema.ts`'s Task 1 exports**

```ts
// packages/codegen/src/emit/standalone-schema.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { isData, isChoice, isRosettaEnumeration } from '@rune-langium/core';
import type { Data, Choice, RosettaEnumeration, RosettaTypeAlias } from '@rune-langium/core';
import type { NamespaceIndex } from '../preview-schema.js';
import type { TypeIndexLookup, TypeIndexEntry } from './type-ref-resolver.js';

export interface ResolvedTarget {
  kind: 'data' | 'choice' | 'enum' | 'typeAlias';
  node: Data | Choice | RosettaEnumeration | RosettaTypeAlias;
  sourceUri: string;
}

function mergeIndexEntries<N>(
  target: Map<string, TypeIndexEntry<N>>,
  namespaceIndexes: readonly NamespaceIndex[],
  pick: (ns: NamespaceIndex) => ReadonlyMap<string, TypeIndexEntry<N>>
): void {
  for (const ns of namespaceIndexes) {
    for (const [name, entry] of pick(ns)) {
      if (!target.has(name)) target.set(name, entry);
    }
  }
}

/**
 * Merge every namespace's own index into one flat, bare-name-keyed
 * TypeIndexLookup spanning the whole loaded document set — Langium already
 * resolves cross-namespace `.ref`s at link time, so this index only backs
 * resolveTypeCallTarget's refText-fallback path, not primary resolution.
 */
export function buildGlobalTypeIndex(namespaceIndexes: readonly NamespaceIndex[]): TypeIndexLookup {
  const dataByName = new Map<string, TypeIndexEntry<Data>>();
  const enumByName = new Map<string, TypeIndexEntry<RosettaEnumeration>>();
  const choiceByName = new Map<string, TypeIndexEntry<Choice>>();
  const typeAliasByName = new Map<string, TypeIndexEntry<RosettaTypeAlias>>();
  mergeIndexEntries(dataByName, namespaceIndexes, (ns) => ns.dataByName);
  mergeIndexEntries(enumByName, namespaceIndexes, (ns) => ns.enumByName);
  mergeIndexEntries(choiceByName, namespaceIndexes, (ns) => ns.choiceByName);
  mergeIndexEntries(typeAliasByName, namespaceIndexes, (ns) => ns.typeAliasByName);
  return { dataByName, enumByName, choiceByName, typeAliasByName };
}

/**
 * Resolve a `${namespace}.${name}` targetId to its real AST node — mirrors
 * preview-schema.ts's own generatePreviewSchemas targetId matching (compute
 * each candidate's own qualified id and compare, rather than parsing the
 * targetId string apart, since namespaces are themselves dot-separated).
 */
export function findTargetNode(namespaceIndexes: readonly NamespaceIndex[], targetId: string): ResolvedTarget | undefined {
  for (const ns of namespaceIndexes) {
    for (const [name, entry] of ns.dataByName) {
      if (`${ns.namespace}.${name}` === targetId) return { kind: 'data', node: entry.node, sourceUri: entry.sourceUri };
    }
    for (const [name, entry] of ns.choiceByName) {
      if (`${ns.namespace}.${name}` === targetId) return { kind: 'choice', node: entry.node, sourceUri: entry.sourceUri };
    }
    for (const [name, entry] of ns.enumByName) {
      if (`${ns.namespace}.${name}` === targetId) return { kind: 'enum', node: entry.node, sourceUri: entry.sourceUri };
    }
    for (const [name, entry] of ns.typeAliasByName) {
      if (`${ns.namespace}.${name}` === targetId) return { kind: 'typeAlias', node: entry.node, sourceUri: entry.sourceUri };
    }
  }
  return undefined;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/emit/standalone-schema.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/codegen/src/emit/type-ref-resolver.ts packages/codegen/src/emit/standalone-schema.ts packages/codegen/test/emit/standalone-schema.test.ts
git commit -m "feat(codegen): add global type index + target lookup for standalone schema extraction"
```

---

### Task 2: Closure computation

**Files:**
- Modify: `packages/codegen/src/emit/standalone-schema.ts`
- Test: `packages/codegen/test/emit/standalone-schema.test.ts`

**Interfaces:**
- Consumes: `resolveTypeCallTarget`, `nodeSourceUri` (`./type-ref-resolver.js`, the latter now exported by Task 1); `ResolvedTarget` (Task 1, this file).
- Produces (for Task 3): `export interface StandaloneClosure { dataByName: Map<string, Data>; choiceByName: Map<string, Choice>; enumByName: Map<string, RosettaEnumeration>; typeAliasByName: Map<string, RosettaTypeAlias>; docs: LangiumDocument[] }`; `export function computeStandaloneClosure(target: ResolvedTarget, globalIndex: TypeIndexLookup): StandaloneClosure`.

**Key design point:** `resolveTypeCallTarget` internally chases `RosettaTypeAlias` chains and only ever calls back with the terminal `onPrimitive`/`onEnum`/`onData`/`onChoice`/`onUnresolved` — an intermediate alias in a chain is NEVER passed to any callback. This means the closure walker never needs to enqueue an alias node reached via an attribute/option reference; only the very first seed (`target.node`, if the target itself IS a `RosettaTypeAlias`) can ever put an alias into `typeAliasByName`. Do not try to special-case "was this reached through an alias" — there is nothing to special-case; the resolver already collapsed that distinction.

- [ ] **Step 1: Write the failing tests**

```ts
describe('computeStandaloneClosure', () => {
  it('returns a closure of just the target for a scalar-only Data type', async () => {
    const docs = await parseModels([`namespace test
      type Foo:
        x string (0..1)`]);
    const namespaceIndexes = buildNamespaceIndexes(docs);
    const target = findTargetNode(namespaceIndexes, 'test.Foo')!;
    const globalIndex = buildGlobalTypeIndex(namespaceIndexes);
    const closure = computeStandaloneClosure(target, globalIndex);
    expect(Array.from(closure.dataByName.keys())).toEqual(['Foo']);
    expect(closure.choiceByName.size).toBe(0);
    expect(closure.enumByName.size).toBe(0);
    expect(closure.typeAliasByName.size).toBe(0);
  });

  it('walks a 2-hop alias chain to a Data type, without adding the intermediate aliases', async () => {
    const docs = await parseModels([`namespace test
      type Target:
        y string (0..1)
      typeAlias Inner: Target
      typeAlias Outer: Inner
      type Foo:
        bar Outer (0..1)`]);
    const namespaceIndexes = buildNamespaceIndexes(docs);
    const target = findTargetNode(namespaceIndexes, 'test.Foo')!;
    const globalIndex = buildGlobalTypeIndex(namespaceIndexes);
    const closure = computeStandaloneClosure(target, globalIndex);
    expect(Array.from(closure.dataByName.keys()).sort()).toEqual(['Foo', 'Target']);
    expect(closure.typeAliasByName.size).toBe(0);
  });

  it('does not stack-overflow on a self-referencing cyclic Data type', async () => {
    const docs = await parseModels([`namespace test
      type Node:
        children Node (0..*)`]);
    const namespaceIndexes = buildNamespaceIndexes(docs);
    const target = findTargetNode(namespaceIndexes, 'test.Node')!;
    const globalIndex = buildGlobalTypeIndex(namespaceIndexes);
    const closure = computeStandaloneClosure(target, globalIndex);
    expect(Array.from(closure.dataByName.keys())).toEqual(['Node']);
  });

  it('walks a Choice option across namespaces, through an alias, to an Enum', async () => {
    const docs = await parseModels([
      `namespace test.other
       enum Status: ACTIVE INACTIVE`,
      `namespace test.main
       typeAlias StatusAlias: test.other.Status
       choice Wrapper:
         StatusAlias`
    ]);
    const namespaceIndexes = buildNamespaceIndexes(docs);
    const target = findTargetNode(namespaceIndexes, 'test.main.Wrapper')!;
    const globalIndex = buildGlobalTypeIndex(namespaceIndexes);
    const closure = computeStandaloneClosure(target, globalIndex);
    expect(Array.from(closure.choiceByName.keys())).toEqual(['Wrapper']);
    expect(Array.from(closure.enumByName.keys())).toEqual(['Status']);
    expect(closure.docs.length).toBe(2);
  });

  it('adds the typeAlias node itself when the target IS a type alias', async () => {
    const docs = await parseModels([`namespace test
      typeAlias MyAlias: int`]);
    const namespaceIndexes = buildNamespaceIndexes(docs);
    const target = findTargetNode(namespaceIndexes, 'test.MyAlias')!;
    const globalIndex = buildGlobalTypeIndex(namespaceIndexes);
    const closure = computeStandaloneClosure(target, globalIndex);
    expect(Array.from(closure.typeAliasByName.keys())).toEqual(['MyAlias']);
    expect(closure.dataByName.size).toBe(0);
  });
});
```

(Adjust the multi-namespace fixture syntax — cross-namespace type reference qualification — to whatever this codebase's actual `.rune` grammar convention is; check an existing cross-namespace fixture, e.g. via `rg -rn "namespace test\." packages/codegen/test/fixtures` for a real example, before finalizing this test's source strings.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/emit/standalone-schema.test.ts -t "computeStandaloneClosure"`
Expected: FAIL — `computeStandaloneClosure` not defined

- [ ] **Step 3: Implement `computeStandaloneClosure`**

Add to `packages/codegen/src/emit/standalone-schema.ts`:

```ts
import type { LangiumDocument } from 'langium';
import { resolveTypeCallTarget, nodeSourceUri, type TypeResolutionVisitor } from './type-ref-resolver.js';

export interface StandaloneClosure {
  dataByName: Map<string, Data>;
  choiceByName: Map<string, Choice>;
  enumByName: Map<string, RosettaEnumeration>;
  typeAliasByName: Map<string, RosettaTypeAlias>;
  docs: LangiumDocument[];
}

type FrontierNode = Data | Choice | RosettaTypeAlias;

export function computeStandaloneClosure(target: ResolvedTarget, globalIndex: TypeIndexLookup): StandaloneClosure {
  const dataByName = new Map<string, Data>();
  const choiceByName = new Map<string, Choice>();
  const enumByName = new Map<string, RosettaEnumeration>();
  const typeAliasByName = new Map<string, RosettaTypeAlias>();
  const docs = new Set<LangiumDocument>();
  const visited = new Set<Data | Choice | RosettaEnumeration | RosettaTypeAlias>();
  const frontier: FrontierNode[] = [];

  const trackDoc = (node: { $container?: unknown }): void => {
    const withDoc = node as { $container?: { $document?: LangiumDocument } };
    const doc = withDoc.$container?.$document;
    if (doc) docs.add(doc);
  };

  const enqueue = (node: Data | Choice | RosettaEnumeration | RosettaTypeAlias): void => {
    if (visited.has(node)) return;
    visited.add(node);
    trackDoc(node);
    if (isData(node)) {
      dataByName.set(node.name, node);
      frontier.push(node);
    } else if (isChoice(node)) {
      choiceByName.set(node.name, node);
      frontier.push(node);
    } else if (isRosettaEnumeration(node)) {
      enumByName.set(node.name, node);
    } else {
      typeAliasByName.set(node.name, node);
      frontier.push(node);
    }
  };

  const dependencyVisitor: TypeResolutionVisitor<void> = {
    onPrimitive: () => undefined,
    onEnum: (node) => enqueue(node),
    onData: (node) => enqueue(node),
    onChoice: (node) => enqueue(node),
    onUnresolved: () => undefined
  };

  enqueue(target.node);

  while (frontier.length > 0) {
    const node = frontier.shift()!;
    if (isData(node)) {
      const superRef = node.superType?.ref;
      if (superRef) enqueue(superRef);
      for (const attr of node.attributes) {
        resolveTypeCallTarget(attr.typeCall, globalIndex, dependencyVisitor, nodeSourceUri(node, ''));
      }
    } else if (isChoice(node)) {
      for (const option of node.attributes) {
        resolveTypeCallTarget(option.typeCall, globalIndex, dependencyVisitor, nodeSourceUri(node, ''));
      }
    } else {
      resolveTypeCallTarget(node.typeCall, globalIndex, dependencyVisitor, nodeSourceUri(node, ''));
    }
  }

  return { dataByName, choiceByName, enumByName, typeAliasByName, docs: Array.from(docs) };
}
```

Note: `Data.superType?.ref` and `Choice`'s option `typeCall` are read directly (not through `resolveTypeCallTarget`) for `superType` specifically, because `Data.superType` is grammar-typed as `langium.Reference<DataOrChoice>` — it can never resolve to a `RosettaTypeAlias`, so there is no alias chain to chase there; a plain `isData`/`isChoice`-free direct enqueue is correct and sufficient (confirm this grammar constraint by reading `packages/core/src/generated/ast.ts`'s `Data.superType` field type before writing this step, in case it has changed).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/emit/standalone-schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/emit/standalone-schema.ts packages/codegen/test/emit/standalone-schema.test.ts
git commit -m "feat(codegen): compute transitive type-dependency closure for standalone schema extraction"
```

---

### Task 3: Synthetic namespace assembly + `emitStandaloneZodSchema`

**Files:**
- Modify: `packages/codegen/src/emit/standalone-schema.ts`
- Test: `packages/codegen/test/emit/standalone-schema.test.ts`

**Interfaces:**
- Consumes: `emitNamespace` (`./zod-emitter.js`); `NamespaceWalkResult` (`./namespace-walker.js`); `buildTypeReferenceGraph`, `findCyclicTypes` (`../cycle-detector.js`); `topoSort` (`../topo-sort.js`); `GeneratorDiagnostic` (`../types.js`); `computeStandaloneClosure`, `findTargetNode`, `buildGlobalTypeIndex` (Task 1/2, this file); `buildNamespaceIndexes` (`../preview-schema.js`).
- Produces (public API of this whole plan): `export function emitStandaloneZodSchema(documents: LangiumDocument[], targetId: string): { code: string; diagnostics: GeneratorDiagnostic[] }`.

- [ ] **Step 1: Write the failing tests**

```ts
import { emitStandaloneZodSchema } from '../../src/emit/standalone-schema.js';

describe('emitStandaloneZodSchema', () => {
  it('produces a self-contained script with no import statements for a cross-namespace closure', async () => {
    const docs = await parseModels([
      `namespace test.other
       type Bar:
         y string (0..1)`,
      `namespace test.main
       typeAlias BarAlias: test.other.Bar
       type Foo:
         bar BarAlias (0..1)`
    ]);
    const result = emitStandaloneZodSchema(docs, 'test.main.Foo');
    expect(result.code).not.toMatch(/^import /m);
    expect(result.code).toContain('BarSchema');
    expect(result.diagnostics).toEqual([]);
  });

  it('produces a script that genuinely evaluates and validates real sample data', async () => {
    const docs = await parseModels([
      `namespace test.other
       type Bar:
         y string (0..1)`,
      `namespace test.main
       typeAlias BarAlias: test.other.Bar
       type Foo:
         bar BarAlias (0..1)`
    ]);
    const result = emitStandaloneZodSchema(docs, 'test.main.Foo');
    // RUNTIME_HELPER_JS_SOURCE mirrors what apps/studio/src/workers/codegen-worker.ts
    // already prepends before evaluating generated func bodies — reuse the same
    // export here so this test proves the real end-to-end contract, not an
    // approximation of it.
    const { RUNTIME_HELPER_JS_SOURCE } = await import('../../src/export.js');
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const wrapper = new Function(`${RUNTIME_HELPER_JS_SOURCE}\n\n${result.code}\nreturn FooSchema;`);
    const FooSchema = wrapper();
    expect(FooSchema.safeParse({ bar: { y: 'hello' } }).success).toBe(true);
    expect(FooSchema.safeParse({ bar: { y: 123 } }).success).toBe(false);
  });

  it('produces a script for a target with no dependencies at all', async () => {
    const docs = await parseModels([`namespace test
      type Leaf:
        x string (0..1)`]);
    const result = emitStandaloneZodSchema(docs, 'test.Leaf');
    expect(result.code).not.toMatch(/^import /m);
    expect(result.code).toContain('LeafSchema');
  });

  it('returns a diagnostic and empty code for an unknown targetId', async () => {
    const docs = await parseModels([`namespace test
      type Leaf:
        x string (0..1)`]);
    const result = emitStandaloneZodSchema(docs, 'test.DoesNotExist');
    expect(result.code).toBe('');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.severity).toBe('error');
  });

  it('surfaces a genuinely unresolvable reference within the closure as a diagnostic', async () => {
    const docs = await parseModels([`namespace test
      type Foo:
        bar MissingType (0..1)`]);
    const result = emitStandaloneZodSchema(docs, 'test.Foo');
    expect(result.diagnostics.some((d) => d.code === 'unresolved-ref')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/emit/standalone-schema.test.ts -t "emitStandaloneZodSchema"`
Expected: FAIL — `emitStandaloneZodSchema` not defined

- [ ] **Step 3: Implement `emitStandaloneZodSchema`**

Add to `packages/codegen/src/emit/standalone-schema.ts`:

```ts
import { emitNamespace } from './zod-emitter.js';
import type { NamespaceWalkResult } from './namespace-walker.js';
import { buildTypeReferenceGraph, findCyclicTypes } from '../cycle-detector.js';
import { topoSort } from '../topo-sort.js';
import type { GeneratorDiagnostic } from '../types.js';
import { buildNamespaceIndexes } from '../preview-schema.js';

export function emitStandaloneZodSchema(
  documents: LangiumDocument[],
  targetId: string
): { code: string; diagnostics: GeneratorDiagnostic[] } {
  const namespaceIndexes = buildNamespaceIndexes(documents);
  const target = findTargetNode(namespaceIndexes, targetId);
  if (!target) {
    return {
      code: '',
      diagnostics: [
        {
          severity: 'error',
          code: 'unknown-target',
          message: `Target '${targetId}' was not found in the loaded documents.`
        }
      ]
    };
  }

  const globalIndex = buildGlobalTypeIndex(namespaceIndexes);
  const closure = computeStandaloneClosure(target, globalIndex);

  const graph = buildTypeReferenceGraph(closure.docs);
  const cyclicTypes = findCyclicTypes(graph);
  const emitOrder = topoSort(graph, cyclicTypes);

  const syntheticModel: NamespaceWalkResult = {
    docs: closure.docs,
    namespace: '__standalone__',
    dataByName: closure.dataByName,
    enumByName: closure.enumByName,
    typeAliasByName: closure.typeAliasByName,
    choiceByName: closure.choiceByName,
    rulesByName: new Map(),
    reportsByName: new Map(),
    annotationsByName: new Map(),
    libraryFuncsByName: new Map(),
    emitOrder,
    cyclicTypes,
    graph
  };

  const result = emitNamespace(syntheticModel, {}, { namespaces: new Map() });
  return { code: result.content, diagnostics: result.diagnostics };
}
```

Before writing this step, confirm `buildTypeReferenceGraph`'s default `getNodeId` parameter (bare `.name`, not namespace-qualified) is what gets used here — do NOT pass `qualifiedTypeId` or any namespace-qualifying function, since `emitOrder`'s string values must exactly match `closure.dataByName`/`closure.choiceByName`'s bare-name keys for `emitNamespaceWithContract`'s `model.dataByName.get(typeName)` lookups to succeed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/emit/standalone-schema.test.ts`
Expected: PASS, full file green

- [ ] **Step 5: Run the whole `packages/codegen` suite, type-check, and lint**

Run: `pnpm --filter @rune-langium/codegen exec vitest run`
Expected: PASS, zero regressions

Run: `pnpm --filter @rune-langium/codegen run type-check`
Expected: clean

Run: `pnpm run lint` (or the package-scoped oxlint equivalent)
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add packages/codegen/src/emit/standalone-schema.ts packages/codegen/test/emit/standalone-schema.test.ts
git commit -m "feat(codegen): assemble synthetic namespace and expose emitStandaloneZodSchema"
```

---
