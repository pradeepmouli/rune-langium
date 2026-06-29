# Editable-Surface Rendering (B2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every construct the visual-editor inspector can edit/add/delete — conditions, functions, typeAliases, annotations, synonyms, and `deleteType` — round-trip to `.rosetta` source losslessly; expression bodies render from the committed `$cstText` (verbatim).

**Architecture:** Extend the Plan A renderer. Add per-construct cases to the render-core dispatcher (reusing its `renderAttribute`/`childList`/`indentBlock` helpers; expression bodies emit `$cstText`). Capture Mutative **inverse** patches at the `mutateGraph` chokepoint so deletions (a `remove` patch carrying the deleted node's `$cstRange`) drop their source range. Rename the AST→source path `serialize→render` (reserve `serialize` for JSON).

**Tech Stack:** TypeScript 5.9 (strict, ESM/NodeNext), Langium 4.3, Mutative, Zustand, Vitest. Packages: `@rune-langium/core`, `@rune-langium/codegen`, `@rune-langium/visual-editor`.

## Global Constraints

- SPDX: `packages/` = `MIT`; `apps/studio/` = `FSL-1.1-ALv2`. New files get the header for their directory.
- ESM with `.js` import specifiers (NodeNext).
- **`render` naming**: the AST→`.rosetta` path uses `render*`; `serialize` is reserved for JSON (`JsonSerializer`, `serializeRuneModel`). No new `serialize*` symbols in this path.
- Expression bodies (Condition / Operation / Shortcut) render **verbatim from `expression.$cstText`** (fallback `expression.$cstNode?.text`) — no parsing, no reformatting. (Native structural expression rendering is B1.)
- Cross-references render `ref.$refText`, never `.ref`.
- `$cstRange` is read-only post-parse; dirtiness + removals come only from Mutative patches / inverse patches.
- Unchanged children always ride their CST slice (Plan A invariant).
- Commit with `SKIP_SIMPLE_GIT_HOOKS=1`.
- **Validation runs FULL suites** (a filtered run let a broken test slip in Plan A): `pnpm --filter @rune-langium/core --filter @rune-langium/codegen run build`, then `pnpm run test` (0 failures) and `pnpm run type-check` (0 errors). Per-construct iteration may use `pnpm --filter @rune-langium/codegen test -- <pat>` / `pnpm --filter @rune-langium/visual-editor test -- <pat>`, but each task ends with the full run.

---

## File Structure

- `packages/codegen/src/emit/rosetta/rosetta-emit-core.ts` → renamed **`rosetta-render-core.ts`**: the render dispatcher + per-construct render functions. Gains `Condition`, `RosettaFunction`, `Operation`, `ShortcutDeclaration`, `RosettaTypeAlias`, `AnnotationRef`, synonym cases.
- `packages/codegen/src/rosetta.ts`: browser-safe subpath barrel — re-exports renamed `renderNode`/`renderModel` + types.
- `packages/visual-editor/src/serialize/cst-reuse-serializer.ts` → renamed **`cst-reuse-renderer.ts`**: `renderNamespace` (was `serializeNamespaceToSource`); assembly gains range-drop for deletions.
- `packages/visual-editor/src/hooks/useModelSourceSync.ts`: thread `removals` (deleted ranges) into the renderer; consume `pendingInversePatches`.
- `packages/visual-editor/src/store/editor-store.ts`: capture inverse patches; `pendingInversePatches` state; new `updateTypeAliasType` action.
- `packages/visual-editor/src/components/editors/TypeAliasForm.tsx`: wire the wrapped-type select to the new action.
- Tests under `packages/codegen/test/emit/rosetta/` and `packages/visual-editor/test/serialize/` + `test/store/`.

---

## Task 1: Rename the AST→source path `serialize`/`emit` → `render`

**Files:**
- Rename: `packages/codegen/src/emit/rosetta/rosetta-emit-core.ts` → `packages/codegen/src/emit/rosetta/rosetta-render-core.ts`
- Rename: `packages/visual-editor/src/serialize/cst-reuse-serializer.ts` → `packages/visual-editor/src/serialize/cst-reuse-renderer.ts`
- Modify: `packages/codegen/src/rosetta.ts`; all importers + tests.

**Interfaces:**
- Produces: `renderNode(node, renderChild): string | null`, `renderModel(model): string`, type `RenderChild`, type `DehydratedNode` (from `@rune-langium/codegen/rosetta`); `renderNamespace(args)` (was `serializeNamespaceToSource`) from `cst-reuse-renderer.js`. Internal helpers renamed `emit*`→`render*` (`renderAttribute`, `renderData`, `renderChoice`, `renderChoiceOption`, `renderEnum`, `renderEnumValue`).

- [ ] **Step 1: Rename the codegen render-core symbols + file**

`git mv packages/codegen/src/emit/rosetta/rosetta-emit-core.ts packages/codegen/src/emit/rosetta/rosetta-render-core.ts`. In that file rename: `emitNode`→`renderNode`, `emitModelText`→`renderModel`, `EmitChild`→`RenderChild`, and the private `emit*` helpers (`emitAttribute`→`renderAttribute`, `emitData`→`renderData`, `emitChoice`→`renderChoice`, `emitChoiceOption`→`renderChoiceOption`, `emitEnum`→`renderEnum`, `emitEnumValue`→`renderEnumValue`). Keep `childList`/`indentBlock`/`formatCardinality`/`refText`/`definitionLine`/`escapeString` names (not serialize-conflated) but they may be renamed too if trivial — leave them to minimize churn.

- [ ] **Step 2: Update the subpath barrel**

`packages/codegen/src/rosetta.ts`:
```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
export { renderNode, renderModel } from './emit/rosetta/rosetta-render-core.js';
export type { RenderChild, DehydratedNode } from './emit/rosetta/rosetta-render-core.js';
```

- [ ] **Step 3: Rename the visual-editor renderer + file**

`git mv packages/visual-editor/src/serialize/cst-reuse-serializer.ts packages/visual-editor/src/serialize/cst-reuse-renderer.ts`. Rename `serializeNamespaceToSource`→`renderNamespace`, `SerializeArgs`→`RenderArgs`. Update its import of the emit-core to `import { renderNode, type RenderChild, type DehydratedNode } from '@rune-langium/codegen/rosetta';` and all internal `emitNode`/`EmitChild` references.

- [ ] **Step 4: Update all importers + tests**

Run `rg -n "serializeNamespaceToSource|emitNode|emitModelText|EmitChild|rosetta-emit-core|cst-reuse-serializer|SerializeArgs" packages apps --type ts` and update every hit: `useModelSourceSync.ts` (`buildSourceForNamespaces` calls `renderNamespace`), `RuneTypeGraph.tsx` (`exportRosetta` uses `renderModel`), all test files (`rosetta-emit-core.test.ts`→keep name or rename to `rosetta-render-core.test.ts`; update imports/calls), and any others.

- [ ] **Step 5: Build + full suites + type-check**

Run: `pnpm --filter @rune-langium/core --filter @rune-langium/codegen run build`
Run: `pnpm run test`
Run: `pnpm run type-check`
Expected: 0 failures, 0 type errors (pure rename — behavior unchanged).

- [ ] **Step 6: Commit**

```bash
git add -A
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor(codegen,ve): rename AST→source path serialize/emit → render"
```

---

## Task 2: Capture Mutative inverse patches at the `mutateGraph` chokepoint

**Files:**
- Modify: `packages/visual-editor/src/store/editor-store.ts` (`mutateGraph` ~:842-859; `EditorState` ~:238; `initialState` ~:928; `GraphMutationExtra` Omit ~:821-824)
- Test: `packages/visual-editor/test/store/inverse-patches.test.ts` (create)

**Interfaces:**
- Produces: `EditorState.pendingInversePatches: Patches` (cleared on reparse alongside `pendingEditPatches`), populated by `mutateGraph`.

- [ ] **Step 1: Write the failing test**

Create `packages/visual-editor/test/store/inverse-patches.test.ts`:
```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';

const SRC = `namespace test\nversion "1.0.0"\n\ntype Foo:\n  bar string (1..1)\n\ntype Bar:\n  baz int (0..1)\n`;

describe('mutateGraph captures inverse patches', () => {
  it('records a remove inverse patch carrying the deleted node on deleteType', async () => {
    const { value } = await parse(SRC);
    const store = createEditorStore();
    store.getState().loadModels(value);
    const foo = store.getState().nodes.find((n) => n.data.name === 'Foo')!;
    store.getState().deleteType(foo.id);
    const inv = store.getState().pendingInversePatches;
    // The inverse of removing nodes/<id> is an add/replace carrying the old node value.
    const removeInverse = inv.find(
      (p) => Array.isArray(p.path) && p.path[0] === 'nodes' && String(p.path[1]) === foo.id
    );
    expect(removeInverse).toBeDefined();
    expect((removeInverse!.value as { data?: { $cstRange?: unknown } }).data?.$cstRange).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rune-langium/visual-editor test -- inverse-patches`
Expected: FAIL — `pendingInversePatches` is `undefined` (state field missing).

- [ ] **Step 3: Add the state field**

In `editor-store.ts`, add to the `EditorState` interface beside `pendingEditPatches` (~:238): `pendingInversePatches: Patches;`. Add to `initialState` (~:928): `pendingInversePatches: [],`. Add `'pendingInversePatches'` to the `GraphMutationExtra` Omit union (~:821-824).

- [ ] **Step 4: Capture inverse patches in `mutateGraph`**

Change the capture line (~:849) and the `set` (~:851-858):
```ts
const { nodesById, edgesById, pendingEditPatches, pendingInversePatches } = get();
const [next, patches, inversePatches] = mutativeCreate(
  { nodes: nodesById, edges: edgesById }, recipe, { enablePatches: true }
);
if (patches.length === 0 && !extra) return;
set({
  nodesById: next.nodes,
  edgesById: next.edges,
  nodes: nodesFromMap(next.nodes),
  edges: edgesFromMap(next.edges),
  pendingEditPatches: patches.length > 0 ? [...pendingEditPatches, ...patches] : pendingEditPatches,
  pendingInversePatches: inversePatches.length > 0 ? [...pendingInversePatches, ...inversePatches] : pendingInversePatches,
  ...extra
});
```

- [ ] **Step 5: Clear inverse patches on reparse**

Find where `pendingEditPatches: []` is reset on an accepted parse (the `loadModels` `set` that bumps `parseEpoch`, ~:1085-1088) and add `pendingInversePatches: [],` to that same `set`.

- [ ] **Step 6: Run the test + full suites**

Run: `pnpm --filter @rune-langium/visual-editor test -- inverse-patches`
Expected: PASS.
Run: `pnpm run test && pnpm run type-check`
Expected: 0 failures / 0 errors.

- [ ] **Step 7: Commit**

```bash
git add -A
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(ve): capture Mutative inverse patches in mutateGraph (for deletion + undo)"
```

---

## Task 3: render Condition (and post-condition); body via `$cstText`

**Files:**
- Modify: `packages/codegen/src/emit/rosetta/rosetta-render-core.ts`
- Test: `packages/codegen/test/emit/rosetta/render-condition.test.ts` (create)

**Interfaces:**
- Consumes: `renderNode`/`RenderChild`/`indentBlock`/`definitionLine`/`escapeString` (Task 1).
- Produces: `renderCondition(node, renderChild)`; `renderNode` dispatch handles `'Condition'`.

- [ ] **Step 1: Write the failing test**

Create `packages/codegen/test/emit/rosetta/render-condition.test.ts`:
```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { renderNode, type RenderChild } from '../../../src/emit/rosetta/rosetta-render-core.js';
const regen: RenderChild = (c) => renderNode(c, regen) ?? '';

describe('renderNode — Condition', () => {
  it('renders a named condition with $cstText body', () => {
    const cond = {
      $type: 'Condition', name: 'NonEmpty', postCondition: false, definition: undefined,
      expression: { $cstText: 'if bar exists then baz exists' },
      annotations: [], references: []
    } as never;
    expect(renderNode(cond, regen)).toBe('condition NonEmpty:\n  if bar exists then baz exists');
  });
  it('renders a post-condition with the post-condition keyword', () => {
    const cond = {
      $type: 'Condition', name: 'Done', postCondition: true, definition: undefined,
      expression: { $cstText: 'result exists' }, annotations: [], references: []
    } as never;
    expect(renderNode(cond, regen)).toBe('post-condition Done:\n  result exists');
  });
  it('renders an anonymous condition + definition', () => {
    const cond = {
      $type: 'Condition', name: undefined, postCondition: false, definition: 'a check',
      expression: { $cstText: 'True' }, annotations: [], references: []
    } as never;
    expect(renderNode(cond, regen)).toBe('condition:\n  <"a check">\n  True');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rune-langium/codegen test -- render-condition`
Expected: FAIL — `renderNode` returns `null` for `Condition`.

- [ ] **Step 3: Implement `renderCondition` + dispatch**

Add a helper to read the body text (place near the other helpers):
```ts
function exprText(expr: unknown): string {
  const e = expr as { $cstText?: string; $cstNode?: { text?: string } } | undefined;
  return (e?.$cstText ?? e?.$cstNode?.text ?? '').trim();
}
```
Add `renderCondition`:
```ts
function renderCondition(c: DehydratedNode, renderChild: RenderChild): string {
  const cc = c as unknown as {
    name?: string; definition?: string; postCondition?: boolean; expression?: unknown;
  };
  const head = cc.postCondition ? 'post-condition' : 'condition';
  const lines = [cc.name ? `${head} ${cc.name}:` : `${head}:`];
  const def = definitionLine(cc.definition);
  if (def) lines.push(indentBlock(def));
  const body = exprText(cc.expression);
  if (body) lines.push(indentBlock(body));
  return lines.join('\n');
}
```
Add `case 'Condition': return renderCondition(node, renderChild);` to the `renderNode` switch.

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @rune-langium/codegen test -- render-condition`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(codegen): render Condition/post-condition (body via \$cstText)"
```

---

## Task 4: render RosettaFunction, Operation, ShortcutDeclaration

**Files:**
- Modify: `packages/codegen/src/emit/rosetta/rosetta-render-core.ts`
- Modify: `packages/visual-editor/src/serialize/cst-reuse-renderer.ts` (extend `CHILD_ARRAY_KEYS`)
- Test: `packages/codegen/test/emit/rosetta/render-function.test.ts` (create)

**Interfaces:**
- Consumes: `renderAttribute` (Task 1), `renderCondition` (Task 3), `exprText` (Task 3), `refText`/`indentBlock`/`definitionLine`.
- Produces: `renderFunction`/`renderOperation`/`renderShortcut`; dispatch handles `'RosettaFunction'`, `'Operation'`, `'ShortcutDeclaration'`.

- [ ] **Step 1: Write the failing test**

Create `packages/codegen/test/emit/rosetta/render-function.test.ts`:
```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { renderNode, type RenderChild } from '../../../src/emit/rosetta/rosetta-render-core.js';
const regen: RenderChild = (c) => renderNode(c, regen) ?? '';

const attr = (name: string, type: string, inf: number, sup: number) => ({
  $type: 'Attribute', name, override: false,
  typeCall: { type: { $refText: type } },
  card: { $type: 'RosettaCardinality', inf, sup, unbounded: false },
  annotations: [], references: [], synonyms: [], labels: [], ruleReferences: [], typeCallArgs: []
});

describe('renderNode — RosettaFunction', () => {
  it('renders a function with inputs, output, and a set operation', () => {
    const fn = {
      $type: 'RosettaFunction', name: 'Compute', definition: undefined,
      annotations: [], references: [], conditions: [], postConditions: [], shortcuts: [],
      inputs: [attr('a', 'number', 1, 1)],
      output: attr('result', 'number', 1, 1),
      operations: [{ $type: 'Operation', add: false, assignRoot: { $refText: 'result' }, path: undefined, definition: undefined, expression: { $cstText: 'a' } }]
    } as never;
    expect(renderNode(fn, regen)).toBe(
      'func Compute:\n' +
      '  inputs:\n' +
      '    a number (1..1)\n' +
      '  output:\n' +
      '    result number (1..1)\n' +
      '  set result:\n' +
      '    a'
    );
  });

  it('renders an add operation with a path and an alias shortcut', () => {
    const op = { $type: 'Operation', add: true, assignRoot: { $refText: 'out' }, path: { feature: { $refText: 'items' }, next: undefined }, definition: undefined, expression: { $cstText: 'x' } } as never;
    expect(renderNode(op, regen)).toBe('add out -> items:\n    x');
    const sc = { $type: 'ShortcutDeclaration', name: 'helper', definition: undefined, expression: { $cstText: 'a + b' } } as never;
    expect(renderNode(sc, regen)).toBe('alias helper:\n    a + b');
  });
});
```

> NOTE: assert against the exact indentation `renderFunction` produces; adjust the literals in Step 3 to match if you choose a different nesting depth, but keep inputs/output/operations indented one level under `func` and their members one level deeper.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rune-langium/codegen test -- render-function`
Expected: FAIL — `renderNode` returns `null` for `RosettaFunction`/`Operation`/`ShortcutDeclaration`.

- [ ] **Step 3: Implement the three renderers + dispatch**

Add a path renderer + the three functions:
```ts
function renderSegment(seg: unknown): string {
  let out = '';
  let s = seg as { feature?: { $refText?: string }; next?: unknown } | undefined;
  while (s) { const f = s.feature?.$refText; if (f) out += ` -> ${f}`; s = s.next as typeof s; }
  return out;
}

function renderOperation(o: DehydratedNode): string {
  const op = o as unknown as { add?: boolean; assignRoot?: { $refText?: string }; path?: unknown; definition?: string; expression?: unknown };
  const kw = op.add ? 'add' : 'set';
  let head = `${kw} ${op.assignRoot?.$refText ?? ''}${renderSegment(op.path)}:`;
  const lines = [head];
  const def = definitionLine(op.definition);
  if (def) lines.push(indentBlock(def, 2));
  const body = exprText(op.expression);
  if (body) lines.push(indentBlock(body, 2));
  return lines.join('\n');
}

function renderShortcut(s: DehydratedNode): string {
  const sc = s as unknown as { name?: string; definition?: string; expression?: unknown };
  const lines = [`alias ${sc.name ?? ''}:`];
  const def = definitionLine(sc.definition);
  if (def) lines.push(indentBlock(def, 2));
  const body = exprText(sc.expression);
  if (body) lines.push(indentBlock(body, 2));
  return lines.join('\n');
}

function renderFunction(f: DehydratedNode, renderChild: RenderChild): string {
  const fn = f as unknown as {
    name?: string; definition?: string; superFunction?: { $refText?: string };
    annotations?: unknown[]; references?: unknown[];
    inputs?: unknown[]; output?: unknown; shortcuts?: unknown[];
    conditions?: unknown[]; operations?: unknown[]; postConditions?: unknown[];
  };
  let header = `func ${fn.name}`;
  const sup = fn.superFunction?.$refText;
  if (sup) header += ` extends ${sup}`;
  header += ':';
  const lines = [header];
  const def = definitionLine(fn.definition);
  if (def) lines.push(indentBlock(def));
  for (const child of childList(fn.annotations, fn.references)) lines.push(indentBlock(renderChild(child)));
  if ((fn.inputs ?? []).length > 0) {
    lines.push(indentBlock('inputs:'));
    for (const i of fn.inputs!) lines.push(indentBlock(renderChild(i as DehydratedNode), 2));
  }
  if (fn.output) {
    lines.push(indentBlock('output:'));
    lines.push(indentBlock(renderChild(fn.output as DehydratedNode), 2));
  }
  for (const sc of fn.shortcuts ?? []) lines.push(indentBlock(renderChild(sc as DehydratedNode)));
  for (const c of fn.conditions ?? []) { lines.push(''); lines.push(indentBlock(renderChild(c as DehydratedNode))); }
  for (const op of fn.operations ?? []) { lines.push(''); lines.push(indentBlock(renderChild(op as DehydratedNode))); }
  for (const pc of fn.postConditions ?? []) { lines.push(''); lines.push(indentBlock(renderChild(pc as DehydratedNode))); }
  return lines.join('\n');
}
```
Add to the `renderNode` switch:
```ts
case 'RosettaFunction': return renderFunction(node, renderChild);
case 'Operation': return renderOperation(node);
case 'ShortcutDeclaration': return renderShortcut(node);
```

- [ ] **Step 4: Extend `CHILD_ARRAY_KEYS`**

In `cst-reuse-renderer.ts` add `'inputs'`, `'operations'`, `'shortcuts'`, `'postConditions'`, `'parameters'` to `CHILD_ARRAY_KEYS` (so dirty-path computation resolves these children for reuse).

- [ ] **Step 5: Run the test + full build/suites**

Run: `pnpm --filter @rune-langium/codegen test -- render-function`
Expected: PASS.
Run: `pnpm --filter @rune-langium/core --filter @rune-langium/codegen run build && pnpm run test && pnpm run type-check`
Expected: 0 failures / 0 errors.

- [ ] **Step 6: Commit**

```bash
git add -A
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(codegen): render RosettaFunction/Operation/ShortcutDeclaration (bodies via \$cstText)"
```

---

## Task 5: render RosettaTypeAlias + add `updateTypeAliasType` store action

**Files:**
- Modify: `packages/codegen/src/emit/rosetta/rosetta-render-core.ts`
- Modify: `packages/visual-editor/src/store/editor-store.ts` (new action), `packages/visual-editor/src/components/editors/TypeAliasForm.tsx` (wire it)
- Test: `packages/codegen/test/emit/rosetta/render-typealias.test.ts`, `packages/visual-editor/test/store/typealias-edit.test.ts` (create)

**Interfaces:**
- Produces: `renderTypeAlias`; dispatch handles `'RosettaTypeAlias'`. Store action `updateTypeAliasType(nodeId: string, typeName: string): void`.

- [ ] **Step 1: Write the failing render test**

Create `packages/codegen/test/emit/rosetta/render-typealias.test.ts`:
```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { renderNode, type RenderChild } from '../../../src/emit/rosetta/rosetta-render-core.js';
const regen: RenderChild = (c) => renderNode(c, regen) ?? '';

describe('renderNode — RosettaTypeAlias', () => {
  it('renders typeAlias name: wrappedType', () => {
    const ta = { $type: 'RosettaTypeAlias', name: 'MyNum', definition: undefined, parameters: [], conditions: [], typeCall: { type: { $refText: 'number' } } } as never;
    expect(renderNode(ta, regen)).toBe('typeAlias MyNum: number');
  });
  it('renders a definition line', () => {
    const ta = { $type: 'RosettaTypeAlias', name: 'X', definition: 'an alias', parameters: [], conditions: [], typeCall: { type: { $refText: 'string' } } } as never;
    expect(renderNode(ta, regen)).toBe('typeAlias X:\n  <"an alias">\n  string');
  });
});
```

- [ ] **Step 2: Run to verify it fails / Implement `renderTypeAlias`**

Run: `pnpm --filter @rune-langium/codegen test -- render-typealias` → FAIL.
Implement:
```ts
function renderTypeAlias(t: DehydratedNode, renderChild: RenderChild): string {
  const ta = t as unknown as { name?: string; definition?: string; typeCall?: { type?: { $refText?: string } }; conditions?: unknown[] };
  const wrapped = ta.typeCall?.type?.$refText ?? '';
  const def = definitionLine(ta.definition);
  if (!def && (ta.conditions ?? []).length === 0) return `typeAlias ${ta.name}: ${wrapped}`;
  const lines = [`typeAlias ${ta.name}:`];
  if (def) lines.push(indentBlock(def));
  lines.push(indentBlock(wrapped));
  for (const c of ta.conditions ?? []) { lines.push(''); lines.push(indentBlock(renderChild(c as DehydratedNode))); }
  return lines.join('\n');
}
```
Add `case 'RosettaTypeAlias': return renderTypeAlias(node, renderChild);`. (Type-alias parameters `(...)` are not inspector-editable; if present on a parsed alias the node rides CST when unchanged. Parameters rendering is out of scope — note in the report.)
Run the test → PASS.

- [ ] **Step 3: Write the failing store-action test**

Create `packages/visual-editor/test/store/typealias-edit.test.ts`:
```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';

const SRC = `namespace test\nversion "1.0.0"\n\ntypeAlias MyNum: number\n`;

describe('updateTypeAliasType', () => {
  it('writes typeCall.type.$refText and dirties the node', async () => {
    const { value } = await parse(SRC);
    const store = createEditorStore();
    store.getState().loadModels(value);
    const ta = store.getState().nodes.find((n) => n.data.name === 'MyNum')!;
    store.getState().updateTypeAliasType(ta.id, 'int');
    const updated = store.getState().nodesById.get(ta.id)!;
    expect((updated.data as { typeCall: { type: { $refText: string } } }).typeCall.type.$refText).toBe('int');
    expect(store.getState().pendingEditPatches.some(
      (p) => Array.isArray(p.path) && p.path.includes('typeCall')
    )).toBe(true);
  });
});
```

- [ ] **Step 4: Implement the action + wire the form**

In `editor-store.ts` add to the `EditorActions` interface `updateTypeAliasType(nodeId: string, typeName: string): void;` and implement (mirroring `updateOutputType`'s lazy-create):
```ts
updateTypeAliasType(nodeId: string, typeName: string) {
  mutateGraph(set, get, (draft) => {
    const n = draft.nodes.get(nodeId);
    if (!n || n.data.$type !== 'RosettaTypeAlias') return;
    const d = n.data as { typeCall?: { type?: { $refText?: string }; arguments?: unknown[] } };
    if (!d.typeCall) d.typeCall = { type: { $refText: typeName }, arguments: [] } as never;
    else if (!d.typeCall.type) d.typeCall.type = { $refText: typeName };
    else d.typeCall.type.$refText = typeName;
  });
},
```
In `TypeAliasForm.tsx` `handleTypeSelect` (~:149-157), after the `form.setValue(...)`, call `actions.updateTypeAliasType(nodeId, label)` (obtain `actions`/`nodeId` from the form's existing props/context as the other forms do).

- [ ] **Step 5: Run both tests + full suites**

Run: `pnpm --filter @rune-langium/codegen test -- render-typealias`
Run: `pnpm --filter @rune-langium/visual-editor test -- typealias-edit`
Run: `pnpm --filter @rune-langium/core --filter @rune-langium/codegen run build && pnpm run test && pnpm run type-check`
Expected: PASS / 0 failures / 0 errors.

- [ ] **Step 6: Commit**

```bash
git add -A
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(codegen,ve): render RosettaTypeAlias + updateTypeAliasType action"
```

---

## Task 6: render AnnotationRef + synonyms (class / member / enum)

**Files:**
- Modify: `packages/codegen/src/emit/rosetta/rosetta-render-core.ts`
- Test: `packages/codegen/test/emit/rosetta/render-annotations-synonyms.test.ts` (create)

**Interfaces:**
- Produces: `renderAnnotationRef`, `renderClassSynonym`, `renderSynonym`, `renderEnumSynonym`; dispatch handles `'AnnotationRef'`, `'RosettaClassSynonym'`, `'RosettaSynonym'`, `'RosettaEnumSynonym'`.

- [ ] **Step 1: Write the failing test**

Create `packages/codegen/test/emit/rosetta/render-annotations-synonyms.test.ts`:
```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { renderNode, type RenderChild } from '../../../src/emit/rosetta/rosetta-render-core.js';
const regen: RenderChild = (c) => renderNode(c, regen) ?? '';

describe('renderNode — annotations & synonyms', () => {
  it('renders an annotation ref (annotation + attribute)', () => {
    const a = { $type: 'AnnotationRef', annotation: { $refText: 'metadata' }, attribute: { $refText: 'scheme' }, qualifiers: [] } as never;
    expect(renderNode(a, regen)).toBe('[metadata scheme]');
  });
  it('renders an annotation ref (annotation only)', () => {
    const a = { $type: 'AnnotationRef', annotation: { $refText: 'rootType' }, attribute: undefined, qualifiers: [] } as never;
    expect(renderNode(a, regen)).toBe('[rootType]');
  });
  it('renders a class synonym (the inspector-produced source shape)', () => {
    const s = { $type: 'RosettaClassSynonym', sources: [{ $refText: 'FpML' }], value: undefined, metaValue: undefined } as never;
    expect(renderNode(s, regen)).toBe('[synonym FpML]');
  });
});
```

- [ ] **Step 2: Run to verify it fails / Implement the renderers + dispatch**

Run: `pnpm --filter @rune-langium/codegen test -- render-annotations-synonyms` → FAIL.
Implement:
```ts
function renderAnnotationRef(a: DehydratedNode): string {
  const ar = a as unknown as { annotation?: { $refText?: string }; attribute?: { $refText?: string }; qualifiers?: unknown[] };
  const parts = [ar.annotation?.$refText ?? ''];
  if (ar.attribute?.$refText) parts.push(ar.attribute.$refText);
  // Qualifiers (qualName=value) are not inspector-editable; render any present verbatim-ish.
  for (const q of ar.qualifiers ?? []) {
    const qq = q as { qualName?: string; qualValue?: string };
    if (qq.qualName) parts.push(qq.qualValue !== undefined ? `${qq.qualName}="${qq.qualValue}"` : qq.qualName);
  }
  return `[${parts.join(' ')}]`;
}
function synonymSources(sources: unknown[] | undefined): string {
  return (sources ?? []).map((s) => (s as { $refText?: string }).$refText ?? '').filter(Boolean).join(', ');
}
function renderClassSynonym(s: DehydratedNode): string {
  const cs = s as unknown as { sources?: unknown[] };
  return `[synonym ${synonymSources(cs.sources)}]`;
}
function renderSynonym(s: DehydratedNode): string {
  const sy = s as unknown as { sources?: unknown[] };
  return `[synonym ${synonymSources(sy.sources)}]`;
}
function renderEnumSynonym(s: DehydratedNode): string {
  const es = s as unknown as { sources?: unknown[]; synonymValue?: string };
  const base = `[synonym ${synonymSources(es.sources)}`;
  return es.synonymValue !== undefined ? `${base} value "${es.synonymValue}"]` : `${base}]`;
}
```
Add cases: `'AnnotationRef'`→`renderAnnotationRef(node)`, `'RosettaClassSynonym'`→`renderClassSynonym(node)`, `'RosettaSynonym'`→`renderSynonym(node)`, `'RosettaEnumSynonym'`→`renderEnumSynonym(node)`.
Run the test → PASS.

> NOTE: synonyms have rich optional sub-content (`RosettaSynonymBody`: value/hints/mapper/merge/etc.). B2 renders the **inspector-produced shape** (sources [+ enum value]); a parsed synonym with richer content rides its CST slice when unchanged. If a future inspector edits richer synonym fields, extend these renderers. State this scope in the report.

- [ ] **Step 3: Full build/suites + commit**

Run: `pnpm --filter @rune-langium/core --filter @rune-langium/codegen run build && pnpm run test && pnpm run type-check`
Expected: 0 failures / 0 errors.
```bash
git add -A
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(codegen): render AnnotationRef + synonym kinds (inspector-produced shape)"
```

---

## Task 7: Deletion — drop removed elements' ranges in the renderer assembly

**Files:**
- Modify: `packages/visual-editor/src/serialize/cst-reuse-renderer.ts` (`RenderArgs`, assembly loop ~:77-111)
- Modify: `packages/visual-editor/src/hooks/useModelSourceSync.ts` (`buildSourceForNamespaces`: derive removals from inverse patches, thread them)
- Test: `packages/visual-editor/test/serialize/deletion.test.ts` (create)

**Interfaces:**
- Consumes: `pendingInversePatches` (Task 2).
- Produces: `RenderArgs` gains `removedRanges?: ReadonlyArray<{ offset: number; end: number }>`; `renderNamespace` drops those ranges. `buildSourceForNamespaces` computes removals per namespace from inverse `remove` patches.

- [ ] **Step 1: Write the failing test**

Create `packages/visual-editor/test/serialize/deletion.test.ts`:
```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { renderNamespace } from '../../src/serialize/cst-reuse-renderer.js';
import { buildDirtyIndex } from '../../src/serialize/dirty-paths.js';
import type { Patches } from 'mutative';
import type { TypeGraphNode } from '../../src/types.js';

const SRC = `namespace test
version "1.0.0"

type Foo:
  bar string (1..1)

type Bar:
  baz int (0..1)
`;

// Build the two nodes from a parse so they carry $cstRange.
async function nodes(): Promise<TypeGraphNode[]> {
  const { parse } = await import('@rune-langium/core');
  const { parsedAdapter } = await import('@rune-langium/core');
  const { value } = await parse(SRC);
  const els = (value as unknown as { elements: unknown[] }).elements;
  return els.map((e, i) => ({
    id: `test.${(e as { name: string }).name}`,
    data: parsedAdapter.dehydrate(e as Parameters<typeof parsedAdapter.dehydrate>[0]),
    meta: { namespace: 'test', deferred: false }
  })) as unknown as TypeGraphNode[];
}

describe('deletion drops the removed element range', () => {
  it('removes type Bar from source when its remove range is supplied', async () => {
    const all = await nodes();
    const bar = all.find((n) => n.data.name === 'Bar')!;
    const barRange = (bar.data as { $cstRange: { offset: number; end: number } }).$cstRange;
    const remaining = all.filter((n) => n.data.name !== 'Bar'); // Bar deleted from graph
    const out = renderNamespace({
      nodes: remaining, originalSource: SRC,
      dirty: buildDirtyIndex([] as unknown as Patches),
      removedRanges: [barRange]
    });
    expect(out).toContain('type Foo:');
    expect(out).toContain('bar string (1..1)');
    expect(out).not.toContain('type Bar:');
    expect(out).not.toContain('baz int (0..1)');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rune-langium/visual-editor test -- serialize/deletion`
Expected: FAIL — `removedRanges` not a param; `type Bar:` still present (copied as a gap).

- [ ] **Step 3: Implement range-drop in the assembly**

In `cst-reuse-renderer.ts`: add `removedRanges?: ReadonlyArray<{ offset: number; end: number }>` to `RenderArgs`. Add a gap-copy helper that excludes removed ranges:
```ts
function copyGapExcluding(
  source: string, from: number, to: number,
  removed: ReadonlyArray<{ offset: number; end: number }>
): string {
  let out = '';
  let cur = from;
  for (const r of removed) {           // `removed` is pre-sorted by offset
    if (r.end <= from || r.offset >= to) continue; // not in this gap
    if (r.offset > cur) out += source.slice(cur, r.offset);
    cur = Math.max(cur, r.end);
  }
  if (cur < to) out += source.slice(cur, to);
  return out;
}
```
In the assembly: `const sortedRemoved = [...(args.removedRanges ?? [])].sort((a, b) => a.offset - b.offset);`. Replace the gap copy `parts.push(originalSource.slice(cursor, range.offset))` with `parts.push(copyGapExcluding(originalSource, cursor, range.offset, sortedRemoved))`, and the trailing `parts.push(originalSource.slice(cursor))` with `parts.push(copyGapExcluding(originalSource, cursor, originalSource.length, sortedRemoved))`. (A removed range never coincides with a present node's range — see Step 4's rename guard.)

- [ ] **Step 4: Derive + thread removals in `buildSourceForNamespaces`**

In `useModelSourceSync.ts`, add `inversePatches: Patches` to `BuildSourceArgs`. Compute removals per namespace from inverse `remove` patches — **but exclude ranges a current node still occupies** (a `renameType` re-keys via delete-old + set-new, so the old id's delete produces a length-2 inverse at `['nodes', oldId]` whose value carries the *same* `$cstRange` the renamed node now occupies; that is NOT a deletion):
```ts
// Per namespace: ranges of genuinely-removed elements.
const removalsByNs = new Map<string, Array<{ offset: number; end: number }>>();
// Ranges still occupied by a current node (rename keeps the range under a new id).
const occupied = new Set<string>();
for (const n of nodes) {
  if (n.meta.deferred) continue;
  const r = (n.data as { $cstRange?: { offset: number; end: number } }).$cstRange;
  if (r) occupied.add(`${r.offset}:${r.end}`);
}
for (const p of inversePatches) {
  const path = p.path as (string | number)[];
  if (path[0] !== 'nodes' || path.length !== 2) continue; // only whole-node inverses
  const node = p.value as
    | { meta?: { namespace?: string; deferred?: boolean }; data?: { $cstRange?: { offset: number; end: number } } }
    | undefined;
  const r = node?.data?.$cstRange;
  const ns = node?.meta?.namespace;
  if (!r || !ns || node?.meta?.deferred) continue;
  if (occupied.has(`${r.offset}:${r.end}`)) continue; // renamed/replaced, not deleted
  (removalsByNs.get(ns) ?? removalsByNs.set(ns, []).get(ns)!).push(r);
}
```
Pass `removedRanges: removalsByNs.get(ns) ?? []` into each `renderNamespace(...)` call. Update the effect to pass `pendingInversePatches` from state into `buildSourceForNamespaces`.

- [ ] **Step 5: Run the test + full suites**

Run: `pnpm --filter @rune-langium/visual-editor test -- serialize/deletion`
Expected: PASS.
Run: `pnpm --filter @rune-langium/core --filter @rune-langium/codegen run build && pnpm run test && pnpm run type-check`
Expected: 0 failures / 0 errors.

- [ ] **Step 6: Commit**

```bash
git add -A
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(ve): deletion drops removed element ranges via inverse patches"
```

---

## Task 8: End-to-end editability round-trips + comprehensiveness audit

**Files:**
- Test: `packages/visual-editor/test/serialize/editable-roundtrip.test.ts` (create)
- Possibly Modify: any inspector action found bypassing `mutateGraph`.

**Interfaces:** consumes all prior tasks (renderNode cases, deletion, the store actions).

- [ ] **Step 1: Write end-to-end round-trip tests through the store actions**

Create `packages/visual-editor/test/serialize/editable-roundtrip.test.ts`: for each of {add condition, edit condition expression, add function input, edit function body, delete type}, drive the **store action** on a parsed model, render via `buildSourceForNamespaces`, re-parse the output, and assert the change is present AND untouched siblings are byte-intact. Example (add condition):
```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { buildSourceForNamespaces } from '../../src/hooks/useModelSourceSync.js';

const SRC = `namespace test\nversion "1.0.0"\n\ntype Foo:\n  bar string (1..1)\n`;

it('adding a condition persists to source and re-parses', async () => {
  const { value } = await parse(SRC);
  const store = createEditorStore();
  store.getState().loadModels(value);
  const foo = store.getState().nodes.find((n) => n.data.name === 'Foo')!;
  store.getState().addCondition(foo.id, { name: 'C1', expressionText: 'bar exists' });
  const out = buildSourceForNamespaces({
    nodes: store.getState().nodes, edges: store.getState().edges,
    originalSourceByNamespace: new Map([['test', SRC]]),
    patches: store.getState().pendingEditPatches,
    inversePatches: store.getState().pendingInversePatches
  }).get('test')!;
  expect(out).toContain('condition C1:');
  expect(out).toContain('bar exists');
  expect(out).toContain('bar string (1..1)'); // untouched attribute preserved
  const re = await parse(out);
  expect((re.value as { elements: { name?: string }[] }).elements.some((e) => e.name === 'Foo')).toBe(true);
});
```
Add analogous cases for edit-condition, add-input, edit-function-body, and delete-type. **Also add a rename-type case** that calls `renameType`, builds source via `buildSourceForNamespaces` (passing `pendingInversePatches`), and asserts the renamed type **is present under its new name and was NOT dropped** — this guards the deletion logic's occupied-range exclusion (rename re-keys via delete-old+set-new, which must not be treated as a deletion).

- [ ] **Step 2: Run them**

Run: `pnpm --filter @rune-langium/visual-editor test -- editable-roundtrip`
Expected: PASS. If any FAILS revealing a missing route (an edit that doesn't reach `pendingEditPatches`), fix the offending store action to go through `mutateGraph` and re-run.

- [ ] **Step 3: Comprehensiveness audit**

Run `rg -n "set\(\{" packages/visual-editor/src/store/editor-store.ts` and confirm every inspector-facing edit action mutates via `mutateGraph` (not a raw `set` outside the chokepoint), excepting the explicitly out-of-scope `updateComments` (meta-only). Note any exceptions in the report.

- [ ] **Step 4: Full suites + commit**

Run: `pnpm --filter @rune-langium/core --filter @rune-langium/codegen run build && pnpm run test && pnpm run type-check`
Expected: 0 failures / 0 errors.
```bash
git add -A
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "test(ve): end-to-end editable round-trips + comprehensiveness audit"
```

---

## Follow-up: B1 (separate plan)

After B2: replace the `$cstText` body passthrough (Tasks 3-4) with a structural `renderExpression(Dehydrated<RosettaExpression>)` (full grammar, correct precedence), add a first-class `parseExpression` core API (bare-expression parse of the grammar's non-entry `Expression` rule), and collapse the editor preview (`expression-node-to-dsl`) + the Zod transpiler's copied precedence table onto the one shared renderer. The `Condition`/`Operation`/`Shortcut` cases are the swap site.
