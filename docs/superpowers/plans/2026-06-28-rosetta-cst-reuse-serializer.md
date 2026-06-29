# Lossless AST → `.rosetta` via CST-Reuse — Implementation Plan (Plan A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make visual-editor inspector edits write back to `.rosetta` source losslessly — conditions, attribute annotations/metadata/synonyms/doc-refs, comments, and formatting survive an edit to any other field — by replacing the lossy `serializeModel` + `mergeSerializedIntoSource` round-trip with a CST-reuse serializer driven by carried offsets.

**Architecture:** Each dehydrated node carries a permanent `$cstRange` baseline locator. A whole-AST emit-core (`emitNode`) returns structural text for implemented `$type`s and `null` otherwise. The editor serializer recurses: a subtree-clean node (has `$cstRange`, no `pendingEditPatches` at-or-under it) slices its original bytes; a dirty/new node regenerates via `emitNode`, falling back to its `$cstRange` slice, recursing into children. Untouched content is never re-emitted.

**Tech Stack:** TypeScript 5.9 (strict, ESM), Langium 4.3, Mutative patches, Zustand, Vitest. pnpm workspace. Packages: `@rune-langium/core`, `@rune-langium/codegen`, `@rune-langium/visual-editor`, `apps/studio`.

## Global Constraints

- SPDX headers: `packages/` = `MIT`; `apps/studio/` = `FSL-1.1-ALv2`. Every new file gets the header for its directory.
- ESM with `.js` import specifiers in TypeScript source (NodeNext).
- `$cstRange` is **never cleared**; it is a baseline locator refreshed only on reparse. Dirtiness comes solely from `pendingEditPatches`.
- Cross-references emit `ref.$refText`, never `.ref`.
- `emitNode` returns `string | null`; `null` ⇒ caller uses the node's `$cstRange` slice. Never emit a placeholder (no `True`, no `// Error`) into committed source.
- The editor must import the emit-core ONLY via the `@rune-langium/codegen/rosetta` subpath; that subpath must not transitively import `generator.ts`, `index.ts`, or `exceljs`.
- Run validation per package: `pnpm --filter <pkg> test`, `pnpm --filter <pkg> run type-check`. Commit with `SKIP_SIMPLE_GIT_HOOKS=1`.
- Scope: this plan = spec phases 1–4 + cleanup. The codegen **batch** `.rosetta` target + `Choice` walker support (spec phase 5) is a separate follow-up plan (Plan B).

---

## File Structure

- `packages/core/src/serializer/dehydrated.ts` — add optional `$cstRange` to `Dehydrated<T>`.
- `packages/core/src/services/rune-store-hydrator.ts` — stamp `$cstRange` from `$cstNode` during dehydration.
- `packages/codegen/src/emit/rosetta/rosetta-emit-core.ts` — NEW. Pure whole-AST `emitNode` + per-construct emitters. No fs/ExcelJS/generator imports.
- `packages/codegen/src/rosetta.ts` — NEW. Browser-safe barrel re-exporting the emit-core only.
- `packages/codegen/package.json` — add `./rosetta` export subpath.
- `packages/visual-editor/src/serialize/dirty-paths.ts` — NEW. Derive a subtree-dirty predicate from `pendingEditPatches`.
- `packages/visual-editor/src/serialize/cst-reuse-serializer.ts` — NEW. The driver: recursion + file assembly.
- `packages/visual-editor/src/hooks/useModelSourceSync.ts` — switch to the cst-reuse serializer; thread the dirty set.
- `apps/studio/src/shell/ExplorePerspective.tsx` — `handleModelChanged` consumes the new serializer output (drops `mergeSerializedIntoSource`).
- Cleanup targets: `packages/core/src/serializer/rosetta-serializer.ts` (retire `serializeElement`/`serializeModels`; retire `serializeModel` after migration), `apps/studio/src/utils/source-merge.ts` (retire after migration).

---

## Task 1: Carry `$cstRange` on `Dehydrated<T>` and stamp it during dehydration

**Files:**
- Modify: `packages/core/src/serializer/dehydrated.ts`
- Modify: `packages/core/src/services/rune-store-hydrator.ts:52-69`
- Test: `packages/core/test/serializer/cst-range.test.ts` (create)

**Interfaces:**
- Consumes: Langium `CstNode` (`{ offset: number; end: number }` via `$cstNode`).
- Produces: `Dehydrated<T>.$cstRange?: { offset: number; end: number }` — present on nodes dehydrated from a live parse, absent on curated/pre-dehydrated nodes.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/serializer/cst-range.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rune-langium/core test -- cst-range`
Expected: FAIL — `dehydrated.$cstRange` is `undefined` (hydrator does not stamp it yet).

- [ ] **Step 3: Add the optional field to `Dehydrated<T>`**

In `packages/core/src/serializer/dehydrated.ts`, add `$cstRange` to the first object literal (alongside `$type`/`$namespace`), because `$cstNode` is excluded by `LangiumRuntimeFields` and the mapped half will not carry it:

```ts
export type Dehydrated<T extends AstNode> = {
  readonly $type: T['$type'];
  readonly $namespace?: string;
  readonly $cstRange?: { offset: number; end: number };
} & {
  -readonly [K in Exclude<keyof T, LangiumRuntimeFields | '$type'>]: DehydratedField<T[K]>;
};
```

- [ ] **Step 4: Stamp `$cstRange` in the hydrator**

In `packages/core/src/services/rune-store-hydrator.ts`, inside `dehydrateAstNode` (currently lines 52-69), read the live `node.$cstNode` (still present here — only the copied `result.$cstNode` is deleted) and stamp `result.$cstRange` before returning:

```ts
protected override dehydrateAstNode(node: AstNode, context: DehydrateContext): object {
  const result = super.dehydrateAstNode(node, context) as Record<string, unknown>;
  delete result.$containerIndex;
  delete result.$containerProperty;
  delete result.$cstNode;
  // Permanent baseline locator for CST-reuse serialization. Two ints; not the
  // text (which would nest/duplicate). Read from the live node, whose $cstNode
  // is still attached at this point.
  const cst = node.$cstNode;
  if (cst && typeof cst.offset === 'number' && typeof cst.end === 'number') {
    result.$cstRange = { offset: cst.offset, end: cst.end };
  }
  const cstText = (node as AstNode & { $cstText?: unknown }).$cstText;
  if (typeof cstText === 'string') {
    result.$cstText = cstText;
  }
  const model = AstUtils.getContainerOfType(node, isRosettaModel);
  if (model) {
    result.$namespace = model.name;
  }
  return result;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @rune-langium/core test -- cst-range`
Expected: PASS (both cases).

- [ ] **Step 6: Type-check and run the core serializer suite**

Run: `pnpm --filter @rune-langium/core run type-check`
Run: `pnpm --filter @rune-langium/core test -- serializer`
Expected: type-check clean; existing serializer tests still pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/serializer/dehydrated.ts packages/core/src/services/rune-store-hydrator.ts packages/core/test/serializer/cst-range.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(core): carry \$cstRange baseline locator on Dehydrated<T>"
```

---

## Task 2: Whole-AST `emitNode` emit-core (implemented scalars + `null` fallback)

**Files:**
- Create: `packages/codegen/src/emit/rosetta/rosetta-emit-core.ts`
- Test: `packages/codegen/test/emit/rosetta/rosetta-emit-core.test.ts`

**Interfaces:**
- Consumes: `Dehydrated<T>` (from `@rune-langium/core`); the AST types `Data`, `Attribute`, `Choice`, `ChoiceOption`, `RosettaEnumeration`, `RosettaEnumValue`, `RosettaCardinality` (field shapes per the spec).
- Produces:
  - `type EmitChild = (child: DehydratedNode) => string;`
  - `function emitNode(node: DehydratedNode, emitChild: EmitChild): string | null;`
  where `DehydratedNode = Dehydrated<AstNode>`.

- [ ] **Step 1: Write the failing test**

Create `packages/codegen/test/emit/rosetta/rosetta-emit-core.test.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { emitNode, type EmitChild } from '../../../src/emit/rosetta/rosetta-emit-core.js';

// Child policy for tests: always regenerate; throw if a child is unimplemented
// (the tests below only use implemented children).
const regen: EmitChild = (c) => {
  const t = emitNode(c, regen);
  if (t === null) throw new Error(`unimplemented child ${(c as { $type: string }).$type}`);
  return t;
};

describe('emitNode — implemented scalars', () => {
  it('emits a Data header with extends and definition', () => {
    const node = {
      $type: 'Data',
      name: 'Foo',
      superType: { $refText: 'Bar' },
      definition: 'a foo',
      annotations: [],
      references: [],
      synonyms: [],
      conditions: [],
      attributes: [
        {
          $type: 'Attribute',
          name: 'bar',
          override: false,
          typeCall: { type: { $refText: 'string' } },
          card: { $type: 'RosettaCardinality', inf: 0, sup: 1, unbounded: false },
          annotations: [], references: [], synonyms: [], labels: [],
          ruleReferences: [], typeCallArgs: []
        }
      ]
    } as never;

    expect(emitNode(node, regen)).toBe(
      'type Foo extends Bar:\n' +
      '  <"a foo">\n' +
      '  bar string (0..1)'
    );
  });

  it('emits an unbounded cardinality as (n..*)', () => {
    const attr = {
      $type: 'Attribute', name: 'xs', override: false,
      typeCall: { type: { $refText: 'string' } },
      card: { $type: 'RosettaCardinality', inf: 1, sup: undefined, unbounded: true },
      annotations: [], references: [], synonyms: [], labels: [],
      ruleReferences: [], typeCallArgs: []
    } as never;
    expect(emitNode(attr, regen)).toBe('xs string (1..*)');
  });

  it('emits override and a missing definition', () => {
    const attr = {
      $type: 'Attribute', name: 'y', override: true,
      typeCall: { type: { $refText: 'int' } },
      card: { $type: 'RosettaCardinality', inf: 0, sup: 0, unbounded: false },
      annotations: [], references: [], synonyms: [], labels: [],
      ruleReferences: [], typeCallArgs: []
    } as never;
    expect(emitNode(attr, regen)).toBe('override y int (0..0)');
  });

  it('emits a choice with options', () => {
    const node = {
      $type: 'Choice', name: 'Pick', annotations: [], synonyms: [],
      attributes: [
        { $type: 'ChoiceOption', typeCall: { type: { $refText: 'A' } }, annotations: [], references: [], synonyms: [], labels: [], ruleReferences: [] },
        { $type: 'ChoiceOption', typeCall: { type: { $refText: 'B' } }, annotations: [], references: [], synonyms: [], labels: [], ruleReferences: [] }
      ]
    } as never;
    expect(emitNode(node, regen)).toBe('choice Pick:\n  A\n  B');
  });

  it('emits an enum with extends, displayName and values', () => {
    const node = {
      $type: 'RosettaEnumeration', name: 'Color',
      parent: { $refText: 'BaseColor' }, definition: undefined,
      annotations: [], references: [], synonyms: [],
      enumValues: [
        { $type: 'RosettaEnumValue', name: 'RED', display: 'Red', definition: undefined, annotations: [], references: [], enumSynonyms: [] },
        { $type: 'RosettaEnumValue', name: 'GREEN', display: undefined, definition: undefined, annotations: [], references: [], enumSynonyms: [] }
      ]
    } as never;
    expect(emitNode(node, regen)).toBe(
      'enum Color extends BaseColor:\n' +
      '  RED displayName "Red"\n' +
      '  GREEN'
    );
  });

  it('returns null for an unimplemented $type', () => {
    const fn = { $type: 'RosettaFunction', name: 'DoIt' } as never;
    expect(emitNode(fn, regen)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rune-langium/codegen test -- rosetta-emit-core`
Expected: FAIL — module `rosetta-emit-core.ts` does not exist.

- [ ] **Step 3: Implement the emit-core**

Create `packages/codegen/src/emit/rosetta/rosetta-emit-core.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Whole-AST → `.rosetta` source emit-core.
 *
 * `emitNode` dispatches on `$type`. Implemented constructs return structural
 * `.rosetta` text; every other `$type` returns `null`, meaning "I cannot
 * generate this — use the CST". Composite children are emitted via the caller's
 * `emitChild` policy (reuse-or-regenerate). Cross-references emit `$refText`.
 *
 * No fs / ExcelJS / generator imports — safe to import in a browser hot path via
 * the `@rune-langium/codegen/rosetta` subpath.
 */

import type { AstNode } from 'langium';
import type { Dehydrated } from '@rune-langium/core';
import type {
  Data, Attribute, Choice, ChoiceOption,
  RosettaEnumeration, RosettaEnumValue, RosettaCardinality
} from '@rune-langium/core';

export type DehydratedNode = Dehydrated<AstNode>;
export type EmitChild = (child: DehydratedNode) => string;

// --- helpers --------------------------------------------------------------

function escapeString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function indentBlock(text: string, level = 1): string {
  const pad = '  '.repeat(level);
  return text
    .split('\n')
    .map((line) => (line.trim() ? `${pad}${line}` : ''))
    .join('\n');
}

function formatCardinality(card: Dehydrated<RosettaCardinality>): string {
  if (card.unbounded) return `(${card.inf}..*)`;
  return `(${card.inf}..${card.sup ?? card.inf})`;
}

function refText(ref: { $refText: string } | undefined): string | undefined {
  return ref?.$refText;
}

/** Definition renders as a `<"...">` doc string in the domain surface. */
function definitionLine(def: string | undefined): string | undefined {
  return def === undefined ? undefined : `<"${escapeString(def)}">`;
}

// --- per-construct emitters ----------------------------------------------

function emitAttribute(a: Dehydrated<Attribute>, emitChild: EmitChild): string {
  const head: string[] = [];
  if (a.override) head.push('override');
  head.push(a.name);
  const type = refText(a.typeCall?.type);
  if (type) head.push(type);
  head.push(formatCardinality(a.card));
  const lines = [head.join(' ')];
  const def = definitionLine(a.definition);
  if (def) lines.push(indentBlock(def));
  // Unimplemented annotation/synonym/label/ref children ride CST via emitChild.
  for (const child of childList(a.annotations, a.references, a.synonyms, a.labels, a.ruleReferences)) {
    lines.push(indentBlock(emitChild(child)));
  }
  return lines.join('\n');
}

function emitChoiceOption(o: Dehydrated<ChoiceOption>, emitChild: EmitChild): string {
  const type = refText(o.typeCall?.type) ?? 'unknown';
  const lines = [type];
  const def = definitionLine(o.definition);
  if (def) lines.push(indentBlock(def));
  for (const child of childList(o.annotations, o.references, o.synonyms, o.labels, o.ruleReferences)) {
    lines.push(indentBlock(emitChild(child)));
  }
  return lines.join('\n');
}

function emitEnumValue(v: Dehydrated<RosettaEnumValue>, emitChild: EmitChild): string {
  let head = v.name;
  if (v.display) head += ` displayName "${escapeString(v.display)}"`;
  const lines = [head];
  const def = definitionLine(v.definition);
  if (def) lines.push(indentBlock(def));
  for (const child of childList(v.annotations, v.references, v.enumSynonyms)) {
    lines.push(indentBlock(emitChild(child)));
  }
  return lines.join('\n');
}

function emitData(d: Dehydrated<Data>, emitChild: EmitChild): string {
  let header = `type ${d.name}`;
  const parent = refText(d.superType);
  if (parent) header += ` extends ${parent}`;
  header += ':';
  const lines = [header];
  const def = definitionLine(d.definition);
  if (def) lines.push(indentBlock(def));
  // Meta block (annotations/refs/synonyms) — unimplemented, ride CST.
  for (const child of childList(d.annotations, d.references, d.synonyms)) {
    lines.push(indentBlock(emitChild(child)));
  }
  for (const attr of d.attributes ?? []) {
    lines.push(indentBlock(emitChild(attr as DehydratedNode)));
  }
  for (const cond of d.conditions ?? []) {
    lines.push('');
    lines.push(indentBlock(emitChild(cond as DehydratedNode)));
  }
  return lines.join('\n');
}

function emitChoice(c: Dehydrated<Choice>, emitChild: EmitChild): string {
  const lines = [`choice ${c.name}:`];
  const def = definitionLine(c.definition);
  if (def) lines.push(indentBlock(def));
  for (const child of childList(c.annotations, c.synonyms)) {
    lines.push(indentBlock(emitChild(child)));
  }
  for (const opt of c.attributes ?? []) {
    lines.push(indentBlock(emitChild(opt as DehydratedNode)));
  }
  return lines.join('\n');
}

function emitEnum(e: Dehydrated<RosettaEnumeration>, emitChild: EmitChild): string {
  let header = `enum ${e.name}`;
  const parent = refText(e.parent);
  if (parent) header += ` extends ${parent}`;
  header += ':';
  const lines = [header];
  const def = definitionLine(e.definition);
  if (def) lines.push(indentBlock(def));
  for (const child of childList(e.annotations, e.references, e.synonyms)) {
    lines.push(indentBlock(emitChild(child)));
  }
  for (const val of e.enumValues ?? []) {
    lines.push(indentBlock(emitChild(val as DehydratedNode)));
  }
  return lines.join('\n');
}

/** Flatten present child arrays into one ordered list of DehydratedNodes. */
function childList(...arrays: Array<ReadonlyArray<unknown> | undefined>): DehydratedNode[] {
  const out: DehydratedNode[] = [];
  for (const arr of arrays) {
    if (!arr) continue;
    for (const item of arr) out.push(item as DehydratedNode);
  }
  return out;
}

// --- dispatcher -----------------------------------------------------------

export function emitNode(node: DehydratedNode, emitChild: EmitChild): string | null {
  switch ((node as { $type: string }).$type) {
    case 'Data': return emitData(node as Dehydrated<Data>, emitChild);
    case 'Attribute': return emitAttribute(node as Dehydrated<Attribute>, emitChild);
    case 'Choice': return emitChoice(node as Dehydrated<Choice>, emitChild);
    case 'ChoiceOption': return emitChoiceOption(node as Dehydrated<ChoiceOption>, emitChild);
    case 'RosettaEnumeration': return emitEnum(node as Dehydrated<RosettaEnumeration>, emitChild);
    case 'RosettaEnumValue': return emitEnumValue(node as Dehydrated<RosettaEnumValue>, emitChild);
    default: return null; // unimplemented → caller uses CST
  }
}
```

> NOTE for the implementer: confirm `Data`/`Attribute`/etc. are exported from the
> `@rune-langium/core` barrel (they are, via `index.ts → generated/domain.ts →
> ast.ts`). If a type import fails, import from `@rune-langium/core` directly as
> above. The meta-block children (annotations/refs/synonyms) and conditions are
> intentionally routed through `emitChild` (they return `null` from `emitNode` and
> therefore slice their CST in the editor driver).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rune-langium/codegen test -- rosetta-emit-core`
Expected: PASS (all cases).

- [ ] **Step 5: Type-check**

Run: `pnpm --filter @rune-langium/codegen run type-check`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/codegen/src/emit/rosetta/rosetta-emit-core.ts packages/codegen/test/emit/rosetta/rosetta-emit-core.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(codegen): whole-AST emitNode emit-core for .rosetta (scalars + null fallback)"
```

---

## Task 3: Browser-safe `@rune-langium/codegen/rosetta` subpath

**Files:**
- Create: `packages/codegen/src/rosetta.ts`
- Modify: `packages/codegen/package.json` (exports map)
- Test: `packages/codegen/test/rosetta-subpath-isolation.test.ts` (create)

**Interfaces:**
- Produces: the public import `@rune-langium/codegen/rosetta` exposing `emitNode`, `EmitChild`, `DehydratedNode` and nothing that reaches `generator.ts`/`exceljs`.

- [ ] **Step 1: Write the failing test**

Create `packages/codegen/test/rosetta-subpath-isolation.test.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, '../src');

// Transitively collect relative imports starting from a source entry, asserting
// the import graph never reaches generator.ts / index.ts / excel-emitter / exceljs.
function collectGraph(entryRel: string): Set<string> {
  const seen = new Set<string>();
  const stack = [resolve(srcDir, entryRel)];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const code = readFileSync(file, 'utf8');
    const importRe = /from\s+['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(code))) {
      const spec = m[1];
      if (spec.startsWith('.')) {
        const target = resolve(dirname(file), spec.replace(/\.js$/, '.ts'));
        stack.push(target);
      } else {
        seen.add(`pkg:${spec}`);
      }
    }
  }
  return seen;
}

describe('@rune-langium/codegen/rosetta isolation', () => {
  it('does not transitively import generator/index/excel/exceljs', () => {
    const graph = collectGraph('rosetta.ts');
    const joined = [...graph].join('\n');
    expect(joined).not.toMatch(/generator\.ts/);
    expect(joined).not.toMatch(/[/\\]index\.ts/);
    expect(joined).not.toMatch(/excel-emitter\.ts/);
    expect(graph.has('pkg:exceljs')).toBe(false);
  });

  it('re-exports emitNode', async () => {
    const mod = await import('../src/rosetta.js');
    expect(typeof mod.emitNode).toBe('function');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rune-langium/codegen test -- rosetta-subpath-isolation`
Expected: FAIL — `src/rosetta.ts` does not exist (import + graph collection throw).

- [ ] **Step 3: Create the subpath barrel**

Create `packages/codegen/src/rosetta.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Browser-safe entry for the `.rosetta` emit-core.
 *
 * Re-exports ONLY the pure emit-core. It must never import `./index.js`,
 * `./generator.js`, or anything under `./emit/excel-emitter.js` — those pull in
 * ExcelJS (Node-only) and would break browser bundling of the visual editor.
 */
export { emitNode } from './emit/rosetta/rosetta-emit-core.js';
export type { EmitChild, DehydratedNode } from './emit/rosetta/rosetta-emit-core.js';
```

- [ ] **Step 4: Add the export subpath to package.json**

In `packages/codegen/package.json`, extend the `exports` map (keep the existing `"."` entry) :

```json
"exports": {
  ".": {
    "types": "./dist/src/index.d.ts",
    "default": "./dist/src/index.js"
  },
  "./rosetta": {
    "types": "./dist/src/rosetta.d.ts",
    "default": "./dist/src/rosetta.js"
  }
}
```

- [ ] **Step 5: Build the package (so the subpath resolves) and run the test**

Run: `pnpm --filter @rune-langium/codegen run build`
Run: `pnpm --filter @rune-langium/codegen test -- rosetta-subpath-isolation`
Expected: both pass; isolation assertions green.

- [ ] **Step 6: Commit**

```bash
git add packages/codegen/src/rosetta.ts packages/codegen/package.json packages/codegen/test/rosetta-subpath-isolation.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(codegen): add browser-safe @rune-langium/codegen/rosetta subpath"
```

---

## Task 4: Dirty-path predicate from `pendingEditPatches`

**Files:**
- Create: `packages/visual-editor/src/serialize/dirty-paths.ts`
- Test: `packages/visual-editor/test/serialize/dirty-paths.test.ts` (create)

**Interfaces:**
- Consumes: `Patches` from `mutative` — each patch has `path: (string | number)[]`, rooted like `['nodes', '<nodeId>', 'data', 'attributes', 0, 'name']`.
- Produces:
  - `type DirtyIndex` (opaque).
  - `function buildDirtyIndex(patches: Patches): DirtyIndex`
  - `function isNodeDirty(index: DirtyIndex, nodeId: string): boolean` — any patch under this node id.
  - `function isSubtreeDirty(index: DirtyIndex, nodeId: string, dataPath: (string | number)[]): boolean` — any patch path is at-or-under `['nodes', nodeId, 'data', ...dataPath]`.

- [ ] **Step 1: Write the failing test**

Create `packages/visual-editor/test/serialize/dirty-paths.test.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import type { Patches } from 'mutative';
import { buildDirtyIndex, isNodeDirty, isSubtreeDirty } from '../../src/serialize/dirty-paths.js';

const patches = [
  { op: 'replace', path: ['nodes', 'test.Foo', 'data', 'attributes', 0, 'name'], value: 'x' }
] as unknown as Patches;

describe('dirty-paths', () => {
  const idx = buildDirtyIndex(patches);

  it('marks the owning node dirty', () => {
    expect(isNodeDirty(idx, 'test.Foo')).toBe(true);
    expect(isNodeDirty(idx, 'test.Bar')).toBe(false);
  });

  it('marks the edited attribute subtree dirty', () => {
    expect(isSubtreeDirty(idx, 'test.Foo', ['attributes', 0])).toBe(true);
    expect(isSubtreeDirty(idx, 'test.Foo', ['attributes', 0, 'name'])).toBe(true);
  });

  it('leaves a sibling attribute clean', () => {
    expect(isSubtreeDirty(idx, 'test.Foo', ['attributes', 1])).toBe(false);
  });

  it('marks an ancestor (the whole data) dirty', () => {
    expect(isSubtreeDirty(idx, 'test.Foo', [])).toBe(true);
  });

  it('leaves conditions clean when only an attribute changed', () => {
    expect(isSubtreeDirty(idx, 'test.Foo', ['conditions', 0])).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rune-langium/visual-editor test -- dirty-paths`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `packages/visual-editor/src/serialize/dirty-paths.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Derive a subtree-dirty predicate from the Mutative `pendingEditPatches`.
 *
 * Patch paths are rooted at the editor store draft, e.g.
 *   ['nodes', '<nodeId>', 'data', 'attributes', 0, 'name'].
 * A node's subtree at `['nodes', nodeId, 'data', ...dataPath]` is dirty iff some
 * patch path is at-or-under it (the patch path has that path as a prefix).
 */

import type { Patches } from 'mutative';

type PathSeg = string | number;
export interface DirtyIndex {
  /** All patch paths that target the `nodes` draft, normalized to arrays. */
  readonly paths: ReadonlyArray<ReadonlyArray<PathSeg>>;
}

export function buildDirtyIndex(patches: Patches): DirtyIndex {
  const paths: PathSeg[][] = [];
  for (const p of patches) {
    const path = p.path as PathSeg[];
    if (Array.isArray(path) && path[0] === 'nodes') paths.push(path);
  }
  return { paths };
}

function hasPrefix(path: ReadonlyArray<PathSeg>, prefix: PathSeg[]): boolean {
  if (path.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    // Compare loosely: Mutative may emit numeric indices as numbers or strings.
    if (String(path[i]) !== String(prefix[i])) return false;
  }
  return true;
}

export function isNodeDirty(index: DirtyIndex, nodeId: string): boolean {
  const prefix: PathSeg[] = ['nodes', nodeId];
  return index.paths.some((p) => hasPrefix(p, prefix));
}

export function isSubtreeDirty(index: DirtyIndex, nodeId: string, dataPath: PathSeg[]): boolean {
  const prefix: PathSeg[] = ['nodes', nodeId, 'data', ...dataPath];
  return index.paths.some((p) => hasPrefix(p, prefix));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rune-langium/visual-editor test -- dirty-paths`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/visual-editor/src/serialize/dirty-paths.ts packages/visual-editor/test/serialize/dirty-paths.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(ve): dirty-path predicate from pendingEditPatches"
```

---

## Task 5: CST-reuse serializer (recursion + file assembly)

**Files:**
- Create: `packages/visual-editor/src/serialize/cst-reuse-serializer.ts`
- Test: `packages/visual-editor/test/serialize/cst-reuse-serializer.test.ts` (create)

**Interfaces:**
- Consumes: `emitNode`, `EmitChild`, `DehydratedNode` (`@rune-langium/codegen/rosetta`); `DirtyIndex`, `isSubtreeDirty` (Task 4); `TypeGraphNode` (`../types.js`); `Dehydrated<T>.$cstRange`.
- Produces:
  - `function serializeNamespaceToSource(args: { nodes: TypeGraphNode[]; originalSource: string; dirty: DirtyIndex }): string`
  - Internal `serializeNode(node, dataPath): string` recursion.

- [ ] **Step 1: Write the failing test**

Create `packages/visual-editor/test/serialize/cst-reuse-serializer.test.ts`. This is the **bug-regression test** — it must fail against the old `serializeModel` behaviour and pass here.

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { parsedAdapter } from '@rune-langium/core/adapters/parsed-adapter';
import { serializeNamespaceToSource } from '../../src/serialize/cst-reuse-serializer.js';
import { buildDirtyIndex } from '../../src/serialize/dirty-paths.js';
import type { Patches } from 'mutative';
import type { TypeGraphNode } from '../../src/types.js';

const SRC = `namespace test
version "1.0.0"

type Foo:
  bar string (1..1)
    [metadata scheme]
  baz int (0..1)

  condition NonEmpty:
    if bar exists then baz exists
`;

// Build a single graph node from the parsed Data element.
async function fooNode(): Promise<{ node: TypeGraphNode; nodeId: string }> {
  const { value } = await parse(SRC);
  const data = (value as unknown as { elements: unknown[] }).elements[0];
  const dehydrated = parsedAdapter.dehydrate(
    data as Parameters<typeof parsedAdapter.dehydrate>[0]
  );
  const nodeId = 'test.Foo';
  const node = {
    id: nodeId,
    data: dehydrated,
    meta: { namespace: 'test', deferred: false }
  } as unknown as TypeGraphNode;
  return { node, nodeId };
}

describe('cst-reuse serializer', () => {
  it('reuses the whole element verbatim when nothing is dirty', async () => {
    const { node } = await fooNode();
    const out = serializeNamespaceToSource({
      nodes: [node], originalSource: SRC, dirty: buildDirtyIndex([] as unknown as Patches)
    });
    expect(out).toBe(SRC); // byte-for-byte
  });

  it('regenerates only the edited attribute and PRESERVES the condition + metadata', async () => {
    const { node, nodeId } = await fooNode();
    // Simulate the inspector renaming attribute[0] bar -> barRenamed.
    (node.data as { attributes: Array<{ name: string }> }).attributes[0].name = 'barRenamed';
    const patches = [
      { op: 'replace', path: ['nodes', nodeId, 'data', 'attributes', 0, 'name'], value: 'barRenamed' }
    ] as unknown as Patches;

    const out = serializeNamespaceToSource({
      nodes: [node], originalSource: SRC, dirty: buildDirtyIndex(patches)
    });

    expect(out).toContain('barRenamed string (1..1)');
    // The lossy bug would have dropped these. They must survive:
    expect(out).toContain('[metadata scheme]');               // attr annotation preserved
    expect(out).toContain('condition NonEmpty:');             // condition preserved
    expect(out).toContain('if bar exists then baz exists');   // condition BODY, not `True`
    expect(out).toContain('baz int (0..1)');                  // sibling attribute untouched
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rune-langium/visual-editor test -- cst-reuse-serializer`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the serializer**

Create `packages/visual-editor/src/serialize/cst-reuse-serializer.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * CST-reuse `.rosetta` serializer (option B).
 *
 * Per node: if its subtree is clean (has a $cstRange and no pendingEditPatch at
 * or under it), slice the original bytes; else regenerate via the emit-core,
 * recursing into children (each child reuses if clean). Untouched content is
 * never re-emitted. Replaces serializeModel + mergeSerializedIntoSource.
 */

import { emitNode, type EmitChild, type DehydratedNode } from '@rune-langium/codegen/rosetta';
import type { TypeGraphNode } from '../types.js';
import { type DirtyIndex, isSubtreeDirty } from './dirty-paths.js';

interface CstRange { offset: number; end: number }

function cstRange(node: unknown): CstRange | undefined {
  return (node as { $cstRange?: CstRange }).$cstRange;
}

export interface SerializeArgs {
  nodes: TypeGraphNode[];
  originalSource: string;
  dirty: DirtyIndex;
  /**
   * Node ids forced to regenerate regardless of patches — used when an edit
   * lives off the node's `data` subtree (e.g. an `extends` change carried on an
   * EDGE, not a `nodes` patch). See Task 6's inheritance handling.
   */
  forceDirtyNodeIds?: ReadonlySet<string>;
}

export function serializeNamespaceToSource(args: SerializeArgs): string {
  const { nodes, originalSource, dirty, forceDirtyNodeIds } = args;

  // Per-node recursive serializer (closes over originalSource + dirty + nodeId).
  function makeSerialize(nodeId: string) {
    const serialize = (child: DehydratedNode, dataPath: (string | number)[]): string => {
      const range = cstRange(child);
      const forced = dataPath.length === 0 && (forceDirtyNodeIds?.has(nodeId) ?? false);
      const subtreeDirty = forced || isSubtreeDirty(dirty, nodeId, dataPath);
      if (range && !subtreeDirty) {
        return originalSource.slice(range.offset, range.end); // clean → reuse
      }
      // Dirty or new → regenerate. emitChild recurses with extended dataPath.
      const emitChild: EmitChild = (c) => {
        const idx = childIndex(child, c, dataPath);
        return serialize(c, idx);
      };
      const generated = emitNode(child, emitChild);
      if (generated !== null) return generated;
      if (range) return originalSource.slice(range.offset, range.end); // unimplemented but had bytes
      throw new Error(
        `cannot serialize new node of unimplemented $type ${(child as { $type: string }).$type}`
      );
    };
    return serialize;
  }

  // Top-level elements that exist in the baseline (have a $cstRange), sorted by
  // source offset, drive the assembly. Gaps between them (header, comments,
  // non-graph elements like functions) are copied verbatim.
  const placed = nodes
    .map((n) => ({ n, range: cstRange(n.data) }))
    .filter((x): x is { n: TypeGraphNode; range: CstRange } => x.range !== undefined)
    .sort((a, b) => a.range.offset - b.range.offset);

  const parts: string[] = [];
  let cursor = 0;
  for (const { n, range } of placed) {
    if (range.offset > cursor) parts.push(originalSource.slice(cursor, range.offset));
    const serialize = makeSerialize(n.id);
    parts.push(serialize(n.data as unknown as DehydratedNode, []));
    cursor = range.end;
  }
  if (cursor < originalSource.length) parts.push(originalSource.slice(cursor));

  // New top-level nodes (no $cstRange) → append at the namespace tail.
  const fresh = nodes.filter((n) => cstRange(n.data) === undefined);
  if (fresh.length > 0) {
    let body = parts.join('');
    if (!body.endsWith('\n')) body += '\n';
    const additions = fresh.map((n) => {
      const serialize = makeSerialize(n.id);
      return serialize(n.data as unknown as DehydratedNode, []);
    });
    return body + '\n' + additions.join('\n\n') + '\n';
  }

  return parts.join('');
}

/**
 * Compute the dataPath segment for a child relative to its parent's dataPath.
 * The emit-core hands us the child object; we locate it among the parent's
 * known child arrays to build the patch-comparable path.
 */
function childIndex(
  parent: DehydratedNode,
  child: DehydratedNode,
  parentPath: (string | number)[]
): (string | number)[] {
  const p = parent as unknown as Record<string, unknown[]>;
  for (const key of CHILD_ARRAY_KEYS) {
    const arr = p[key];
    if (Array.isArray(arr)) {
      const i = arr.indexOf(child);
      if (i >= 0) return [...parentPath, key, i];
    }
  }
  // Child not found in a known array (should not happen for emitted children);
  // fall back to the parent path so the child inherits the parent's dirtiness.
  return parentPath;
}

const CHILD_ARRAY_KEYS = [
  'attributes', 'conditions', 'annotations', 'references',
  'synonyms', 'enumSynonyms', 'labels', 'ruleReferences', 'enumValues'
];
```

> NOTE for the implementer: `childIndex` relies on `emitChild` being called with
> the exact child object reference from the parent's array (it is — the emit-core
> iterates the parent's arrays and passes each element). The `indexOf` identity
> match is therefore reliable. If a future emit case constructs a new child
> object, give it an explicit path instead.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rune-langium/visual-editor test -- cst-reuse-serializer`
Expected: PASS — clean reuse is byte-identical; the edited-attribute case preserves `[metadata scheme]`, the condition, and the condition body.

- [ ] **Step 5: Type-check**

Run: `pnpm --filter @rune-langium/visual-editor run type-check`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/visual-editor/src/serialize/cst-reuse-serializer.ts packages/visual-editor/test/serialize/cst-reuse-serializer.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(ve): CST-reuse .rosetta serializer (option B)"
```

---

## Task 6: Wire the serializer into `useModelSourceSync` (thread dirty set; degraded guard)

**Files:**
- Modify: `packages/visual-editor/src/hooks/useModelSourceSync.ts`
- Modify: `apps/studio/src/shell/ExplorePerspective.tsx` (`handleModelChanged`, call site at :1277)
- Test: `packages/visual-editor/test/hooks/useModelSourceSync.test.ts` (extend if present, else create a focused unit test on the new exported helper)

**Interfaces:**
- Consumes: `serializeNamespaceToSource` (Task 5), `buildDirtyIndex` (Task 4), `pendingEditPatches` from the editor store.
- Produces: `onModelChanged` now receives `Map<namespace, fullFileText>` already merged against the original source (no separate merge step). `handleModelChanged` writes the text directly.

- [ ] **Step 1: Write the failing test**

The hook needs the original source per namespace + the dirty index. Extract the assembly into a pure exported helper so it is testable without React. Add to a new `packages/visual-editor/test/hooks/source-sync-emit.test.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { buildSourceForNamespaces } from '../../src/hooks/useModelSourceSync.js';
import type { Patches } from 'mutative';
import type { TypeGraphNode } from '../../src/types.js';

describe('buildSourceForNamespaces', () => {
  it('returns one entry per namespace, reusing source when clean', () => {
    const src = 'namespace test\nversion "1.0.0"\n\ntype Foo:\n  bar string (0..1)\n';
    const node = {
      id: 'test.Foo',
      meta: { namespace: 'test', deferred: false },
      data: { $type: 'Data', name: 'Foo', $cstRange: { offset: src.indexOf('type Foo'), end: src.length - 1 },
              attributes: [], conditions: [], annotations: [], references: [], synonyms: [] }
    } as unknown as TypeGraphNode;

    const out = buildSourceForNamespaces({
      nodes: [node], edges: [],
      originalSourceByNamespace: new Map([['test', src]]),
      patches: [] as unknown as Patches
    });

    expect(out.get('test')).toBe(src);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rune-langium/visual-editor test -- source-sync-emit`
Expected: FAIL — `buildSourceForNamespaces` is not exported.

- [ ] **Step 3: Add the pure helper and rewire the hook**

In `packages/visual-editor/src/hooks/useModelSourceSync.ts`:
- Add the signature: the hook gains `pendingEditPatches` and an `originalSourceByNamespace` resolver. Update the user-edit branch (today lines 156-164) to call `buildSourceForNamespaces` instead of `serializeModel(modelsToAst(...))`. Export the helper:

```ts
import type { Patches } from 'mutative';
import { serializeNamespaceToSource } from '../serialize/cst-reuse-serializer.js';
import { buildDirtyIndex } from '../serialize/dirty-paths.js';
import type { TypeGraphNode, TypeGraphEdge } from '../types.js';

export interface BuildSourceArgs {
  nodes: TypeGraphNode[];
  edges: TypeGraphEdge[];
  originalSourceByNamespace: Map<string, string>;
  patches: Patches;
}

/** Pure: produce Map<namespace, full .rosetta source> via CST-reuse. */
export function buildSourceForNamespaces(args: BuildSourceArgs): Map<string, string> {
  const { nodes, edges, originalSourceByNamespace, patches } = args;
  const dirty = buildDirtyIndex(patches);

  // Inheritance is carried on EDGES (extends / enum-extends), not on the
  // node's data subtree, so an inheritance change does NOT produce a `nodes`
  // patch. Reflect the edge-derived parent onto a shallow clone of node.data
  // and force-regenerate any node whose effective parent differs from the
  // original (dehydrated) value. Mirrors model-to-ast.ts:buildInheritanceMap.
  const inheritanceTarget = new Map<string, string>(); // sourceNodeId -> targetNodeId
  for (const e of edges) {
    if (e.data?.kind === 'extends' || e.data?.kind === 'enum-extends') {
      inheritanceTarget.set(e.source, e.target);
    }
  }
  const forceDirtyNodeIds = new Set<string>();
  const effectiveNodes = nodes.map((n) => {
    const targetId = inheritanceTarget.get(n.id);
    const d = n.data as { $type?: string; superType?: { $refText?: string }; parent?: { $refText?: string } };
    const refKey = d.$type === 'RosettaEnumeration' ? 'parent' : 'superType';
    const original = (d as Record<string, { $refText?: string } | undefined>)[refKey]?.$refText;
    const effective = targetId === undefined ? undefined : nameFromNodeId(targetId);
    // Prefer the existing qualified $refText when the edge agrees; only override
    // when the edge introduces/changes/removes inheritance.
    if (effective !== undefined && original === undefined) {
      forceDirtyNodeIds.add(n.id);
      return cloneWithRef(n, refKey, effective);
    }
    if (effective === undefined && original !== undefined) {
      forceDirtyNodeIds.add(n.id);
      return cloneWithRef(n, refKey, undefined);
    }
    return n; // unchanged inheritance (or both absent) — reuse as-is
  });

  const byNs = new Map<string, TypeGraphNode[]>();
  for (const n of effectiveNodes) {
    if (n.meta.deferred) continue; // curated placeholders are never source
    const ns = n.meta.namespace;
    (byNs.get(ns) ?? byNs.set(ns, []).get(ns)!).push(n);
  }
  const out = new Map<string, string>();
  for (const [ns, nsNodes] of byNs) {
    const originalSource = originalSourceByNamespace.get(ns);
    if (originalSource === undefined) continue; // no baseline to reuse — skip (degraded)
    out.set(ns, serializeNamespaceToSource({ nodes: nsNodes, originalSource, dirty, forceDirtyNodeIds }));
  }
  return out;
}

// Shallow-clone a node, replacing the inheritance ref field. $cstRange survives
// the shallow clone (it is a sibling field on data).
function cloneWithRef(n: TypeGraphNode, refKey: string, refText: string | undefined): TypeGraphNode {
  const data = { ...(n.data as Record<string, unknown>) };
  data[refKey] = refText === undefined ? undefined : { $refText: refText };
  return { ...n, data } as TypeGraphNode;
}
```

> NOTE for the implementer: import `nameFromNodeId` from
> `../store/node-projection.js` (used by `model-to-ast.ts:105` for exactly this).
> **Verify first** how the supertype inspector field commits: if it writes
> `node.data.superType` directly (a `nodes` patch), the patch-based dirty signal
> already covers it and the edge-reflection above is a harmless no-op (edge and
> data agree). If it only draws an EDGE, the reflection above is what keeps
> inheritance edits from being lost. Either way this code is correct; the test in
> Task 7 covers the edge path.

- Update the hook to: read `pendingEditPatches` and the per-namespace original source (passed in by the caller — see Step 4), and in the user-edit branch (after the `parseAdvanced` gate at lines 140-154) call `buildSourceForNamespaces(...)` and pass its result to `onModelChanged`. Keep the existing initial-skip and equality guards. **Preserve the `parseEpoch` gate verbatim** — it already suppresses write-back on degraded reparses.

- Update the hook signature to accept `patches: Patches` and `originalSourceByNamespace: Map<string,string>` parameters (added after `parseEpoch`).

- [ ] **Step 4: Update the studio call site**

In `apps/studio/src/shell/ExplorePerspective.tsx`:
- Add a `storePendingEditPatches` selector: `const storePendingEditPatches = useEditorStore((s) => s.pendingEditPatches);`
- Build `originalSourceByNamespace` from `filesRef.current` + `namespaceToFile` (invert it: namespace → file content).
- Change the `useModelSourceSync(...)` call (line 1277) to pass the patches and the original-source map.
- Replace `handleModelChanged`'s body: the `serialized` map now already contains **full merged file text per namespace**, so drop the `mergeSerializedIntoSource` call and write the text directly:

```ts
const handleModelChanged = useCallback(
  async (serialized: Map<string, string>) => {
    const filesAtStart = filesRef.current;
    const merged = filesAtStart.map((f) => {
      for (const [ns, text] of serialized) {
        if (namespaceToFile.get(ns) !== f.path) continue;
        if (text === f.content) return f;
        return { ...f, content: text, dirty: true };
      }
      return f;
    });
    if (filesRef.current !== filesAtStart) return;
    if (!merged.some((e, i) => e !== filesAtStart[i])) return;
    onFilesChange?.(merged);
  },
  [namespaceToFile, onFilesChange]
);
```

Remove the now-unused `mergeSerializedIntoSource` import (line 108).

- [ ] **Step 5: Run tests + type-check across the two packages**

Run: `pnpm --filter @rune-langium/visual-editor test`
Run: `pnpm --filter @rune-langium/visual-editor run type-check`
Run: `pnpm --filter @rune-langium/studio test`
Run: `pnpm --filter @rune-langium/studio run type-check`
Expected: all pass. Existing source-sync tests that assert the OLD `serializeModel` whole-file output will need updating to the CST-reuse output — update them to assert content preservation, not exact lossy bytes.

- [ ] **Step 6: Commit**

```bash
git add packages/visual-editor/src/hooks/useModelSourceSync.ts apps/studio/src/shell/ExplorePerspective.tsx packages/visual-editor/test/hooks/source-sync-emit.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(ve,studio): route inspector write-back through CST-reuse serializer"
```

---

## Task 7: Cascade + degraded-parse regression coverage

**Files:**
- Test: `packages/visual-editor/test/serialize/cst-reuse-cascade.test.ts` (create)

**Interfaces:**
- Consumes: Task 5 serializer; Task 4 dirty index.

- [ ] **Step 1: Write the cascade test**

Create `packages/visual-editor/test/serialize/cst-reuse-cascade.test.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { parsedAdapter } from '@rune-langium/core/adapters/parsed-adapter';
import { serializeNamespaceToSource } from '../../src/serialize/cst-reuse-serializer.js';
import { buildDirtyIndex } from '../../src/serialize/dirty-paths.js';
import type { Patches } from 'mutative';
import type { TypeGraphNode } from '../../src/types.js';

const SRC = `namespace test
version "1.0.0"

type Uses:
  field Target (0..1)
`;

function node(data: unknown, id: string): TypeGraphNode {
  return { id, data, meta: { namespace: 'test', deferred: false } } as unknown as TypeGraphNode;
}

describe('cst-reuse — cascade + degraded', () => {
  it('regenerates a referencing attribute when its $refText was cascaded', async () => {
    const { value } = await parse(SRC);
    const data = (value as unknown as { elements: unknown[] }).elements[0];
    const d = parsedAdapter.dehydrate(data as Parameters<typeof parsedAdapter.dehydrate>[0]);
    // Cascade: rename Target -> Target2 rewrote the attribute's typeCall ref.
    (d as { attributes: Array<{ typeCall: { type: { $refText: string } } }> })
      .attributes[0].typeCall.type.$refText = 'Target2';
    const patches = [
      { op: 'replace',
        path: ['nodes', 'test.Uses', 'data', 'attributes', 0, 'typeCall', 'type', '$refText'],
        value: 'Target2' }
    ] as unknown as Patches;

    const out = serializeNamespaceToSource({
      nodes: [node(d, 'test.Uses')], originalSource: SRC, dirty: buildDirtyIndex(patches)
    });
    expect(out).toContain('field Target2 (0..1)');
    expect(out).not.toContain('field Target (0..1)');
  });

  it('falls back to whole-element reuse when a dirty node still has its $cstRange (degraded emit)', async () => {
    // If emitNode were to return null for an edited-but-unimplemented node that
    // still carries a $cstRange, the serializer slices rather than dropping it.
    const { value } = await parse(SRC);
    const data = (value as unknown as { elements: unknown[] }).elements[0];
    const d = parsedAdapter.dehydrate(data as Parameters<typeof parsedAdapter.dehydrate>[0]);
    // Force the "unimplemented" branch by masking $type (simulates a future node
    // kind the emit-core hasn't learned yet) while keeping the original $cstRange.
    (d as { $type: string }).$type = 'RosettaFunction';
    const patches = [
      { op: 'replace', path: ['nodes', 'test.Uses', 'data', 'name'], value: 'x' }
    ] as unknown as Patches;
    const out = serializeNamespaceToSource({
      nodes: [node(d, 'test.Uses')], originalSource: SRC, dirty: buildDirtyIndex(patches)
    });
    expect(out).toContain('type Uses:'); // sliced from CST, not dropped
  });
});
```

- [ ] **Step 2: Add the inheritance-via-edge test**

Create `packages/visual-editor/test/serialize/inheritance-edge.test.ts` (exercises the edge-reflection path in `buildSourceForNamespaces`):

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { parsedAdapter } from '@rune-langium/core/adapters/parsed-adapter';
import { buildSourceForNamespaces } from '../../src/hooks/useModelSourceSync.js';
import type { Patches } from 'mutative';
import type { TypeGraphNode, TypeGraphEdge } from '../../src/types.js';

const SRC = `namespace test
version "1.0.0"

type Base:
  x string (0..1)

type Sub:
  y string (0..1)
`;

describe('inheritance via edge', () => {
  it('regenerates Sub with extends when an extends edge is added', async () => {
    const { value } = await parse(SRC);
    const els = (value as unknown as { elements: unknown[] }).elements;
    const subData = parsedAdapter.dehydrate(els[1] as Parameters<typeof parsedAdapter.dehydrate>[0]);
    const sub = { id: 'test.Sub', data: subData, meta: { namespace: 'test', deferred: false } } as unknown as TypeGraphNode;
    const baseData = parsedAdapter.dehydrate(els[0] as Parameters<typeof parsedAdapter.dehydrate>[0]);
    const base = { id: 'test.Base', data: baseData, meta: { namespace: 'test', deferred: false } } as unknown as TypeGraphNode;

    const edges = [
      { id: 'e1', source: 'test.Sub', target: 'test.Base', data: { kind: 'extends' } }
    ] as unknown as TypeGraphEdge[];

    const out = buildSourceForNamespaces({
      nodes: [base, sub], edges,
      originalSourceByNamespace: new Map([['test', SRC]]),
      patches: [] as unknown as Patches
    });

    const text = out.get('test')!;
    expect(text).toContain('type Sub extends Base:');
    expect(text).toContain('y string (0..1)'); // child preserved
    expect(text).toContain('type Base:');       // Base untouched
  });
});
```

- [ ] **Step 3: Run to verify behaviour**

Run: `pnpm --filter @rune-langium/visual-editor test -- cst-reuse-cascade inheritance-edge`
Expected: PASS. (If the cascade case fails, the dirty-path test in Task 4 missed a nested ref path — fix `isSubtreeDirty` prefix handling, not this test. If the inheritance case fails, check `nameFromNodeId` output matches the bare type name.)

- [ ] **Step 4: Commit**

```bash
git add packages/visual-editor/test/serialize/cst-reuse-cascade.test.ts packages/visual-editor/test/serialize/inheritance-edge.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "test(ve): cascade, degraded, and inheritance-edge coverage for CST-reuse serializer"
```

---

## Task 8: Retire dead code and the lossy round-trip

**Files:**
- Modify: `packages/core/src/serializer/rosetta-serializer.ts` (remove `serializeElement`, `serializeModels`; remove `serializeModel` once unreferenced)
- Modify: `packages/core/src/index.ts` (trim barrel exports)
- Modify: `packages/visual-editor/src/components/RuneTypeGraph.tsx` (`exportRosetta` → emit-core or the new serializer)
- Delete: `apps/studio/src/utils/source-merge.ts` (+ its test) once no importer remains
- Grep gate: confirm no remaining importers before each deletion.

**Interfaces:**
- Consumes: nothing new. This task only removes now-dead code.

- [ ] **Step 1: Confirm `serializeElement` / `serializeModels` are unreferenced**

Run: `rg -n "serializeElement|serializeModels" packages apps --type ts | rg -v 'rosetta-serializer.ts|\.test\.|roundtrip'`
Expected: no live importers (only the definitions + the conformance test's local redefinitions).

- [ ] **Step 2: Remove the two dead exports + barrel entries**

Delete `serializeElement` and `serializeModels` from `packages/core/src/serializer/rosetta-serializer.ts`; update `packages/core/src/index.ts:51` to `export { serializeModel } from './serializer/rosetta-serializer.js';` (keep `serializeModel` for now — `RuneTypeGraph.exportRosetta` still uses it until Step 4).

- [ ] **Step 3: Run core tests + type-check**

Run: `pnpm --filter @rune-langium/core test`
Run: `pnpm --filter @rune-langium/core run type-check`
Expected: pass (the conformance test redefines its own locals, so it is unaffected).

- [ ] **Step 4: Migrate `RuneTypeGraph.exportRosetta` off `serializeModel`**

Point `exportRosetta` at the CST-reuse serializer where original source is available, or — for the explicit "export current graph" button where there is no baseline source — at a full-regenerate pass: `emitNode(node, function emitChild(c){ return emitNode(c, emitChild) ?? ''; })` per element. (Full coverage of every annotation is Plan B; for the export button, an unimplemented child with no CST emits empty — acceptable for an explicit export, and tracked by Plan B.)

- [ ] **Step 5: Remove `serializeModel` + `source-merge` once unreferenced**

Run: `rg -n "serializeModel\b|mergeSerializedIntoSource" packages apps --type ts | rg -v '\.test\.'`
If empty: delete the `serializeModel` function, its barrel export, `apps/studio/src/utils/source-merge.ts`, and `apps/studio/test/...source-merge*`. Otherwise, leave and note the remaining consumer.

- [ ] **Step 6: Full package suites + type-check**

Run: `pnpm --filter @rune-langium/core test && pnpm --filter @rune-langium/visual-editor test && pnpm --filter @rune-langium/studio test`
Run: `pnpm run type-check`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add -A
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor: retire lossy serializeModel/source-merge round-trip and dead exports"
```

---

## Task 9: `preserveCstText` evaluation (keep narrow or retire)

**Files:**
- Investigate: `packages/core/src/serializer/preserve-cst-text.ts` and its consumers (VE expression cells).

**Interfaces:**
- Consumes: nothing.

- [ ] **Step 1: Identify the cross-worker consumers**

Run: `rg -n "preserveCstText|\\$cstText" packages apps --type ts | rg -v '\.test\.'`
Determine which consumers read `$cstText` AFTER a parse-worker→main-thread or server→browser hop (where the original source is not available to slice).

- [ ] **Step 2: Decide and record**

If every consumer has the original source available at read time → `$cstRange` + on-demand slice replaces `$cstText`; remove `preserveCstText` and its callers. If any consumer is across a source-less boundary → keep `preserveCstText` scoped to that boundary and add a one-line comment pointing here. Record the decision inline in `preserve-cst-text.ts`. (No code change required if kept.)

- [ ] **Step 3: Commit (only if code changed)**

```bash
git add -A
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "chore(core): scope/retire preserveCstText per CST-reuse evaluation"
```

---

## Follow-up: Plan B (separate plan)

Not in this plan — author after Plan A merges:
- codegen **batch** `.rosetta` target: `RosettaEmitter implements NamespaceEmitter` composing the emit-core, registered in `generator.ts` (`NAMESPACE_EMITTERS` + `PROFILES`).
- Add `Choice` collection to `packages/codegen/src/emit/namespace-walker.ts` (today it omits `Choice`).
- Extend `emitNode` with full structural coverage of annotations / synonyms / doc refs / labels / rule refs / conditions for the **no-CST** batch path (the editor path keeps riding CST-reuse for these).
- Lossless inspector-driven **deletion** via a retained baseline element-id→range index.
