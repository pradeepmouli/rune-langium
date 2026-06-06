# Node-Unification Phase 1 — Core Wire-AST Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate five duplicated/divergent "wire AST" serialization concerns into `@rune-langium/core` (MIT) so the parse function, parse/codegen workers, and artifact script share one source of truth — fixing the V8 BigInt `Number`-vs-`String` latent divergence along the way.

**Architecture:** Add small, focused, individually-tested helper modules to `packages/core/src/` and export them from the core barrel. Then replace each duplicated call site (in `apps/studio/functions/**` (FSL), `apps/studio/src/workers/**` (FSL), `apps/studio/src/services/**` (FSL), `packages/core/src/**` (MIT), and `scripts/build-serialized-artifacts.mjs`) with a call to the core helper. Because consumers resolve `@rune-langium/core` from its built `dist/`, core is rebuilt after helpers land and before consumer verification.

**Tech Stack:** TypeScript 5.9 (strict, ESM/NodeNext), pnpm workspace monorepo, Langium 4.2.x, vitest. Core build: `tsgo -b` (run via `pnpm --filter @rune-langium/core build`).

**Scope:** V7 (`preserveCstText`), V8 (`serializeRuneModel` + canonical BigInt policy), V9 (`hydrateModelDocument`/`deserializeRuneModel`), V10 (`namespaceFromSource` + `namespaceFromModelName`), V11 (`qualifiedExportPath`, **server/scope adoption only**). **Out of scope (Phase 3):** the visual-editor node-id `::`→`.` switch and its ~34 fixtures; V14 wire-contract types module. The editor's `makeNodeId` (`::`) and `getNamespace` are left untouched here.

---

## Critical constraints (read before any task)

1. **SPDX headers.** New files in `packages/core/src/**` start with:
   ```ts
   // SPDX-License-Identifier: MIT
   // Copyright (c) 2026 Pradeep Mouli
   ```
   Files under `apps/studio/**` and `scripts/build-serialized-artifacts.mjs` are `FSL-1.1-ALv2` — do not change their headers.
2. **Licensing boundary.** All shared helpers MUST live in `packages/core` (MIT). Never put shared code in `apps/studio`. The studio is **source-available, not "open source."**
3. **Server cannot import browser code.** `functions/**` runs in the Cloudflare Workers runtime — the only shared dependency it may import is `@rune-langium/core`. That is exactly where every helper here lands.
4. **Consumers resolve core from `dist`.** `packages/core/package.json` `exports` map points at `dist/` only; `scripts/build-serialized-artifacts.mjs` imports `../packages/core/dist/index.js`. **After adding/altering core helpers you MUST run `pnpm --filter @rune-langium/core build` before type-checking or running the function/worker/script consumers.** Core's OWN unit tests import from `../../src/...` and need no build.
5. **Commits.** End every commit message with:
   ```
   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   ```
   Use `SKIP_SIMPLE_GIT_HOOKS=1` on commits (NOT `--no-verify`). Do not commit `reference-design/`.
6. **Validation commands.**
   - Core: `pnpm --filter @rune-langium/core test`, `pnpm --filter @rune-langium/core run type-check`
   - Whole repo: `pnpm run type-check`, `pnpm run lint`, `pnpm test`
   - Use `grep` (NOT `rg`) for identifier searches.

## Design decision — canonical BigInt policy (V8)

The five BigInt-replacer sites disagree: the `JsonSerializer.serialize` replacers (`parse.ts:447`, `build-serialized-artifacts.mjs:155`), the artifact outer stringify (`:164`), and the per-namespace replacer (`:216`) all use `Number(value)`; only the parse-function envelope wrapper `stringifyWithBigInt` (`parse.ts:577`) uses `value.toString()` (String). That single String outlier is the V8 divergence.

**Decision: centralize on `Number(value)`** — the policy the actual serialized-AST wire bytes already use on every path except the lone envelope wrapper. This makes all paths agree (the fix the spec asks for) with **zero change to the serialized-AST wire shape** the browser already consumes. It is **lossy for bigint literals above `Number.MAX_SAFE_INTEGER` (2^53)** — but that lossiness already exists on the main AST path today; unifying does not worsen it, and large numerics in Rosetta are modeled as `BigDecimal`/string, not bigint. The helper documents this; switching to a lossless String policy later would require deserialize-side handling and is deliberately out of scope.

> **Plan-review checkpoint:** if you want the lossless-String policy instead (changes wire shape + needs deserialize handling), say so before execution and Task 3 changes accordingly.

## File structure

| File | New/modify | Responsibility |
|---|---|---|
| `packages/core/src/naming/qualified-export-path.ts` | new (MIT) | `qualifiedExportPath(namespace, name)` — the dot scope key (V11) |
| `packages/core/src/naming/namespace.ts` | new (MIT) | `namespaceFromSource(text)` + `namespaceFromModelName(name)` (V10) |
| `packages/core/src/serializer/rune-serialize.ts` | new (MIT) | `RUNE_SERIALIZE_OPTIONS`, `runeBigIntReplacer`, `serializeRuneModel(serializer, model)` (V8) |
| `packages/core/src/serializer/preserve-cst-text.ts` | new (MIT) | `preserveCstText(model)` (V7) |
| `packages/core/src/serializer/hydrate-model-document.ts` | new (MIT) | `deserializeRuneModel(services, json)` + `hydrateModelDocument(services, uri, json, opts)` (V9) |
| `packages/core/src/index.ts` | modify (MIT) | re-export all of the above |
| `packages/core/test/naming/*.test.ts`, `packages/core/test/serializer/*.test.ts` | new (MIT) | unit tests per helper |
| `apps/studio/functions/api/parse.ts` | modify (FSL) | adopt qualifiedExportPath, namespace helper, serializeRuneModel, preserveCstText, hydrateModelDocument; delete local copies |
| `apps/studio/functions/api/codegen.ts` | modify (FSL) | adopt hydrateModelDocument |
| `apps/studio/functions/lib/serialized-model-meta.ts` | modify (FSL) | adopt namespaceFromModelName |
| `apps/studio/src/workers/parser-worker.ts` | modify (FSL) | adopt preserveCstText, hydrateModelDocument/deserializeRuneModel, namespaceFromSource; delete local preserveCstText |
| `apps/studio/src/workers/codegen-worker.ts` | modify (FSL) | adopt hydrateModelDocument |
| `apps/studio/src/services/model-loader.ts` | modify (FSL) | adopt namespaceFromSource |
| `packages/core/src/services/rune-dsl-scope-computation.ts` | modify (MIT) | adopt qualifiedExportPath |
| `packages/core/src/analysis/cross-namespace-refs.ts` | modify (MIT) | adopt namespaceFromModelName |
| `packages/core/src/serializer/rosetta-serializer.ts` | modify (MIT) | adopt namespaceFromModelName |
| `scripts/build-serialized-artifacts.mjs` | modify (FSL) | adopt serializeRuneModel/runeBigIntReplacer from `dist` |

Task order is dependency-driven: pure helpers first (V11, V10), then serialize (V8), then preserveCstText (V7), then the services-coupled hydrate (V9), then a whole-repo verification + core-rebuild sweep.

---

## Task 1: V11 — `qualifiedExportPath` core helper + server/scope adoption

**Files:**
- Create: `packages/core/src/naming/qualified-export-path.ts`
- Create: `packages/core/test/naming/qualified-export-path.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/services/rune-dsl-scope-computation.ts:45` (the `const qualifiedName = ...` line)
- Modify: `apps/studio/functions/api/parse.ts:457` (the export `path` build)

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/naming/qualified-export-path.test.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { qualifiedExportPath } from '../../src/naming/qualified-export-path.js';

describe('qualifiedExportPath', () => {
  it('joins namespace and name with a dot', () => {
    expect(qualifiedExportPath('cdm.base.datetime', 'BusinessCenters')).toBe('cdm.base.datetime.BusinessCenters');
  });
  it('handles a single-segment namespace', () => {
    expect(qualifiedExportPath('test', 'Foo')).toBe('test.Foo');
  });
  it('handles an empty namespace by returning the bare name (no leading dot)', () => {
    expect(qualifiedExportPath('', 'Foo')).toBe('Foo');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/core test -- qualified-export-path`
Expected: FAIL — `Cannot find module '../../src/naming/qualified-export-path.js'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/naming/qualified-export-path.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * The canonical Langium scope key for a top-level exported element:
 * `${namespace}.${name}`. Namespaces are dot-joined identifiers and element
 * names are dotless (grammar `ValidID`), so the result is injective and the
 * last dot separates namespace from name. An empty namespace yields the bare
 * name (no leading dot).
 *
 * This is the single source of truth for the dot qualified name. (The
 * visual-editor's `::` node id is a SEPARATE convention, retired in a later
 * phase — do not couple to it here.)
 */
export function qualifiedExportPath(namespace: string, name: string): string {
  return namespace ? `${namespace}.${name}` : name;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/core test -- qualified-export-path`
Expected: PASS (3 tests).

- [ ] **Step 5: Export from the core barrel**

In `packages/core/src/index.ts`, add (next to other exports):
```ts
export { qualifiedExportPath } from './naming/qualified-export-path.js';
```

- [ ] **Step 6: Adopt at the scope-computation site (MIT)**

In `packages/core/src/services/rune-dsl-scope-computation.ts`, add the import near the top (after the existing imports):
```ts
import { qualifiedExportPath } from '../naming/qualified-export-path.js';
```
Replace the line `const qualifiedName = \`${ns}.${simpleName}\`;` with:
```ts
    const qualifiedName = qualifiedExportPath(ns, simpleName);
```

- [ ] **Step 7: Build core, then adopt at the server site (FSL)**

Run: `pnpm --filter @rune-langium/core build`
Then in `apps/studio/functions/api/parse.ts`, add to the existing `@rune-langium/core` import (it already imports `collectNamespaceDependencies, closeNamespaceDependencies`):
```ts
import { collectNamespaceDependencies, closeNamespaceDependencies, qualifiedExportPath } from '@rune-langium/core';
```
Replace the export-push line `exports.push({ type: e.$type, name: e.name, path: \`${namespace}.${e.name}\` });` with:
```ts
      exports.push({ type: e.$type, name: e.name, path: qualifiedExportPath(namespace, e.name) });
```

- [ ] **Step 8: Verify**

Run:
```
pnpm --filter @rune-langium/core run type-check
pnpm --filter @rune-langium/core test
pnpm run type-check
```
Expected: core type-check + tests pass; whole-repo type-check passes (the function now resolves `qualifiedExportPath` from the freshly built core dist).

- [ ] **Step 9: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add packages/core/src/naming/qualified-export-path.ts packages/core/test/naming/qualified-export-path.test.ts packages/core/src/index.ts packages/core/src/services/rune-dsl-scope-computation.ts apps/studio/functions/api/parse.ts packages/core/dist
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor(core): add qualifiedExportPath helper; adopt at scope + parse (V11)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
(If `packages/core/dist` is git-ignored, the `git add packages/core/dist` is a harmless no-op — check `git status` and include it only if dist is tracked.)

---

## Task 2: V10 — `namespaceFromSource` + `namespaceFromModelName` helpers + 7-site adoption

**Files:**
- Create: `packages/core/src/naming/namespace.ts`
- Create: `packages/core/test/naming/namespace.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/analysis/cross-namespace-refs.ts` (`getElementNamespace` ~49-60, `modelNamespace` ~112-118)
- Modify: `packages/core/src/serializer/rosetta-serializer.ts` (`getNamespace` ~45-53)
- Modify: `apps/studio/functions/lib/serialized-model-meta.ts` (`nameToNamespace` ~20-27)
- Modify: `apps/studio/src/services/model-loader.ts` (`extractNamespace` ~263-265)
- Modify: `apps/studio/src/workers/parser-worker.ts:325` (inline regex)

> The two source-text-regex sites (model-loader, parser-worker) share `namespaceFromSource`. The four AST/JSON `name`-shape sites (cross-namespace-refs ×2, rosetta-serializer, serialized-model-meta) share `namespaceFromModelName`. Each site keeps its own miss-fallback (`''` / `'unknown'` / `undefined`) by appending `?? <fallback>`. The `parse.ts:450-451` string-only cast and the `parse.ts:554` serialized-JSON-preamble regex are left as-is (distinct cheap paths) — do not touch them in this task.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/naming/namespace.test.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { namespaceFromSource, namespaceFromModelName } from '../../src/naming/namespace.js';

describe('namespaceFromSource', () => {
  it('extracts a dotted namespace from source text', () => {
    expect(namespaceFromSource('  namespace cdm.base.datetime\ntype Foo:')).toBe('cdm.base.datetime');
  });
  it('extracts from the first namespace line anywhere in the text', () => {
    expect(namespaceFromSource('// comment\nnamespace test\n')).toBe('test');
  });
  it('returns empty string when there is no namespace', () => {
    expect(namespaceFromSource('type Foo:')).toBe('');
  });
});

describe('namespaceFromModelName', () => {
  it('returns a plain string name unchanged', () => {
    expect(namespaceFromModelName('cdm.base')).toBe('cdm.base');
  });
  it('strips surrounding quotes from a STRING-named namespace', () => {
    expect(namespaceFromModelName('"my namespace"')).toBe('my namespace');
  });
  it('joins a {segments} shape with dots', () => {
    expect(namespaceFromModelName({ segments: ['cdm', 'base', 'datetime'] })).toBe('cdm.base.datetime');
  });
  it('returns undefined for null/unknown shapes', () => {
    expect(namespaceFromModelName(null)).toBeUndefined();
    expect(namespaceFromModelName(undefined)).toBeUndefined();
    expect(namespaceFromModelName(42)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/core test -- naming/namespace`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/naming/namespace.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/** Matches the `namespace <QualifiedName>` declaration in `.rosetta` source. */
const NAMESPACE_SOURCE_RE = /^\s*namespace\s+([\w.]+)/m;

/**
 * Extract the namespace from raw `.rosetta` source text. Returns `''` when no
 * `namespace` declaration is present (matching the historical callers).
 */
export function namespaceFromSource(text: string): string {
  return text.match(NAMESPACE_SOURCE_RE)?.[1] ?? '';
}

/**
 * Normalize a `RosettaModel.name` value (which may be a plain string, a quoted
 * STRING-named namespace, or a `{ segments: string[] }` qualified-name object)
 * to its dotted string form. Returns `undefined` for null/unknown shapes; the
 * caller supplies any `''`/`'unknown'` fallback it needs.
 */
export function namespaceFromModelName(name: unknown): string | undefined {
  if (typeof name === 'string') return name.replace(/^"|"$/g, '');
  if (name && typeof name === 'object' && 'segments' in name) {
    const segs = (name as { segments?: unknown }).segments;
    if (Array.isArray(segs)) return segs.join('.');
  }
  return undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/core test -- naming/namespace`
Expected: PASS.

- [ ] **Step 5: Export from the barrel**

In `packages/core/src/index.ts`:
```ts
export { namespaceFromSource, namespaceFromModelName } from './naming/namespace.js';
```

- [ ] **Step 6: Adopt at the four MIT `name`-shape sites**

In `packages/core/src/analysis/cross-namespace-refs.ts`, add `import { namespaceFromModelName } from '../naming/namespace.js';` and:
- In `getElementNamespace`, replace the `const name = model.name; if (typeof name === 'string') ... return String(name);` block (the three `if`s) with:
  ```ts
    return namespaceFromModelName((model as { name?: unknown }).name);
  ```
  (Keep the preceding `$type !== 'RosettaModel'` guard and the `container`/`undefined` early-returns; only the name-normalization tail changes. The function still returns `string | undefined`, which `namespaceFromModelName` provides.)
- In the local `modelNamespace(model)` helper, replace its body with:
  ```ts
    return namespaceFromModelName((model as unknown as { name?: unknown }).name);
  ```

In `packages/core/src/serializer/rosetta-serializer.ts`, add `import { namespaceFromModelName } from '../naming/namespace.js';` and replace the `getNamespace` body with:
```ts
function getNamespace(model: unknown): string {
  return namespaceFromModelName((model as { name?: unknown }).name) ?? 'unknown';
}
```

In `apps/studio/functions/lib/serialized-model-meta.ts`, add `import { namespaceFromModelName } from '@rune-langium/core';` and replace the local `nameToNamespace` function body with a single delegate (or replace its call sites with `namespaceFromModelName`):
```ts
function nameToNamespace(name: unknown): string | undefined {
  return namespaceFromModelName(name);
}
```

- [ ] **Step 7: Adopt at the two FSL source-regex sites**

In `apps/studio/src/services/model-loader.ts`, add `import { namespaceFromSource } from '@rune-langium/core';` and replace the `extractNamespace` body:
```ts
function extractNamespace(content: string): string {
  return namespaceFromSource(content);
}
```

In `apps/studio/src/workers/parser-worker.ts`, add `namespaceFromSource` to the existing `@rune-langium/core` import, and replace the inline `const ns = file.content.match(/^\s*namespace\s+([\w.]+)/m)?.[1] ?? '';` with:
```ts
        const ns = namespaceFromSource(file.content);
```

- [ ] **Step 8: Build core + verify**

Run:
```
pnpm --filter @rune-langium/core build
pnpm --filter @rune-langium/core test
pnpm --filter @rune-langium/core run type-check
pnpm run type-check
pnpm --filter @rune-langium/studio test
```
Expected: all pass. The studio test run confirms the worker/model-loader adoptions behave identically (namespace extraction is exercised by parse/workspace tests).

- [ ] **Step 9: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add packages/core/src/naming/namespace.ts packages/core/test/naming/namespace.test.ts packages/core/src/index.ts packages/core/src/analysis/cross-namespace-refs.ts packages/core/src/serializer/rosetta-serializer.ts apps/studio/functions/lib/serialized-model-meta.ts apps/studio/src/services/model-loader.ts apps/studio/src/workers/parser-worker.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor(core): namespace extraction helpers; adopt 6 sites (V10)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: V8 — `serializeRuneModel` + canonical BigInt policy + adoption

**Files:**
- Create: `packages/core/src/serializer/rune-serialize.ts`
- Create: `packages/core/test/serializer/rune-serialize.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/studio/functions/api/parse.ts` (serialize call ~444-449; `stringifyWithBigInt` ~576-578)
- Modify: `scripts/build-serialized-artifacts.mjs` (~152-158, ~163-165, ~216 + import)

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/serializer/rune-serialize.test.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { RUNE_SERIALIZE_OPTIONS, runeBigIntReplacer, serializeRuneModel } from '../../src/serializer/rune-serialize.js';

describe('runeBigIntReplacer', () => {
  it('converts bigint to Number (canonical policy)', () => {
    expect(runeBigIntReplacer('k', 5n)).toBe(5);
    expect(typeof runeBigIntReplacer('k', 5n)).toBe('number');
  });
  it('passes non-bigint values through unchanged', () => {
    expect(runeBigIntReplacer('k', 'x')).toBe('x');
    expect(runeBigIntReplacer('k', 42)).toBe(42);
  });
  it('makes JSON.stringify bigint-safe and agrees with the serializer policy', () => {
    expect(JSON.stringify({ n: 7n }, runeBigIntReplacer)).toBe('{"n":7}');
  });
});

describe('RUNE_SERIALIZE_OPTIONS', () => {
  it('requests refText + textRegions and carries a bigint replacer', () => {
    expect(RUNE_SERIALIZE_OPTIONS.refText).toBe(true);
    expect(RUNE_SERIALIZE_OPTIONS.textRegions).toBe(true);
    expect(typeof RUNE_SERIALIZE_OPTIONS.replacer).toBe('function');
  });
});

describe('serializeRuneModel', () => {
  it('delegates to the serializer with RUNE_SERIALIZE_OPTIONS', () => {
    const calls: unknown[] = [];
    const fakeSerializer = {
      serialize(model: unknown, opts: unknown) {
        calls.push({ model, opts });
        return '{"ok":true}';
      }
    };
    const out = serializeRuneModel(fakeSerializer as never, { $type: 'RosettaModel' } as never);
    expect(out).toBe('{"ok":true}');
    expect(calls).toHaveLength(1);
    expect((calls[0] as { opts: { refText: boolean } }).opts.refText).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/core test -- rune-serialize`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/serializer/rune-serialize.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import type { AstNode, JsonSerializer, JsonSerializeOptions } from 'langium';

/**
 * Canonical BigInt JSON replacer for Rune wire serialization: bigint → Number.
 *
 * Chosen so EVERY serialization path (the AST `JsonSerializer.serialize`, the
 * parse-function response envelope, and the artifact build script) agrees on a
 * single policy — closing the historical `Number`-vs-`String` divergence.
 *
 * NOTE: `Number(bigint)` is lossy above `Number.MAX_SAFE_INTEGER` (2^53). This
 * matches the pre-existing behavior of the AST serialize path; large numerics in
 * Rosetta are modeled as `BigDecimal`/string, not bigint. A lossless string
 * policy would change the wire shape and require deserialize-side handling.
 */
export function runeBigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? Number(value) : value;
}

/**
 * The Langium `JsonSerializer.serialize` option triple used for the canonical
 * Rune wire form: keep cross-reference `$refText`, keep text regions, and apply
 * the canonical bigint policy.
 */
export const RUNE_SERIALIZE_OPTIONS: JsonSerializeOptions = {
  refText: true,
  textRegions: true,
  replacer: (key, value, defaultReplacer) =>
    typeof value === 'bigint' ? Number(value) : defaultReplacer(key, value)
};

/**
 * Serialize a Rune AST model to its canonical wire JSON string. Single source of
 * truth for "how a Rune AST is serialized for the wire".
 */
export function serializeRuneModel(serializer: JsonSerializer, model: AstNode): string {
  return serializer.serialize(model, RUNE_SERIALIZE_OPTIONS);
}
```

> If `JsonSerializeOptions` is not the exact exported type name in the installed Langium, import the type the existing `parse.ts` serialize call already satisfies (inspect `RuneDsl.serializer.JsonSerializer.serialize`'s second param type) and use that; the runtime shape `{ refText, textRegions, replacer }` is what matters. If no public option type is exported, type `RUNE_SERIALIZE_OPTIONS` with an inline `{ refText: boolean; textRegions: boolean; replacer: (...) => unknown }` and cast at the call in `serializeRuneModel`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/core test -- rune-serialize`
Expected: PASS.

- [ ] **Step 5: Export from the barrel**

In `packages/core/src/index.ts`:
```ts
export { RUNE_SERIALIZE_OPTIONS, runeBigIntReplacer, serializeRuneModel } from './serializer/rune-serialize.js';
```

- [ ] **Step 6: Build core, then adopt in `parse.ts` (FSL)**

Run: `pnpm --filter @rune-langium/core build`

In `apps/studio/functions/api/parse.ts`, add `serializeRuneModel, runeBigIntReplacer` to the `@rune-langium/core` import.
- Replace the serialize call:
  ```ts
  const serializedModel = serializeRuneModel(RuneDsl.serializer.JsonSerializer, model);
  ```
- Replace the `stringifyWithBigInt` body so the envelope uses the SAME canonical policy (this is the V8 bug fix — String → Number):
  ```ts
  function stringifyWithBigInt(value: unknown): string {
    return JSON.stringify(value, runeBigIntReplacer);
  }
  ```
  Update the preceding comment block (currently noting "browser treats them as strings") to: `// Envelope uses the canonical bigint policy (runeBigIntReplacer → Number) so wire bytes agree across all serialize paths (V8).`

- [ ] **Step 7: Adopt in the artifact script (FSL, imports from dist)**

In `scripts/build-serialized-artifacts.mjs`, after the existing `const { createRuneDslServices } = await import('../packages/core/dist/index.js');`, also import the helpers from the same dist module:
```js
const { createRuneDslServices, serializeRuneModel, runeBigIntReplacer } = await import('../packages/core/dist/index.js');
```
- Replace the `serializer.serialize(doc.parseResult.value, { refText, textRegions, replacer })` call (the `modelJson:` value) with:
  ```js
  modelJson: serializeRuneModel(serializer, doc.parseResult.value),
  ```
- Replace the outer artifact `JSON.stringify(artifact, (_key, value) => typeof value === 'bigint' ? Number(value) : value)` with:
  ```js
  const json = JSON.stringify(artifact, runeBigIntReplacer);
  ```
- Replace the per-namespace `const bigintReplacer = (_key, value) => (typeof value === 'bigint' ? Number(value) : value);` and its use with `runeBigIntReplacer`:
  ```js
  JSON.stringify({ documents: nsDocList }, runeBigIntReplacer)
  ```
  (delete the now-unused local `bigintReplacer` declaration).

- [ ] **Step 8: Verify (incl. the artifact script actually runs)**

Run:
```
pnpm --filter @rune-langium/core run type-check
pnpm run type-check
node scripts/build-serialized-artifacts.mjs
```
Expected: type-checks pass; the artifact script completes without error and regenerates its output. (If the script requires args/env, run it the way `package.json`'s artifact script does — check `grep -n build-serialized-artifacts package.json` and use that invocation.) Confirm the regenerated artifact JSON still parses (the script itself round-trips it).

> If running the full artifact build is heavy or needs the `.resources` corpus that may be absent, instead assert the script's module loads and the helper import resolves: `node -e "import('../packages/core/dist/index.js').then(m => { if (typeof m.serializeRuneModel !== 'function') throw new Error('missing'); console.log('ok'); })"` from `scripts/`. Note in your report which path you used and why.

- [ ] **Step 9: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add packages/core/src/serializer/rune-serialize.ts packages/core/test/serializer/rune-serialize.test.ts packages/core/src/index.ts apps/studio/functions/api/parse.ts scripts/build-serialized-artifacts.mjs
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "fix(core): canonical bigint serialize policy; close Number-vs-String divergence (V8)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: V7 — `preserveCstText` core helper + delete both copies

**Files:**
- Create: `packages/core/src/serializer/preserve-cst-text.ts`
- Create: `packages/core/test/serializer/preserve-cst-text.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/studio/src/workers/parser-worker.ts` (delete local `preserveCstText` ~208-236; import + call the core one)
- Modify: `apps/studio/functions/api/parse.ts` (delete local `preserveCstText` ~500-525; import + call the core one)

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/serializer/preserve-cst-text.test.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { preserveCstText } from '../../src/serializer/preserve-cst-text.js';

describe('preserveCstText', () => {
  it('copies $cstNode.text to $cstText for Function condition parts and their expressions', () => {
    const model = {
      elements: [
        {
          $type: 'RosettaFunction',
          conditions: [
            { $cstNode: { text: 'cond src' }, expression: { $cstNode: { text: 'expr src' } } }
          ],
          shortcuts: [{ $cstNode: { text: 'sc' } }],
          operations: [],
          postConditions: []
        }
      ]
    };
    preserveCstText(model);
    expect(model.elements[0].conditions[0].$cstText).toBe('cond src');
    expect(model.elements[0].conditions[0].expression.$cstText).toBe('expr src');
    expect(model.elements[0].shortcuts[0].$cstText).toBe('sc');
  });

  it('copies $cstText for Data/Choice condition arrays', () => {
    const model = {
      elements: [
        { $type: 'Data', conditions: [{ $cstNode: { text: 'd cond' }, expression: { $cstNode: { text: 'd expr' } } }] }
      ]
    };
    preserveCstText(model);
    expect(model.elements[0].conditions[0].$cstText).toBe('d cond');
    expect(model.elements[0].conditions[0].expression.$cstText).toBe('d expr');
  });

  it('is a no-op for elements/parts without $cstNode and tolerates missing arrays', () => {
    const model = { elements: [{ $type: 'RosettaFunction' }, { $type: 'Data', conditions: [{}] }] };
    expect(() => preserveCstText(model)).not.toThrow();
    expect((model.elements[1] as { conditions: Array<{ $cstText?: string }> }).conditions[0].$cstText).toBeUndefined();
  });

  it('tolerates a null/undefined model', () => {
    expect(() => preserveCstText(undefined)).not.toThrow();
    expect(() => preserveCstText(null)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/core test -- preserve-cst-text`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** (verbatim port of the existing identical bodies)

```ts
// packages/core/src/serializer/preserve-cst-text.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Copy `$cstNode.text → $cstText` for condition/expression-bearing AST parts
 * BEFORE `JsonSerializer.serialize`, because `$cstNode` is non-serializable
 * (circular) and the serializer drops it — yet the visual-editor's expression
 * cells need the original source text after the JSON round-trip.
 *
 * Walks Function shortcuts/conditions/operations/postConditions and Data/Choice
 * conditions, copying both the part's and its `expression`'s CST text. This is
 * the single source of truth shared by the browser parse worker and the server
 * parse function (previously duplicated, byte-identical, in both — V7).
 */
export function preserveCstText(model: any): void {
  for (const elem of model?.elements ?? []) {
    if (elem.$type === 'RosettaFunction') {
      for (const arr of [elem.shortcuts, elem.conditions, elem.operations, elem.postConditions]) {
        for (const part of arr ?? []) {
          if (part?.$cstNode?.text) {
            part.$cstText = part.$cstNode.text;
          }
          if (part?.expression?.$cstNode?.text) {
            part.expression.$cstText = part.expression.$cstNode.text;
          }
        }
      }
    }
    if (elem.conditions) {
      for (const cond of elem.conditions) {
        if (cond?.$cstNode?.text) {
          cond.$cstText = cond.$cstNode.text;
        }
        if (cond?.expression?.$cstNode?.text) {
          cond.expression.$cstText = cond.expression.$cstNode.text;
        }
      }
    }
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/core test -- preserve-cst-text`
Expected: PASS (4 tests).

- [ ] **Step 5: Export from the barrel**

In `packages/core/src/index.ts`:
```ts
export { preserveCstText } from './serializer/preserve-cst-text.js';
```

- [ ] **Step 6: Build core, then delete both local copies and import the core one**

Run: `pnpm --filter @rune-langium/core build`

In `apps/studio/src/workers/parser-worker.ts`: delete the entire local `preserveCstText` function (the `/* eslint-disable ... */` … function … `/* eslint-enable ... */` block, ~208-236), add `preserveCstText` to the existing `@rune-langium/core` import. The two call sites (`if (model) preserveCstText(model);` and `preserveCstText(model);`) are unchanged.

In `apps/studio/functions/api/parse.ts`: delete the entire local `preserveCstText` function (~500-525) and its preceding "Mirrors … keep in sync" docstring, add `preserveCstText` to the `@rune-langium/core` import. The call site (`preserveCstText(model);`) is unchanged.

- [ ] **Step 7: Verify**

Run:
```
pnpm --filter @rune-langium/core test
pnpm --filter @rune-langium/core run type-check
pnpm run type-check
pnpm --filter @rune-langium/studio test
pnpm run lint
```
Expected: all pass. The studio suite exercises parse → serialize → deserialize round-trips that depend on `$cstText` survival, so a regression here would surface (e.g. expression-cell / structure tests).

- [ ] **Step 8: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add packages/core/src/serializer/preserve-cst-text.ts packages/core/test/serializer/preserve-cst-text.test.ts packages/core/src/index.ts apps/studio/src/workers/parser-worker.ts apps/studio/functions/api/parse.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor(core): move preserveCstText to core; delete both copies (V7)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: V9 — `deserializeRuneModel` + `hydrateModelDocument` + 4-site adoption

**Files:**
- Create: `packages/core/src/serializer/hydrate-model-document.ts`
- Create: `packages/core/test/serializer/hydrate-model-document.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/studio/src/workers/parser-worker.ts` (deferred-provider deserialize ~133-143; handleLinkDocument ~410-416)
- Modify: `apps/studio/src/workers/codegen-worker.ts` (~235-249)
- Modify: `apps/studio/functions/api/parse.ts` (populateDependencyGraph ~656-659)
- Modify: `apps/studio/functions/api/codegen.ts` (~218-231)

> **Shape of the helper.** The common core across all five sites is `deserialize(json) → factory.fromModel(model, uri)`. The variations are: (a) the parser-worker deferred-provider does deserialize ONLY (the linker owns the document) — it uses `deserializeRuneModel`; (b) some sites register with an idempotency guard (`getDocument` then `addDocument`), some register unconditionally, and one (`populateDependencyGraph`) does NOT register (a later `builder.build` does). The helper therefore exposes `register: 'idempotent' | 'always' | 'none'`. Worker-local concerns (the `newModelsAccumulator.push(model)`, the `deferredModelJson.delete(...)`) STAY at the call site.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/serializer/hydrate-model-document.test.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { URI } from 'langium';
import { deserializeRuneModel, hydrateModelDocument } from '../../src/serializer/hydrate-model-document.js';

function makeFakeServices() {
  const added: unknown[] = [];
  const existingByUri = new Map<string, unknown>();
  const fakeDoc = { uri: 'x' };
  const services = {
    RuneDsl: {
      serializer: { JsonSerializer: { deserialize: (json: string) => ({ $type: 'RosettaModel', parsed: json }) } }
    },
    shared: {
      workspace: {
        LangiumDocumentFactory: { fromModel: (_model: unknown, _uri: unknown) => fakeDoc },
        LangiumDocuments: {
          getDocument: (uri: { toString(): string }) => existingByUri.get(uri.toString()),
          addDocument: (doc: unknown) => added.push(doc)
        }
      }
    }
  };
  return { services, added, existingByUri, fakeDoc };
}

describe('deserializeRuneModel', () => {
  it('deserializes via the RuneDsl JsonSerializer', () => {
    const { services } = makeFakeServices();
    const model = deserializeRuneModel(services as never, '{"a":1}');
    expect((model as { parsed: string }).parsed).toBe('{"a":1}');
  });
});

describe('hydrateModelDocument', () => {
  it("register:'none' returns model+document without adding", () => {
    const { services, added } = makeFakeServices();
    const { model, document } = hydrateModelDocument(services as never, URI.parse('mem:///a'), '{}', { register: 'none' });
    expect(model).toBeDefined();
    expect(document).toBeDefined();
    expect(added).toHaveLength(0);
  });

  it("register:'always' adds the document unconditionally", () => {
    const { services, added } = makeFakeServices();
    hydrateModelDocument(services as never, URI.parse('mem:///a'), '{}', { register: 'always' });
    expect(added).toHaveLength(1);
  });

  it("register:'idempotent' returns the existing document and does not re-add", () => {
    const { services, added, existingByUri, fakeDoc } = makeFakeServices();
    const uri = URI.parse('mem:///a');
    existingByUri.set(uri.toString(), { uri: 'existing' });
    const { document } = hydrateModelDocument(services as never, uri, '{}', { register: 'idempotent' });
    expect(document).toEqual({ uri: 'existing' });
    expect(added).toHaveLength(0);
    void fakeDoc;
  });

  it("register:'idempotent' adds when no existing document", () => {
    const { services, added } = makeFakeServices();
    hydrateModelDocument(services as never, URI.parse('mem:///b'), '{}', { register: 'idempotent' });
    expect(added).toHaveLength(1);
  });

  it('accepts a string uri and parses it', () => {
    const { services } = makeFakeServices();
    const { document } = hydrateModelDocument(services as never, 'mem:///c', '{}', { register: 'none' });
    expect(document).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/core test -- hydrate-model-document`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/serializer/hydrate-model-document.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { URI, type AstNode, type LangiumDocument } from 'langium';
import type { RosettaModel } from '../generated/ast.js';

/**
 * The minimal services shape these helpers need: the Rune JsonSerializer plus
 * the shared document factory + document store. `createRuneDslServices`'
 * return value (`{ RuneDsl, shared }`) satisfies this structurally.
 */
export interface HydrateServices {
  RuneDsl: { serializer: { JsonSerializer: { deserialize<T extends AstNode>(content: string): T } } };
  shared: {
    workspace: {
      LangiumDocumentFactory: { fromModel(model: AstNode, uri: URI): LangiumDocument };
      LangiumDocuments: {
        getDocument(uri: URI): LangiumDocument | undefined;
        addDocument(document: LangiumDocument): void;
      };
    };
  };
}

/** Deserialize a serialized Rune AST JSON string back to a `RosettaModel`. */
export function deserializeRuneModel(services: HydrateServices, json: string): RosettaModel {
  return services.RuneDsl.serializer.JsonSerializer.deserialize<RosettaModel>(json);
}

export interface HydrateOptions {
  /**
   * - `'none'`: build the document but do NOT register it (a later
   *   `DocumentBuilder.build` will). Returns the freshly built document.
   * - `'always'`: register unconditionally.
   * - `'idempotent'`: if a document already exists for `uri`, return it and do
   *   not re-add; otherwise register the new one.
   */
  register: 'none' | 'always' | 'idempotent';
}

/**
 * Deserialize a serialized Rune AST and build a `LangiumDocument` for it,
 * optionally registering it into the shared `LangiumDocuments` store. Single
 * source of truth for the "deserialize → fromModel → (maybe) addDocument"
 * sequence previously re-implemented at five sites (V9).
 *
 * Worker-local concerns (model accumulators, deferred-json eviction) stay at the
 * call site — this helper owns only the shared deserialize+factory+register shape.
 */
export function hydrateModelDocument(
  services: HydrateServices,
  uri: URI | string,
  json: string,
  options: HydrateOptions
): { model: RosettaModel; document: LangiumDocument } {
  const resolvedUri = typeof uri === 'string' ? URI.parse(uri) : uri;
  const model = deserializeRuneModel(services, json);
  const factory = services.shared.workspace.LangiumDocumentFactory;
  const documents = services.shared.workspace.LangiumDocuments;

  if (options.register === 'idempotent') {
    const existing = documents.getDocument(resolvedUri);
    if (existing) {
      return { model, document: existing };
    }
  }

  const document = factory.fromModel(model, resolvedUri);
  if (options.register === 'always' || options.register === 'idempotent') {
    documents.addDocument(document);
  }
  return { model, document };
}
```

> Confirm the `RosettaModel` import path: the explorer found core tests importing generated AST from `../../src/generated/ast.js`. If the barrel already re-exports `RosettaModel` as a type, importing from `../generated/ast.js` inside core is still correct (avoid importing the package barrel from within core). If `LangiumDocumentFactory.fromModel`'s signature differs in the installed Langium, match the real signature (the existing call sites already use `factory.fromModel(model, uri)`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/core test -- hydrate-model-document`
Expected: PASS.

- [ ] **Step 5: Export from the barrel**

In `packages/core/src/index.ts`:
```ts
export { deserializeRuneModel, hydrateModelDocument } from './serializer/hydrate-model-document.js';
export type { HydrateServices, HydrateOptions } from './serializer/hydrate-model-document.js';
```

- [ ] **Step 6: Build core, then adopt the four register-bearing sites**

Run: `pnpm --filter @rune-langium/core build`

**6a. `apps/studio/src/workers/codegen-worker.ts` (~235-249).** This worker already has `createRuneDslServices` services in scope. Add `hydrateModelDocument` to the `@rune-langium/core` import. Replace the `deserialize → fromModel → getDocument → push existing-or-new → addDocument-if-new` block with:
```ts
        const { document } = hydrateModelDocument(services, URI.parse(entry.uri), entry.serializedModelJson!, {
          register: 'idempotent'
        });
        curatedDocuments.push(document);
```
where `services` is this worker's `{ RuneDsl, shared }` object (confirm the local variable name holding the `createRuneDslServices` result; it may be destructured — if so, reconstruct `{ RuneDsl, shared }` or pass the original object). Keep the surrounding loop + `curatedDocuments` array.

**6b. `apps/studio/functions/api/codegen.ts` (~218-231).** Add `hydrateModelDocument` to the core import. Replace the `deserialize → fromModel → getDocument → push → addDocument-if-new` block with:
```ts
      const { document } = hydrateModelDocument(context, URI.parse(`curated:///${cd.uri}`), cd.serializedModel, {
        register: 'idempotent'
      });
      docs.push(document);
```
(Use whatever local holds `{ RuneDsl, shared }` — the explorer shows a `context`/services object reaching `serializer` and `langiumDocuments`; confirm it exposes `shared.workspace`. If the function only has `RuneDsl` + a separate `langiumDocuments`/`factory`, construct the `HydrateServices` shape inline: `{ RuneDsl, shared: { workspace: { LangiumDocumentFactory: factory, LangiumDocuments: langiumDocuments } } }`.)

**6c. `apps/studio/functions/api/parse.ts` populateDependencyGraph (~656-659).** Add `hydrateModelDocument` to the core import. Replace:
```ts
      const { document } = hydrateModelDocument(context, URI.parse(entry.uri), entry.serializedModel, { register: 'none' });
      curatedDocs.push(document);
```
(Again map `context` to the `HydrateServices` shape; `register: 'none'` because the later `builder.build([...userDocs, ...curatedDocs])` registers them. Preserve the existing fail-soft try/catch around it.)

**6d. `apps/studio/src/workers/parser-worker.ts` handleLinkDocument (~410-416).** Add `hydrateModelDocument` to the core import. Replace the `deserialize → push accumulator → fromModel → addDocument → delete` block with:
```ts
      const { model, document } = hydrateModelDocument(services, targetUri, deferredModelJson.get(targetUri.toString())!, {
        register: 'always'
      });
      newModelsAccumulator.push(model);
      doc = document;
      deferredModelJson.delete(targetUri.toString());
```
Keep the `if (deferredModelJson.has(targetUri.toString())) { ... }` guard around it. `services` is the worker's services object.

- [ ] **Step 7: Adopt the deserialize-only deferred-provider site (parser-worker ~133-143)**

Replace `const model = serializer.deserialize<RosettaModel>(json);` inside the `deferredProvider.getModel` closure with:
```ts
      const model = deserializeRuneModel(services, json);
```
Add `deserializeRuneModel` to the core import. Keep `newModelsAccumulator.push(model); return model;` and the `consume` method unchanged. (If `services` is constructed AFTER this closure, keep using the local `serializer` variable instead and skip this sub-step — report that you did. The deferred provider is closure-local; using `deserializeRuneModel` here is a nicety, not a dedup requirement. Only adopt it if `services`/the serializer is cleanly in scope.)

- [ ] **Step 8: Build core + full verify**

Run:
```
pnpm --filter @rune-langium/core build
pnpm --filter @rune-langium/core test
pnpm --filter @rune-langium/core run type-check
pnpm run type-check
pnpm --filter @rune-langium/studio test
pnpm run lint
```
Expected: all pass. The studio suite exercises curated/codegen hydration paths (the `register:'idempotent'` sites) and worker link/hydrate (the `register:'always'` site).

- [ ] **Step 9: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add packages/core/src/serializer/hydrate-model-document.ts packages/core/test/serializer/hydrate-model-document.test.ts packages/core/src/index.ts apps/studio/src/workers/parser-worker.ts apps/studio/src/workers/codegen-worker.ts apps/studio/functions/api/parse.ts apps/studio/functions/api/codegen.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor(core): hydrateModelDocument/deserializeRuneModel; adopt 5 sites (V9)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Whole-repo verification sweep + dead-code check

**Files:** none new — verification only (plus deleting any now-orphaned imports/types surfaced below).

- [ ] **Step 1: Rebuild core from clean**

Run: `pnpm --filter @rune-langium/core build`
Expected: clean build (all five helper modules compiled into `dist`).

- [ ] **Step 2: Grep for orphaned duplicate logic** (confirm the dedup actually removed the copies)

Run:
```
grep -rn "preserveCstText" apps/ packages/ | grep -v "preserve-cst-text"
grep -rn "namespace\\\\s+(" apps/ packages/
grep -rn "typeof value === 'bigint'" apps/ scripts/ packages/
grep -rn "\\.segments.join" apps/ packages/
```
Expected: (a) `preserveCstText` appears only as call sites + the core module + the core barrel (no second function body); (b) the `namespace\s+(...)` regex literal appears ONLY in `packages/core/src/naming/namespace.ts`; (c) the only remaining `typeof value === 'bigint'` literals are inside `packages/core/src/serializer/rune-serialize.ts` (the canonical policy); (d) `.segments.join` appears only inside `packages/core/src/naming/namespace.ts`. If any duplicate body remains, you missed a site — fix it before continuing. (The `parse.ts:450-451` string-only cast and the `parse.ts:554` serialized-JSON-preamble regex are intentionally NOT touched — they are distinct cheap paths, not the V10 normalizer; they may still appear and that's expected.)

- [ ] **Step 3: Full repo gates**

Run:
```
pnpm run type-check
pnpm run lint
pnpm test
```
Expected: all green. If `pnpm test` is heavy, at minimum run `pnpm --filter @rune-langium/core test && pnpm --filter @rune-langium/studio test && pnpm --filter @rune-langium/visual-editor test`. Report the exact counts.

- [ ] **Step 4: Confirm the V8 fix is observable** (the one behavior change in this plan)

Add a focused assertion that the envelope and serialize paths now agree. In `packages/core/test/serializer/rune-serialize.test.ts`, append:
```ts
describe('V8 — single canonical policy', () => {
  it('runeBigIntReplacer and RUNE_SERIALIZE_OPTIONS.replacer agree (both Number)', () => {
    const viaStandalone = JSON.parse(JSON.stringify({ n: 9007199254740993n }, runeBigIntReplacer));
    const viaOptions = RUNE_SERIALIZE_OPTIONS.replacer!('n', 9007199254740993n, (_k, v) => v);
    expect(typeof viaStandalone.n).toBe('number');
    expect(typeof viaOptions).toBe('number'); // both Number — no String outlier
  });
});
```
Run: `pnpm --filter @rune-langium/core test -- rune-serialize`
Expected: PASS — documents that the historical `String` outlier is gone.

- [ ] **Step 5: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add packages/core/test/serializer/rune-serialize.test.ts packages/core/dist
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "test(core): assert single canonical bigint policy; phase-1 verification (V7-V11)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
(Include `packages/core/dist` only if dist is tracked in git — check `git status`.)

---

## Self-review checklist (performed during plan authoring)

**Spec coverage (§9.6 #1 + #3, scoped to V7/V8/V9/V10/V11):**
- V7 `preserveCstText` → core + both copies deleted → Task 4. ✓
- V8 `serializeRuneModel` + `RUNE_SERIALIZE_OPTIONS` + ONE bigint policy (fixes the `Number`-vs-`String` divergence) → Task 3. ✓
- V9 `hydrateModelDocument` + `deserializeRuneModel`, 5 sites (4 register-bearing + 1 deserialize-only) → Task 5. ✓
- V10 `namespaceFromSource` + `namespaceFromModelName`, 6 adopted sites (the 2 distinct cheap paths intentionally left) → Task 2. ✓
- V11 `qualifiedExportPath`, server/scope adoption only (editor `::` untouched) → Task 1. ✓

**Spec-drift corrections folded in:** V11 adoption is only 2 sites (scope-computation + parse.ts); `build-serialized-artifacts.mjs`/`curated-fetch.ts` build `/elements@N` pointer paths, NOT qualified names, so they are NOT V11 sites. The V8 divergence is specifically `stringifyWithBigInt` (String) vs all others (Number). V9 `populateDependencyGraph` uses `register:'none'` (builder.build registers later), not `addDocument`. ✓

**Build-ordering constraint** (consumers resolve core from `dist`): every task builds core after adding helpers and before consumer verification; the `.mjs` script imports the helpers from `dist`. ✓

**Licensing:** all five helpers in `packages/core` (MIT); FSL files only consume them; no shared code added under `apps/studio`. ✓

**Type consistency:** helper names are stable across tasks (`qualifiedExportPath`, `namespaceFromSource`/`namespaceFromModelName`, `RUNE_SERIALIZE_OPTIONS`/`runeBigIntReplacer`/`serializeRuneModel`, `preserveCstText`, `deserializeRuneModel`/`hydrateModelDocument`); the barrel re-exports each. `HydrateServices` is structurally satisfied by `createRuneDslServices`' `{ RuneDsl, shared }` return. ✓

**Placeholder scan:** every step has concrete code/commands. The two genuinely environment-dependent integration points (the exact local `services`/`factory` variable wiring at the parse/codegen function sites, and whether the artifact script can run fully vs. a load-check) are flagged with explicit fallbacks + "report which path you used," not left vague. ✓

**Known deferrals (Phase 3, not this plan):** the editor node-id `::`→`.` switch + ~34 fixtures; V14 wire-contract types module; V12 worker reset/register dedup; V13 severity mapping; V15 WorkspaceFile/CachedFile sub-shape. The lossless-String bigint policy (vs the chosen Number) is flagged at the plan-review checkpoint.
