# Prototype Workspace — Phase 1 (Instance Authoring + JSON I/O) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a "Prototype" perspective in Rune Studio where a user creates, edits, imports, and exports named instances of Rune model types (data types and choices), with unbounded-depth field authoring, real validation (structure + conditions), and JSON/bundle import-export — the smallest slice of the Prototype Workspace spec that stands alone as working software.

**Architecture:** MIT `@rune-langium/codegen` gains an `./instances` subpath: a lazy field resolver that extends the existing `preview-schema.ts` recursive walk instead of duplicating it, a condition-predicate extractor that reuses the existing expression transpiler, bundle/manifest types, and a plain-JSON import codec. FSL `apps/studio` gains a 6th perspective (`prototype`) with three panels backed by a new zustand `instance-store`, OPFS persistence under the already-reserved `.studio/` namespace, a new `createTarGz` (the codebase currently only has extraction), and a new `instance:validate` codegen-worker message that runs structural checks plus worker-executed condition predicates — never eval'ing a full generated Zod module.

**Tech Stack:** TypeScript 5.9 strict/ESM, Zod v4, zustand 5, React 19, Vitest, `pako` (existing dependency, gzip/inflate), Web Crypto (`crypto.subtle`).

**Design doc:** `docs/superpowers/specs/2026-07-13-prototype-workspace-phase1-design.md` (023-studio-prototype-workspace, Phase 1 of the original Prototype Workspace feature spec).

## Global Constraints

- **Licensing header**: every new file under `packages/codegen/` gets `// SPDX-License-Identifier: MIT`; every new file under `apps/studio/` gets `// SPDX-License-Identifier: FSL-1.1-ALv2` plus `// Copyright (c) 2026 Pradeep Mouli` (match the header already on `apps/studio/src/opfs/opfs-fs.ts` and `apps/studio/src/services/model-registry.ts`).
- **No eval of a full generated Zod module.** `specs/016-studio-form-preview/research.md` rejected this for security/bundling reasons; this plan never revisits that call. Condition checks run via `transpileCondition`'s plain boolean-predicate strings, executed the same way `dispatchExecute` already runs transpiled function bodies — not via dynamic `import()` of generated `.ts` source.
- **`.studio/` is reserved, not `files/`.** Instance data lives under `.studio/instances/`, never inside the git-tracked `files/` working tree (per `specs/012-studio-workspace-ux/data-model.md:138-155`).
- **Zero duplicated attribute-walking logic.** The lazy resolver extends `buildField`/`buildBaseField`/`objectField` in `packages/codegen/src/preview-schema.ts`; it does not reimplement Rosetta type dispatch.
- **Every new codegen subpath export follows the existing pattern** in `packages/codegen/package.json`'s `exports` map (`"./instances"` alongside `"./export"`, `"./import"`, `"./rosetta"`, `"./lens"`).
- **Unknown fields are preserved by default on both import and export** (opt-in stripping only) — never silently drop data.
- **CDM smoke tests are gated/skipped when `.resources/` is absent**, per existing repo convention (`packages/codegen/test/cdm-smoke.test.ts` already does this).

---

## File Structure

**MIT — `packages/codegen/src/instances/`** (new directory, one new subpath export `./instances`):
- `fingerprint.ts` — `sha256Hex()`, ported from `apps/curated-mirror-worker/src/manifest.ts:68-75`.
- `resolve-fields.ts` — `resolveFields(typeFqn, path, docs)`, the lazy one-level-at-a-time field walker.
- `condition-predicates.ts` — `getActiveConditionPredicates(data)`, reusing `transpileCondition`.
- `bundle.ts` — `InstanceRecord`, `BundleManifest` types + `serializeManifest`/`parseManifest`.
- `json-codec.ts` — `ImportCodec` interface + the `jsonCodec` implementation.
- `index.ts` — barrel re-exporting the above (the package's root barrel stays intentionally empty; this is a dedicated subpath like `./export`/`./import`).

**Modified (MIT):**
- `packages/codegen/src/preview-schema.ts` — export `FieldContext`, `buildField`, `buildNamespaceIndexes`, `NamespaceIndex` (currently module-private); add a `lazy?: boolean` flag threaded through `FieldContext` so `objectField`'s depth-ceiling branch emits an expandable stub instead of an `unknown` stub when lazy.
- `packages/codegen/src/emit/zod-emitter.ts` — promote the private `buildTranspilerContext` method to a standalone exported function `buildConditionTranspilerContext` in `base-namespace-emitter.ts` (both the emitter and the new `condition-predicates.ts` call it — one implementation, not two).
- `packages/codegen/package.json` — add the `"./instances"` exports entry.

**FSL — new files under `apps/studio/src/`:**
- `opfs/tar-untar.ts` — add `createTarGz()` (currently extraction-only).
- `opfs/instances-fs.ts` — `.studio/instances/` read/write/index helpers.
- `store/instance-store.ts` — zustand store (CRUD + validation dispatch + staleness).
- `shell/perspectives/prototype-chrome.tsx` — `PrototypeActions` (mirrors `explore-chrome.tsx`'s pattern).
- `shell/panels/InstanceExplorerPanel.tsx`, `InstanceFormPanel.tsx`, `InstanceInspectorPanel.tsx`, `InstanceFunctionPanel.tsx` (thin wrapper reusing `FormPreviewPanel`'s function-execution UI).

**Modified (FSL):**
- `shell/perspectives/perspective-types.ts` — `PerspectiveId` gains `'prototype'`.
- `shell/perspectives/perspective-registry.ts` — 6th entry.
- `workers/codegen-worker.ts` — new `instance:validate` message type + handler.
- `services/codegen-service.ts` — `createInstanceValidateMessage`, `dispatchValidateInstance`, result typing.

---

### Task 1: Model-fingerprint helper (MIT)

**Files:**
- Create: `packages/codegen/src/instances/fingerprint.ts`
- Test: `packages/codegen/test/instances/fingerprint.test.ts`

**Interfaces:**
- Produces: `sha256Hex(bytes: Uint8Array): Promise<string>` — consumed by Task 4 (bundle manifest) and, later, by the studio's bundle-export/import wiring.

- [ ] **Step 1: Write the failing test**

```ts
// packages/codegen/test/instances/fingerprint.test.ts
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/instances/fingerprint.js';

describe('sha256Hex', () => {
  it('hashes bytes to a stable hex digest', async () => {
    const bytes = new TextEncoder().encode('hello world');
    const hex = await sha256Hex(bytes);
    expect(hex).toBe('b94d27b9934d3e08a52e52d7da7dacefbd54873861cf1e34a15b9f7f5c4e1a4d0'.slice(0, 64));
  });

  it('produces different digests for different input', async () => {
    const a = await sha256Hex(new TextEncoder().encode('a'));
    const b = await sha256Hex(new TextEncoder().encode('b'));
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/codegen test -- src/instances/fingerprint.test.ts`
Expected: FAIL — `Cannot find module '../../src/instances/fingerprint.js'`

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/codegen/src/instances/fingerprint.ts
// SPDX-License-Identifier: MIT

/**
 * SHA-256 hex digest via Web Crypto (`crypto.subtle`) — available
 * identically in browsers and Cloudflare Workers, no Node dependency.
 * Mirrors apps/curated-mirror-worker/src/manifest.ts's sha256Hex.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const dataBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const buf = await crypto.subtle.digest('SHA-256', dataBuffer as ArrayBuffer);
  const arr = new Uint8Array(buf);
  let hex = '';
  for (const b of arr) hex += b.toString(16).padStart(2, '0');
  return hex;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/codegen test -- src/instances/fingerprint.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Create the `instances` barrel and wire the package export**

```ts
// packages/codegen/src/instances/index.ts
// SPDX-License-Identifier: MIT
export { sha256Hex } from './fingerprint.js';
```

In `packages/codegen/package.json`, add to `exports` (alongside `"./export"`, `"./import"`):

```json
"./instances": {
  "types": "./dist/src/instances/index.d.ts",
  "default": "./dist/src/instances/index.js"
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/codegen/src/instances/fingerprint.ts packages/codegen/src/instances/index.ts packages/codegen/test/instances/fingerprint.test.ts packages/codegen/package.json
git commit -m "feat(codegen): add sha256Hex fingerprint helper for instance bundles"
```

---

### Task 2: Export `preview-schema.ts` internals + lazy mode on the depth ceiling (MIT)

**Files:**
- Modify: `packages/codegen/src/preview-schema.ts:52-62` (`FieldContext`), `:589-619` (`objectField`)
- Test: `packages/codegen/test/preview-schema.test.ts` (existing file — add cases, do not create a new one)

**Interfaces:**
- Consumes: nothing new — this task only widens visibility and adds one optional field to an existing internal type.
- Produces: `FieldContext` (now exported, gains `lazy?: boolean`), `buildField`, `buildNamespaceIndexes`, `NamespaceIndex` (now exported) — consumed by Task 3 (`resolve-fields.ts`).

- [ ] **Step 1: Write the failing test** (bounded behavior must be provably unchanged, and the new lazy stub shape proven)

```ts
// add to packages/codegen/test/preview-schema.test.ts
import { buildField } from '../src/preview-schema.js';
// (NamespaceIndex / FieldContext are exported for Task 3's consumption;
// this test exercises objectField indirectly through buildField.)

it('lazy mode emits an expandable object stub at the depth ceiling instead of unknown', () => {
  const seenTypes = new Set(['Root']);
  const ctx = {
    namespace: { dataByName: new Map(), typeAliasByName: new Map(), choiceByName: new Map(), funcByName: new Map(), duplicateDataNames: new Set(), namespace: 'test' } as never,
    unsupportedFeatures: new Set<string>(),
    sourceMap: [],
    sourceUri: 'file:///test.rosetta',
    maxDepth: 0,
    depth: 0,
    path: 'child',
    label: 'Child',
    seenTypes,
    lazy: true
  };
  // objectField is exercised through the public buildField/buildBaseField path in
  // the existing 'recursive type at depth ceiling' fixture already in this file —
  // this case only asserts the NEW lazy branch's shape:
  expect(ctx.lazy).toBe(true); // placeholder assertion replaced by the real
  // objectField-boundary fixture below once objectField is exported in Step 3.
});
```

(This step is intentionally thin — `objectField` is currently module-private, so the real assertion is written in Step 4 once it is exported.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/codegen test -- src/preview-schema.test.ts`
Expected: PASS trivially (the placeholder assertion is true) — this confirms the harness runs; the REAL regression check is Step 4's fixture, written after export.

- [ ] **Step 3: Widen `FieldContext` and export the internals Task 3 needs**

In `packages/codegen/src/preview-schema.ts`, change:

```ts
interface FieldContext {
```

to:

```ts
export interface FieldContext {
```

and add one field:

```ts
  seenTypes: Set<string>;
  /** When true, a depth-ceiling object field becomes an expandable stub instead of an 'unknown' stub. Used by the lazy resolver (instances/resolve-fields.ts) — absent/false preserves today's bounded generatePreviewSchemas() behavior exactly. */
  lazy?: boolean;
}
```

Change `function buildField` → `export function buildField`, `function buildNamespaceIndexes` → `export function buildNamespaceIndexes`, and `interface NamespaceIndex` → `export interface NamespaceIndex` (find these via the existing symbol locations — `buildNamespaceIndexes` at line 132, `NamespaceIndex` wherever it's declared just above it).

- [ ] **Step 4: Update `objectField`'s depth-ceiling branch and write the real regression test**

In `objectField` (line 589), change:

```ts
  if (ctx.seenTypes.has(data.name) || ctx.depth >= ctx.maxDepth) {
    ctx.unsupportedFeatures.add(`recursive-reference:${data.name}`);
    return {
      path: ctx.path,
      label: ctx.label,
      kind: 'unknown',
      required: true,
      description: `Recursive reference to ${data.name} is not expanded in form preview.`
    };
  }
```

to:

```ts
  if (ctx.seenTypes.has(data.name) || ctx.depth >= ctx.maxDepth) {
    if (ctx.lazy) {
      return {
        path: ctx.path,
        label: ctx.label,
        kind: 'object',
        required: true,
        expandable: true
      };
    }
    ctx.unsupportedFeatures.add(`recursive-reference:${data.name}`);
    return {
      path: ctx.path,
      label: ctx.label,
      kind: 'unknown',
      required: true,
      description: `Recursive reference to ${data.name} is not expanded in form preview.`
    };
  }
```

Add `expandable?: boolean` to the `object`-kind branch of the `PreviewField` union in `packages/codegen/src/types.ts` (find the object-kind field interface, sibling to `PreviewEnumField`/`PreviewUnknownField`).

Now replace the Step 1 placeholder test with the real fixture:

```ts
it('lazy mode emits an expandable object stub at the depth ceiling, bounded mode still emits unknown', () => {
  // Two Data types, A -> B -> A (cycle), maxDepth: 1 forces the ceiling on B's nested A.
  const [schemaBounded] = generatePreviewSchemas(parseFixture(CYCLIC_FIXTURE), { maxDepth: 1 });
  const nested = findFieldByPath(schemaBounded.fields, 'b.a');
  expect(nested?.kind).toBe('unknown');

  const lazySchema = buildField(getAttr(CYCLIC_FIXTURE, 'a'), { ...baseCtx, maxDepth: 1, lazy: true });
  expect(lazySchema.kind === 'object' ? (lazySchema as { expandable?: boolean }).expandable : undefined).toBe(true);
});
```

(`CYCLIC_FIXTURE`, `parseFixture`, `findFieldByPath`, `getAttr`, and `baseCtx` are existing test helpers already used elsewhere in this file for the pre-existing 'recursive-reference' fixture — reuse them, do not redefine.)

- [ ] **Step 5: Run the full preview-schema suite**

Run: `pnpm --filter @rune-langium/codegen test -- src/preview-schema.test.ts`
Expected: PASS, including every pre-existing test (the bounded/`generatePreviewSchemas` path is unchanged — `lazy` defaults to falsy).

- [ ] **Step 6: Commit**

```bash
git add packages/codegen/src/preview-schema.ts packages/codegen/src/types.ts packages/codegen/test/preview-schema.test.ts
git commit -m "feat(codegen): add lazy mode to the field-context walk for on-demand resolution"
```

---

### Task 3: `resolveFields` — the lazy field resolver entry point (MIT)

**Files:**
- Create: `packages/codegen/src/instances/resolve-fields.ts`
- Test: `packages/codegen/test/instances/resolve-fields.test.ts`
- Modify: `packages/codegen/src/instances/index.ts` (barrel)

**Interfaces:**
- Consumes: `FieldContext`, `buildField`, `buildNamespaceIndexes`, `NamespaceIndex` from Task 2; `PreviewField` from `packages/codegen/src/types.ts`.
- Produces: `resolveFields(typeFqn: string, path: string[], documents: LangiumDocument[]): PreviewField[]` — consumed by the studio's `InstanceFormPanel` (Task 13).

- [ ] **Step 1: Write the failing test**

```ts
// packages/codegen/test/instances/resolve-fields.test.ts
import { describe, expect, it } from 'vitest';
import { resolveFields } from '../../src/instances/resolve-fields.js';
import { parseTestModel } from '../test-utils.js'; // existing helper used across this test suite

const FIXTURE = `
namespace test.instances

type Root:
  child Child (1..1)

type Child:
  grandchild Root (0..1)
  name string (1..1)
`;

describe('resolveFields', () => {
  it('resolves exactly one level at the top', async () => {
    const docs = await parseTestModel(FIXTURE);
    const fields = resolveFields('test.instances.Root', [], docs);
    expect(fields).toHaveLength(1);
    expect(fields[0]?.path).toBe('child');
    expect(fields[0]?.kind).toBe('object');
    expect((fields[0] as { expandable?: boolean }).expandable).toBe(true);
  });

  it('resolves one more level when given a path', async () => {
    const docs = await parseTestModel(FIXTURE);
    const fields = resolveFields('test.instances.Root', ['child'], docs);
    const names = fields.map((f) => f.path);
    expect(names).toEqual(['child.grandchild', 'child.name']);
  });

  it('does not hang on a recursive type — the cycle re-emits an expandable stub, not an eager loop', async () => {
    const docs = await parseTestModel(FIXTURE);
    const fields = resolveFields('test.instances.Root', ['child', 'grandchild'], docs);
    expect(fields[0]?.kind).toBe('object');
    expect((fields[0] as { expandable?: boolean }).expandable).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/codegen test -- src/instances/resolve-fields.test.ts`
Expected: FAIL — `Cannot find module '../../src/instances/resolve-fields.js'`

- [ ] **Step 3: Write the implementation**

```ts
// packages/codegen/src/instances/resolve-fields.ts
// SPDX-License-Identifier: MIT
import type { LangiumDocument } from 'langium';
import { buildField, buildNamespaceIndexes, type NamespaceIndex } from '../preview-schema.js';
import type { PreviewField } from '../types.js';

function findDataByFqn(namespaces: NamespaceIndex[], typeFqn: string): { data: unknown; sourceUri: string; namespace: NamespaceIndex } | undefined {
  const lastDot = typeFqn.lastIndexOf('.');
  const ns = typeFqn.slice(0, lastDot);
  const name = typeFqn.slice(lastDot + 1);
  const namespace = namespaces.find((n) => n.namespace === ns);
  if (!namespace) return undefined;
  const entry = namespace.dataByName.get(name) ?? namespace.choiceByName.get(name);
  if (!entry) return undefined;
  return { data: (entry as { node: unknown }).node, sourceUri: (entry as { sourceUri: string }).sourceUri, namespace };
}

function navigateToPath(root: unknown, namespace: NamespaceIndex, path: string[]): { data: unknown; depth: number; seenTypes: Set<string> } {
  let current = root;
  const seenTypes = new Set<string>([(current as { name: string }).name]);
  for (const segment of path) {
    const attrs = (current as { attributes: Array<{ name: string; typeCall?: { type?: { ref?: unknown; $refText?: string } } }> }).attributes;
    const attr = attrs.find((a) => a.name === segment);
    if (!attr) throw new Error(`resolveFields: no attribute '${segment}' on type while walking path [${path.join('.')}]`);
    const typeRef = attr.typeCall?.type?.ref ?? namespace.dataByName.get(attr.typeCall?.type?.$refText ?? '')?.node;
    if (!typeRef) throw new Error(`resolveFields: could not resolve type of '${segment}'`);
    current = typeRef;
    seenTypes.add((current as { name: string }).name);
  }
  return { data: current, depth: path.length, seenTypes };
}

/**
 * Resolve exactly one more level of fields below `path` on `typeFqn`.
 * Unlike generatePreviewSchemas()'s bounded eager tree, this never recurses
 * past one level — nested object fields come back as `{ kind: 'object',
 * expandable: true }` stubs; the caller (InstanceFormPanel) calls this again
 * with the deeper path when the user expands that field. Memoization is the
 * caller's responsibility (per-typeFqn, since this function is pure given
 * the same documents).
 */
export function resolveFields(typeFqn: string, path: string[], documents: LangiumDocument[]): PreviewField[] {
  const namespaces = buildNamespaceIndexes(documents);
  const found = findDataByFqn(namespaces, typeFqn);
  if (!found) throw new Error(`resolveFields: unknown type '${typeFqn}'`);

  const { data: rootData, sourceUri, namespace } = found;
  const { data: targetData, depth, seenTypes } = navigateToPath(rootData, namespace, path);
  const attrs = (targetData as { attributes: Array<{ name: string }> }).attributes;

  return attrs.map((attr) =>
    buildField(attr as never, {
      namespace,
      unsupportedFeatures: new Set(),
      sourceMap: [],
      sourceUri,
      maxDepth: depth,
      depth,
      path: [...path, attr.name].join('.'),
      label: attr.name,
      seenTypes,
      lazy: true
    })
  );
}
```

**Correction (found during execution, verified independently by the Task 3 reviewer):** `maxDepth: depth` is used above, not `depth + 1` as an earlier draft of this step had it. With `depth + 1`, any non-cyclic object-kind field among the returned attributes would fail `objectField`'s ceiling check and eagerly expand one extra level of its own children — `expandable` would be `undefined` instead of `true`, breaking the "resolve exactly one level" contract and failing the Step 1 test below. `maxDepth: depth` makes `ctx.depth >= ctx.maxDepth` true immediately for every returned attribute, which is what forces object-kind fields into stubs regardless of whether their type happens to already be in `seenTypes`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/codegen test -- src/instances/resolve-fields.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Add to the barrel**

```ts
// packages/codegen/src/instances/index.ts — add:
export { resolveFields } from './resolve-fields.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/codegen/src/instances/resolve-fields.ts packages/codegen/src/instances/index.ts packages/codegen/test/instances/resolve-fields.test.ts
git commit -m "feat(codegen): add resolveFields lazy one-level field resolver"
```

---

### Task 4: Condition-predicate extraction (MIT)

**Files:**
- Modify: `packages/codegen/src/emit/base-namespace-emitter.ts` (add `buildConditionTranspilerContext`)
- Modify: `packages/codegen/src/emit/zod-emitter.ts:839-855` (`buildTranspilerContext` delegates to the new shared function)
- Create: `packages/codegen/src/instances/condition-predicates.ts`
- Test: `packages/codegen/test/instances/condition-predicates.test.ts`

**Interfaces:**
- Consumes: `transpileCondition` from `packages/codegen/src/expr/transpiler.ts`, `activeConditions` from `base-namespace-emitter.ts`.
- Produces: `getActiveConditionPredicates(data: Data): Array<{ name: string; predicate: string }>` — consumed by the studio's `instance:validate` worker handler (Task 8).

- [ ] **Step 1: Write the failing test**

```ts
// packages/codegen/test/instances/condition-predicates.test.ts
import { describe, expect, it } from 'vitest';
import { getActiveConditionPredicates } from '../../src/instances/condition-predicates.js';
import { parseTestModel } from '../test-utils.js';

const FIXTURE = `
namespace test.conditions

type Trade:
  quantity number (1..1)

  condition PositiveQuantity:
    quantity > 0
`;

describe('getActiveConditionPredicates', () => {
  it('returns one predicate per active condition, executable against a data object', async () => {
    const docs = await parseTestModel(FIXTURE);
    const data = findDataInDocs(docs, 'test.conditions.Trade'); // existing test-utils helper
    const predicates = getActiveConditionPredicates(data);
    expect(predicates).toHaveLength(1);
    expect(predicates[0]?.name).toBe('PositiveQuantity');

    const check = new Function('data', `return (${predicates[0]!.predicate});`);
    expect(check({ quantity: 5 })).toBe(true);
    expect(check({ quantity: -1 })).toBe(false);
  });

  it('returns an empty array for a type with no conditions', async () => {
    const docs = await parseTestModel(`namespace test.conditions\n\ntype Plain:\n  name string (1..1)\n`);
    const data = findDataInDocs(docs, 'test.conditions.Plain');
    expect(getActiveConditionPredicates(data)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/codegen test -- src/instances/condition-predicates.test.ts`
Expected: FAIL — `Cannot find module '../../src/instances/condition-predicates.js'`

- [ ] **Step 3: Promote `buildTranspilerContext` to a shared export**

In `packages/codegen/src/emit/base-namespace-emitter.ts`, add (near `activeConditions`, using the same `buildAttributeTypesMap`/`buildAttrAccessorNamesMap` helpers already in this file):

```ts
export function buildConditionTranspilerContext(
  data: Data,
  emitMode: 'zod-refine' | 'zod-superRefine' | 'ts-method',
  conditionName: string,
  diagnostics: Diagnostic[]
): ExpressionTranspilerContext {
  return {
    selfName: 'data',
    emitMode,
    conditionName,
    typeName: data.name,
    attributeTypes: buildAttributeTypesMap(data),
    diagnostics,
    attrAccessorNames: buildAttrAccessorNamesMap(data)
  };
}
```

In `packages/codegen/src/emit/zod-emitter.ts`, replace the body of the private `buildTranspilerContext` method (839-855) with a one-line delegation:

```ts
  private buildTranspilerContext(data: Data, emitMode: 'zod-refine' | 'zod-superRefine', conditionName: string): ExpressionTranspilerContext {
    return buildConditionTranspilerContext(data, emitMode, conditionName, this.ctx.diagnostics);
  }
```

(Add the `buildConditionTranspilerContext` import at the top of `zod-emitter.ts`.)

- [ ] **Step 4: Run the existing zod-emitter suite to confirm no regression**

Run: `pnpm --filter @rune-langium/codegen test -- src/emit/zod-emitter`
Expected: PASS — condition-emission output is byte-identical since the delegation is a pure refactor.

- [ ] **Step 5: Write the implementation**

```ts
// packages/codegen/src/instances/condition-predicates.ts
// SPDX-License-Identifier: MIT
import type { Data } from '@rune-langium/core';
import { activeConditions, buildConditionTranspilerContext } from '../emit/base-namespace-emitter.js';
import { transpileCondition } from '../expr/transpiler.js';

export interface ConditionPredicate {
  name: string;
  predicate: string;
}

/**
 * Extract each active condition on `data` as a plain JS boolean-predicate
 * string referencing `data` — the same string `emitConditionBlock` embeds
 * into `.refine((data) => <predicate>, ...)`, but returned standalone so
 * the studio's instance validator can execute it directly (no Zod module,
 * no eval of generated source — same sandboxing precedent as dispatchExecute
 * running transpiled function bodies).
 */
export function getActiveConditionPredicates(data: Data): ConditionPredicate[] {
  return activeConditions(data).map((cond) => {
    const name = cond.name ?? 'Condition';
    const ctx = buildConditionTranspilerContext(data, 'zod-refine', name, []);
    return { name, predicate: transpileCondition(cond, ctx) };
  });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/codegen test -- src/instances/condition-predicates.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Add to the barrel and commit**

```ts
// packages/codegen/src/instances/index.ts — add:
export { getActiveConditionPredicates, type ConditionPredicate } from './condition-predicates.js';
```

```bash
git add packages/codegen/src/emit/base-namespace-emitter.ts packages/codegen/src/emit/zod-emitter.ts packages/codegen/src/instances/condition-predicates.ts packages/codegen/src/instances/index.ts packages/codegen/test/instances/condition-predicates.test.ts
git commit -m "feat(codegen): extract condition predicates for instance validation, reusing the expression transpiler"
```

---

### Task 5: Bundle format types + manifest (de)serialization (MIT)

**Files:**
- Create: `packages/codegen/src/instances/bundle.ts`
- Test: `packages/codegen/test/instances/bundle.test.ts`

**Interfaces:**
- Consumes: `sha256Hex` (Task 1).
- Produces: `InstanceRecord`, `BundleManifest` types; `computeModelFingerprint(documents: LangiumDocument[]): Promise<string>`; `buildManifest(instances: InstanceRecord[], modelFingerprint: string, gitCommitSha?: string): BundleManifest`; `serializeManifest`/`parseManifest` — consumed by the studio's bundle export/import wiring (Task 15) and the OPFS layer (Task 9).

- [ ] **Step 1: Write the failing test**

```ts
// packages/codegen/test/instances/bundle.test.ts
import { describe, expect, it } from 'vitest';
import { buildManifest, parseManifest, serializeManifest, type InstanceRecord } from '../../src/instances/bundle.js';

const RECORD: InstanceRecord = {
  id: '01J000000000000000000001',
  name: 'My Party',
  typeFqn: 'test.Party',
  data: { name: 'Acme Corp' },
  createdAt: 1000,
  modifiedAt: 1000
};

describe('bundle manifest', () => {
  it('round-trips through serialize/parse', () => {
    const manifest = buildManifest([RECORD], 'deadbeef', undefined);
    const json = serializeManifest(manifest);
    const parsed = parseManifest(json);
    expect(parsed).toEqual(manifest);
  });

  it('includes gitCommitSha only when provided, never as the gating field', () => {
    const withGit = buildManifest([RECORD], 'deadbeef', 'abc1234');
    expect(withGit.modelFingerprint).toBe('deadbeef');
    expect(withGit.gitCommitSha).toBe('abc1234');

    const withoutGit = buildManifest([RECORD], 'deadbeef', undefined);
    expect(withoutGit.gitCommitSha).toBeUndefined();
  });

  it('rejects a manifest with an unknown formatVersion', () => {
    const bad = JSON.stringify({ formatVersion: 999, modelFingerprint: 'x', instances: [] });
    expect(() => parseManifest(bad)).toThrow(/formatVersion/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/codegen test -- src/instances/bundle.test.ts`
Expected: FAIL — `Cannot find module '../../src/instances/bundle.js'`

- [ ] **Step 3: Write the implementation**

```ts
// packages/codegen/src/instances/bundle.ts
// SPDX-License-Identifier: MIT
import type { LangiumDocument } from 'langium';
import { sha256Hex } from './fingerprint.js';

export interface InstanceProvenance {
  codec: 'json' | 'function' | string;
  source?: string;
  inputs?: string[];
  importedAt: number;
}

export interface ValidationDiagnostic {
  path: string;
  message: string;
  conditionName?: string;
}

export interface InstanceRecord {
  id: string;
  name: string;
  typeFqn: string;
  concreteTypeFqn?: string;
  data: unknown;
  provenance?: InstanceProvenance;
  createdAt: number;
  modifiedAt: number;
  stale?: { reason: string; diagnostics: ValidationDiagnostic[] };
}

export interface BundleManifestInstanceEntry {
  id: string;
  name: string;
  typeFqn: string;
}

export interface BundleManifest {
  formatVersion: 1;
  modelFingerprint: string;
  gitCommitSha?: string;
  instances: BundleManifestInstanceEntry[];
}

const FORMAT_VERSION = 1;

/** Content hash of the currently-loaded model's serialized parsed documents. Gates staleness on bundle import — see design doc §4. */
export async function computeModelFingerprint(documents: LangiumDocument[]): Promise<string> {
  const serialized = documents
    .map((doc) => doc.textDocument.getText())
    .sort()
    .join(' ');
  return sha256Hex(new TextEncoder().encode(serialized));
}

export function buildManifest(instances: InstanceRecord[], modelFingerprint: string, gitCommitSha: string | undefined): BundleManifest {
  return {
    formatVersion: FORMAT_VERSION,
    modelFingerprint,
    ...(gitCommitSha ? { gitCommitSha } : {}),
    instances: instances.map((r) => ({ id: r.id, name: r.name, typeFqn: r.typeFqn }))
  };
}

export function serializeManifest(manifest: BundleManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export function parseManifest(json: string): BundleManifest {
  const parsed = JSON.parse(json) as BundleManifest;
  if (parsed.formatVersion !== FORMAT_VERSION) {
    throw new Error(`bundle manifest: unsupported formatVersion ${parsed.formatVersion}, expected ${FORMAT_VERSION}`);
  }
  return parsed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/codegen test -- src/instances/bundle.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Add to the barrel and commit**

```ts
// packages/codegen/src/instances/index.ts — add:
export {
  buildManifest,
  computeModelFingerprint,
  parseManifest,
  serializeManifest,
  type BundleManifest,
  type InstanceProvenance,
  type InstanceRecord,
  type ValidationDiagnostic
} from './bundle.js';
```

```bash
git add packages/codegen/src/instances/bundle.ts packages/codegen/src/instances/index.ts packages/codegen/test/instances/bundle.test.ts
git commit -m "feat(codegen): add InstanceRecord + bundle manifest types with fingerprint gating"
```

---

### Task 6: Plain-JSON import codec (MIT)

**Files:**
- Create: `packages/codegen/src/instances/json-codec.ts`
- Test: `packages/codegen/test/instances/json-codec.test.ts`

**Interfaces:**
- Produces: `ImportCodec` interface, `jsonCodec: ImportCodec` — consumed by the studio's import dialog wiring (Task 15). This is intentionally a distinct interface/module from `packages/codegen/src/import/` (that directory imports Rune *model definitions* from JSON Schema/OpenAPI/SQL/XSD; this codec imports *instance data* conforming to an already-loaded model type — different concern, kept in a separate directory to avoid confusion).

- [ ] **Step 1: Write the failing test**

```ts
// packages/codegen/test/instances/json-codec.test.ts
import { describe, expect, it } from 'vitest';
import { jsonCodec } from '../../src/instances/json-codec.js';

describe('jsonCodec', () => {
  it('parses valid JSON and returns no diagnostics', () => {
    const result = jsonCodec.import('{"name":"Acme"}', 'test.Party');
    expect(result.data).toEqual({ name: 'Acme' });
    expect(result.diagnostics).toEqual([]);
  });

  it('reports a parse-error diagnostic for malformed JSON, distinctly from schema errors', () => {
    const result = jsonCodec.import('{not valid json', 'test.Party');
    expect(result.data).toBeUndefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.kind).toBe('parse-error');
  });

  it('canTarget accepts any type FQN (plain-JSON codec has no schema of its own to match against)', () => {
    expect(jsonCodec.canTarget('anything.At.All')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/codegen test -- src/instances/json-codec.test.ts`
Expected: FAIL — `Cannot find module '../../src/instances/json-codec.js'`

- [ ] **Step 3: Write the implementation**

```ts
// packages/codegen/src/instances/json-codec.ts
// SPDX-License-Identifier: MIT

export interface ImportDiagnostic {
  kind: 'parse-error' | 'unmapped-field' | 'coercion';
  path?: string;
  message: string;
}

export interface ImportCodecResult {
  data: unknown;
  diagnostics: ImportDiagnostic[];
}

export interface ImportCodec {
  id: string;
  label: string;
  canTarget(typeFqn: string): boolean;
  import(input: Uint8Array | string, targetTypeFqn: string): ImportCodecResult;
}

function toText(input: Uint8Array | string): string {
  return typeof input === 'string' ? input : new TextDecoder().decode(input);
}

/**
 * Parse-and-pass-through: unknown fields are preserved verbatim (import is
 * non-destructive by construction). Schema-level diagnostics (unknown
 * fields, type mismatches) come from the normal instance validation
 * pipeline once the InstanceRecord exists — not from this codec.
 */
export const jsonCodec: ImportCodec = {
  id: 'json',
  label: 'Plain JSON',
  canTarget: () => true,
  import(input: Uint8Array | string, _targetTypeFqn: string): ImportCodecResult {
    const text = toText(input);
    try {
      return { data: JSON.parse(text), diagnostics: [] };
    } catch (err) {
      return {
        data: undefined,
        diagnostics: [{ kind: 'parse-error', message: err instanceof Error ? err.message : String(err) }]
      };
    }
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/codegen test -- src/instances/json-codec.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Add to the barrel and commit**

```ts
// packages/codegen/src/instances/index.ts — add:
export { jsonCodec, type ImportCodec, type ImportCodecResult, type ImportDiagnostic } from './json-codec.js';
```

```bash
git add packages/codegen/src/instances/json-codec.ts packages/codegen/src/instances/index.ts packages/codegen/test/instances/json-codec.test.ts
git commit -m "feat(codegen): add plain-JSON ImportCodec for instance data"
```

---

### Task 7: `createTarGz` — the missing create-side counterpart to `extractTarGz` (FSL)

**Files:**
- Modify: `apps/studio/src/opfs/tar-untar.ts`
- Test: `apps/studio/test/opfs/tar-untar.test.ts` (existing file — add cases)

**Interfaces:**
- Consumes: `pako.gzip` (pako is already a dependency, used today for `inflate`).
- Produces: `createTarGz(entries: Array<{ path: string; data: Uint8Array }>): Uint8Array` — consumed by the bundle export wiring (Task 15).

- [ ] **Step 1: Write the failing test**

```ts
// add to apps/studio/test/opfs/tar-untar.test.ts
import { createTarGz, extractTarGz } from '../../src/opfs/tar-untar.js';

it('createTarGz output round-trips through the existing extractTarGz', async () => {
  const fs = newFs(); // existing helper in this test file
  const entries = [
    { path: 'manifest.json', data: new TextEncoder().encode('{"formatVersion":1}') },
    { path: 'instances/a.json', data: new TextEncoder().encode('{"id":"a"}') }
  ];
  const gz = createTarGz(entries);
  await extractTarGz(gz, fs, { pathPrefix: '/out' });

  expect(await fs.readFile('/out/manifest.json', 'utf8')).toBe('{"formatVersion":1}');
  expect(await fs.readFile('/out/instances/a.json', 'utf8')).toBe('{"id":"a"}');
});

it('createTarGz produces valid gzip (round-trips through pako.inflate directly)', () => {
  const gz = createTarGz([{ path: 'a.txt', data: new TextEncoder().encode('hi') }]);
  expect(() => inflate(gz)).not.toThrow();
});
```

(Add `import { inflate } from 'pako';` to the test file's imports if not already present.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio test -- src/opfs/tar-untar.test.ts`
Expected: FAIL — `createTarGz is not exported`

- [ ] **Step 3: Write the implementation**

```ts
// add to apps/studio/src/opfs/tar-untar.ts
import { deflate, gzip } from 'pako';

export interface TarEntry {
  path: string;
  data: Uint8Array;
}

function ustarHeaderBytes(path: string, size: number): Uint8Array {
  const header = new Uint8Array(BLOCK);
  const enc = new TextEncoder();
  const nameBytes = enc.encode(path);
  if (nameBytes.length > 100) {
    throw new Error(`tar: entry path exceeds 100-byte ustar name limit: ${path}`);
  }
  header.set(nameBytes, 0);
  // mode (8), uid (8), gid (8): fixed innocuous values, NUL-padded octal.
  header.set(enc.encode('0000644\0'), 100);
  header.set(enc.encode('0000000\0'), 108);
  header.set(enc.encode('0000000\0'), 116);
  // size: 12-byte octal, NUL-terminated.
  const sizeOctal = size.toString(8).padStart(11, '0') + '\0';
  header.set(enc.encode(sizeOctal), 124);
  // mtime: zero (stable output, matches OpfsFs's own stable-zero convention for dirs).
  header.set(enc.encode('00000000000\0'), 136);
  // checksum field: 8 spaces while computing, then overwritten below.
  header.set(enc.encode('        '), 148);
  header[156] = '0'.charCodeAt(0); // typeflag: regular file
  header.set(enc.encode('ustar\0'), 257); // magic
  header.set(enc.encode('00'), 263); // version

  let checksum = 0;
  for (const b of header) checksum += b;
  const checksumOctal = checksum.toString(8).padStart(6, '0') + '\0 ';
  header.set(enc.encode(checksumOctal), 148);
  return header;
}

function padTo512(data: Uint8Array): Uint8Array {
  const remainder = data.byteLength % BLOCK;
  if (remainder === 0) return data;
  const padded = new Uint8Array(data.byteLength + (BLOCK - remainder));
  padded.set(data);
  return padded;
}

/**
 * ustar writer + gzip — the create-side counterpart extractTarGz never had.
 * Purpose-built to match: only regular files (no dirs/links needed for
 * bundle export), 512-byte blocks, two trailing zero blocks per the ustar
 * end-of-archive convention extractTarGz already relies on.
 */
export function createTarGz(entries: TarEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const entry of entries) {
    parts.push(ustarHeaderBytes(entry.path, entry.data.byteLength));
    parts.push(padTo512(entry.data));
  }
  parts.push(new Uint8Array(BLOCK * 2)); // end-of-archive: two zero blocks

  const totalLength = parts.reduce((sum, p) => sum + p.byteLength, 0);
  const tar = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    tar.set(part, offset);
    offset += part.byteLength;
  }
  return gzip(tar);
}
```

(Remove the unused `deflate` import if only `gzip` ends up used — keep the import list minimal.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio test -- src/opfs/tar-untar.test.ts`
Expected: PASS, including every pre-existing extraction test.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/opfs/tar-untar.ts apps/studio/test/opfs/tar-untar.test.ts
git commit -m "feat(studio): add createTarGz, the tar-create counterpart extractTarGz was missing"
```

---

### Task 8: `.studio/instances/` OPFS persistence (FSL)

**Files:**
- Create: `apps/studio/src/opfs/instances-fs.ts`
- Test: `apps/studio/test/opfs/instances-fs.test.ts`

**Interfaces:**
- Consumes: `OpfsFs` from `apps/studio/src/opfs/opfs-fs.ts`; `InstanceRecord` from `@rune-langium/codegen/instances`.
- Produces: `readInstanceIndex`, `writeInstanceIndex`, `readInstance`, `writeInstance`, `deleteInstance`, `listInstanceFiles` — consumed by `instance-store.ts` (Task 9).

- [ ] **Step 1: Write the failing test**

```ts
// apps/studio/test/opfs/instances-fs.test.ts
import { describe, expect, it } from 'vitest';
import { OpfsFs } from '../../src/opfs/opfs-fs.js';
import { createOpfsRoot } from '../setup/opfs-mock.js';
import { deleteInstance, readInstance, readInstanceIndex, writeInstance, writeInstanceIndex } from '../../src/opfs/instances-fs.js';
import type { InstanceRecord } from '@rune-langium/codegen/instances';

const RECORD: InstanceRecord = {
  id: '01J000000000000000000001',
  name: 'My Party',
  typeFqn: 'test.Party',
  data: { name: 'Acme' },
  createdAt: 1000,
  modifiedAt: 1000
};

describe('instances-fs', () => {
  it('writes and reads an instance record', async () => {
    const fs = new OpfsFs(createOpfsRoot() as never);
    await writeInstance(fs, '/ws1', RECORD);
    const read = await readInstance(fs, '/ws1', RECORD.id);
    expect(read).toEqual(RECORD);
  });

  it('writes and reads the index', async () => {
    const fs = new OpfsFs(createOpfsRoot() as never);
    await writeInstanceIndex(fs, '/ws1', [{ id: RECORD.id, name: RECORD.name, typeFqn: RECORD.typeFqn, modifiedAt: RECORD.modifiedAt }]);
    const index = await readInstanceIndex(fs, '/ws1');
    expect(index).toHaveLength(1);
    expect(index[0]?.id).toBe(RECORD.id);
  });

  it('returns an empty index when none has been written yet', async () => {
    const fs = new OpfsFs(createOpfsRoot() as never);
    expect(await readInstanceIndex(fs, '/ws1')).toEqual([]);
  });

  it('deletes an instance file', async () => {
    const fs = new OpfsFs(createOpfsRoot() as never);
    await writeInstance(fs, '/ws1', RECORD);
    await deleteInstance(fs, '/ws1', RECORD.id);
    await expect(readInstance(fs, '/ws1', RECORD.id)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio test -- src/opfs/instances-fs.test.ts`
Expected: FAIL — `Cannot find module '../../src/opfs/instances-fs.js'`

- [ ] **Step 3: Write the implementation**

```ts
// apps/studio/src/opfs/instances-fs.ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type { InstanceRecord } from '@rune-langium/codegen/instances';
import type { OpfsFs } from './opfs-fs.js';

export interface InstanceIndexEntry {
  id: string;
  name: string;
  typeFqn: string;
  modifiedAt: number;
}

function instancesDir(workspaceRoot: string): string {
  return `${workspaceRoot}/.studio/instances`;
}

function instancePath(workspaceRoot: string, id: string): string {
  return `${instancesDir(workspaceRoot)}/${id}.json`;
}

function indexPath(workspaceRoot: string): string {
  return `${instancesDir(workspaceRoot)}/index.json`;
}

export async function writeInstance(fs: OpfsFs, workspaceRoot: string, record: InstanceRecord): Promise<void> {
  await fs.mkdir(instancesDir(workspaceRoot));
  await fs.writeFile(instancePath(workspaceRoot, record.id), JSON.stringify(record, null, 2));
}

export async function readInstance(fs: OpfsFs, workspaceRoot: string, id: string): Promise<InstanceRecord> {
  const raw = await fs.readFile(instancePath(workspaceRoot, id), 'utf8');
  return JSON.parse(raw as string) as InstanceRecord;
}

export async function deleteInstance(fs: OpfsFs, workspaceRoot: string, id: string): Promise<void> {
  await fs.unlink(instancePath(workspaceRoot, id));
}

export async function readInstanceIndex(fs: OpfsFs, workspaceRoot: string): Promise<InstanceIndexEntry[]> {
  try {
    const raw = await fs.readFile(indexPath(workspaceRoot), 'utf8');
    return JSON.parse(raw as string) as InstanceIndexEntry[];
  } catch {
    return [];
  }
}

export async function writeInstanceIndex(fs: OpfsFs, workspaceRoot: string, entries: InstanceIndexEntry[]): Promise<void> {
  await fs.mkdir(instancesDir(workspaceRoot));
  await fs.writeFile(indexPath(workspaceRoot), JSON.stringify(entries, null, 2));
}

export async function listInstanceFiles(fs: OpfsFs, workspaceRoot: string): Promise<string[]> {
  try {
    return (await fs.readdir(instancesDir(workspaceRoot))).filter((name) => name.endsWith('.json') && name !== 'index.json');
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio test -- src/opfs/instances-fs.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/opfs/instances-fs.ts apps/studio/test/opfs/instances-fs.test.ts
git commit -m "feat(studio): add .studio/instances/ OPFS read/write layer"
```

---

### Task 9: `instance:validate` codegen-worker message (FSL)

**Files:**
- Modify: `apps/studio/src/workers/codegen-worker.ts` (new message type + handler, alongside `PreviewExecuteMessage`/`preview:execute`)
- Modify: `apps/studio/src/services/codegen-service.ts` (dispatch helper + result typing, alongside `createPreviewExecuteMessage`)
- Test: `apps/studio/test/workers/codegen-worker.test.ts` (existing file — add cases)

**Interfaces:**
- Consumes: `getActiveConditionPredicates` from `@rune-langium/codegen/instances`; the worker's existing parsed-document state (same state `preview:generate` already reads).
- Produces: `dispatchValidateInstance(typeFqn: string, data: Record<string, unknown>, requestId: string): void` on the codegen service; `instance:validateResult` message shape `{ type: 'instance:validateResult', requestId: string, diagnostics: ValidationDiagnostic[] }` — consumed by `instance-store.ts` (Task 10).

- [ ] **Step 1: Write the failing test**

```ts
// add to apps/studio/test/workers/codegen-worker.test.ts
it('handles instance:validate — structural error and condition violation both surface as diagnostics', async () => {
  const { worker, postMessage } = setupWorkerHarness(); // existing helper in this file
  postMessage({ type: 'codegen:setFiles', files: [{ path: 'test.rosetta', content: FIXTURE_WITH_CONDITION }] });
  postMessage({
    type: 'instance:validate',
    typeFqn: 'test.Trade',
    data: { quantity: -1 },
    requestId: 'validate:1'
  });

  const result = await waitForMessage(worker, 'instance:validateResult');
  expect(result.requestId).toBe('validate:1');
  expect(result.diagnostics.some((d) => d.conditionName === 'PositiveQuantity')).toBe(true);
});
```

(`FIXTURE_WITH_CONDITION`, `setupWorkerHarness`, and `waitForMessage` are existing helpers already used by this test file's `preview:execute` tests — reuse them.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio test -- src/workers/codegen-worker.test.ts`
Expected: FAIL — unhandled message type `instance:validate`

- [ ] **Step 3: Write the implementation**

**First, extract the existing structural validator out of `FormPreviewPanel.tsx` so the worker can import it too** (a `.tsx` file cannot be imported from a worker context — this is a pure extraction, output must be byte-identical, no behavior change):

```ts
// apps/studio/src/services/preview-validator.ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
//
// Extracted from FormPreviewPanel.tsx (874-965) so the codegen worker can
// reuse the same structural validator for instance:validate — pure move,
// same z.object()-from-PreviewField construction, same issue formatting.
import { z } from 'zod';
import type { FormPreviewSchema, PreviewField } from '@rune-langium/codegen';

export function fieldRootKey(path: string): string {
  return path.split('.')[0]!.split('[')[0]!;
}

export function formatIssuePath(path: ReadonlyArray<PropertyKey>): string {
  return path
    .filter((segment): segment is string | number => typeof segment === 'string' || typeof segment === 'number')
    .map((segment) => (typeof segment === 'number' ? `[${segment}]` : segment))
    .join('.')
    .replace('.[', '[');
}

function buildFieldValidator(field: PreviewField): z.ZodTypeAny {
  switch (field.kind) {
    case 'string':
      return field.required ? z.string().min(1) : z.string().optional();
    case 'number':
      return field.required ? z.number() : z.number().optional();
    case 'boolean':
      return z.boolean().optional();
    case 'array':
      return field.required ? z.array(z.unknown()).min(1) : z.array(z.unknown()).optional();
    default:
      return z.unknown();
  }
}

export function buildSchemaValidator(fields: PreviewField[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
  return z.object(Object.fromEntries(fields.map((field) => [fieldRootKey(field.path), buildFieldValidator(field)])));
}

export function validatePreviewSample(schema: FormPreviewSchema, values: Record<string, unknown>): { errors: Record<string, string>; valid: boolean } {
  const validator = buildSchemaValidator(schema.fields);
  const result = validator.safeParse(values);
  if (result.success) return { errors: {}, valid: true };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) errors[formatIssuePath(issue.path)] = issue.message;
  return { errors, valid: false };
}
```

Then in `FormPreviewPanel.tsx`, delete the module-private `buildSchemaValidator`/`buildFieldValidator`/`fieldRootKey`/`formatIssuePath`/`validatePreviewSample` definitions and import them from `../services/preview-validator.js` instead. Run `pnpm --filter @rune-langium/studio test -- src/components/FormPreviewPanel.test.tsx` (or wherever its existing test lives) to confirm this pure move changes no test output.

Now in `apps/studio/src/workers/codegen-worker.ts`, add alongside `PreviewExecuteMessage`:

```ts
interface InstanceValidateMessage {
  type: 'instance:validate';
  typeFqn: string;
  data: Record<string, unknown>;
  requestId: string;
}
```

**Reuse the existing hardened execution wrapper, don't write a second one.** `executeFunction` (`codegen-worker.ts:358-436`) already runs transpiled Rune code via `new Function(...)` with `fetch`/`WebSocket`/`XMLHttpRequest`/`importScripts` shadowed as inert params and `RUNTIME_HELPER_JS_SOURCE` (the same `runeCheckOneOf`/`runeCount`/`runeAttrExists` bundle `transpileCondition`'s output calls into — see `specs/015-rune-codegen-zod/contracts/runtime-helpers.md`) prepended, with a documented threat-model comment already in place (394-410) and an existing eslint/react-doctor suppression. Condition predicates need the exact same treatment — `transpileCondition` emits calls like `runeAttrExists(...)`, so executing a predicate without the runtime helpers in scope throws `ReferenceError: runeAttrExists is not defined`. Extract the wrapper itself into a shared helper both call sites use:

```ts
// add to apps/studio/src/workers/codegen-worker.ts, near executeFunction
function runInWorkerSandbox(jsSource: string, argName: string, argValue: unknown, returnExpr: string): unknown {
  // Mirrors executeFunction's existing new Function(...) hardening (358-436):
  // shadow the same dangerous globals as inert params, prepend the same
  // runtime-helper bundle. Not a full sandbox (see executeFunction's comment
  // for the documented threat model) — same trust boundary as the shipped
  // function-execution path, not a new one.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  // react-doctor-disable-next-line react-doctor/no-eval
  const wrapper = new Function(
    argName,
    'fetch',
    'WebSocket',
    'XMLHttpRequest',
    'importScripts',
    `${RUNTIME_HELPER_JS_SOURCE}\n\n${jsSource}\nreturn ${returnExpr};`
  );
  return wrapper(argValue, undefined, undefined, undefined, undefined);
}
```

(`RUNTIME_HELPER_JS_SOURCE` is whatever `executeFunction` already imports for this purpose — use the identical import, do not redeclare it. Refactor `executeFunction` itself to call `runInWorkerSandbox` too, so there is exactly one hardened-execution code path, not two.)

Add a handler branch (alongside the existing `preview:execute` branch — find it via the existing `runCodegen`/message-switch structure) that:
1. Looks up the `Data` AST node for `typeFqn` from the worker's already-parsed documents (same lookup `generatePreviewSchemas` does via `buildNamespaceIndexes`).
2. Builds the structural validator via `validatePreviewSample` (now importable from `preview-validator.ts`) over the type's `resolveFields(typeFqn, [], currentDocuments)` tree.
3. Runs `getActiveConditionPredicates(data)` (imported from `@rune-langium/codegen/instances`) and executes each predicate by calling `runInWorkerSandbox('', 'data', instanceData, \`(${predicate})\`)` — the predicate string becomes the return expression directly, with an empty `jsSource` (there's no function body to prepend, only the runtime helpers + the predicate). Push a diagnostic `{ path: conditionName, message: '<conditionName> failed', conditionName }` for every predicate whose result is falsy.
4. Merges both diagnostic sets and posts `{ type: 'instance:validateResult', requestId, diagnostics }`.

```ts
// worker message handler addition
case 'instance:validate': {
  const msg = data as InstanceValidateMessage;
  const dataNode = findDataNode(currentDocuments, msg.typeFqn); // small local helper, mirrors buildNamespaceIndexes lookup
  if (!dataNode) {
    self.postMessage({ type: 'instance:validateResult', requestId: msg.requestId, diagnostics: [{ path: '', message: `Unknown type ${msg.typeFqn}` }] });
    break;
  }
  const fields = resolveFields(msg.typeFqn, [], currentDocuments);
  const structural = validatePreviewSample({ schemaVersion: 1, targetId: msg.typeFqn, title: dataNode.name, status: 'ready', fields }, msg.data);
  const conditionDiagnostics = getActiveConditionPredicates(dataNode)
    .filter(({ predicate }) => !new Function('data', `return (${predicate});`)(msg.data))
    .map(({ name }) => ({ path: name, message: `Condition '${name}' failed`, conditionName: name }));
  const structuralDiagnostics = Object.entries(structural.errors).map(([path, message]) => ({ path, message }));
  self.postMessage({
    type: 'instance:validateResult',
    requestId: msg.requestId,
    diagnostics: [...structuralDiagnostics, ...conditionDiagnostics]
  });
  break;
}
```

In `apps/studio/src/services/codegen-service.ts`, add alongside `createPreviewExecuteMessage`:

```ts
export function createInstanceValidateMessage(typeFqn: string, data: Record<string, unknown>, requestId: string) {
  return { type: 'instance:validate' as const, typeFqn, data, requestId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio test -- src/workers/codegen-worker.test.ts`
Expected: PASS, including every pre-existing `preview:execute`/`preview:generate` test.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/workers/codegen-worker.ts apps/studio/src/services/codegen-service.ts apps/studio/src/services/preview-validator.ts apps/studio/test/workers/codegen-worker.test.ts
git commit -m "feat(studio): add instance:validate worker message — structural check + condition predicates"
```

---

### Task 10: `instance-store` (FSL)

**Files:**
- Create: `apps/studio/src/store/instance-store.ts`
- Test: `apps/studio/test/store/instance-store.test.ts`

**Interfaces:**
- Consumes: `writeInstance`/`readInstance`/`readInstanceIndex`/`writeInstanceIndex`/`deleteInstance` (Task 8); `InstanceRecord` (Task 5); `createInstanceValidateMessage` (Task 9).
- Produces: `useInstanceStore` zustand hook with `{ instances: Record<string, InstanceRecord>, createInstance, updateInstanceData, removeInstance, setWorker, dispatchValidate, receiveValidateResult }` — consumed by every panel (Tasks 12-14). `dispatchValidate`/`receiveValidateResult`/`setWorker` are the round-trip to the `instance:validate` worker message built in Task 9 — without them Task 9's handler is unreachable from the UI, so this task wires it, not just the CRUD half.

- [ ] **Step 1: Write the failing test**

```ts
// apps/studio/test/store/instance-store.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useInstanceStore } from '../../src/store/instance-store.js';

describe('instance-store', () => {
  beforeEach(() => {
    useInstanceStore.setState({ instances: {} });
  });

  it('createInstance adds a record keyed by id, with provenance defaulting to manual authoring', () => {
    const id = useInstanceStore.getState().createInstance('test.Party', 'My Party');
    const record = useInstanceStore.getState().instances[id];
    expect(record?.name).toBe('My Party');
    expect(record?.typeFqn).toBe('test.Party');
    expect(record?.data).toEqual({});
  });

  it('updateInstanceData merges a field-path update into the record and bumps modifiedAt', () => {
    const id = useInstanceStore.getState().createInstance('test.Party', 'My Party');
    const before = useInstanceStore.getState().instances[id]!.modifiedAt;
    useInstanceStore.getState().updateInstanceData(id, 'name', 'Acme');
    const after = useInstanceStore.getState().instances[id]!;
    expect(after.data).toEqual({ name: 'Acme' });
    expect(after.modifiedAt).toBeGreaterThanOrEqual(before);
  });

  it('deleteInstance removes the record', () => {
    const id = useInstanceStore.getState().createInstance('test.Party', 'My Party');
    useInstanceStore.getState().removeInstance(id);
    expect(useInstanceStore.getState().instances[id]).toBeUndefined();
  });

  it('dispatchValidate posts an instance:validate message carrying a requestId the store can map back to the instance', () => {
    const postMessage = vi.fn();
    useInstanceStore.getState().setWorker({ postMessage } as unknown as Worker);
    const id = useInstanceStore.getState().createInstance('test.Party', 'My Party');
    useInstanceStore.getState().dispatchValidate(id);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'instance:validate', typeFqn: 'test.Party' }));
  });

  it('receiveValidateResult resolves the requestId back to the originating instance id', () => {
    const postMessage = vi.fn();
    useInstanceStore.getState().setWorker({ postMessage } as unknown as Worker);
    const id = useInstanceStore.getState().createInstance('test.Party', 'My Party');
    useInstanceStore.getState().dispatchValidate(id);
    const requestId = postMessage.mock.calls[0]![0].requestId as string;

    useInstanceStore.getState().receiveValidateResult(requestId, [{ path: 'name', message: 'required' }]);
    expect(useInstanceStore.getState().validationErrors[id]).toEqual([{ path: 'name', message: 'required' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio test -- src/store/instance-store.test.ts`
Expected: FAIL — `Cannot find module '../../src/store/instance-store.js'`

- [ ] **Step 3: Write the implementation**

```ts
// apps/studio/src/store/instance-store.ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { createInstanceValidateMessage } from '../services/codegen-service.js';
import type { InstanceRecord, ValidationDiagnostic } from '@rune-langium/codegen/instances';
import { create } from 'zustand';

function ulid(): string {
  // Time-sortable enough for Phase 1's uniqueness needs; swap for a real
  // ulid library only if cross-session collision resistance ever matters.
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// Module-level, like preview-store.ts's workerRef/dispatchExecuteCounter —
// not store state, since a Worker instance isn't serializable/comparable
// the way zustand state is expected to be.
let workerRef: Worker | undefined;
let requestCounter = 0;
const pendingRequests = new Map<string, string>(); // requestId -> instanceId

interface InstanceStoreState {
  instances: Record<string, InstanceRecord>;
  validationErrors: Record<string, ValidationDiagnostic[]>;
  createInstance(typeFqn: string, name: string): string;
  updateInstanceData(id: string, fieldPath: string, value: unknown): void;
  removeInstance(id: string): void;
  setWorker(worker: Worker): void;
  dispatchValidate(id: string): void;
  receiveValidateResult(requestId: string, diagnostics: ValidationDiagnostic[]): void;
}

export const useInstanceStore = create<InstanceStoreState>((set, get) => ({
  instances: {},
  validationErrors: {},

  createInstance(typeFqn, name) {
    const id = ulid();
    const now = Date.now();
    const record: InstanceRecord = { id, name, typeFqn, data: {}, createdAt: now, modifiedAt: now };
    set((state) => ({ instances: { ...state.instances, [id]: record } }));
    return id;
  },

  updateInstanceData(id, fieldPath, value) {
    set((state) => {
      const existing = state.instances[id];
      if (!existing) return state;
      const data = { ...(existing.data as Record<string, unknown>), [fieldPath]: value };
      return { instances: { ...state.instances, [id]: { ...existing, data, modifiedAt: Date.now() } } };
    });
    get().dispatchValidate(id);
  },

  removeInstance(id) {
    set((state) => {
      const { [id]: _removed, ...rest } = state.instances;
      return { instances: rest };
    });
  },

  setWorker(worker) {
    workerRef = worker;
  },

  dispatchValidate(id) {
    const record = get().instances[id];
    if (!record || !workerRef) return;
    requestCounter++;
    const requestId = `validate:${id}:${requestCounter}`;
    pendingRequests.set(requestId, id);
    workerRef.postMessage(createInstanceValidateMessage(record.typeFqn, record.data as Record<string, unknown>, requestId));
  },

  receiveValidateResult(requestId, diagnostics) {
    const id = pendingRequests.get(requestId);
    if (!id) return;
    pendingRequests.delete(requestId);
    set((state) => ({ validationErrors: { ...state.validationErrors, [id]: diagnostics } }));
  }
}));
```

The studio's existing worker-lifecycle owner (wherever `preview-store`'s `workerRef` gets set today — e.g. `CodegenProvider.tsx`, per `handleCodegenMessage`) must also call `useInstanceStore.getState().setWorker(worker)` once the worker is created, and route `instance:validateResult` messages to `useInstanceStore.getState().receiveValidateResult(msg.requestId, msg.diagnostics)` alongside its existing `preview:result`/`preview:executeResult` routing. Read that file's message-dispatch switch before editing it — this is a one-case addition to an existing switch, not a new dispatch mechanism.

(`updateInstanceData`'s flat field-path key is a Phase 1 simplification for the top-level-attribute case exercised by this test; Task 13's `InstanceFormPanel` extends the write to nested paths using the same dotted-path convention `PreviewField.path` already uses, via a small `setAtPath`/`getAtPath` pair colocated in that task rather than duplicated here.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio test -- src/store/instance-store.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/store/instance-store.ts apps/studio/test/store/instance-store.test.ts
git commit -m "feat(studio): add instance-store with worker-backed validate dispatch"
```

---

### Task 11: Perspective registry entry (FSL)

**Files:**
- Modify: `apps/studio/src/shell/perspectives/perspective-types.ts:6` (`PerspectiveId`)
- Modify: `apps/studio/src/shell/perspectives/perspective-registry.ts:8-50` (`PERSPECTIVES`)
- Create: `apps/studio/src/shell/perspectives/prototype-chrome.tsx`
- Test: `apps/studio/test/shell/perspective-registry.test.ts` (existing file — add a case)

**Interfaces:**
- Produces: registry entry `{ id: 'prototype', ... }`, consumed by `PerspectiveHost.tsx` (already generic over `PERSPECTIVES`, no change needed there) and by the rail (`ActivityBar`, already generic).

- [ ] **Step 1: Write the failing test**

```ts
// add to apps/studio/test/shell/perspective-registry.test.ts
it('includes a prototype entry requiring a workspace', () => {
  const prototype = PERSPECTIVES.find((p) => p.id === 'prototype');
  expect(prototype).toBeDefined();
  expect(prototype?.requiresWorkspace).toBe(true);
  expect(prototype?.group).toBe('main');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio test -- src/shell/perspective-registry.test.ts`
Expected: FAIL — `prototype` entry not found

- [ ] **Step 3: Write the implementation**

In `perspective-types.ts`:

```ts
export type PerspectiveId = 'explore' | 'workspaces' | 'git' | 'export' | 'settings' | 'prototype';
```

```ts
// apps/studio/src/shell/perspectives/prototype-chrome.tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
export function PrototypeActions(): null {
  // No perspective-level actions in Phase 1 (New Instance / Import live in
  // InstanceExplorerPanel itself, not the shared topbar action cluster).
  return null;
}
```

In `perspective-registry.ts`, add (import `Boxes` from `lucide-react` alongside the existing icon imports, and `PrototypeActions` from `./prototype-chrome.js`):

```ts
{
  id: 'prototype',
  label: 'Prototype',
  icon: Boxes,
  group: 'main',
  requiresWorkspace: true,
  actions: PrototypeActions
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio test -- src/shell/perspective-registry.test.ts`
Expected: PASS, including all 5 pre-existing entries.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/shell/perspectives/perspective-types.ts apps/studio/src/shell/perspectives/perspective-registry.ts apps/studio/src/shell/perspectives/prototype-chrome.tsx apps/studio/test/shell/perspective-registry.test.ts
git commit -m "feat(studio): register the Prototype perspective"
```

---

### Task 12: `InstanceExplorerPanel` (FSL)

**Files:**
- Create: `apps/studio/src/shell/panels/InstanceExplorerPanel.tsx`
- Test: `apps/studio/test/shell/panels/InstanceExplorerPanel.test.tsx`

**Interfaces:**
- Consumes: `useInstanceStore` (Task 10).
- Produces: `<InstanceExplorerPanel onSelect={(id: string) => void} selectedId={string | undefined} />` — consumed by the Prototype perspective screen (wired in Task 15 alongside the other two panels).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/studio/test/shell/panels/InstanceExplorerPanel.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InstanceExplorerPanel } from '../../../src/shell/panels/InstanceExplorerPanel.js';
import { useInstanceStore } from '../../../src/store/instance-store.js';

describe('InstanceExplorerPanel', () => {
  beforeEach(() => {
    useInstanceStore.setState({ instances: {} });
  });

  it('lists existing instances and calls onSelect when a row is clicked', () => {
    useInstanceStore.getState().createInstance('test.Party', 'My Party');
    const onSelect = vi.fn();
    render(<InstanceExplorerPanel onSelect={onSelect} selectedId={undefined} />);
    fireEvent.click(screen.getByText('My Party'));
    expect(onSelect).toHaveBeenCalledWith(expect.any(String));
  });

  it('filters the list by the search box', () => {
    useInstanceStore.getState().createInstance('test.Party', 'Alpha');
    useInstanceStore.getState().createInstance('test.Party', 'Beta');
    render(<InstanceExplorerPanel onSelect={() => {}} selectedId={undefined} />);
    fireEvent.change(screen.getByPlaceholderText('Search instances'), { target: { value: 'Alp' } });
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio test -- src/shell/panels/InstanceExplorerPanel.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```tsx
// apps/studio/src/shell/panels/InstanceExplorerPanel.tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { useState } from 'react';
import { useInstanceStore } from '../../store/instance-store.js';

export interface InstanceExplorerPanelProps {
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

export function InstanceExplorerPanel({ selectedId, onSelect }: InstanceExplorerPanelProps) {
  const instances = useInstanceStore((s) => s.instances);
  const [filter, setFilter] = useState('');

  const rows = Object.values(instances).filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="flex h-full flex-col">
      <input
        placeholder="Search instances"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="border-b border-border bg-transparent px-2 py-1 text-sm outline-none"
      />
      <ul className="flex-1 overflow-auto">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              aria-current={r.id === selectedId}
              className="w-full truncate px-2 py-1 text-left text-sm hover:bg-accent aria-[current=true]:bg-accent"
            >
              {r.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio test -- src/shell/panels/InstanceExplorerPanel.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/shell/panels/InstanceExplorerPanel.tsx apps/studio/test/shell/panels/InstanceExplorerPanel.test.tsx
git commit -m "feat(studio): add InstanceExplorerPanel (list + filter)"
```

---

### Task 13: `InstanceFormPanel` (FSL)

**Files:**
- Create: `apps/studio/src/shell/panels/InstanceFormPanel.tsx`
- Test: `apps/studio/test/shell/panels/InstanceFormPanel.test.tsx`

**Interfaces:**
- Consumes: `resolveFields` (`@rune-langium/codegen/instances`), `useInstanceStore` (Task 10), `useModelStore`'s parsed documents (existing store already used by `FormPreviewPanel` — same source `generatePreviewSchemas` reads from today).
- Produces: `<InstanceFormPanel instanceId={string} />`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/studio/test/shell/panels/InstanceFormPanel.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InstanceFormPanel } from '../../../src/shell/panels/InstanceFormPanel.js';
import { useInstanceStore } from '../../../src/store/instance-store.js';

vi.mock('@rune-langium/codegen/instances', async () => {
  const actual = await vi.importActual<typeof import('@rune-langium/codegen/instances')>('@rune-langium/codegen/instances');
  return {
    ...actual,
    resolveFields: vi.fn(() => [{ path: 'name', label: 'name', kind: 'string', required: true }])
  };
});

describe('InstanceFormPanel', () => {
  beforeEach(() => {
    useInstanceStore.setState({ instances: {} });
  });

  it('renders one input per top-level resolved field and writes edits to the store', () => {
    const id = useInstanceStore.getState().createInstance('test.Party', 'My Party');
    render(<InstanceFormPanel instanceId={id} />);
    const input = screen.getByLabelText('name');
    fireEvent.change(input, { target: { value: 'Acme' } });
    expect(useInstanceStore.getState().instances[id]?.data).toEqual({ name: 'Acme' });
  });
});

describe('InstanceFormPanel — (1..*) array fields', () => {
  beforeEach(() => {
    useInstanceStore.setState({ instances: {} });
  });

  it('renders an Add button for an array field, and adding twice yields two item inputs', () => {
    vi.mocked(resolveFields).mockReturnValue([
      { path: 'aliases', label: 'aliases', kind: 'array', required: false, children: [{ path: 'aliases[]', label: 'aliases', kind: 'string', required: true }] }
    ] as never);
    const id = useInstanceStore.getState().createInstance('test.Party', 'My Party');
    render(<InstanceFormPanel instanceId={id} />);
    fireEvent.click(screen.getByRole('button', { name: /add aliases/i }));
    fireEvent.click(screen.getByRole('button', { name: /add aliases/i }));
    expect(screen.getAllByLabelText(/aliases\[\d+\]/)).toHaveLength(2);
  });

  it('removing an item drops it from the stored array and re-indexes the rest', () => {
    vi.mocked(resolveFields).mockReturnValue([
      { path: 'aliases', label: 'aliases', kind: 'array', required: false, children: [{ path: 'aliases[]', label: 'aliases', kind: 'string', required: true }] }
    ] as never);
    const id = useInstanceStore.getState().createInstance('test.Party', 'My Party');
    useInstanceStore.getState().updateInstanceData(id, 'aliases', ['A', 'B']);
    render(<InstanceFormPanel instanceId={id} />);
    fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]!);
    expect(useInstanceStore.getState().instances[id]?.data).toEqual({ aliases: ['B'] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio test -- src/shell/panels/InstanceFormPanel.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```tsx
// apps/studio/src/shell/panels/InstanceFormPanel.tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { resolveFields } from '@rune-langium/codegen/instances';
import { useMemo, useState } from 'react';
import { useModelStore } from '../../store/model-store.js';
import { useInstanceStore } from '../../store/instance-store.js';

export interface InstanceFormPanelProps {
  instanceId: string;
}

export function InstanceFormPanel({ instanceId }: InstanceFormPanelProps) {
  const record = useInstanceStore((s) => s.instances[instanceId]);
  const updateInstanceData = useInstanceStore((s) => s.updateInstanceData);
  const documents = useModelStore((s) => s.parsedDocuments); // existing selector, same source generatePreviewSchemas already reads
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const topLevelFields = useMemo(() => (record ? resolveFields(record.typeFqn, [], documents) : []), [record?.typeFqn, documents]);

  if (!record) return null;

  return (
    <form className="flex flex-col gap-2 p-2">
      {topLevelFields.map((field) => {
        if (field.kind === 'object' && (field as { expandable?: boolean }).expandable) {
          const isOpen = expanded.has(field.path);
          return (
            <div key={field.path}>
              <button
                type="button"
                onClick={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(field.path)) next.delete(field.path);
                    else next.add(field.path);
                    return next;
                  })
                }
              >
                {isOpen ? '▾' : '▸'} {field.label}
              </button>
              {isOpen && (
                <NestedFields typeFqn={record.typeFqn} path={field.path} documents={documents} instanceId={instanceId} />
              )}
            </div>
          );
        }
        if (field.kind === 'array') {
          const items = ((record.data as Record<string, unknown>)[field.path] as string[] | undefined) ?? [];
          return (
            <fieldset key={field.path} className="flex flex-col gap-1 text-sm">
              <legend>{field.label}</legend>
              {items.map((value, i) => (
                <div key={i} className="flex gap-1">
                  <input
                    aria-label={`${field.path}[${i}]`}
                    value={value}
                    onChange={(e) => {
                      const next = [...items];
                      next[i] = e.target.value;
                      updateInstanceData(instanceId, field.path, next);
                    }}
                    className="border border-border bg-transparent px-2 py-1"
                  />
                  <button
                    type="button"
                    aria-label={`Move ${field.label} item ${i} up`}
                    disabled={i === 0}
                    onClick={() => {
                      const next = [...items];
                      [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                      updateInstanceData(instanceId, field.path, next);
                    }}
                  >
                    ↑
                  </button>
                  <button type="button" aria-label={`Remove ${field.label} item ${i}`} onClick={() => updateInstanceData(instanceId, field.path, items.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" aria-label={`Add ${field.label}`} onClick={() => updateInstanceData(instanceId, field.path, [...items, ''])}>
                Add {field.label}
              </button>
            </fieldset>
          );
        }
        return (
          <label key={field.path} className="flex flex-col gap-1 text-sm">
            {field.label}
            <input
              aria-label={field.label}
              value={(record.data as Record<string, unknown>)[field.path] as string | undefined ?? ''}
              onChange={(e) => updateInstanceData(instanceId, field.path, e.target.value)}
              className="border border-border bg-transparent px-2 py-1"
            />
          </label>
        );
      })}
    </form>
  );
}

function NestedFields({
  typeFqn,
  path,
  documents,
  instanceId
}: {
  typeFqn: string;
  path: string;
  documents: unknown[];
  instanceId: string;
}) {
  const updateInstanceData = useInstanceStore((s) => s.updateInstanceData);
  const record = useInstanceStore((s) => s.instances[instanceId]);
  const fields = useMemo(() => resolveFields(typeFqn, path.split('.'), documents as never), [typeFqn, path, documents]);
  if (!record) return null;
  return (
    <div className="ml-4 flex flex-col gap-2">
      {fields.map((field) => (
        <label key={field.path} className="flex flex-col gap-1 text-sm">
          {field.label}
          <input
            aria-label={field.label}
            value={(record.data as Record<string, unknown>)[field.path] as string | undefined ?? ''}
            onChange={(e) => updateInstanceData(instanceId, field.path, e.target.value)}
            className="border border-border bg-transparent px-2 py-1"
          />
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio test -- src/shell/panels/InstanceFormPanel.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/shell/panels/InstanceFormPanel.tsx apps/studio/test/shell/panels/InstanceFormPanel.test.tsx
git commit -m "feat(studio): add InstanceFormPanel driven by resolveFields"
```

---

### Task 14: Function tab reuse + `InstanceInspectorPanel` (FSL)

**Files:**
- Create: `apps/studio/src/shell/panels/InstanceFunctionPanel.tsx`, `apps/studio/src/shell/panels/InstanceInspectorPanel.tsx`
- Test: `apps/studio/test/shell/panels/InstanceInspectorPanel.test.tsx`

**Interfaces:**
- Consumes: `FormPreviewPanel` (existing, unchanged), `useInstanceStore` (Task 10).
- Produces: `<InstanceFunctionPanel />` (thin wrapper), `<InstanceInspectorPanel instanceId={string} />`.

- [ ] **Step 1: Write the failing test** (Inspector only — the Function panel is a zero-logic wrapper, not independently test-worthy beyond "it renders")

```tsx
// apps/studio/test/shell/panels/InstanceInspectorPanel.test.tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { InstanceInspectorPanel } from '../../../src/shell/panels/InstanceInspectorPanel.js';
import { useInstanceStore } from '../../../src/store/instance-store.js';

describe('InstanceInspectorPanel', () => {
  beforeEach(() => {
    useInstanceStore.setState({ instances: {}, validationErrors: {} });
  });

  it('shows raw JSON and a validation summary for the selected instance', () => {
    const postMessage = vi.fn();
    useInstanceStore.getState().setWorker({ postMessage } as unknown as Worker);
    const id = useInstanceStore.getState().createInstance('test.Party', 'My Party');
    useInstanceStore.getState().updateInstanceData(id, 'name', 'Acme');
    // updateInstanceData auto-dispatches a validate request; grab its requestId
    // to simulate the worker's async reply, the same way real production code does.
    const requestId = postMessage.mock.calls.at(-1)?.[0]?.requestId as string;
    useInstanceStore.getState().receiveValidateResult(requestId, [{ path: 'name', message: 'too short' }]);
    render(<InstanceInspectorPanel instanceId={id} />);
    expect(screen.getByText(/"Acme"/)).toBeInTheDocument();
    expect(screen.getByText('too short')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio test -- src/shell/panels/InstanceInspectorPanel.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```tsx
// apps/studio/src/shell/panels/InstanceFunctionPanel.tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { FormPreviewPanel } from '../../components/FormPreviewPanel.js';

/**
 * Reuses FormPreviewPanel's function-execution UI as-is (picker +
 * dispatchExecute + read-only output). No instance-binding in Phase 1 —
 * that's the Phase 2 upgrade to US5. See design doc §5.
 */
export function InstanceFunctionPanel() {
  return <FormPreviewPanel mode="function" />;
}
```

```tsx
// apps/studio/src/shell/panels/InstanceInspectorPanel.tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { useInstanceStore } from '../../store/instance-store.js';

export interface InstanceInspectorPanelProps {
  instanceId: string;
}

export function InstanceInspectorPanel({ instanceId }: InstanceInspectorPanelProps) {
  const record = useInstanceStore((s) => s.instances[instanceId]);
  const diagnostics = useInstanceStore((s) => s.validationErrors[instanceId]) ?? [];

  if (!record) return null;

  return (
    <div className="flex flex-col gap-3 p-2 text-sm">
      <section>
        <h3 className="font-semibold">Validation</h3>
        {diagnostics.length === 0 ? (
          <p className="text-muted-foreground">Valid</p>
        ) : (
          <ul>
            {diagnostics.map((d, i) => (
              <li key={`${d.path}-${i}`}>
                {d.path}: {d.message}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="font-semibold">Provenance</h3>
        <p className="text-muted-foreground">{record.provenance?.codec ?? 'manual'}</p>
      </section>
      <section>
        <h3 className="font-semibold">Raw JSON</h3>
        <pre className="overflow-auto">{JSON.stringify(record.data, null, 2)}</pre>
      </section>
    </div>
  );
}
```

(`FormPreviewPanel`'s exact prop surface for selecting "function mode" must match what actually exists — if it does not currently accept a `mode` prop, the implementer reads `apps/studio/src/components/FormPreviewPanel.tsx`'s props interface first and adapts this wrapper to whatever the real prop/state contract is, e.g. driving it through `preview-store`'s existing target-selection state instead of a new prop. The behavioral requirement is fixed — mount the existing function-execution UI unchanged — the exact wiring is a one-file adaptation once the implementer has the component open.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio test -- src/shell/panels/InstanceInspectorPanel.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/shell/panels/InstanceFunctionPanel.tsx apps/studio/src/shell/panels/InstanceInspectorPanel.tsx apps/studio/test/shell/panels/InstanceInspectorPanel.test.tsx
git commit -m "feat(studio): add InstanceInspectorPanel + reuse FormPreviewPanel for the Function tab"
```

---

### Task 15: Bundle export/import wiring + staleness (FSL)

**Files:**
- Create: `apps/studio/src/services/instance-bundle.ts`
- Test: `apps/studio/test/services/instance-bundle.test.ts`

**Interfaces:**
- Consumes: `createTarGz`/`extractTarGz` (Task 7), `readInstance`/`writeInstance`/`listInstanceFiles` (Task 8), `buildManifest`/`parseManifest`/`computeModelFingerprint` (Task 5).
- Produces: `exportBundle(fs, workspaceRoot, documents): Promise<Uint8Array>`, `importBundle(fs, workspaceRoot, bundleBytes, documents): Promise<{ imported: InstanceRecord[]; stale: boolean }>`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/studio/test/services/instance-bundle.test.ts
import { describe, expect, it } from 'vitest';
import { OpfsFs } from '../../src/opfs/opfs-fs.js';
import { createOpfsRoot } from '../setup/opfs-mock.js';
import { writeInstance } from '../../src/opfs/instances-fs.js';
import { exportBundle, importBundle } from '../../src/services/instance-bundle.js';
import type { InstanceRecord } from '@rune-langium/codegen/instances';

function fakeDocs(text: string) {
  return [{ textDocument: { getText: () => text } }] as never;
}

const RECORD: InstanceRecord = {
  id: '01J000000000000000000001',
  name: 'My Party',
  typeFqn: 'test.Party',
  data: { name: 'Acme' },
  createdAt: 1000,
  modifiedAt: 1000
};

describe('instance bundle export/import', () => {
  it('round-trips one instance through export and import against the SAME model', async () => {
    const fs = new OpfsFs(createOpfsRoot() as never);
    await writeInstance(fs, '/ws1', RECORD);
    const docs = fakeDocs('namespace test\ntype Party:\n  name string (1..1)\n');

    const bytes = await exportBundle(fs, '/ws1', docs);

    const fs2 = new OpfsFs(createOpfsRoot() as never);
    const result = await importBundle(fs2, '/ws2', bytes, docs);

    expect(result.stale).toBe(false);
    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]?.name).toBe('My Party');
  });

  it('flags imported instances stale when the model text differs from the manifest fingerprint', async () => {
    const fs = new OpfsFs(createOpfsRoot() as never);
    await writeInstance(fs, '/ws1', RECORD);
    const originalDocs = fakeDocs('namespace test\ntype Party:\n  name string (1..1)\n');
    const bytes = await exportBundle(fs, '/ws1', originalDocs);

    const changedDocs = fakeDocs('namespace test\ntype Party:\n  name string (1..1)\n  extra string (0..1)\n');
    const fs2 = new OpfsFs(createOpfsRoot() as never);
    const result = await importBundle(fs2, '/ws2', bytes, changedDocs);

    expect(result.stale).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio test -- src/services/instance-bundle.test.ts`
Expected: FAIL — `Cannot find module '../../src/services/instance-bundle.js'`

- [ ] **Step 3: Write the implementation**

```ts
// apps/studio/src/services/instance-bundle.ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { buildManifest, computeModelFingerprint, parseManifest, serializeManifest, type InstanceRecord } from '@rune-langium/codegen/instances';
import type { LangiumDocument } from 'langium';
import { createTarGz } from '../opfs/tar-untar.js';
import { extractTarGz } from '../opfs/tar-untar.js';
import { listInstanceFiles, readInstance, writeInstance } from '../opfs/instances-fs.js';
import type { OpfsFs } from '../opfs/opfs-fs.js';

export async function exportBundle(fs: OpfsFs, workspaceRoot: string, documents: LangiumDocument[]): Promise<Uint8Array> {
  const files = await listInstanceFiles(fs, workspaceRoot);
  const ids = files.map((f) => f.replace(/\.json$/, ''));
  const records = await Promise.all(ids.map((id) => readInstance(fs, workspaceRoot, id)));

  const fingerprint = await computeModelFingerprint(documents);
  const manifest = buildManifest(records, fingerprint, undefined);

  const entries = [
    { path: 'manifest.json', data: new TextEncoder().encode(serializeManifest(manifest)) },
    ...records.map((r) => ({ path: `instances/${r.id}.json`, data: new TextEncoder().encode(JSON.stringify(r)) }))
  ];
  return createTarGz(entries);
}

export async function importBundle(
  fs: OpfsFs,
  workspaceRoot: string,
  bundleBytes: Uint8Array,
  documents: LangiumDocument[]
): Promise<{ imported: InstanceRecord[]; stale: boolean }> {
  const scratchRoot = `${workspaceRoot}/.studio/.bundle-import-scratch`;
  await extractTarGz(bundleBytes, fs, { pathPrefix: scratchRoot });

  const manifestRaw = await fs.readFile(`${scratchRoot}/manifest.json`, 'utf8');
  const manifest = parseManifest(manifestRaw as string);

  const currentFingerprint = await computeModelFingerprint(documents);
  const stale = currentFingerprint !== manifest.modelFingerprint;

  const imported: InstanceRecord[] = [];
  for (const entry of manifest.instances) {
    const raw = await fs.readFile(`${scratchRoot}/instances/${entry.id}.json`, 'utf8');
    const record = JSON.parse(raw as string) as InstanceRecord;
    const finalRecord: InstanceRecord = stale
      ? { ...record, stale: { reason: 'model-fingerprint-mismatch', diagnostics: [] } }
      : record;
    await writeInstance(fs, workspaceRoot, finalRecord);
    imported.push(finalRecord);
  }

  return { imported, stale };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio test -- src/services/instance-bundle.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/services/instance-bundle.ts apps/studio/test/services/instance-bundle.test.ts
git commit -m "feat(studio): wire bundle export/import with fingerprint-gated staleness"
```

---

### Task 16: CDM smoke test (MIT)

**Files:**
- Modify: `packages/codegen/test/cdm-smoke.test.ts` (existing file — add a describe block; reuses the existing `runJsonBattery` helper and the existing `.resources/`-presence guard already in this file)

**Interfaces:**
- Consumes: `resolveFields`, `jsonCodec` (Tasks 3, 6); the existing corpus-loading helper already used by this file's other `describe` blocks.

- [ ] **Step 1: Write the failing test**

```ts
// add to packages/codegen/test/cdm-smoke.test.ts
describe.skipIf(!hasResourcesCorpus)('Prototype Workspace Phase 1 — CDM smoke', () => {
  it('resolves fields one level at a time for a deep real CDM type without hanging', async () => {
    const docs = await loadCorpusDocs(); // existing helper in this file
    const fields = resolveFields('cdm.event.common.TradeState', [], docs);
    expect(fields.length).toBeGreaterThan(0);
    // Drill one level into the first expandable field, proving lazy expansion works on real CDM depth.
    const expandable = fields.find((f) => f.kind === 'object' && (f as { expandable?: boolean }).expandable);
    if (expandable) {
      const nested = resolveFields('cdm.event.common.TradeState', expandable.path.split('.'), docs);
      expect(nested.length).toBeGreaterThan(0);
    }
  });

  it('imports a known-good and known-bad real CDM JSON sample with distinct diagnostics', async () => {
    const goodJson = readCorpusFixture('trade-state-valid.json'); // existing corpus fixture helper
    const badJson = readCorpusFixture('trade-state-missing-required.json');

    const good = jsonCodec.import(goodJson, 'cdm.event.common.TradeState');
    expect(good.diagnostics).toEqual([]);

    const bad = jsonCodec.import(badJson, 'cdm.event.common.TradeState');
    // jsonCodec itself only reports parse errors — schema errors are the
    // caller's job (instance-store's validate dispatch, Task 9/10), so this
    // asserts the codec parsed it (valid JSON, invalid instance is NOT a
    // codec-level diagnostic).
    expect(bad.diagnostics).toEqual([]);
    expect(bad.data).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails or skips correctly**

Run: `pnpm --filter @rune-langium/codegen test -- test/cdm-smoke.test.ts`
Expected: SKIP if `.resources/` is absent (matching this file's existing guard behavior); FAIL with "Cannot find module" for `resolveFields`/`jsonCodec` imports if present but the corpus fixtures `trade-state-valid.json`/`trade-state-missing-required.json` don't exist yet under this file's fixture directory — create them from a real trimmed CDM `TradeState` sample if the corpus is available in this environment; otherwise leave this test`.skip`-gated identically to its siblings and note the gap in the task's commit message.

- [ ] **Step 3: Run test to verify it passes** (once fixtures exist, in an environment with `.resources/` present)

Run: `pnpm --filter @rune-langium/codegen test -- test/cdm-smoke.test.ts`
Expected: PASS (2 new tests) or SKIP (both, consistently with the rest of the file) when the corpus is absent.

- [ ] **Step 4: Commit**

```bash
git add packages/codegen/test/cdm-smoke.test.ts packages/codegen/test/fixtures/trade-state-valid.json packages/codegen/test/fixtures/trade-state-missing-required.json
git commit -m "test(codegen): add Prototype Workspace Phase 1 CDM smoke coverage"
```

---

## Final

- [ ] Run the full monorepo suite: `pnpm test` and `pnpm run type-check` — zero regressions.
- [ ] Manually verify in the browser: open a workspace with a small model containing a nested type, a `(1..*)` attribute, a condition block, and an enum; open the Prototype perspective; create an instance; drill into the nested field; add/remove/reorder elements of the `(1..*)` attribute; violate the condition and see it reported by name; fix it; reload the browser and confirm persistence; import a JSON payload with one bad field and see the diagnostic; export it back out; export a bundle and re-import it into a second workspace.
- [ ] superpowers:finishing-a-development-branch → present merge/PR/cleanup options (do NOT merge to master locally).

## Known gap flagged during self-review (not resolved in this plan — needs a scope decision)

US1 AS4 (polymorphic attributes: a parent type with known subtypes, or a `choice`, requires picking the concrete subtype/option before rendering its fields) is **not implemented by any task above**. Checking the real code: `buildBaseField` (`preview-schema.ts:511-552`) has no branch for Choice-typed attributes or "declared type has subtypes" detection today — it falls through to the `unsupported-reference` branch for both. Discovering "known subtypes of X" requires walking every `Data` node's `.superType` in reverse (there's no precomputed index; `packages/codegen/src/cycle-detector.ts`'s `buildTypeReferenceGraph` builds a *forward* type-reference graph via `superType`/`extends` edges that could be inverted, but I have not verified that's the right primitive to reuse here versus writing a purpose-built reverse-walk). This is real, non-trivial work I did not want to design on the fly just to check a box — it needs the same grounding-before-committing treatment the rest of this plan got. Recommend: land Tasks 1-16 as a working Phase 1a (scalar + nested-object + array attributes, no polymorphic/choice-typed attributes), then scope polymorphic/choice attribute support as a short Phase 1b addendum plan once this lands, OR pause now and let me research the subtype-discovery mechanism properly before adding it as Task 17. Flagging rather than guessing.
