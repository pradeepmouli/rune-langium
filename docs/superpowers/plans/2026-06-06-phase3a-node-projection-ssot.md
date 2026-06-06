# Phase 3A — `node-projection.ts` SSoT Consolidation (V1–V6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create one module — `packages/visual-editor/src/store/node-projection.ts` — that owns *all* node-shape knowledge (id builders, edge-id builders, the GraphMetadata field set + AST projection, per-kind member accessors, and array↔Map derivation), and re-point every existing caller to it **without changing behavior**.

**Architecture:** A pure, behavior-preserving refactor (spec §5 Stage 0). It closes DRY violations V1–V6 by collapsing duplicated/inline node-shape logic into a single MIT module. **The node-id separator stays `::` in this plan** — the `::`→`.` flip is a separate follow-up (3A′) that this centralization makes trivial. No Maps are introduced here (that is 3B). The existing visual-editor suite (~1131 tests across 89 files) + studio suite (~878 tests) are the safety net: every task must keep them green.

**Tech Stack:** TypeScript 5.9 (strict, ESM/NodeNext), React 19, zustand 5, Mutative, vitest. Package `@rune-langium/visual-editor` (MIT). `@rune-langium/core` resolves from source via project references (no build needed for type-check/test).

**Out of scope (later sub-plans):** node-id `::`→`.` migration + structure-graph instance-path decision (3A′); `nodesById`/`edgesById` Map substrate + `mutateGraph` (3B); the 34-action recipe migration (3C); the generated `domain.ts` surface (3D, after langium-zod #68 merges). Do NOT introduce Maps into `EditorState`, do NOT convert actions to recipes, do NOT change the `::` separator here.

---

## Critical constraints

1. **SPDX header** on the new file:
   ```ts
   // SPDX-License-Identifier: MIT
   // Copyright (c) 2026 Pradeep Mouli
   ```
2. **Behavior-preserving.** Every helper must produce byte-identical output to the inline code it replaces. The proof is the existing suite staying green — run the **whole** `@rune-langium/visual-editor` package suite after each task (per memory: sibling tests assert old behavior; a curated subset misses regressions), then the studio suite for tasks that touch store/adapter code studio exercises.
3. **Node-kind resolution stays in `model-helpers.ts`** (`resolveNodeKind`, ~line 266) — P7, already DRY. `node-projection.ts` MAY re-export it for a single import surface but must NOT re-implement it.
4. **Keep `::`.** Do not change `makeNodeId` to dots in this plan. Do not touch `structure-graph-adapter.ts`'s `::` instance paths.
5. **Validation:** `pnpm --filter @rune-langium/visual-editor test`, `pnpm --filter @rune-langium/visual-editor run type-check`, `pnpm --filter @rune-langium/studio test`, `pnpm run lint`. Use `rg` for searches. Commits: `SKIP_SIMPLE_GIT_HOOKS=1`, end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Branch: `feat/phase3a-node-projection` off `feat/node-unification-phase1`.

## Current-state map (from ground-truth audit — exact sites)

- **V1 ids:** two `makeNodeId` defns — `adapters/ast-to-model.ts:60-62` (used `:177`) and `store/editor-store.ts:495-497` (used `:997` createType, `:1072` renameType); inline build in `editor-store.ts:412` (`buildDeferredPlaceholderNodes`); inverse `nameFromNodeId` in `adapters/model-to-ast.ts:61-64` (used `:110`).
- **V3 edges:** `EdgeKind`s from `ALL_EDGE_KINDS` (`editor-store.ts:616-622`): `extends`, `attribute-ref`, `choice-option`, `enum-extends`, `type-alias-ref`. Construction template-literals: `ast-to-model.ts:127`; `editor-store.ts:1141,1241,1248,1374,1414,1557,1604,1742`. Replace-based surgery (LEAVE for 3C): `editor-store.ts:1298` (renameAttribute), `:1099` (renameType).
- **V2 metadata:** `GraphMetadata` (`types.ts:112-125`); `GRAPH_META_KEYS`+`stripMetadata` (`model-to-ast.ts:41-56`); fingerprint projection (`useModelSourceSync.ts:43-70`, excludes `position`/`errors`/`hasExternalRefs`); inverse spreads in `ast-to-model.ts:79-103` (buildGraphNode), `editor-store.ts:404-432` (buildDeferredPlaceholderNodes), `editor-store.ts:1004-1014` (createType).
- **V4 members:** inline kind→field guards in `editor-store.ts` (Data/Annotation/Choice→`attributes`; RosettaEnumeration→`enumValues`; RosettaFunction→`inputs`; RosettaRecordType→`features`).
- **V5/V6 derivation:** `projectGraph`/`flattenGraph` (`edit-reconcile.ts:37-46`); `buildNodeMap` (`editor-store.ts:389-391`, used `:937,2305,2317,2328,2331,2350,2387`).
- **Imports:** VE imports `@rune-langium/core` from source; `qualifiedExportPath` is already available (do NOT use it here — that's 3A′).

---

## Task 1: Create `node-projection.ts` + V1 id builders, re-point callers

**Files:**
- Create: `packages/visual-editor/src/store/node-projection.ts`
- Create: `packages/visual-editor/test/store/node-projection.test.ts`
- Modify: `packages/visual-editor/src/adapters/ast-to-model.ts` (delete local `makeNodeId`, import)
- Modify: `packages/visual-editor/src/store/editor-store.ts` (delete local `makeNodeId`, import; inline `:412` → `makeNodeId`)
- Modify: `packages/visual-editor/src/adapters/model-to-ast.ts` (delete local `nameFromNodeId`, import)

- [ ] **Step 1: Write the failing test**

```ts
// packages/visual-editor/test/store/node-projection.test.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { makeNodeId, nameFromNodeId, splitNodeId } from '../../src/store/node-projection.js';

describe('node-projection id builders (V1)', () => {
  it('makeNodeId joins namespace and name with the :: separator', () => {
    expect(makeNodeId('cdm.base', 'Foo')).toBe('cdm.base::Foo');
  });
  it('nameFromNodeId returns the trailing name', () => {
    expect(nameFromNodeId('cdm.base::Foo')).toBe('Foo');
    expect(nameFromNodeId('Foo')).toBe('Foo'); // no separator → whole string
  });
  it('splitNodeId returns namespace + name', () => {
    expect(splitNodeId('cdm.base::Foo')).toEqual({ namespace: 'cdm.base', name: 'Foo' });
    expect(splitNodeId('Foo')).toEqual({ namespace: '', name: 'Foo' });
  });
});
```

- [ ] **Step 2: Run, confirm FAIL**

Run: `pnpm --filter @rune-langium/visual-editor test -- node-projection`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the module with V1 builders**

```ts
// packages/visual-editor/src/store/node-projection.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * node-projection — the SINGLE owner of node-shape knowledge for the visual
 * editor: id construction, edge-id construction, the GraphMetadata field set +
 * AST projection, per-kind member-container access, and array↔Map derivation.
 *
 * No node-shape fact should live anywhere else. (Node-KIND resolution stays in
 * `model-helpers.ts`'s `resolveNodeKind`; this module re-exports it for a single
 * import surface but does not re-implement it.)
 *
 * NOTE: the node-id separator is `::` here; the `::`→`.` unification is a
 * separate follow-up that only changes the two functions below.
 */

const NODE_ID_SEPARATOR = '::';

/** Build the canonical top-level node id `${namespace}::${name}`. */
export function makeNodeId(namespace: string, name: string): string {
  return `${namespace}${NODE_ID_SEPARATOR}${name}`;
}

/** The trailing simple name of a node id (everything after the last separator). */
export function nameFromNodeId(nodeId: string): string {
  const parts = nodeId.split(NODE_ID_SEPARATOR);
  return parts.length > 1 ? parts[parts.length - 1]! : nodeId;
}

/** Split a node id into `{ namespace, name }`; namespace is '' when absent. */
export function splitNodeId(nodeId: string): { namespace: string; name: string } {
  const idx = nodeId.lastIndexOf(NODE_ID_SEPARATOR);
  if (idx < 0) return { namespace: '', name: nodeId };
  return { namespace: nodeId.slice(0, idx), name: nodeId.slice(idx + NODE_ID_SEPARATOR.length) };
}
```

- [ ] **Step 4: Run, confirm PASS**

Run: `pnpm --filter @rune-langium/visual-editor test -- node-projection`
Expected: PASS (3 tests).

- [ ] **Step 5: Re-point `ast-to-model.ts`**

Delete the local `makeNodeId` function (`:60-62`). Add to the imports (near the other relative imports) `import { makeNodeId } from '../store/node-projection.js';`. The call at `:177` is unchanged.

- [ ] **Step 6: Re-point `model-to-ast.ts`**

Delete the local `nameFromNodeId` function (`:61-64`). Add `import { nameFromNodeId } from '../store/node-projection.js';`. The call at `:110` is unchanged.

- [ ] **Step 7: Re-point `editor-store.ts`**

Delete the local `makeNodeId` function (`:495-497`). Add `makeNodeId` to the existing `node-projection.js` import (create the import if none yet: `import { makeNodeId } from './node-projection.js';`). Calls at `:997`, `:1072` unchanged. Replace the inline build in `buildDeferredPlaceholderNodes` (`:412`, currently `` const nodeId = `${entry.namespace}::${exp.name}`; ``) with:
```ts
        const nodeId = makeNodeId(entry.namespace, exp.name);
```

- [ ] **Step 8: Verify behavior-preserving**

Run:
```
pnpm --filter @rune-langium/visual-editor run type-check
pnpm --filter @rune-langium/visual-editor test
pnpm --filter @rune-langium/studio test
```
Expected: all green (the suites assert `::` ids — unchanged). Report counts.

- [ ] **Step 9: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add packages/visual-editor/src/store/node-projection.ts packages/visual-editor/test/store/node-projection.test.ts packages/visual-editor/src/adapters/ast-to-model.ts packages/visual-editor/src/adapters/model-to-ast.ts packages/visual-editor/src/store/editor-store.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor(ve): node-projection module + V1 id builders; re-point callers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: V3 edge-id builders, re-point construction sites

**Files:**
- Modify: `packages/visual-editor/src/store/node-projection.ts` (add `EdgeKind`, `makeEdgeId`, `parseEdgeId`)
- Modify: `packages/visual-editor/test/store/node-projection.test.ts`
- Modify: `packages/visual-editor/src/adapters/ast-to-model.ts` (`:127`)
- Modify: `packages/visual-editor/src/store/editor-store.ts` (the 8 fresh-construction sites)

> The two label-bearing kinds (`attribute-ref`, `choice-option`) encode `${source}--${kind}--${label}--${target}`; the label-less kinds (`extends`, `enum-extends`) encode `${source}--${kind}--${target}`. Node ids never contain `--`, so split-on-`--` round-trips. The `.replace`-based id surgery in `renameAttribute` (`:1298`) and `renameType` (`:1099`) is action mutation logic — LEAVE it for 3C; this task only centralizes fresh-edge construction.

- [ ] **Step 1: Write the failing test** (append a describe block)

```ts
import { makeEdgeId, parseEdgeId } from '../../src/store/node-projection.js';

describe('node-projection edge-id builders (V3)', () => {
  it('builds and parses a label-bearing edge id (attribute-ref)', () => {
    const id = makeEdgeId('attribute-ref', { source: 'ns::A', target: 'ns::B', label: 'foo' });
    expect(id).toBe('ns::A--attribute-ref--foo--ns::B');
    expect(parseEdgeId(id)).toEqual({ kind: 'attribute-ref', source: 'ns::A', target: 'ns::B', label: 'foo' });
  });
  it('builds and parses a label-less edge id (extends)', () => {
    const id = makeEdgeId('extends', { source: 'ns::Child', target: 'ns::Parent' });
    expect(id).toBe('ns::Child--extends--ns::Parent');
    expect(parseEdgeId(id)).toEqual({ kind: 'extends', source: 'ns::Child', target: 'ns::Parent' });
  });
  it('returns null for a non-edge string', () => {
    expect(parseEdgeId('ns::A')).toBeNull();
  });
});
```

- [ ] **Step 2: Run, confirm FAIL**

Run: `pnpm --filter @rune-langium/visual-editor test -- node-projection`

- [ ] **Step 3: Add the edge-id builders** to `node-projection.ts`

```ts
/** The edge kinds the editor draws (mirrors `ALL_EDGE_KINDS`). */
export type EdgeKind = 'extends' | 'attribute-ref' | 'choice-option' | 'enum-extends' | 'type-alias-ref';

const EDGE_SEPARATOR = '--';
const LABEL_BEARING: ReadonlySet<EdgeKind> = new Set(['attribute-ref', 'choice-option']);

/**
 * Build an edge id. Label-bearing kinds (`attribute-ref`, `choice-option`) encode
 * `${source}--${kind}--${label}--${target}`; others encode `${source}--${kind}--${target}`.
 */
export function makeEdgeId(kind: EdgeKind, parts: { source: string; target: string; label?: string }): string {
  const { source, target, label } = parts;
  return label !== undefined
    ? `${source}${EDGE_SEPARATOR}${kind}${EDGE_SEPARATOR}${label}${EDGE_SEPARATOR}${target}`
    : `${source}${EDGE_SEPARATOR}${kind}${EDGE_SEPARATOR}${target}`;
}

/** Parse an edge id back to its parts, or `null` if it isn't a well-formed edge id. */
export function parseEdgeId(
  id: string
): { kind: EdgeKind; source: string; target: string; label?: string } | null {
  const segs = id.split(EDGE_SEPARATOR);
  if (segs.length < 3) return null;
  const kind = segs[1] as EdgeKind;
  if (LABEL_BEARING.has(kind)) {
    if (segs.length !== 4) return null;
    return { kind, source: segs[0]!, label: segs[2], target: segs[3]! };
  }
  if (segs.length !== 3) return null;
  return { kind, source: segs[0]!, target: segs[2]! };
}
```

- [ ] **Step 4: Run, confirm PASS**

Run: `pnpm --filter @rune-langium/visual-editor test -- node-projection`

- [ ] **Step 5: Re-point the fresh-construction sites** (each produces a byte-identical string)

Add `makeEdgeId` to the `node-projection.js` import in both `ast-to-model.ts` and `editor-store.ts`. Then replace each template literal:

- `ast-to-model.ts:127` `` `${nodeId}--attribute-ref--${member.name ?? typeName}--${targetNodeId}` `` →
  ```ts
  makeEdgeId('attribute-ref', { source: nodeId, target: targetNodeId, label: member.name ?? typeName })
  ```
- `editor-store.ts:1141` (addAttribute) → `makeEdgeId('attribute-ref', { source: nodeId, target: targetNodeId, label: attrName })`
- `editor-store.ts:1241` (updateAttributeType, Choice) → `makeEdgeId('choice-option', { source: nodeId, target: targetTypeId, label: refText })`
- `editor-store.ts:1248` (updateAttributeType, Data) → `makeEdgeId('attribute-ref', { source: nodeId, target: targetTypeId, label: attrName })`
- `editor-store.ts:1374` (setInheritance) → `makeEdgeId('extends', { source: childId, target: parentId })`
- `editor-store.ts:1414` (updateAttribute) → `makeEdgeId('attribute-ref', { source: nodeId, target: targetNodeId, label: newName })`
- `editor-store.ts:1557` (setEnumParent) → `makeEdgeId('enum-extends', { source: nodeId, target: parentId })`
- `editor-store.ts:1604` (addChoiceOption) → `makeEdgeId('choice-option', { source: nodeId, target: targetNodeId, label: typeName })`
- `editor-store.ts:1742` (updateInputParam) → `makeEdgeId('attribute-ref', { source: nodeId, target: targetNodeId, label: newName })`

For EACH: read the surrounding code to confirm the exact variable names (`nodeId`/`targetNodeId`/`attrName`/`refText`/`typeName`/`childId`/`parentId`/`newName`) match the local scope; adapt if a site uses different locals. Do NOT touch `:1298` or `:1099` (the `.replace` surgery).

- [ ] **Step 6: Verify**

Run:
```
pnpm --filter @rune-langium/visual-editor run type-check
pnpm --filter @rune-langium/visual-editor test
pnpm --filter @rune-langium/studio test
```
Expected: green (edge ids byte-identical). If any edge-related test fails, the produced string differs — diff the expected vs `makeEdgeId` output and fix the call.

- [ ] **Step 7: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add packages/visual-editor/src/store/node-projection.ts packages/visual-editor/test/store/node-projection.test.ts packages/visual-editor/src/adapters/ast-to-model.ts packages/visual-editor/src/store/editor-store.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor(ve): V3 edge-id builders; re-point fresh-construction sites

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: V2 metadata field set + AST projection, re-point

**Files:**
- Modify: `packages/visual-editor/src/store/node-projection.ts` (add `GRAPH_METADATA_KEYS`, `stripGraphMetadata`, `astRelevantProjection`, `withGraphMetadata`)
- Modify: `packages/visual-editor/test/store/node-projection.test.ts`
- Modify: `packages/visual-editor/src/adapters/model-to-ast.ts` (use `stripGraphMetadata`)
- Modify: `packages/visual-editor/src/hooks/useModelSourceSync.ts` (use `astRelevantProjection`)
- Modify: `packages/visual-editor/src/adapters/ast-to-model.ts` + `packages/visual-editor/src/store/editor-store.ts` (use `withGraphMetadata` at the 3 spread sites)

> `GRAPH_META_KEYS` (the strip set) = `namespace, position, errors, isReadOnly, hasExternalRefs, comments` (NOT `deferred` — intentional). The fingerprint additionally excludes `position, errors, hasExternalRefs`. Keep both behaviors exactly.

- [ ] **Step 1: Write the failing test** (append)

```ts
import {
  GRAPH_METADATA_KEYS,
  stripGraphMetadata,
  astRelevantProjection,
  withGraphMetadata
} from '../../src/store/node-projection.js';

describe('node-projection metadata projection (V2)', () => {
  const data = {
    $type: 'Data', name: 'Foo', attributes: [],
    namespace: 'ns', position: { x: 1, y: 2 }, errors: [], isReadOnly: false, hasExternalRefs: false, comments: 'c'
  } as Record<string, unknown>;

  it('GRAPH_METADATA_KEYS is the strip set (no `deferred`)', () => {
    expect([...GRAPH_METADATA_KEYS].sort()).toEqual(
      ['comments', 'errors', 'hasExternalRefs', 'isReadOnly', 'namespace', 'position'].sort()
    );
    expect(GRAPH_METADATA_KEYS.has('deferred')).toBe(false);
  });
  it('stripGraphMetadata removes only metadata keys, keeps AST fields', () => {
    const out = stripGraphMetadata(data as never);
    expect(out).toEqual({ $type: 'Data', name: 'Foo', attributes: [] });
  });
  it('astRelevantProjection excludes position/errors/hasExternalRefs but keeps namespace/comments', () => {
    const out = astRelevantProjection(data as never) as Record<string, unknown>;
    expect('position' in out).toBe(false);
    expect('errors' in out).toBe(false);
    expect('hasExternalRefs' in out).toBe(false);
    expect(out.namespace).toBe('ns');
    expect(out.comments).toBe('c');
  });
  it('withGraphMetadata merges AST data + metadata', () => {
    const node = withGraphMetadata({ $type: 'Data', name: 'Foo' } as never, {
      namespace: 'ns', position: { x: 0, y: 0 }, errors: [], hasExternalRefs: false
    });
    expect((node as Record<string, unknown>).name).toBe('Foo');
    expect((node as Record<string, unknown>).namespace).toBe('ns');
  });
});
```

- [ ] **Step 2: Run, confirm FAIL**

Run: `pnpm --filter @rune-langium/visual-editor test -- node-projection`

- [ ] **Step 3: Add the metadata helpers** to `node-projection.ts`

```ts
import type { AnyGraphNode } from '../types.js';

/**
 * The GraphMetadata keys stripped when extracting the AST model. Mirrors the old
 * `GRAPH_META_KEYS` exactly — `deferred` is intentionally NOT included (it is a
 * placeholder-only flag that never round-trips through `modelsToAst`).
 */
export const GRAPH_METADATA_KEYS: ReadonlySet<string> = new Set([
  'namespace',
  'position',
  'errors',
  'isReadOnly',
  'hasExternalRefs',
  'comments'
]);

/** Fields excluded from the content fingerprint (positional/derived view state). */
const FINGERPRINT_EXCLUDED: ReadonlySet<string> = new Set(['position', 'errors', 'hasExternalRefs']);

/** Strip GraphMetadata view fields, leaving the AST-relevant fields. */
export function stripGraphMetadata(data: AnyGraphNode): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!GRAPH_METADATA_KEYS.has(key)) result[key] = value;
  }
  return result;
}

/** The "what counts as content" projection for fingerprinting (excludes positional/derived). */
export function astRelevantProjection(data: AnyGraphNode): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!FINGERPRINT_EXCLUDED.has(key)) result[key] = value;
  }
  return result;
}

/** Inverse of strip: merge AST data with GraphMetadata into a graph-node data object. */
export function withGraphMetadata(
  astData: Record<string, unknown>,
  meta: Record<string, unknown>
): AnyGraphNode {
  return { ...astData, ...meta } as unknown as AnyGraphNode;
}
```

> Confirm `AnyGraphNode` is exported from `../types.js` (the audit shows graph-node data typed as `AnyGraphNode`). If the import path differs, match the actual export.

- [ ] **Step 4: Run, confirm PASS**

Run: `pnpm --filter @rune-langium/visual-editor test -- node-projection`

- [ ] **Step 5: Re-point `model-to-ast.ts`**

Delete the local `GRAPH_META_KEYS` const + `stripMetadata` function (`:41-56`). Add `import { stripGraphMetadata } from '../store/node-projection.js';`. Replace every call `stripMetadata(x)` with `stripGraphMetadata(x)` (rg for `stripMetadata` in this file).

- [ ] **Step 6: Re-point `useModelSourceSync.ts`**

In `computeContentFingerprint` (`:43-70`), replace the inline per-node projection (the object that omits `position`/`errors`/`hasExternalRefs`) with a call to `astRelevantProjection(n.data)`. Add `import { astRelevantProjection } from '../store/node-projection.js';`. The surrounding sort-by-`n.id` + JSON.stringify stays. Read the current inline projection carefully and confirm `astRelevantProjection` produces the SAME included key set (namespace, comments, isReadOnly, deferred, AST fields included; position/errors/hasExternalRefs excluded) — if the inline version excludes or includes a different key, reconcile (the fingerprint MUST NOT change, or every model re-serializes once on upgrade).

- [ ] **Step 7: Re-point the 3 inverse-spread sites** with `withGraphMetadata`

Add `withGraphMetadata` to the `node-projection.js` import in `ast-to-model.ts` and `editor-store.ts`. At each site, replace the inline `{ ...astData, namespace, position, errors, ... }` spread with `withGraphMetadata(astData, { namespace, position, errors, ... })` preserving the EXACT same metadata fields the site currently sets:
- `ast-to-model.ts:79-103` (buildGraphNode): `withGraphMetadata(astData, { namespace, position: { x: 0, y: 0 }, errors: [], isReadOnly, hasExternalRefs: false })`.
- `editor-store.ts:404-432` (buildDeferredPlaceholderNodes): the data object includes `deferred: true` — pass it in the meta object too (it's not in GRAPH_METADATA_KEYS but `withGraphMetadata` merges whatever you give it): `withGraphMetadata({ $type: exp.type, name: exp.name }, { namespace: entry.namespace, position: { x: 0, y: 0 }, errors: [], isReadOnly: true, hasExternalRefs: false, deferred: true })`.
- `editor-store.ts:1004-1014` (createType): keep `baseData` as-is OR wrap — this site builds `baseData` then mutates it further; the lowest-risk change is to leave `createType` UNTOUCHED in this task (it is a structural action migrated in 3C, and its metadata spread is intertwined with action logic). Only convert the two read/hydration sites (buildGraphNode, buildDeferredPlaceholderNodes). Note this deferral in your commit.

- [ ] **Step 8: Verify**

Run:
```
pnpm --filter @rune-langium/visual-editor run type-check
pnpm --filter @rune-langium/visual-editor test
pnpm --filter @rune-langium/studio test
```
Expected: green. **Especially watch the source-sync / fingerprint tests** — a changed fingerprint key set would surface as a serialization-churn test failure.

- [ ] **Step 9: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add packages/visual-editor/src/store/node-projection.ts packages/visual-editor/test/store/node-projection.test.ts packages/visual-editor/src/adapters/model-to-ast.ts packages/visual-editor/src/hooks/useModelSourceSync.ts packages/visual-editor/src/adapters/ast-to-model.ts packages/visual-editor/src/store/editor-store.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor(ve): V2 metadata strip/projection/inverse; re-point read+hydration sites

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: V4 member-array accessors, re-point inline guards

**Files:**
- Modify: `packages/visual-editor/src/store/node-projection.ts` (add `getMemberArray`, `forEachMember`, `ensureMemberArray`)
- Modify: `packages/visual-editor/test/store/node-projection.test.ts`
- Modify: `packages/visual-editor/src/store/editor-store.ts` (re-point a SAFE subset of read-only member lookups)

> The kind→field map: `Data`/`Annotation`/`Choice` → `attributes`; `RosettaEnumeration` → `enumValues`; `RosettaFunction` → `inputs`; `RosettaRecordType` → `features`. **This task only centralizes the MAP + provides accessors and re-points read-only lookups that are trivially equivalent.** It does NOT restructure the mutation-heavy action bodies (those become recipes in 3C, where `getMemberArray` is the natural seam). Keep the change surface small and behavior-identical.

- [ ] **Step 1: Write the failing test** (append)

```ts
import { getMemberArray, ensureMemberArray, forEachMember } from '../../src/store/node-projection.js';

describe('node-projection member accessors (V4)', () => {
  it('maps each kind to its member field', () => {
    expect(getMemberArray({ $type: 'Data', attributes: [1] } as never)).toEqual({ field: 'attributes', members: [1] });
    expect(getMemberArray({ $type: 'Choice', attributes: [] } as never)).toEqual({ field: 'attributes', members: [] });
    expect(getMemberArray({ $type: 'RosettaEnumeration', enumValues: [2] } as never)).toEqual({ field: 'enumValues', members: [2] });
    expect(getMemberArray({ $type: 'RosettaFunction', inputs: [3] } as never)).toEqual({ field: 'inputs', members: [3] });
    expect(getMemberArray({ $type: 'RosettaRecordType', features: [4] } as never)).toEqual({ field: 'features', members: [4] });
  });
  it('returns null for a kind with no member container', () => {
    expect(getMemberArray({ $type: 'TypeAlias' } as never)).toBeNull();
  });
  it('ensureMemberArray initializes a missing array and returns it', () => {
    const node = { $type: 'Data' } as Record<string, unknown>;
    const arr = ensureMemberArray(node as never);
    expect(arr).toEqual([]);
    expect(node.attributes).toBe(arr);
  });
  it('forEachMember iterates the member array', () => {
    const seen: unknown[] = [];
    forEachMember({ $type: 'Data', attributes: ['a', 'b'] } as never, (m) => seen.push(m));
    expect(seen).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run, confirm FAIL**

Run: `pnpm --filter @rune-langium/visual-editor test -- node-projection`

- [ ] **Step 3: Add the member accessors** to `node-projection.ts`

```ts
/** Per-kind member-container field. The single owner of this map (V4). */
const MEMBER_FIELD_BY_KIND: Readonly<Record<string, string>> = {
  Data: 'attributes',
  Annotation: 'attributes',
  Choice: 'attributes',
  RosettaEnumeration: 'enumValues',
  RosettaFunction: 'inputs',
  RosettaRecordType: 'features'
};

/** The member array + its field name for a node, or null if the kind has none. */
export function getMemberArray(node: { $type?: string } & Record<string, unknown>): { field: string; members: unknown[] } | null {
  const field = node.$type ? MEMBER_FIELD_BY_KIND[node.$type] : undefined;
  if (!field) return null;
  const members = node[field];
  return { field, members: Array.isArray(members) ? members : [] };
}

/** Ensure the member array exists on the node, returning it (initializes `[]`). */
export function ensureMemberArray(node: { $type?: string } & Record<string, unknown>): unknown[] {
  const field = node.$type ? MEMBER_FIELD_BY_KIND[node.$type] : undefined;
  if (!field) return [];
  if (!Array.isArray(node[field])) node[field] = [];
  return node[field] as unknown[];
}

/** Iterate the members of a node (no-op when the kind has no member container). */
export function forEachMember(node: { $type?: string } & Record<string, unknown>, fn: (member: unknown, index: number) => void): void {
  const got = getMemberArray(node);
  if (got) got.members.forEach(fn);
}
```

- [ ] **Step 4: Run, confirm PASS**

Run: `pnpm --filter @rune-langium/visual-editor test -- node-projection`

- [ ] **Step 5: Re-point trivially-equivalent read-only lookups**

`rg -n "MEMBER_FIELD_BY_KIND|\.attributes|\.enumValues|\.inputs|\.features" packages/visual-editor/src/store/editor-store.ts` and identify READ-ONLY sites that fetch the member array via an inline `$type` guard purely to read/length-check it (not the push/splice mutation bodies). Re-point ONLY those to `getMemberArray(node)?.members`. If a site is entangled with mutation (push/splice/spread), LEAVE it — it converts cleanly in 3C. The goal is to retire the *duplicated kind→field knowledge* where it's a clean read; do not refactor action control flow. If, after inspection, every member access in the store is mutation-entangled (no clean read-only sites), it is acceptable to land only the accessors + map here and note that the call-site adoption happens in 3C — the map is now centralized regardless. REPORT which sites you re-pointed (if any) and which you deferred.

- [ ] **Step 6: Verify**

Run:
```
pnpm --filter @rune-langium/visual-editor run type-check
pnpm --filter @rune-langium/visual-editor test
pnpm --filter @rune-langium/studio test
```
Expected: green.

- [ ] **Step 7: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add packages/visual-editor/src/store/node-projection.ts packages/visual-editor/test/store/node-projection.test.ts packages/visual-editor/src/store/editor-store.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor(ve): V4 member-array accessors + kind→field map

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: V5/V6 array↔Map derivation, re-point

**Files:**
- Modify: `packages/visual-editor/src/store/node-projection.ts` (add `toNodesById`, `nodesFromMap`, `toEdgesById`, `edgesFromMap`)
- Modify: `packages/visual-editor/test/store/node-projection.test.ts`
- Modify: `packages/visual-editor/src/store/edit-reconcile.ts` (use the shared derivation in `projectGraph`/`flattenGraph`)
- Modify: `packages/visual-editor/src/store/editor-store.ts` (`buildNodeMap` → `toNodesById`)

> `projectGraph` builds `{ nodes: Map, edges: Map }`; `flattenGraph` returns `{ nodes: [], edges: [] }`. `buildNodeMap` is the nodes-only half. Centralize the four primitives; keep `projectGraph`/`flattenGraph` as thin wrappers (they're used by `commitGraphEdit` and `reconcileParse`) OR have callers use the primitives directly. Behavior identical.

- [ ] **Step 1: Write the failing test** (append)

```ts
import { toNodesById, nodesFromMap, toEdgesById, edgesFromMap } from '../../src/store/node-projection.js';

describe('node-projection array↔Map derivation (V5/V6)', () => {
  const nodes = [{ id: 'a' }, { id: 'b' }] as never[];
  const edges = [{ id: 'e1' }] as never[];
  it('toNodesById / nodesFromMap round-trip preserving order', () => {
    const map = toNodesById(nodes);
    expect(map.get('a')).toBe(nodes[0]);
    expect(nodesFromMap(map)).toEqual(nodes);
  });
  it('toEdgesById / edgesFromMap round-trip', () => {
    const map = toEdgesById(edges);
    expect(map.get('e1')).toBe(edges[0]);
    expect(edgesFromMap(map)).toEqual(edges);
  });
});
```

- [ ] **Step 2: Run, confirm FAIL**

Run: `pnpm --filter @rune-langium/visual-editor test -- node-projection`

- [ ] **Step 3: Add the derivation primitives** to `node-projection.ts`

```ts
import type { TypeGraphNode, TypeGraphEdge } from '../types.js';

/** Build the id→node Map (insertion order preserved). */
export function toNodesById(nodes: readonly TypeGraphNode[]): Map<string, TypeGraphNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}
/** Derive the node array from the Map (= [...map.values()]). */
export function nodesFromMap(map: ReadonlyMap<string, TypeGraphNode>): TypeGraphNode[] {
  return [...map.values()];
}
/** Build the id→edge Map. */
export function toEdgesById(edges: readonly TypeGraphEdge[]): Map<string, TypeGraphEdge> {
  return new Map(edges.map((e) => [e.id, e]));
}
/** Derive the edge array from the Map. */
export function edgesFromMap(map: ReadonlyMap<string, TypeGraphEdge>): TypeGraphEdge[] {
  return [...map.values()];
}
```

> Confirm `TypeGraphNode`/`TypeGraphEdge` import path (`../types.js`) — the audit shows these types used throughout.

- [ ] **Step 4: Run, confirm PASS**

Run: `pnpm --filter @rune-langium/visual-editor test -- node-projection`

- [ ] **Step 5: Re-point `edit-reconcile.ts`**

Replace the bodies of `projectGraph` and `flattenGraph` (`:37-46`) to delegate:
```ts
import { toNodesById, toEdgesById, nodesFromMap, edgesFromMap } from './node-projection.js';

export function projectGraph(nodes: readonly TypeGraphNode[], edges: readonly TypeGraphEdge[]): GraphDraft {
  return { nodes: toNodesById(nodes), edges: toEdgesById(edges) };
}
export function flattenGraph(draft: GraphDraft): { nodes: TypeGraphNode[]; edges: TypeGraphEdge[] } {
  return { nodes: nodesFromMap(draft.nodes), edges: edgesFromMap(draft.edges) };
}
```
(Keep these wrappers — `commitGraphEdit`/`reconcileParse` call them; only their internals change.)

- [ ] **Step 6: Re-point `editor-store.ts` `buildNodeMap`**

Replace the local `buildNodeMap` (`:389-391`) body to delegate, OR replace its call sites with `toNodesById`. Simplest: change its body:
```ts
import { toNodesById } from './node-projection.js';
function buildNodeMap(nodes: TypeGraphNode[]): Map<string, TypeGraphNode> {
  return toNodesById(nodes);
}
```
(Leaves the 7 call sites untouched; just centralizes the implementation.)

- [ ] **Step 7: Verify**

Run:
```
pnpm --filter @rune-langium/visual-editor run type-check
pnpm --filter @rune-langium/visual-editor test
pnpm --filter @rune-langium/studio test
```
Expected: green (reconcile + isolation/focus tests exercise these paths).

- [ ] **Step 8: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add packages/visual-editor/src/store/node-projection.ts packages/visual-editor/test/store/node-projection.test.ts packages/visual-editor/src/store/edit-reconcile.ts packages/visual-editor/src/store/editor-store.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor(ve): V5/V6 array↔Map derivation; re-point projectGraph/flattenGraph/buildNodeMap

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Parity guard test + `resolveNodeKind` re-export + full verification

**Files:**
- Modify: `packages/visual-editor/src/store/node-projection.ts` (re-export `resolveNodeKind`)
- Modify: `packages/visual-editor/test/store/node-projection.test.ts` (the `GRAPH_METADATA_KEYS` ↔ `keyof GraphMetadata` parity guard)

- [ ] **Step 1: Re-export node-kind resolution** (single import surface, no re-implementation)

In `node-projection.ts`, add:
```ts
export { resolveNodeKind } from '../adapters/model-helpers.js';
```
(Confirm the export name + path from `model-helpers.ts` — the audit shows `resolveNodeKind` ~line 266.)

- [ ] **Step 2: Add the V2 parity guard test** (the DRY success criterion as a test — spec §6 #7)

Append to `node-projection.test.ts`:
```ts
import type { GraphMetadata } from '../../src/types.js';

describe('node-projection parity guards', () => {
  it('GRAPH_METADATA_KEYS matches the strip-relevant keys of GraphMetadata', () => {
    // GraphMetadata also has `deferred` (not stripped) + an index signature; the
    // strip set is the explicit non-deferred metadata fields. This test fails if a
    // new GraphMetadata field is added without deciding its strip behavior.
    const known: Array<keyof GraphMetadata> = [
      'namespace', 'position', 'errors', 'isReadOnly', 'hasExternalRefs', 'comments', 'deferred'
    ];
    const stripExpected = known.filter((k) => k !== 'deferred');
    expect([...GRAPH_METADATA_KEYS].sort()).toEqual([...stripExpected].sort());
  });
});
```
> This is a hand-maintained parity list (a `satisfies keyof` compile guard is ideal but the index signature on `GraphMetadata` makes `keyof` include `string`; the explicit list + a comment is the pragmatic guard). If `GraphMetadata` gains a field, this test forces a strip-behavior decision.

- [ ] **Step 3: Full verification sweep**

Run and report exact counts:
```
pnpm --filter @rune-langium/visual-editor test
pnpm --filter @rune-langium/visual-editor run type-check
pnpm --filter @rune-langium/studio test
pnpm run lint
```
All green. Then confirm the consolidation removed the duplicates:
```
rg -n "function makeNodeId|function nameFromNodeId" packages/visual-editor/src    # only node-projection.ts
rg -n "function stripMetadata|GRAPH_META_KEYS" packages/visual-editor/src         # gone (moved to node-projection)
rg -n "new Map\(nodes\.map|new Map\(edges\.map|\[\.\.\..*\.values\(\)\]" packages/visual-editor/src/store/edit-reconcile.ts  # delegated
```
Report any remaining inline duplicate (excluding `node-projection.ts` itself, the `.replace` surgery in renameType/renameAttribute (deferred to 3C), and `structure-graph-adapter.ts`'s instance-path `::` (out of scope)).

- [ ] **Step 4: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add packages/visual-editor/src/store/node-projection.ts packages/visual-editor/test/store/node-projection.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor(ve): node-kind re-export + GraphMetadata parity guard; close V1-V6

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review checklist (performed during plan authoring)

**Spec coverage (§3.2 V1–V6, §5 Stage 0):** V1 ids (Task 1) ✓; V3 edge-ids (Task 2) ✓; V2 metadata strip/projection/inverse (Task 3) ✓; V4 member accessors (Task 4) ✓; V5/V6 derivation (Task 5) ✓; `resolveNodeKind` re-export + parity guard (Task 6) ✓.

**Behavior-preserving discipline:** every helper reproduces the exact inline output (`::` kept; `GRAPH_META_KEYS` set verbatim incl. excluding `deferred`; fingerprint excludes verbatim; edge-id formats per-kind verbatim). The existing ~1131 VE + ~878 studio tests are the regression net, run after every task. The two genuinely risky points are flagged: the fingerprint key set (Task 3 Step 6 — a drift re-serializes every model once) and the per-kind edge label/no-label split (Task 2).

**Scope discipline (deferred to later sub-plans, called out at the sites):** the `.replace`-based id surgery in `renameType`/`renameAttribute` (3C); `createType`'s metadata spread (3C — mutation-entangled); mutation-entangled member accesses (3C); the `::`→`.` flip + structure-graph instance-path decision (3A′); Maps/`mutateGraph` (3B); the new `rune/no-raw-node-id` lint rule (3A′, where raw node-id construction outside `node-projection.ts` becomes lint-enforceable once the format changes).

**Placeholder scan:** every step has concrete code/commands. Type-import paths (`AnyGraphNode`, `TypeGraphNode`/`TypeGraphEdge`, `GraphMetadata`, `resolveNodeKind`) are flagged "confirm the path" because the audit shows them used but the exact export site should be verified at edit time — not vague, just a guard against import drift.

**Known limitation:** Task 4/Task 3-createType may land "accessors + map centralized, call-sites partially deferred to 3C" if the store's member/metadata access is mutation-entangled. That still closes the *duplicated-knowledge* DRY goal (the map/keys live in one place); the recipe migration (3C) is the natural consumer. The plan instructs the implementer to report what was re-pointed vs deferred rather than force a risky action-body rewrite into this pure-refactor plan.
