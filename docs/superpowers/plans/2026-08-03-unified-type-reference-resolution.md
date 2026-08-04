<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Pradeep Mouli -->

# Unified Type-Reference Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every codegen emit target (Zod, TypeScript, JSON Schema, XSD, SQL) and Form Preview must
correctly resolve a field whose type is a `typeAlias` declaration — today all six independently
hand-roll their own type-resolution chain and all omit that case, so such a field always falls
back to an "unresolved reference" diagnostic and a degraded output, even when the alias resolves
fine.

**Architecture:** One new framework-agnostic module, `packages/codegen/src/emit/type-ref-resolver.ts`,
exports `resolveTypeCallTarget()` — a visitor-based resolver that walks a `RosettaTypeCall` to its
terminal kind (primitive/enum/data/choice), transparently chasing alias-to-alias chains with a
cycle guard, and invoking exactly one visitor callback. `BaseNamespaceEmitter` gains a shared
`reportUnresolvedReference()` helper and becomes the single owner of each emitter's `diagnostics`
array. Each of the five real emitters, plus `preview-schema.ts`, is migrated to a thin visitor
implementation that reuses its own existing per-target rendering (Zod string / TS string / XSD
string / JSON Schema `$ref` / SQL column / `PreviewField`) — only the *resolution* logic is shared,
not the rendering.

**Tech Stack:** TypeScript 5.9 (strict, ESM), Vitest, Langium 4.3.x AST (`@rune-langium/core`).

## Global Constraints

- No change to any emitter's existing output shape or diagnostic message text for the
  already-working cases (primitive/Enum/Data/Choice) — this is a resolution-logic fix only.
- `sql-emitter.ts`'s FK/join-table modeling and its existing "an unresolved alias target must
  still warn, not silently map to TEXT" behavior must be preserved.
- Alias-to-alias chains must be bounded by a cycle guard (a `Set` of already-visited alias AST
  nodes, not merely a depth counter) — a malformed circular alias chain must not hang generation.
- `preview-schema.ts` keeps its own, materially different diagnostic model
  (`unsupportedFeatures: Set<string>` tags on a `FormPreviewSchema`) — it is NOT a
  `BaseNamespaceEmitter` subclass and is unaffected by the `reportUnresolvedReference` change.
- All new/modified files are under `packages/codegen/` (MIT). SPDX header:
  `// SPDX-License-Identifier: MIT` / `// Copyright (c) 2026 Pradeep Mouli`.

---

### Task 1: `type-ref-resolver.ts` — the shared resolver

**Files:**
- Create: `packages/codegen/src/emit/type-ref-resolver.ts`
- Test: `packages/codegen/test/emit/type-ref-resolver.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks — this is a leaf module.
- Produces (for Tasks 3–8):
  ```ts
  export interface TypeResolutionVisitor<T> {
    onPrimitive(basicTypeName: string): T;
    onEnum(node: RosettaEnumeration, sourceUri: string): T;
    onData(node: Data, sourceUri: string): T;
    onChoice(node: Choice, sourceUri: string): T;
    onUnresolved(refText: string | undefined): T;
  }

  export interface TypeIndexEntry<N> {
    node: N;
    sourceUri: string;
  }

  export interface TypeIndexLookup {
    enumByName: ReadonlyMap<string, TypeIndexEntry<RosettaEnumeration>>;
    dataByName: ReadonlyMap<string, TypeIndexEntry<Data>>;
    choiceByName: ReadonlyMap<string, TypeIndexEntry<Choice>>;
    typeAliasByName: ReadonlyMap<string, TypeIndexEntry<RosettaTypeAlias>>;
  }

  export function resolveTypeCallTarget<T>(
    typeCall: RosettaTypeCall | undefined,
    namespace: TypeIndexLookup,
    visitor: TypeResolutionVisitor<T>,
    fallbackSourceUri: string
  ): T;
  ```
  `TypeIndexLookup` is a structural subset every existing `NamespaceIndex`/`EmissionContext` already
  satisfies (`dataByName`/`enumByName`/`choiceByName`/`typeAliasByName` — no adapter needed at any
  call site in later tasks).

- [ ] **Step 1: Write the failing tests**

```ts
// packages/codegen/test/emit/type-ref-resolver.test.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { EmptyFileSystem } from 'langium';
import { URI } from 'langium';
import type { Data, RosettaEnumeration, Choice, RosettaTypeAlias, RosettaModel } from '@rune-langium/core';
import { resolveTypeCallTarget, type TypeIndexLookup, type TypeResolutionVisitor } from '../../src/emit/type-ref-resolver.js';

const services = createRuneDslServices(EmptyFileSystem).RuneDsl;

async function parseNamespace(source: string): Promise<{ model: RosettaModel; index: TypeIndexLookup }> {
  const doc = services.shared.workspace.LangiumDocumentFactory.fromString<RosettaModel>(
    source,
    URI.parse('file:///test.rosetta')
  );
  await services.shared.workspace.DocumentBuilder.build([doc], { validation: false });
  const model = doc.parseResult.value;
  const index: TypeIndexLookup = {
    enumByName: new Map(),
    dataByName: new Map(),
    choiceByName: new Map(),
    typeAliasByName: new Map()
  };
  for (const el of model.elements) {
    const sourceUri = 'file:///test.rosetta';
    if (el.$type === 'Data') (index.dataByName as Map<string, unknown>).set(el.name, { node: el, sourceUri });
    if (el.$type === 'RosettaEnumeration') (index.enumByName as Map<string, unknown>).set(el.name, { node: el, sourceUri });
    if (el.$type === 'Choice') (index.choiceByName as Map<string, unknown>).set(el.name, { node: el, sourceUri });
    if (el.$type === 'RosettaTypeAlias') (index.typeAliasByName as Map<string, unknown>).set(el.name, { node: el, sourceUri });
  }
  return { model, index };
}

function findAttrTypeCall(data: Data, attrName: string) {
  const attr = data.attributes.find((a) => a.name === attrName);
  if (!attr) throw new Error(`attribute ${attrName} not found`);
  return attr.typeCall;
}

interface Recorded {
  kind: 'primitive' | 'enum' | 'data' | 'choice' | 'unresolved';
  value?: string;
}

function recordingVisitor(): TypeResolutionVisitor<Recorded> {
  return {
    onPrimitive: (basicTypeName) => ({ kind: 'primitive', value: basicTypeName }),
    onEnum: (node) => ({ kind: 'enum', value: node.name }),
    onData: (node) => ({ kind: 'data', value: node.name }),
    onChoice: (node) => ({ kind: 'choice', value: node.name }),
    onUnresolved: (refText) => ({ kind: 'unresolved', value: refText })
  };
}

describe('resolveTypeCallTarget', () => {
  it('resolves a primitive-typed field', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      type Foo:
        bar string (0..1)
    `);
    const data = model.elements.find((e) => e.name === 'Foo') as Data;
    const result = resolveTypeCallTarget(findAttrTypeCall(data, 'bar'), index, recordingVisitor(), 'file:///test.rosetta');
    expect(result).toEqual({ kind: 'primitive', value: 'string' });
  });

  it('resolves an enum-typed field', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      enum Color: RED GREEN BLUE
      type Foo:
        bar Color (0..1)
    `);
    const data = model.elements.find((e) => e.name === 'Foo') as Data;
    const result = resolveTypeCallTarget(findAttrTypeCall(data, 'bar'), index, recordingVisitor(), 'file:///test.rosetta');
    expect(result).toEqual({ kind: 'enum', value: 'Color' });
  });

  it('resolves a data-typed field', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      type Bar:
        x string (0..1)
      type Foo:
        bar Bar (0..1)
    `);
    const data = model.elements.find((e) => e.name === 'Foo') as Data;
    const result = resolveTypeCallTarget(findAttrTypeCall(data, 'bar'), index, recordingVisitor(), 'file:///test.rosetta');
    expect(result).toEqual({ kind: 'data', value: 'Bar' });
  });

  it('resolves a choice-typed field', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      choice Bar: X Y
      type X: a string (0..1)
      type Y: b string (0..1)
      type Foo:
        bar Bar (0..1)
    `);
    const data = model.elements.find((e) => e.name === 'Foo') as Data;
    const result = resolveTypeCallTarget(findAttrTypeCall(data, 'bar'), index, recordingVisitor(), 'file:///test.rosetta');
    expect(result).toEqual({ kind: 'choice', value: 'Bar' });
  });

  it('resolves a type-alias-to-primitive field to the primitive kind (the production bug)', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      typeAlias MyAlias: string
      type Foo:
        bar MyAlias (0..1)
    `);
    const data = model.elements.find((e) => e.name === 'Foo') as Data;
    const result = resolveTypeCallTarget(findAttrTypeCall(data, 'bar'), index, recordingVisitor(), 'file:///test.rosetta');
    expect(result).toEqual({ kind: 'primitive', value: 'string' });
  });

  it('resolves a type-alias-to-data field to the data kind', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      type Bar:
        x string (0..1)
      typeAlias MyAlias: Bar
      type Foo:
        bar MyAlias (0..1)
    `);
    const data = model.elements.find((e) => e.name === 'Foo') as Data;
    const result = resolveTypeCallTarget(findAttrTypeCall(data, 'bar'), index, recordingVisitor(), 'file:///test.rosetta');
    expect(result).toEqual({ kind: 'data', value: 'Bar' });
  });

  it('chases a 2-hop alias-to-alias-to-primitive chain', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      typeAlias Inner: string
      typeAlias Outer: Inner
      type Foo:
        bar Outer (0..1)
    `);
    const data = model.elements.find((e) => e.name === 'Foo') as Data;
    const result = resolveTypeCallTarget(findAttrTypeCall(data, 'bar'), index, recordingVisitor(), 'file:///test.rosetta');
    expect(result).toEqual({ kind: 'primitive', value: 'string' });
  });

  it('reports unresolved for a field with no type reference match', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      type Foo:
        bar string (0..1)
    `);
    const data = model.elements.find((e) => e.name === 'Foo') as Data;
    const typeCall = findAttrTypeCall(data, 'bar')!;
    // Simulate an unresolved reference: strip the AST link, keep only $refText.
    const brokenTypeCall = { ...typeCall, type: { ...typeCall.type, ref: undefined, $refText: 'NoSuchType' } } as typeof typeCall;
    const result = resolveTypeCallTarget(brokenTypeCall, index, recordingVisitor(), 'file:///test.rosetta');
    expect(result).toEqual({ kind: 'unresolved', value: 'NoSuchType' });
  });

  it('breaks a circular alias chain via onUnresolved instead of looping forever', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      typeAlias A: B
      typeAlias B: A
      type Foo:
        bar A (0..1)
    `);
    const data = model.elements.find((e) => e.name === 'Foo') as Data;
    const result = resolveTypeCallTarget(findAttrTypeCall(data, 'bar'), index, recordingVisitor(), 'file:///test.rosetta');
    expect(result.kind).toBe('unresolved');
  });

  it('falls back to $refText-against-namespace-index lookup when typeRef is absent (single-file/fixture case)', async () => {
    const { model, index } = await parseNamespace(`
      namespace test
      type Bar:
        x string (0..1)
      type Foo:
        bar Bar (0..1)
    `);
    const data = model.elements.find((e) => e.name === 'Foo') as Data;
    const typeCall = findAttrTypeCall(data, 'bar')!;
    const refTextOnlyTypeCall = { ...typeCall, type: { ...typeCall.type, ref: undefined, $refText: 'Bar' } } as typeof typeCall;
    const result = resolveTypeCallTarget(refTextOnlyTypeCall, index, recordingVisitor(), 'file:///test.rosetta');
    expect(result).toEqual({ kind: 'data', value: 'Bar' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/emit/type-ref-resolver.test.ts`
Expected: FAIL — `Cannot find module '../../src/emit/type-ref-resolver.js'`

- [ ] **Step 3: Write the implementation**

```ts
// packages/codegen/src/emit/type-ref-resolver.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import {
  isData,
  isChoice,
  isRosettaEnumeration,
  isRosettaBasicType,
  isRosettaTypeAlias
} from '@rune-langium/core';
import type {
  Data,
  Choice,
  RosettaEnumeration,
  RosettaTypeAlias,
  RosettaTypeCall
} from '@rune-langium/core';

/**
 * Canonical Rosetta built-in scalar type names. Every emitter's own
 * target-specific builtin map (Zod/TS/XSD/JSON-Schema/SQL) uses these same
 * names as keys with different values — this set only recognizes THAT a
 * $refText names a builtin, not what it maps to for any given target.
 */
const ROSETTA_BASIC_TYPE_NAMES = new Set([
  'string',
  'int',
  'number',
  'boolean',
  'date',
  'dateTime',
  'zonedDateTime',
  'time',
  'productType',
  'eventType'
]);

/** Bound on alias-to-alias chain length — defensive only; a real corpus never chains this deep. */
const MAX_ALIAS_CHAIN = 32;

export interface TypeResolutionVisitor<T> {
  onPrimitive(basicTypeName: string): T;
  onEnum(node: RosettaEnumeration, sourceUri: string): T;
  onData(node: Data, sourceUri: string): T;
  onChoice(node: Choice, sourceUri: string): T;
  onUnresolved(refText: string | undefined): T;
}

export interface TypeIndexEntry<N> {
  node: N;
  sourceUri: string;
}

export interface TypeIndexLookup {
  enumByName: ReadonlyMap<string, TypeIndexEntry<RosettaEnumeration>>;
  dataByName: ReadonlyMap<string, TypeIndexEntry<Data>>;
  choiceByName: ReadonlyMap<string, TypeIndexEntry<Choice>>;
  typeAliasByName: ReadonlyMap<string, TypeIndexEntry<RosettaTypeAlias>>;
}

function nodeSourceUri(node: { $container?: unknown } | undefined, fallback: string): string {
  const withDoc = node as { $container?: { $document?: { uri?: { toString(): string } } } } | undefined;
  return withDoc?.$container?.$document?.uri?.toString() ?? fallback;
}

/**
 * Resolve a `RosettaTypeCall` to its terminal kind — primitive, Enum, Data,
 * or Choice — invoking exactly one `visitor` callback. Transparently chases
 * `RosettaTypeAlias` chains (an alias to another alias to ... a primitive or
 * Data type) so callers never see a `'typeAlias'` case: referencing an alias
 * behaves exactly like referencing whatever it ultimately resolves to.
 *
 * Walks the same precedence every emitter's hand-rolled chain used before
 * migration: direct `typeCall.type.ref` (Langium's own resolution) first,
 * `typeCall.type.$refText`-against-`namespace` fallback second (for a
 * single file parsed without the full workspace — common for fixtures).
 */
export function resolveTypeCallTarget<T>(
  typeCall: RosettaTypeCall | undefined,
  namespace: TypeIndexLookup,
  visitor: TypeResolutionVisitor<T>,
  fallbackSourceUri: string
): T {
  const originalRefText = typeCall?.type?.$refText;
  const visitedAliases = new Set<RosettaTypeAlias>();
  let currentTypeCall: RosettaTypeCall | undefined = typeCall;

  for (let hop = 0; hop <= MAX_ALIAS_CHAIN; hop++) {
    const typeRef = currentTypeCall?.type?.ref;
    const refText = currentTypeCall?.type?.$refText;

    if (typeRef) {
      if (isRosettaBasicType(typeRef)) return visitor.onPrimitive(typeRef.name);
      if (isRosettaEnumeration(typeRef)) return visitor.onEnum(typeRef, nodeSourceUri(typeRef, fallbackSourceUri));
      if (isData(typeRef)) return visitor.onData(typeRef, nodeSourceUri(typeRef, fallbackSourceUri));
      if (isChoice(typeRef)) return visitor.onChoice(typeRef, nodeSourceUri(typeRef, fallbackSourceUri));
      if (isRosettaTypeAlias(typeRef)) {
        if (visitedAliases.has(typeRef)) return visitor.onUnresolved(originalRefText);
        visitedAliases.add(typeRef);
        currentTypeCall = typeRef.typeCall;
        continue;
      }
      return visitor.onUnresolved(originalRefText);
    }

    if (refText) {
      if (ROSETTA_BASIC_TYPE_NAMES.has(refText)) return visitor.onPrimitive(refText);
      const enumEntry = namespace.enumByName.get(refText);
      if (enumEntry) return visitor.onEnum(enumEntry.node, enumEntry.sourceUri);
      const dataEntry = namespace.dataByName.get(refText);
      if (dataEntry) return visitor.onData(dataEntry.node, dataEntry.sourceUri);
      const choiceEntry = namespace.choiceByName.get(refText);
      if (choiceEntry) return visitor.onChoice(choiceEntry.node, choiceEntry.sourceUri);
      const aliasEntry = namespace.typeAliasByName.get(refText);
      if (aliasEntry) {
        if (visitedAliases.has(aliasEntry.node)) return visitor.onUnresolved(originalRefText);
        visitedAliases.add(aliasEntry.node);
        currentTypeCall = aliasEntry.node.typeCall;
        continue;
      }
    }

    return visitor.onUnresolved(originalRefText);
  }

  return visitor.onUnresolved(originalRefText);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/emit/type-ref-resolver.test.ts`
Expected: PASS (10/10)

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/emit/type-ref-resolver.ts packages/codegen/test/emit/type-ref-resolver.test.ts
git commit -m "feat(codegen): add shared resolveTypeCallTarget() type-reference resolver"
```

---

### Task 2: `BaseNamespaceEmitter.reportUnresolvedReference()` + diagnostics unification

**Files:**
- Modify: `packages/codegen/src/emit/base-namespace-emitter.ts`
- Modify: `packages/codegen/src/emit/zod-emitter.ts` (constructor + `EmissionContext` wiring only — NOT `resolveTypeExpr` yet, that's Task 3)
- Modify: `packages/codegen/src/emit/ts-emitter.ts` (constructor only)
- Modify: `packages/codegen/src/emit/json-schema-emitter.ts` (constructor only)
- Test: `packages/codegen/test/emit/base-namespace-emitter.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces (for Tasks 3–7):
  ```ts
  // on BaseNamespaceEmitter
  protected readonly diagnostics: GeneratorDiagnostic[];
  protected reportUnresolvedReference(
    attrName: string,
    refText: string | undefined,
    fallbackDescription: string
  ): void;
  ```
  Pushes `{ severity: 'warning', code: 'unresolved-ref', message: <built from attrName/refText/fallbackDescription> }` onto `this.diagnostics`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/codegen/test/emit/base-namespace-emitter.test.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { BaseNamespaceEmitter } from '../../src/emit/base-namespace-emitter.js';
import type { NamespaceWalkResult } from '../../src/emit/namespace-walker.js';
import type { NamespaceRegistry } from '../../src/emit/namespace-registry.js';
import type { GeneratorOutput } from '../../src/types.js';

class TestEmitter extends BaseNamespaceEmitter {
  finalize(): GeneratorOutput {
    return { relativePath: 'test.out', content: '' };
  }
  callReportUnresolved(attrName: string, refText: string | undefined, fallbackDescription: string): void {
    this.reportUnresolvedReference(attrName, refText, fallbackDescription);
  }
}

function makeModel(): NamespaceWalkResult {
  return {
    namespace: 'test',
    dataByName: new Map(),
    enumByName: new Map(),
    choiceByName: new Map(),
    typeAliasByName: new Map(),
    funcByName: new Map(),
    rulesByName: new Map()
  } as unknown as NamespaceWalkResult;
}

describe('BaseNamespaceEmitter.reportUnresolvedReference', () => {
  it('pushes a warning diagnostic with the expected shape', () => {
    const emitter = new TestEmitter(makeModel(), {}, { namespaces: new Map() } as NamespaceRegistry);
    emitter.callReportUnresolved('myAttr', 'MissingType', 'z.unknown()');
    expect(emitter.finalize()).toBeDefined();
    // diagnostics is protected; exercised indirectly via a subclass accessor in real emitter tests.
    // Here we assert via the same TestEmitter exposing it for the unit test.
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/emit/base-namespace-emitter.test.ts`
Expected: FAIL — `reportUnresolvedReference` does not exist on `BaseNamespaceEmitter`

- [ ] **Step 3: Implement `reportUnresolvedReference` + `diagnostics` on `BaseNamespaceEmitter`**

Read `packages/codegen/src/emit/base-namespace-emitter.ts` first — it currently has no `diagnostics`
field. Add, inside the `BaseNamespaceEmitter` class body (after `suppressBoilerplate`):

```ts
  protected readonly diagnostics: GeneratorDiagnostic[] = [];

  /**
   * Push the standard unresolved-type-reference diagnostic. `fallbackDescription`
   * is the one piece that legitimately differs per emitter (what it falls back to
   * emitting — e.g. `'z.unknown()'`, `'unknown'`, `'{}'`, `'xs:string'`), so each
   * emitter's message text is unchanged; only the object-construction and push are shared.
   */
  protected reportUnresolvedReference(attrName: string, refText: string | undefined, fallbackDescription: string): void {
    this.diagnostics.push({
      severity: 'warning',
      code: 'unresolved-ref',
      message: refText
        ? `Attribute '${attrName}': type '${refText}' is not resolved; emitting ${fallbackDescription}`
        : `Attribute '${attrName}' has an unresolved type reference; emitting ${fallbackDescription}`
    });
  }
```

`GeneratorDiagnostic` is already imported in this file (`import type { GeneratorOutput, GeneratorDiagnostic } from '../types.js';`).

Now update the three `EmissionContext`-based emitters' constructors so `ctx.diagnostics` becomes a
*reference* to `this.diagnostics` (the base class's array) instead of its own separate array.

In `packages/codegen/src/emit/zod-emitter.ts`'s constructor (around the `this.ctx = buildEmissionContext(model, registry)` line — read the file first to find `buildEmissionContext`'s exact signature in `emission-context.ts` or wherever it's defined; it must accept an optional pre-existing `diagnostics` array to write into rather than allocating its own):

```ts
    this.ctx = buildEmissionContext(model, registry, this.diagnostics);
```

Read `buildEmissionContext`'s definition (search for it — likely `packages/codegen/src/emit/emission-context.ts` or similar) and change its signature to accept `diagnostics: GeneratorDiagnostic[]` as a parameter, storing it directly as `ctx.diagnostics = diagnostics` rather than `ctx.diagnostics = []`. Apply the identical one-line constructor change to `ts-emitter.ts` and `json-schema-emitter.ts` (both call `buildEmissionContext` the same way — confirm by reading each constructor).

**Important — confirm `EmissionContext`'s index shapes before Task 3.** While reading
`buildEmissionContext`'s definition, also check the exact value type of `ctx.dataByName`,
`ctx.enumByName`, `ctx.choiceByName`, and `ctx.typeAliasByName`. Task 1's `TypeIndexLookup` expects
`ReadonlyMap<string, { node: N; sourceUri: string }>` (matching `preview-schema.ts`'s existing
`NamespaceIndex` shape, which Task 8 relies on as-is). It is plausible `EmissionContext`'s maps are
instead simpler `ReadonlyMap<string, N>` (bare AST nodes) — none of the five real emitters were
observed consuming a per-entry `sourceUri` from these maps before migration (they only ever used
`typeRef.$container?.$document?.uri` for the *typeRef-resolved* path, never a namespace-index
entry's own URI for the *refText-fallback* path). Resolve whichever is actually true one of two ways:

- If `EmissionContext`'s maps already store `{ node, sourceUri }` (or something the resolver can use
  as-is): no further change needed, `this.ctx` satisfies `TypeIndexLookup` directly.
- If they store bare nodes: add a small adapter in `base-namespace-emitter.ts` (or inline at each of
  Tasks 3/4/5's construction sites) that wraps `ctx.dataByName` etc. into `TypeIndexLookup`-shaped
  views, using `this.ctx.sourceUri` (or the equivalent single "current document" URI field already
  used elsewhere in that emitter) as the entry's `sourceUri` — this loses per-entry precision only
  for the refText-fallback path (fixture/single-file case), matching this path's already-approximate
  existing behavior, and does not affect the typeRef-resolved path's accuracy at all.

Whichever is true, keep `xsd-emitter.ts`'s and `sql-emitter.ts`'s own `this.model` (a
`NamespaceWalkResult`, confirmed already to have `dataByName`/`enumByName`/`choiceByName`/
`typeAliasByName`) in mind too for Tasks 6–7 — check its map value shape the same way before writing
those tasks' resolver calls, independently of whatever `EmissionContext` turns out to be.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/emit/base-namespace-emitter.test.ts`
Expected: PASS

Then run the FULL existing codegen suite to confirm the diagnostics-storage change didn't break any
emitter that reads `ctx.diagnostics` or `this.diagnostics` elsewhere:

Run: `pnpm --filter @rune-langium/codegen test`
Expected: PASS (no regressions — diagnostics still end up wherever each emitter's caller reads them from, `finalize()`'s output, etc.)

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/emit/base-namespace-emitter.ts packages/codegen/src/emit/zod-emitter.ts packages/codegen/src/emit/ts-emitter.ts packages/codegen/src/emit/json-schema-emitter.ts packages/codegen/test/emit/base-namespace-emitter.test.ts
git commit -m "feat(codegen): add BaseNamespaceEmitter.reportUnresolvedReference, unify diagnostics storage"
```

---

### Task 3: Migrate `zod-emitter.ts`

**Files:**
- Modify: `packages/codegen/src/emit/zod-emitter.ts:412-490` (`resolveTypeExpr`; re-read the file
  first — line numbers will have shifted slightly after Task 2's constructor edit)
- Test: `packages/codegen/test/emit/zod-emitter.test.ts` (or wherever its existing suite lives —
  confirm exact path by reading the directory; do not create a new file if one already covers this
  emitter)

**Interfaces:**
- Consumes: `resolveTypeCallTarget`, `TypeResolutionVisitor` (Task 1); `this.diagnostics`,
  `this.reportUnresolvedReference` (Task 2).
- Produces: nothing new for later tasks — each emitter migration is independent.

- [ ] **Step 1: Write the failing tests**

Add to the existing zod-emitter test suite (read it first to match its existing fixture/assertion
style exactly):

```ts
it('resolves a field typed via a type-alias-to-primitive to the correct Zod validator', () => {
  const source = `
    namespace test
    typeAlias MyAlias: string
    type Foo:
      bar MyAlias (0..1)
  `;
  // ... existing test harness's own parse+emit helper, however this suite already does it ...
  const output = emitZod(source, 'Foo');
  expect(output).toContain('bar: z.string().optional()');
  expect(output).not.toContain('z.unknown()');
});

it('resolves a field typed via a type-alias-to-Data to the Data schema reference', () => {
  const source = `
    namespace test
    type Bar:
      x string (0..1)
    typeAlias MyAlias: Bar
    type Foo:
      bar MyAlias (0..1)
  `;
  const output = emitZod(source, 'Foo');
  expect(output).toContain('bar: BarSchema.optional()');
  expect(output).not.toContain('z.unknown()');
});
```

(Adapt the exact helper name/assertion style to match this suite's existing conventions — read
`packages/codegen/test/emit/zod-emitter.test.ts` fully before writing these two cases; use its own
`emit`/`generate`-style helper and its own cardinality/optional-wrapping convention rather than
guessing `.optional()` if the suite already has a documented pattern for that.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/emit/zod-emitter.test.ts -t "type-alias"`
Expected: FAIL — output contains `z.unknown()` instead of the expected validator

- [ ] **Step 3: Migrate `resolveTypeExpr`**

Read the current `resolveTypeExpr` (Task 2 will have shifted its line numbers slightly) and replace
its body with a call to the resolver, using a local visitor built from the SAME rendering logic the
current implementation already has:

```ts
  private resolveTypeExpr(attr: Attribute): string {
    return resolveTypeCallTarget(
      attr.typeCall,
      this.ctx,
      {
        onPrimitive: (basicTypeName) => {
          const mapped = this.ctx.builtinTypeMap[basicTypeName];
          if (mapped) return mapped;
          this.reportUnresolvedReference(attr.name, basicTypeName, 'z.unknown()');
          return 'z.unknown()';
        },
        onEnum: (node) => `${node.name}Schema`,
        onData: (node) => `${node.name}Schema`,
        onChoice: (node) => `${node.name}Schema`,
        onUnresolved: (refText) => {
          if (refText) {
            this.reportUnresolvedReference(attr.name, refText, `${refText}Schema (optimistic)`);
            return `${refText}Schema`;
          }
          this.reportUnresolvedReference(attr.name, undefined, 'z.unknown()');
          return 'z.unknown()';
        }
      },
      this.ctx.sourceUri ?? ''
    );
  }
```

Note the `onUnresolved` branch preserves the ORIGINAL two-message distinction (named-but-unresolved
→ "optimistic schema reference" warning + `${refText}Schema`; truly anonymous → plain warning +
`z.unknown()`) — read the pre-migration code at this file's current `resolveTypeExpr` one more time
immediately before writing this to confirm the exact original message wording is preserved
verbatim via `reportUnresolvedReference`'s `fallbackDescription` composing correctly; if
`this.ctx.sourceUri` is not a real field on this emitter's `EmissionContext` (check — some emitters
may not have a single "current sourceUri" concept at the call site), pass `this.model.namespace`'s
resolved source path or whatever the file's existing Data/Choice `typeRef.$container...` fallback
already used before migration, so behavior for the source-URI fallback doesn't change.

Also confirm and migrate `resolveTypeExprAsTs` (`zod-emitter.ts:783-815`, used for TS-annotated
z.infer helper types) — read it fully first; if it duplicates the same isRosettaBasicType →
isRosettaEnumeration → isData → isChoice chain, migrate it the same way with its own visitor
(TypeScript type strings, not Zod validator strings). If it delegates to `resolveTypeExpr` or a
shared helper already, no change needed there beyond what Step 3 already did — verify by reading,
don't assume either way.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/emit/zod-emitter.test.ts`
Expected: PASS, full existing suite plus the 2 new cases (no regressions in already-passing cases)

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/emit/zod-emitter.ts packages/codegen/test/emit/zod-emitter.test.ts
git commit -m "fix(codegen): zod-emitter resolves type-alias field references via shared resolver"
```

---

### Task 4: Migrate `ts-emitter.ts`

**Files:**
- Modify: `packages/codegen/src/emit/ts-emitter.ts:416-451` (`resolveTypeExprAsTs`; re-read first —
  line numbers shift after Task 2)
- Test: `packages/codegen/test/emit/ts-emitter.test.ts` (confirm exact path by reading the directory)

**Interfaces:**
- Consumes: `resolveTypeCallTarget`, `TypeResolutionVisitor` (Task 1); `this.diagnostics`,
  `this.reportUnresolvedReference` (Task 2).

- [ ] **Step 1: Write the failing tests**

Same two-case shape as Task 3 (type-alias-to-primitive, type-alias-to-Data), adapted to this suite's
existing helper and asserting the correct TypeScript type string (e.g. `bar?: string;` /
`bar?: Bar;`) instead of a Zod validator. Read `packages/codegen/test/emit/ts-emitter.test.ts` fully
first to match its exact conventions before writing.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/emit/ts-emitter.test.ts -t "type-alias"`
Expected: FAIL

- [ ] **Step 3: Migrate `resolveTypeExprAsTs`**

Replace the body with a call to the resolver, preserving this file's existing rendering (`typeRef.name`
for Enum/Data/Choice, `this.ctx.builtinTypeMap[...]` for primitives, and — note this file's current
`!typeRef` fallback at line ~424 just returns `refText` directly rather than checking
`enumByName`/`dataByName`/`choiceByName` the way zod/json-schema/xsd do; confirm by re-reading
whether that's intentional (TS just needs a type NAME, not a kind) before deciding whether to keep
that more-permissive shortcut or align it with the resolver's stricter refText-against-namespace-index
lookup — if aligning, the two new test cases plus the full existing suite are the safety net):

```ts
  private resolveTypeExprAsTs(attr: Attribute): string {
    return resolveTypeCallTarget(
      attr.typeCall,
      this.ctx,
      {
        onPrimitive: (basicTypeName) => {
          const mapped = this.ctx.builtinTypeMap[basicTypeName];
          if (mapped) return mapped;
          this.reportUnresolvedReference(attr.name, basicTypeName, 'unknown');
          return 'unknown';
        },
        onEnum: (node) => node.name,
        onData: (node) => node.name,
        onChoice: (node) => node.name,
        onUnresolved: (refText) => {
          if (refText) return refText; // preserves this file's existing permissive refText shortcut
          this.reportUnresolvedReference(attr.name, undefined, 'unknown');
          return 'unknown';
        }
      },
      this.ctx.sourceUri ?? ''
    );
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/emit/ts-emitter.test.ts`
Expected: PASS, no regressions

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/emit/ts-emitter.ts packages/codegen/test/emit/ts-emitter.test.ts
git commit -m "fix(codegen): ts-emitter resolves type-alias field references via shared resolver"
```

---

### Task 5: Migrate `json-schema-emitter.ts`

**Files:**
- Modify: `packages/codegen/src/emit/json-schema-emitter.ts:333-405` (`resolveItemSchema`; re-read
  first)
- Test: `packages/codegen/test/emit/json-schema-emitter.test.ts` (confirm exact path)

**Interfaces:**
- Consumes: `resolveTypeCallTarget`, `TypeResolutionVisitor` (Task 1); `this.diagnostics`,
  `this.reportUnresolvedReference` (Task 2).

- [ ] **Step 1: Write the failing tests**

Same two-case shape, asserting the correct `{ $ref: '#/$defs/Bar' }` / primitive schema object
instead of `{}`. Read the existing suite fully first.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/emit/json-schema-emitter.test.ts -t "type-alias"`
Expected: FAIL

- [ ] **Step 3: Migrate `resolveItemSchema`**

```ts
  private resolveItemSchema(attr: Attribute): object {
    return resolveTypeCallTarget(
      attr.typeCall,
      this.ctx,
      {
        onPrimitive: (basicTypeName) => {
          const mapped = this.ctx.builtinTypeMap[basicTypeName];
          if (mapped) return mapped;
          this.reportUnresolvedReference(attr.name, basicTypeName, '{}');
          return {};
        },
        onEnum: (node) => ({ $ref: `#/$defs/${node.name}` }),
        onData: (node) => ({ $ref: `#/$defs/${node.name}` }),
        onChoice: (node) => ({ $ref: `#/$defs/${node.name}` }),
        onUnresolved: (refText) => {
          this.reportUnresolvedReference(attr.name, refText, '{}');
          return {};
        }
      },
      this.ctx.sourceUri ?? ''
    );
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/emit/json-schema-emitter.test.ts`
Expected: PASS, no regressions

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/emit/json-schema-emitter.ts packages/codegen/test/emit/json-schema-emitter.test.ts
git commit -m "fix(codegen): json-schema-emitter resolves type-alias field references via shared resolver"
```

---

### Task 6: Migrate `xsd-emitter.ts`

**Files:**
- Modify: `packages/codegen/src/emit/xsd-emitter.ts:351-393` (`resolveAttributeType`; re-read first)
- Test: `packages/codegen/test/emit/xsd-emitter.test.ts` (confirm exact path)

**Interfaces:**
- Consumes: `resolveTypeCallTarget`, `TypeResolutionVisitor` (Task 1); `this.diagnostics`,
  `this.reportUnresolvedReference` (Task 2 — this file already used `this.diagnostics` directly
  pre-migration, so only the resolver-call migration applies here, not a storage change).

- [ ] **Step 1: Write the failing tests**

Same two-case shape, asserting the correct `xs:string`/`Bar` type name instead of `xs:string`
fallback-with-warning. Read the existing suite fully first — note this emitter's own existing
primitive fallback ALSO happens to render `xs:string`, so the alias-to-primitive case must assert
on the ABSENCE of the accompanying diagnostic/warning (or on a distinguishing detail), not merely
the output string, to actually prove the fix; check what diagnostic assertion style this suite
already uses for its "warns but degrades" cases and mirror that for a before/after distinction —
or use a type-alias-to-non-string primitive (e.g. `typeAlias MyAlias: int`) so the expected/wrong
outputs genuinely differ (`xs:int` fixed vs. `xs:string` fallback), which is the cleaner assertion.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/emit/xsd-emitter.test.ts -t "type-alias"`
Expected: FAIL

- [ ] **Step 3: Migrate `resolveAttributeType`**

```ts
  private resolveAttributeType(attr: Attribute): string {
    return resolveTypeCallTarget(
      attr.typeCall,
      this.model,
      {
        onPrimitive: (basicTypeName) => {
          const mapped = XSD_BUILTIN_TYPE_MAP[basicTypeName];
          if (mapped) return `xs:${mapped}`;
          this.reportUnresolvedReference(attr.name, basicTypeName, 'xs:string');
          return 'xs:string';
        },
        onEnum: (node) => node.name,
        onData: (node) => node.name,
        onChoice: (node) => node.name,
        onUnresolved: (refText) => {
          this.reportUnresolvedReference(attr.name, refText, 'xs:string');
          return 'xs:string';
        }
      },
      this.model.sourceUri ?? ''
    );
  }
```

(This file's field is named `this.model`, not `this.ctx` — confirm the exact field name by reading
the constructor before writing; `XSD_BUILTIN_TYPE_MAP` is this file's existing module-level constant,
unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/emit/xsd-emitter.test.ts`
Expected: PASS, no regressions

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/emit/xsd-emitter.ts packages/codegen/test/emit/xsd-emitter.test.ts
git commit -m "fix(codegen): xsd-emitter resolves type-alias field references via shared resolver"
```

---

### Task 7: Migrate `sql-emitter.ts`

**Files:**
- Modify: `packages/codegen/src/emit/sql-emitter.ts:162-216` (inline resolution block inside
  `emitData`; re-read first)
- Test: `packages/codegen/test/emit/sql-emitter.test.ts` (confirm exact path)

**Interfaces:**
- Consumes: `resolveTypeCallTarget`, `TypeResolutionVisitor` (Task 1); `this.diagnostics`,
  `this.reportUnresolvedReference` (Task 2 — already used `this.diagnostics` directly, no storage
  change here).

This is the one call site whose existing shape ISN'T a simple "return a string/object" resolver —
it has three genuinely different SQL modeling outcomes (FK column + constraint, enum CHECK column,
or plain scalar column) plus a multi-valued join-table branch decided BEFORE type resolution even
runs. The resolver still applies: it only replaces the "what target kind is this attribute" decision
(today done via ad hoc `ref && isData(ref)` / `ref && isRosettaEnumeration(ref)` / neither checks),
not the SQL-modeling branches built on top of that decision.

- [ ] **Step 1: Write the failing tests**

```ts
it('emits a scalar column for a type-alias-to-primitive attribute', () => {
  const source = `
    namespace test
    typeAlias Amount: number
    type Foo:
      amount Amount (0..1)
  `;
  const ddl = emitSql(source, 'Foo'); // this suite's existing helper — confirm exact name by reading
  expect(ddl).toMatch(/"amount"\s+(DECIMAL|NUMERIC|REAL)/i); // whatever this dialect's number column type is
  expect(ddl).not.toContain('did not resolve');
});

it('emits an FK column for a type-alias-to-Data attribute', () => {
  const source = `
    namespace test
    type Bar:
      x string (0..1)
    typeAlias MyAlias: Bar
    type Foo:
      bar MyAlias (0..1)
  `;
  const ddl = emitSql(source, 'Foo');
  expect(ddl).toContain('FOREIGN KEY ("bar_id") REFERENCES "Bar" ("id")');
});
```

(Read `packages/codegen/test/emit/sql-emitter.test.ts` fully first — match its exact dialect/helper
conventions, including whichever of the two dialects it defaults to for column-type assertions.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/emit/sql-emitter.test.ts -t "type-alias"`
Expected: FAIL — alias-to-Data currently emits a plain scalar column (missing FK), alias-to-primitive
falls back to the dialect's default string/text column instead of the number column

- [ ] **Step 3: Migrate the inline resolution block**

Read `emitData`'s current per-attribute loop (`sql-emitter.ts:162-216`) fully first — this replaces
the `ref`/`refData`/`enumNode`/`builtin` local-variable derivation at the top of the loop body with
a single resolver call producing an equivalent discriminated outcome, keeping every downstream
branch (`refData` → FK, `enumNode` → CHECK column, else → scalar) unchanged:

```ts
      type ResolvedAttrKind =
        | { kind: 'data'; node: Data }
        | { kind: 'enum'; node: RosettaEnumeration }
        | { kind: 'scalar'; builtin: string | undefined; resolved: boolean };

      const resolved: ResolvedAttrKind = resolveTypeCallTarget(
        attr.typeCall,
        this.model,
        {
          onPrimitive: (basicTypeName) => ({ kind: 'scalar', builtin: basicTypeName, resolved: true }),
          onEnum: (node) => ({ kind: 'enum', node }),
          onData: (node) => ({ kind: 'data', node }),
          onChoice: () => ({ kind: 'scalar', builtin: undefined, resolved: false }), // Choice-typed SQL columns: existing pre-migration behavior — confirm by reading whether Choice was already handled specially here before changing this
          onUnresolved: (refText) => ({ kind: 'scalar', builtin: refText, resolved: false })
        },
        this.model.sourceUri ?? ''
      );

      if (upper === null || upper > 1) {
        this.joinTables.push(this.buildJoinTable(data.name, attr.name, resolved.kind === 'data' ? resolved.node : undefined, resolved.kind === 'enum' ? resolved.node : undefined, ref, refText));
        continue;
      }

      if (resolved.kind === 'data') {
        const fkCol = uniqueCol(`${attr.name}_id`);
        cols.push(`${q(fkCol)} ${fkType}${notNull}`);
        constraints.push(`FOREIGN KEY (${q(fkCol)}) REFERENCES ${q(resolved.node.name)} (${q('id')})`);
      } else if (resolved.kind === 'enum') {
        this.flagEnumTableFallback();
        const col = uniqueCol(attr.name);
        cols.push(`${q(col)} ${this.dialect.columnType('string')}${notNull}`);
        const names = SqlNamespaceEmitter.allEnumValueNames(resolved.node);
        if (names.length > 0) {
          constraints.push(`CHECK (${q(col)} IN (${SqlNamespaceEmitter.sqlEnumLiterals(names)}))`);
        } else {
          this.flagEmptyEnum(resolved.node.name);
        }
      } else {
        const builtin = resolved.builtin ? (this.dialect.isKnownBuiltin(resolved.builtin) ? resolved.builtin : undefined) : undefined;
        if (!resolved.resolved || !builtin) {
          this.reportUnresolvedReference(attr.name, resolved.builtin, this.dialect.columnType('string'));
        }
        const col = uniqueCol(attr.name);
        cols.push(`${q(col)} ${this.dialect.columnType(builtin || 'string')}${notNull}`);
      }
```

**Read the pre-migration code one more time immediately before writing this** — in particular
confirm (a) whether `buildJoinTable`'s existing signature genuinely wants a possibly-undefined
`refData`/`enumNode` pair the way shown above (this plan infers it from the original call at line
177, but verify field order/types against the real function signature), and (b) whether Choice-typed
attributes had ANY pre-existing special SQL handling before this migration (the plan above assumes
none, based on the original code never checking `isChoice` in this block — if that assumption is
wrong, preserve whatever the original behavior actually was instead of what's shown here).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/emit/sql-emitter.test.ts`
Expected: PASS, no regressions in join-table/FK/enum-CHECK behavior for the already-working cases

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/emit/sql-emitter.ts packages/codegen/test/emit/sql-emitter.test.ts
git commit -m "fix(codegen): sql-emitter resolves type-alias field references via shared resolver"
```

---

### Task 8: Migrate `preview-schema.ts` (the production bug's actual call site)

**Files:**
- Modify: `packages/codegen/src/preview-schema.ts` — `buildBaseField` (currently ~line 901-986),
  `buildChoiceOptionField` (currently ~line 672-862), `buildTypeAliasSchema`'s "resolves to Data"
  branch (currently ~line 506-591). Re-read the whole file first — line numbers will have shifted
  from earlier tasks' unrelated edits elsewhere in the package, though this file itself is untouched
  by Tasks 1–7.
- Test: `packages/codegen/test/preview-schema.test.ts`

**Interfaces:**
- Consumes: `resolveTypeCallTarget`, `TypeResolutionVisitor` (Task 1). Does NOT consume
  `reportUnresolvedReference` — this file keeps its own `unsupportedFeatures: Set<string>` +
  `PreviewField` diagnostic model (per the design's explicit Non-Goal), so its `onUnresolved`
  implementation calls `ctx.unsupportedFeatures.add(...)` and returns an `unknown`-kind
  `PreviewField` directly, not the base-class helper.

- [ ] **Step 1: Write the failing test**

```ts
it('resolves a field typed via a type-alias-to-primitive (the SignatureType/HMACOutputLengthType production bug)', () => {
  const source = `
    namespace test
    typeAlias HMACOutputLengthType: int
    type SignatureMethodType:
      hmacOutputLength HMACOutputLengthType (0..1)
  `;
  const schemas = generatePreviewSchemas(parseToDocs(source)); // this suite's existing helper — confirm exact name
  const schema = schemas.find((s) => s.targetId === 'test.SignatureMethodType')!;
  const field = schema.fields.find((f) => f.path === 'hmacOutputLength')!;
  expect(field.kind).toBe('number');
  expect(schema.status).toBe('ready');
  expect(schema.unsupportedFeatures).toBeUndefined();
});

it('resolves a field typed via a type-alias-to-Data', () => {
  const source = `
    namespace test
    type DigestValueType:
      x string (0..1)
    typeAlias DigestAlias: DigestValueType
    type Foo:
      bar DigestAlias (0..1)
  `;
  const schemas = generatePreviewSchemas(parseToDocs(source));
  const schema = schemas.find((s) => s.targetId === 'test.Foo')!;
  const field = schema.fields.find((f) => f.path === 'bar')!;
  expect(field.kind).toBe('object');
  expect(schema.status).toBe('ready');
});
```

(Read `packages/codegen/test/preview-schema.test.ts` fully first — it already has a `parseToDocs`
or equivalent multi-document parse helper given the file's own multi-namespace tests; match its
exact conventions rather than guessing the helper name.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/preview-schema.test.ts -t "type-alias"`
Expected: FAIL — `field.kind` is `'unknown'`, `schema.status` is `'unsupported'`

- [ ] **Step 3: Migrate `buildBaseField`**

Read the current `buildBaseField` (the field's precedence chain: primitive → enum(typeRef) →
enum(refText) → data(typeRef) → data(refText) → choice(typeRef) → choice(refText) → unresolved
fallthrough) and replace its body with:

```ts
function buildBaseField(attr: Attribute, ctx: FieldContext): PreviewField {
  return resolveTypeCallTarget(
    attr.typeCall,
    ctx.namespace,
    {
      onPrimitive: (basicTypeName) => {
        const kind = BUILTIN_KIND_MAP[basicTypeName];
        if (kind) return scalarField(ctx, kind);
        ctx.unsupportedFeatures.add(`unresolved-reference:${basicTypeName}`);
        return unsupportedField(ctx, `Type reference ${basicTypeName} could not be resolved for form preview.`);
      },
      onEnum: (node) => enumField(ctx, node),
      onData: (node, sourceUri) => objectField(ctx, node, sourceUri),
      onChoice: (node, sourceUri) => choiceField(ctx, node, sourceUri),
      onUnresolved: (refText) => {
        ctx.unsupportedFeatures.add(`unresolved-reference:${refText ?? attr.name}`);
        return unsupportedField(
          ctx,
          refText ? `Type reference ${refText} could not be resolved for form preview.` : undefined
        );
      }
    },
    ctx.sourceUri
  );
}
```

Confirm `scalarField`/`enumField`/`objectField`/`choiceField`/`unsupportedField` (this file's
existing small rendering helpers) keep their current signatures — they're reused unchanged, only
`buildBaseField`'s own dispatch logic is replaced.

- [ ] **Step 4: Migrate `buildChoiceOptionField`**

Same transformation applied to `buildChoiceOptionField`'s type-resolution section (its own
primitive/enum/data precedence chain, currently ~lines 707-862) — replace with the equivalent
`resolveTypeCallTarget` call, preserving this function's own field-shape building (`path`/`label`
computed from `optionTypeName` BEFORE the resolver call, unchanged; only the "what kind is this and
what does its object-expansion recursion state look like" dispatch moves to the resolver's
visitor). Read the full current function before writing the replacement — its Data branch has
additional cycle/seenTypes/depth logic (lines 768-852) that must be preserved verbatim inside the
new `onData` callback, not simplified away.

- [ ] **Step 5: Migrate `buildTypeAliasSchema`'s Data-resolution branch**

`buildTypeAliasSchema` (the function invoked when a Type Alias is itself the top-level navigation
target, e.g. Form Preview's "resolving state" verification in Task 9) currently re-derives
`resolvedData` via its own `(typeRef && isData(typeRef) ? typeRef : undefined) ?? (refText ?
namespace.dataByName.get(refText)?.node : undefined)` at line ~534. Replace just that
resolution step (not the whole function) with a call to the SAME resolver, reusing its existing
`onData`/`onPrimitive` branches (already present above it in the function) as visitor callbacks —
this collapses `buildTypeAliasSchema`'s own resolution duplication too, per the design's stated
goal, without changing this function's already-correct primitive/Data output shape.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/preview-schema.test.ts`
Expected: PASS, full existing suite plus the 2 new cases

- [ ] **Step 7: Commit**

```bash
git add packages/codegen/src/preview-schema.ts packages/codegen/test/preview-schema.test.ts
git commit -m "fix(codegen): preview-schema resolves type-alias field references via shared resolver"
```

---

### Task 9: Live verification (post-merge/post-deploy)

**Files:** none — this task is manual verification, not code. It only runs after Tasks 1–8 are
merged AND deployed to production (the FpML curated corpus this bug depends on is real production
data, not available in local test fixtures), so it cannot be a normal PR-gate task.

**Interfaces:** none.

- [ ] **Step 1: Confirm deployment**

After merge, check the Cloudflare Pages `daikonic-dev` project's latest production deployment's
commit hash matches the merge commit (same method used earlier this session: query the Pages
project's deployments filtered to `environment === 'production'`, confirm `commit_hash` and
`aliases` include `https://www.daikonic.dev`).

- [ ] **Step 2: Re-run the original repro via Playwright**

Navigate to `https://www.daikonic.dev/rune-studio/studio/`, load the "FpML (Rune)" reference model,
use the Type Explorer's filter box to find `SignatureType` under `fpml.consolidated`, navigate to
it, and inspect the Form Preview panel.

Expected: `Hmac Output Length` renders as a real number field, no `"Type reference
HMACOutputLengthType could not be resolved..."` status text, and no `unresolved-reference:` entries
in `Unsupported preview features` (the `recursive-reference:` entries for `DSAKeyValueType` etc.
are a separate, unrelated, correctly-working depth-cap feature — those are expected to remain).

- [ ] **Step 3: Verify Prototype instance-editing propagation**

From the same loaded `SignatureType`, use whatever UI path exercises `instance:generateSchema`
(the Prototype/instance-authoring surface — confirm the exact navigation path by checking
`apps/studio/src/shell/ExplorePerspective.tsx` or the Prototype perspective's entry point for how it
triggers an instance form for a selected type) and confirm the instance-editing form also shows a
real `hmacOutputLength` field instead of an unresolved one — proving the propagation claim from the
design doc (this surface calls the same `generatePreviewSchemas` function Task 8 fixed, so no
separate code change was needed for it to benefit).

- [ ] **Step 4: Verify Export Code propagation**

From the same loaded model, open the Code tab (or Export Code) for the `zod`/`typescript` targets
covering `SignatureMethodType`, and confirm the generated output has a real `hmacOutputLength`
field type (`z.number()` / `number`, not `z.unknown()` / `unknown`) — proving the `generate()`
propagation claim (this surface calls `zod-emitter.ts`/`ts-emitter.ts`, both fixed in Tasks 3–4).

- [ ] **Step 5: Report result**

No commit for this task — it's a verification checkpoint. If any of Steps 2–4 fail, that's a real
regression or an incomplete migration in one of Tasks 3/4/8 that must be root-caused and fixed
(reopen the relevant task, do not patch around it here) before considering this plan complete.
