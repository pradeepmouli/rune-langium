# Additional Codegen Targets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Status (2026-05-14)

| Phase | Status | PR(s) on master | Notes |
|-------|--------|-----------------|-------|
| **Phase 0** — contract + UI shell + `/api/codegen` | ✅ **Merged** | [#165](https://github.com/pradeepmouli/rune-langium/pull/165) (`d226996c`) | All 14 tasks done. Studio table replaces TargetSwitcher; per-target downloads stream from the Pages Function. |
| **Phase 0.5** — whole-model variants for namespace targets | ✅ **Merged** | [#166](https://github.com/pradeepmouli/rune-langium/pull/166) (`581ced9d`) | `LanguageProfile` + `GenericModelEmitter` + per-target `layout` options. Zod, TypeScript, JSON Schema all support `per-namespace` (library default), `barrel`, and (text targets) `single-file`. Pages Function injects opinionated default per target. Spec: [`docs/superpowers/specs/2026-05-14-codegen-whole-model-variants-design.md`](../specs/2026-05-14-codegen-whole-model-variants-design.md). |
| **Phase 1** — Excel emitter | ✅ **Merged** | [#167](https://github.com/pradeepmouli/rune-langium/pull/167) (`7fb790c8`) | `ExcelWholeModelEmitter` produces one `model.xlsx` with Types / Enums / TypeAliases / Conditions sheets. Deterministic timestamps; topo-sorted Types sheet; primitive-alias `$refText` fallback. |
| **Task #88** — curated workspaces through `/api/codegen` | ✅ **Merged** | [#168](https://github.com/pradeepmouli/rune-langium/pull/168) (`b9414f3e`) | Pages Function accepts `curatedBundles: [{ id, version }]`. Fetches each via `CURATED_MIRROR` service binding, deserializes the pre-parsed AST, passes to `generate()` alongside user files. Validator covers the new field shape. |
| **Phase 2** — SQL + Markdown emitters | ⏳ Pending | — | Both are per-namespace + `LanguageProfile` targets. Should plug into the Phase 0.5 dispatch architecture with no contract changes — Phase 2 work is the emitters themselves + their Profiles. |
| **Phase 3** — GraphQL SDL emitter | ⏳ Pending | — | Whole-model target, like Excel. Hand-rolled `WholeModelEmitter` + a `LanguageProfile` for sidecar metadata if needed. |

**Cumulative diff merged into master:** 4 squash-merged PRs over the course of this work. Codegen package at **~495 tests** (was ~440); studio at **~605 tests** (was ~570). Type-checks clean across all workspace packages.

**Architectural decisions locked in:**
- Library defaults stay `'per-namespace'` for every target with both contracts (spec 019 §10.1). Opinionated defaults live on the Pages Function only.
- `IMPLEMENTED_TARGETS` is the single source of truth used by both the studio's table filter and the Pages Function's target gate. Phase 2/3 emitters self-register by adding to `EMITTER_CLASSES` / `WHOLE_MODEL_EMITTERS` / `PROFILES`.
- Whole-model emitters can be either hand-rolled (Excel, GraphQL) or synthesized from a `NamespaceEmitter` + `LanguageProfile` via `GenericModelEmitter` (Zod, TypeScript, JSON Schema, future SQL/Markdown).
- Curated bundles ride through the Pages Function's `CURATED_MIRROR` binding (same pattern as `/api/parse`); raw .rune source is never required server-side because curated bundles ship as pre-parsed Langium ASTs.

---

**Goal:** Extend `@rune-langium/codegen` with Excel/SQL/Markdown/GraphQL emitters and surface them in the studio via a targets-table UX backed by a server-side Cloudflare Pages Function.

**Architecture:** A parallel `WholeModelEmitter` contract joins the existing `NamespaceEmitter`; `runGenerate()` dispatches on the contract. `GeneratorOutput` grows an optional `binary` field for `.xlsx` payloads. The studio's `CodePreviewPanel` is replaced with a targets table that runs **Preview** in the browser (existing codegen worker, per-namespace targets only) and **Download** server-side via `POST /api/codegen` (Cloudflare Pages Function under `apps/studio/functions/`).

**Tech Stack:** TypeScript 5.9 strict ESM · pnpm workspace · vitest · Langium 4.2 · React 19 · zustand 5 · ExcelJS 4.4 · JSZip 3.10 · `node-sql-parser` · `graphql` ^16 · Cloudflare Pages Functions with `nodejs_compat`.

**Spec:** [`docs/superpowers/specs/2026-05-12-codegen-additional-targets-design.md`](../specs/2026-05-12-codegen-additional-targets-design.md)

**Execution-order note:** Spec 019 (`studio-workers-pages-functions`) shares the same Pages Functions infrastructure (`apps/studio/functions/`, `apps/studio/wrangler.toml`, `wrangler` devDep, `dev:pages` script). If 019 has shipped first (recommended ordering — "optimize before adding features"), **treat Task 0.10 and Task 0.13 below as verify-only**: confirm the files exist with the expected content and skip the creation steps. The rest of the plan (Tasks 0.1–0.9, 0.11, 0.12, and Phases 1–3) is independent of 019.

---

## File Structure

### New files

| Path | Responsibility |
|------|---------------|
| `packages/codegen/src/emit/excel-emitter.ts` | `ExcelWholeModelEmitter` — single-workbook builder using ExcelJS |
| `packages/codegen/src/emit/sql-emitter.ts` | `SqlNamespaceEmitter` — DDL per namespace |
| `packages/codegen/src/emit/sql-dialect.ts` | `SqlDialect` interface + `PostgresDialect`, `SqlServerDialect` strategies |
| `packages/codegen/src/emit/markdown-emitter.ts` | `MarkdownNamespaceEmitter` — GitHub-flavored Markdown per namespace |
| `packages/codegen/src/emit/graphql-emitter.ts` | `GraphqlWholeModelEmitter` — single SDL file |
| `packages/codegen/test/emit/excel-emitter.test.ts` | Excel fixture tests with ExcelJS read-back |
| `packages/codegen/test/emit/sql-emitter.test.ts` | SQL fixture tests with `node-sql-parser` validation |
| `packages/codegen/test/emit/markdown-emitter.test.ts` | Markdown fixture tests |
| `packages/codegen/test/emit/graphql-emitter.test.ts` | GraphQL fixture tests with `buildSchema()` validation |
| `apps/studio/src/components/CodegenTargetsTable.tsx` | Targets table component |
| `apps/studio/functions/api/codegen.ts` | Cloudflare Pages Function for server-side downloads |
| `apps/studio/wrangler.toml` | Pages project config (Functions dir, `nodejs_compat`) |
| `apps/studio/functions/test/codegen.test.ts` | Pages Function integration tests |
| `apps/studio/test/components/CodegenTargetsTable.test.tsx` | Component tests |
| `apps/studio/test/e2e/codegen-targets.spec.ts` | Playwright e2e |

### Modified files

| Path | Change |
|------|--------|
| `packages/codegen/src/types.ts` | Extend `Target` union (sql, markdown, excel, graphql); add `binary` / `mimeType` to `GeneratorOutput`; add `TargetDescriptor` type + `TARGET_DESCRIPTORS` constant |
| `packages/codegen/src/emit/namespace-emitter.ts` | Add `WholeModelEmitter` interface, `WholeModelEmitterConstructor`, `isWholeModelEmitter()` |
| `packages/codegen/src/generator.ts` | Dispatch on contract; extend `EMITTER_CLASSES` per phase |
| `packages/codegen/src/emit/namespace-walker.ts` | `getTargetRelativePath`: add `sql`, `markdown` branches |
| `packages/codegen/src/index.ts` | Re-export `TARGET_DESCRIPTORS`, `WholeModelEmitter`, `isWholeModelEmitter` |
| `packages/codegen/package.json` | Add `exceljs`, `jszip`, `graphql`, `node-sql-parser` as appropriate per phase |
| `apps/studio/src/components/CodePreviewPanel.tsx` | Render `CodegenTargetsTable` when `activeTarget == null`; render code viewer + back link + dropdown when set |
| `apps/studio/src/components/codegen-ui.ts` | Drop local `TARGET_OPTIONS`; re-export `TARGET_DESCRIPTORS` from codegen |
| `apps/studio/src/store/codegen-store.ts` | Add `activeTarget: Target \| null` + setter |
| `apps/studio/src/services/codegen-service.ts` | Add `downloadTarget(target)` POSTing to `/api/codegen` |

### Deleted files

| Path | Reason |
|------|--------|
| `apps/studio/src/components/TargetSwitcher.tsx` | Replaced by `CodegenTargetsTable` + in-preview dropdown |

---

# Phase 0 — Contract, UI Shell, and Pages Function ✅ MERGED in PR #165

> All 14 tasks below shipped in `d226996c`. The remaining content of this section is preserved as historical reference; it describes the state *as-of* the spec at design time. For the current state, see the registries (`NAMESPACE_EMITTERS`, `WHOLE_MODEL_EMITTERS`, `PROFILES`) in `packages/codegen/src/generator.ts` and the studio's `apps/studio/src/components/CodegenTargetsTable.tsx`.

**Outcome:** All existing tests pass. `TARGET_DESCRIPTORS` is exported. Studio's Code panel shows the new table (filtered to registered emitters: zod, typescript, json-schema). Preview round-trips work for those three. Download works server-side via `/api/codegen` for those three (returning a zip of per-namespace files).

## Task 0.1: Extend `Target` union and add `GeneratorOutput.binary`

**Files:**
- Modify: `packages/codegen/src/types.ts`
- Test: `packages/codegen/test/types.test.ts` (NEW)

- [ ] **Step 1: Write the failing test**

Create `packages/codegen/test/types.test.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expectTypeOf } from 'vitest';
import type { Target, GeneratorOutput } from '../src/types.js';

describe('Target union', () => {
  it('includes all seven target identifiers', () => {
    expectTypeOf<Target>().toEqualTypeOf<
      'zod' | 'json-schema' | 'typescript' | 'sql' | 'markdown' | 'excel' | 'graphql'
    >();
  });
});

describe('GeneratorOutput', () => {
  it('has optional binary and mimeType fields', () => {
    const o: GeneratorOutput = {
      relativePath: 'x',
      content: '',
      sourceMap: [],
      diagnostics: [],
      funcs: [],
      binary: new Uint8Array([1, 2, 3]),
      mimeType: 'application/octet-stream'
    };
    expectTypeOf(o.binary).toEqualTypeOf<Uint8Array | undefined>();
    expectTypeOf(o.mimeType).toEqualTypeOf<string | undefined>();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/codegen test -- types.test.ts
```

Expected: FAIL with type errors — `Target` doesn't include the new values, `binary` / `mimeType` don't exist on `GeneratorOutput`.

- [ ] **Step 3: Extend the types**

Modify `packages/codegen/src/types.ts`:

```ts
// Replace the existing Target type:
export type Target = 'zod' | 'json-schema' | 'typescript' | 'sql' | 'markdown' | 'excel' | 'graphql';
```

```ts
// In the GeneratorOutput interface, add these two fields after `funcs`:
export interface GeneratorOutput {
  relativePath: string;
  content: string;
  sourceMap: SourceMapEntry[];
  diagnostics: GeneratorDiagnostic[];
  funcs: GeneratedFunc[];
  /**
   * Optional binary payload. When present, `content` may be empty and
   * consumers should prefer `binary` (e.g., `.xlsx` outputs).
   */
  binary?: Uint8Array;
  /**
   * Optional MIME type hint for the output. Used by download UIs and
   * file writers to set Content-Type correctly.
   */
  mimeType?: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/codegen test -- types.test.ts
```

Expected: PASS.

- [ ] **Step 5: Loosen EMITTER_CLASSES typing temporarily**

In `packages/codegen/src/generator.ts:20`, change:

```ts
} satisfies Record<Target, NamespaceEmitterConstructor>;
```

to:

```ts
} satisfies Partial<Record<Target, NamespaceEmitterConstructor>>;
```

This is temporary; Task 0.4 makes the typing strict again once dispatch handles both contracts.

- [ ] **Step 6: Run type-check**

```bash
pnpm --filter @rune-langium/codegen run type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/codegen/src/types.ts packages/codegen/src/generator.ts packages/codegen/test/types.test.ts
git commit -m "feat(codegen): extend Target union and add GeneratorOutput.binary/mimeType (018 Phase 0)"
```

## Task 0.2: Define `WholeModelEmitter` contract

**Files:**
- Modify: `packages/codegen/src/emit/namespace-emitter.ts`
- Test: `packages/codegen/test/emit/whole-model-emitter.test.ts` (NEW)

- [ ] **Step 1: Write the failing test**

Create `packages/codegen/test/emit/whole-model-emitter.test.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

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
});

describe('WholeModelEmitter type', () => {
  it('has an async emit method', () => {
    expectTypeOf<WholeModelEmitter['emit']>().toBeFunction();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/codegen test -- whole-model-emitter.test.ts
```

Expected: FAIL — types not exported.

- [ ] **Step 3: Add the contract**

In `packages/codegen/src/emit/namespace-emitter.ts`, after the existing `NamespaceEmitterConstructor` interface, add:

```ts
/**
 * Emitter contract for targets that consume the **entire model** as input
 * (rather than one namespace at a time). Used by targets that need
 * cross-namespace state — e.g., Excel produces one workbook for the whole
 * model with cross-sheet hyperlinks; GraphQL produces one SDL file.
 *
 * Returns one or more GeneratorOutput entries. Most whole-model emitters
 * return a single entry (the single artifact). Async because binary
 * emitters (ExcelJS) use stream APIs.
 */
export interface WholeModelEmitter {
  emit(
    walks: ReadonlyMap<string, NamespaceWalkResult>,
    registry: NamespaceRegistry,
    options: GeneratorOptions
  ): Promise<GeneratorOutput[]>;
}

export interface WholeModelEmitterConstructor {
  new (): WholeModelEmitter;
}

/**
 * Discriminator. Distinguishes by prototype shape: NamespaceEmitter exposes
 * `finalize()` (and per-method emit hooks like emitData), while
 * WholeModelEmitter exposes only a single async `emit()` method.
 */
export function isWholeModelEmitter(
  c: NamespaceEmitterConstructor | WholeModelEmitterConstructor
): c is WholeModelEmitterConstructor {
  const proto = (c as { prototype?: Record<string, unknown> }).prototype;
  if (!proto) return false;
  return typeof proto.emit === 'function' && typeof proto.finalize !== 'function';
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/codegen test -- whole-model-emitter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/emit/namespace-emitter.ts packages/codegen/test/emit/whole-model-emitter.test.ts
git commit -m "feat(codegen): add WholeModelEmitter contract and discriminator (018 Phase 0)"
```

## Task 0.3: Add `TARGET_DESCRIPTORS` constant

**Files:**
- Modify: `packages/codegen/src/types.ts`
- Modify: `packages/codegen/src/index.ts`
- Test: `packages/codegen/test/target-descriptors.test.ts` (NEW)

- [ ] **Step 1: Write the failing test**

Create `packages/codegen/test/target-descriptors.test.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { TARGET_DESCRIPTORS } from '../src/index.js';

describe('TARGET_DESCRIPTORS', () => {
  it('has all seven target entries', () => {
    expect(Object.keys(TARGET_DESCRIPTORS).sort()).toEqual([
      'excel', 'graphql', 'json-schema', 'markdown', 'sql', 'typescript', 'zod'
    ]);
  });

  it('marks excel and graphql as whole-model', () => {
    expect(TARGET_DESCRIPTORS.excel.contract).toBe('whole-model');
    expect(TARGET_DESCRIPTORS.graphql.contract).toBe('whole-model');
  });

  it('marks the others as namespace contract', () => {
    for (const t of ['zod', 'typescript', 'json-schema', 'sql', 'markdown'] as const) {
      expect(TARGET_DESCRIPTORS[t].contract).toBe('namespace');
    }
  });

  it('provides a mimeType for whole-model targets', () => {
    expect(TARGET_DESCRIPTORS.excel.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(TARGET_DESCRIPTORS.graphql.mimeType).toBe('application/graphql');
  });

  it('extensions match the spec', () => {
    expect(TARGET_DESCRIPTORS.zod.extension).toBe('.zod.ts');
    expect(TARGET_DESCRIPTORS.typescript.extension).toBe('.ts');
    expect(TARGET_DESCRIPTORS['json-schema'].extension).toBe('.schema.json');
    expect(TARGET_DESCRIPTORS.sql.extension).toBe('.sql');
    expect(TARGET_DESCRIPTORS.markdown.extension).toBe('.md');
    expect(TARGET_DESCRIPTORS.excel.extension).toBe('.xlsx');
    expect(TARGET_DESCRIPTORS.graphql.extension).toBe('.graphql');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/codegen test -- target-descriptors.test.ts
```

Expected: FAIL — `TARGET_DESCRIPTORS` is not exported.

- [ ] **Step 3: Add the constant**

In `packages/codegen/src/types.ts`, append:

```ts
/**
 * Static descriptor for each generator target. Used by UI surfaces (e.g., the
 * studio targets table) to render labels and decide between Preview/Download
 * affordances. The runtime classification (`contract`) mirrors the emitter
 * interface.
 */
export type TargetDescriptor = {
  label: string;
  contract: 'namespace' | 'whole-model';
  desc: string;
  extension: string;
  mimeType?: string;
};

export const TARGET_DESCRIPTORS: Record<Target, TargetDescriptor> = {
  zod: {
    label: 'Zod',
    contract: 'namespace',
    desc: 'Runtime validation schemas',
    extension: '.zod.ts'
  },
  typescript: {
    label: 'TypeScript',
    contract: 'namespace',
    desc: 'Type-only interfaces',
    extension: '.ts'
  },
  'json-schema': {
    label: 'JSON Schema',
    contract: 'namespace',
    desc: 'Draft 2020-12 schema documents',
    extension: '.schema.json'
  },
  sql: {
    label: 'SQL',
    contract: 'namespace',
    desc: 'DDL (Postgres / SQL Server)',
    extension: '.sql'
  },
  markdown: {
    label: 'Markdown',
    contract: 'namespace',
    desc: 'Reference documentation',
    extension: '.md'
  },
  excel: {
    label: 'Excel',
    contract: 'whole-model',
    desc: 'Data dictionary workbook',
    extension: '.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  },
  graphql: {
    label: 'GraphQL SDL',
    contract: 'whole-model',
    desc: 'Schema definition language',
    extension: '.graphql',
    mimeType: 'application/graphql'
  }
};
```

- [ ] **Step 4: Re-export from index**

In `packages/codegen/src/index.ts`, add near the type re-exports:

```ts
export type { TargetDescriptor } from './types.js';
export { TARGET_DESCRIPTORS } from './types.js';
export type { WholeModelEmitter, WholeModelEmitterConstructor } from './emit/namespace-emitter.js';
export { isWholeModelEmitter } from './emit/namespace-emitter.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/codegen test -- target-descriptors.test.ts
```

Expected: PASS (5 assertions).

- [ ] **Step 6: Commit**

```bash
git add packages/codegen/src/types.ts packages/codegen/src/index.ts packages/codegen/test/target-descriptors.test.ts
git commit -m "feat(codegen): add TARGET_DESCRIPTORS as single source of truth (018 Phase 0)"
```

## Task 0.4: Dispatch on emitter contract in `runGenerate`

**Files:**
- Modify: `packages/codegen/src/generator.ts`
- Modify: `packages/codegen/src/index.ts` (make `generate` async)
- Test: `packages/codegen/test/dispatch.test.ts` (NEW)

- [ ] **Step 1: Write the failing test**

Create `packages/codegen/test/dispatch.test.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../src/index.js';

const RUNE_SOURCE = `
namespace cdm.base.math
type Quantity:
  amount number (1..1)
  currency string (0..1)
`;

async function parseInput() {
  const services = createRuneDslServices({ workspaceUri: undefined }).RuneDsl;
  const doc = services.shared.workspace.LangiumDocumentFactory.fromString(
    RUNE_SOURCE,
    URI.parse('file:///test.rune')
  );
  await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });
  return doc;
}

describe('runGenerate dispatch', () => {
  it('rejects unknown targets with a not-implemented diagnostic', async () => {
    const doc = await parseInput();
    const outputs = await generate(doc, { target: 'sql' });
    // SQL emitter is not yet registered in Phase 0.
    expect(outputs).toHaveLength(1);
    expect(outputs[0].diagnostics.some((d) => d.code === 'not-implemented')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/codegen test -- dispatch.test.ts
```

Expected: FAIL — `generate()` may be synchronous and/or target dispatch doesn't return a single not-implemented output.

- [ ] **Step 3: Make `runGenerate` and `generate` async; add contract-aware dispatch**

In `packages/codegen/src/generator.ts`:

```ts
import {
  emitNamespaceWithContract,
  isWholeModelEmitter,
  type NamespaceEmitterConstructor,
  type WholeModelEmitterConstructor
} from './emit/namespace-emitter.js';

const EMITTER_CLASSES: Partial<Record<Target, NamespaceEmitterConstructor | WholeModelEmitterConstructor>> = {
  zod: ZodNamespaceEmitter,
  'json-schema': JsonSchemaNamespaceEmitter,
  typescript: TsNamespaceEmitter
};

export async function runGenerate(
  docs: LangiumDocument[],
  options: GeneratorOptions
): Promise<GeneratorOutput[]> {
  if (docs.length === 0) return [];

  const target = options.target ?? 'zod';
  const emitterClass = EMITTER_CLASSES[target];

  if (!emitterClass) {
    return [{
      relativePath: 'unknown',
      content: '',
      sourceMap: [],
      diagnostics: [createDiagnostic('error', 'not-implemented',
        `Target '${target}' is not implemented.`)],
      funcs: []
    }];
  }

  const byNamespace = groupByNamespace(docs);
  if (byNamespace.size === 0) return [];

  const registry = buildNamespaceRegistry(byNamespace);

  // Walk every namespace once. Walks are reused for both contract types.
  const walks = new Map<string, NamespaceWalkResult>();
  for (const [namespace, namespaceDocs] of byNamespace) {
    walks.set(namespace, walkNamespace(namespaceDocs, namespace));
  }

  let outputs: GeneratorOutput[];
  if (isWholeModelEmitter(emitterClass)) {
    outputs = await new emitterClass().emit(walks, registry, options);
  } else {
    outputs = [];
    for (const [, walkedNamespace] of walks) {
      outputs.push(emitNamespaceWithContract(walkedNamespace, options, registry, emitterClass));
    }
  }

  outputs.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  if (options.strict) {
    const allDiags = outputs.flatMap((o) => o.diagnostics);
    if (hasFatalDiagnostics(allDiags)) {
      throw new GeneratorError('Generation failed with errors', allDiags);
    }
  }

  return outputs;
}
```

In `packages/codegen/src/index.ts`, change the `generate()` export to be async:

```ts
export async function generate(
  docOrDocs: LangiumDocument | LangiumDocument[],
  options: GeneratorOptions = {}
): Promise<GeneratorOutput[]> {
  const docs = Array.isArray(docOrDocs) ? docOrDocs : [docOrDocs];
  return runGenerate(docs, options);
}
```

- [ ] **Step 4: Update existing callers to await `generate()`**

Search and update:

```bash
grep -rn "generate(" packages/codegen/test packages/codegen/bin apps/studio/src 2>/dev/null | grep -v "// " | head -20
```

For each non-test caller, prepend `await`. For tests, ensure the calling `it()` is async and `await` the result. Most likely affected:
- `packages/codegen/bin/rune-codegen.ts`
- `apps/studio/src/workers/codegen-worker.ts`
- All `packages/codegen/test/us*.test.ts`

This is mechanical: every `generate(doc, opts)` becomes `await generate(doc, opts)`.

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/codegen test -- dispatch.test.ts
```

Expected: PASS (1 assertion).

- [ ] **Step 6: Run all codegen tests for regressions**

```bash
pnpm --filter @rune-langium/codegen test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/codegen/src/generator.ts packages/codegen/src/index.ts packages/codegen/test packages/codegen/bin apps/studio/src/workers
git commit -m "feat(codegen): dispatch on emitter contract; make generate() async (018 Phase 0)"
```

## Task 0.5: Extend `getTargetRelativePath` for new targets

**Files:**
- Modify: `packages/codegen/src/emit/namespace-walker.ts`
- Modify: `packages/codegen/test/namespace-walker.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/codegen/test/namespace-walker.test.ts`:

```ts
import { getTargetRelativePath } from '../src/emit/namespace-walker.js';

describe('getTargetRelativePath — new targets', () => {
  it('emits .sql for sql target', () => {
    expect(getTargetRelativePath('cdm.base.math', 'sql')).toBe('cdm/base/math.sql');
  });

  it('emits .md for markdown target', () => {
    expect(getTargetRelativePath('cdm.base.math', 'markdown')).toBe('cdm/base/math.md');
  });

  it('throws for whole-model targets', () => {
    expect(() => getTargetRelativePath('x', 'excel')).toThrow();
    expect(() => getTargetRelativePath('x', 'graphql')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/codegen test -- namespace-walker.test.ts
```

Expected: FAIL — `sql` and `markdown` fall through to `.ts`; whole-model targets don't throw.

- [ ] **Step 3: Extend the function**

Replace the body of `getTargetRelativePath` in `packages/codegen/src/emit/namespace-walker.ts`:

```ts
export function getTargetRelativePath(namespace: string, target: Target): string {
  const basePath = namespace.replace(/\./g, '/');
  switch (target) {
    case 'zod': return `${basePath}.zod.ts`;
    case 'json-schema': return `${basePath}.schema.json`;
    case 'typescript': return `${basePath}.ts`;
    case 'sql': return `${basePath}.sql`;
    case 'markdown': return `${basePath}.md`;
    case 'excel':
    case 'graphql':
      throw new Error(`getTargetRelativePath should not be called for whole-model target '${target}'`);
    default: {
      const _exhaustive: never = target;
      throw new Error(`Unknown target: ${String(_exhaustive)}`);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/codegen test -- namespace-walker.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/emit/namespace-walker.ts packages/codegen/test/namespace-walker.test.ts
git commit -m "feat(codegen): extend getTargetRelativePath for sql/markdown (018 Phase 0)"
```

## Task 0.6: Add `activeTarget` to studio codegen store

**Files:**
- Modify: `apps/studio/src/store/codegen-store.ts`
- Test: `apps/studio/test/store/codegen-store.test.ts` (NEW or extend)

- [ ] **Step 1: Read the current store shape**

```bash
grep -n "codePreviewTarget\|create<\|interface CodegenStoreState\|type CodegenStoreState" apps/studio/src/store/codegen-store.ts
```

- [ ] **Step 2: Write the failing test**

Create or extend `apps/studio/test/store/codegen-store.test.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, beforeEach } from 'vitest';
import { useCodegenStore } from '../../src/store/codegen-store.js';

describe('codegen-store activeTarget', () => {
  beforeEach(() => {
    useCodegenStore.setState({ activeTarget: null });
  });

  it('starts as null', () => {
    expect(useCodegenStore.getState().activeTarget).toBeNull();
  });

  it('setActiveTarget updates the field', () => {
    useCodegenStore.getState().setActiveTarget('zod');
    expect(useCodegenStore.getState().activeTarget).toBe('zod');
  });

  it('setActiveTarget(null) returns to table view', () => {
    useCodegenStore.getState().setActiveTarget('zod');
    useCodegenStore.getState().setActiveTarget(null);
    expect(useCodegenStore.getState().activeTarget).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/studio test -- codegen-store.test.ts
```

Expected: FAIL — `activeTarget` / `setActiveTarget` don't exist.

- [ ] **Step 4: Add the field and setter**

In `apps/studio/src/store/codegen-store.ts`, add to the state interface:

```ts
import type { Target } from '@rune-langium/codegen';

export interface CodegenStoreState {
  // ... existing fields ...
  /**
   * When `null`, the Code preview panel renders the targets table.
   * When set, it renders the code viewer for the given target. Only valid
   * for `contract: 'namespace'` targets.
   */
  activeTarget: Target | null;
  setActiveTarget(target: Target | null): void;
}
```

In the store body:

```ts
activeTarget: null,
setActiveTarget: (target) => set({ activeTarget: target }),
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/studio test -- codegen-store.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/store/codegen-store.ts apps/studio/test/store/codegen-store.test.ts
git commit -m "feat(studio): add activeTarget state to codegen store (018 Phase 0)"
```

## Task 0.7: Build `CodegenTargetsTable` component

**Files:**
- Create: `apps/studio/src/components/CodegenTargetsTable.tsx`
- Create: `apps/studio/test/components/CodegenTargetsTable.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/studio/test/components/CodegenTargetsTable.test.tsx`:

```tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CodegenTargetsTable } from '../../src/components/CodegenTargetsTable.js';
import { useCodegenStore } from '../../src/store/codegen-store.js';

describe('CodegenTargetsTable', () => {
  beforeEach(() => {
    useCodegenStore.setState({ activeTarget: null });
  });

  it('renders a row for each registered per-namespace target with Preview + Download', () => {
    const onDownload = vi.fn();
    render(
      <CodegenTargetsTable
        registeredTargets={new Set(['zod', 'typescript', 'json-schema'])}
        onDownload={onDownload}
      />
    );

    expect(screen.getByRole('row', { name: /Zod/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /TypeScript/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /JSON Schema/i })).toBeInTheDocument();

    const zodRow = screen.getByRole('row', { name: /Zod/i });
    expect(zodRow.querySelector('[data-testid="preview-zod"]')).not.toBeNull();
    expect(zodRow.querySelector('[data-testid="download-zod"]')).not.toBeNull();
  });

  it('filters out unregistered targets', () => {
    render(
      <CodegenTargetsTable registeredTargets={new Set(['zod'])} onDownload={vi.fn()} />
    );
    expect(screen.queryByRole('row', { name: /Excel/i })).toBeNull();
    expect(screen.queryByRole('row', { name: /SQL/i })).toBeNull();
  });

  it('renders only Download for whole-model targets', () => {
    render(
      <CodegenTargetsTable registeredTargets={new Set(['excel'])} onDownload={vi.fn()} />
    );
    const row = screen.getByRole('row', { name: /Excel/i });
    expect(row.querySelector('[data-testid="preview-excel"]')).toBeNull();
    expect(row.querySelector('[data-testid="download-excel"]')).not.toBeNull();
  });

  it('clicking Preview sets activeTarget in the store', () => {
    render(
      <CodegenTargetsTable registeredTargets={new Set(['zod'])} onDownload={vi.fn()} />
    );
    fireEvent.click(screen.getByTestId('preview-zod'));
    expect(useCodegenStore.getState().activeTarget).toBe('zod');
  });

  it('clicking Download invokes onDownload with the target', () => {
    const onDownload = vi.fn();
    render(
      <CodegenTargetsTable registeredTargets={new Set(['zod'])} onDownload={onDownload} />
    );
    fireEvent.click(screen.getByTestId('download-zod'));
    expect(onDownload).toHaveBeenCalledWith('zod');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/studio test -- CodegenTargetsTable.test.tsx
```

Expected: FAIL — file does not exist.

- [ ] **Step 3: Implement the component**

Create `apps/studio/src/components/CodegenTargetsTable.tsx`:

```tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import React, { useCallback } from 'react';
import { Eye, Download } from 'lucide-react';
import { TARGET_DESCRIPTORS, type Target } from '@rune-langium/codegen';
import { Button } from '@rune-langium/design-system';
import { useCodegenStore } from '../store/codegen-store.js';

export interface CodegenTargetsTableProps {
  registeredTargets: ReadonlySet<Target>;
  onDownload: (target: Target) => void;
}

const TARGET_ORDER: readonly Target[] = [
  'zod', 'typescript', 'json-schema', 'sql', 'markdown', 'excel', 'graphql'
];

export function CodegenTargetsTable({
  registeredTargets,
  onDownload
}: CodegenTargetsTableProps): React.ReactElement {
  const setActiveTarget = useCodegenStore((s) => s.setActiveTarget);

  const handlePreview = useCallback(
    (target: Target) => () => setActiveTarget(target),
    [setActiveTarget]
  );

  const visible = TARGET_ORDER.filter((t) => registeredTargets.has(t));

  return (
    <table
      role="table"
      aria-label="Code generation targets"
      data-testid="codegen-targets-table"
      className="codegen-targets-table w-full"
    >
      <thead>
        <tr>
          <th scope="col">Target</th>
          <th scope="col">Description</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {visible.map((target) => {
          const d = TARGET_DESCRIPTORS[target];
          return (
            <tr key={target} aria-label={d.label}>
              <td>{d.label}</td>
              <td>{d.desc}</td>
              <td className="codegen-targets-table__actions flex gap-1">
                {d.contract === 'namespace' ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    data-testid={`preview-${target}`}
                    onClick={handlePreview(target)}
                  >
                    <Eye className="size-3.5" /> Preview
                  </Button>
                ) : null}
                <Button
                  size="xs"
                  variant="ghost"
                  data-testid={`download-${target}`}
                  onClick={() => onDownload(target)}
                >
                  <Download className="size-3.5" /> Download
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/studio test -- CodegenTargetsTable.test.tsx
```

Expected: PASS (5 assertions).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/components/CodegenTargetsTable.tsx apps/studio/test/components/CodegenTargetsTable.test.tsx
git commit -m "feat(studio): add CodegenTargetsTable component (018 Phase 0)"
```

## Task 0.8: Wire `CodePreviewPanel` to switch table ↔ viewer

**Files:**
- Modify: `apps/studio/src/components/CodePreviewPanel.tsx`
- Modify: `apps/studio/test/components/CodePreviewPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `apps/studio/test/components/CodePreviewPanel.test.tsx`:

```tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CodePreviewPanel } from '../../src/components/CodePreviewPanel.js';
import { useCodegenStore } from '../../src/store/codegen-store.js';

describe('CodePreviewPanel — table ↔ viewer', () => {
  beforeEach(() => {
    useCodegenStore.setState({ activeTarget: null });
  });

  it('shows the targets table when activeTarget is null', () => {
    render(<CodePreviewPanel namespace="cdm.base.math" />);
    expect(screen.getByTestId('codegen-targets-table')).toBeInTheDocument();
    expect(screen.queryByTestId('back-to-targets')).toBeNull();
  });

  it('shows the code viewer when activeTarget is set', () => {
    useCodegenStore.setState({ activeTarget: 'zod' });
    render(<CodePreviewPanel namespace="cdm.base.math" />);
    expect(screen.queryByTestId('codegen-targets-table')).toBeNull();
    expect(screen.getByTestId('back-to-targets')).toBeInTheDocument();
  });

  it('clicking ← Targets restores the table', () => {
    useCodegenStore.setState({ activeTarget: 'zod' });
    render(<CodePreviewPanel namespace="cdm.base.math" />);
    fireEvent.click(screen.getByTestId('back-to-targets'));
    expect(useCodegenStore.getState().activeTarget).toBeNull();
  });

  it('preview dropdown lists only per-namespace targets', () => {
    useCodegenStore.setState({ activeTarget: 'zod' });
    render(<CodePreviewPanel namespace="cdm.base.math" />);
    const select = screen.getByTestId('preview-target-select') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).not.toContain('excel');
    expect(options).not.toContain('graphql');
    expect(options).toContain('zod');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/studio test -- CodePreviewPanel.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Refactor `CodePreviewPanel`**

In `apps/studio/src/components/CodePreviewPanel.tsx`, restructure so that `activeTarget == null` renders the table and otherwise renders the existing viewer with a toolbar:

```tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import React, { useCallback, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { TARGET_DESCRIPTORS, type Target } from '@rune-langium/codegen';
import { useCodegenStore } from '../store/codegen-store.js';
import { CodegenTargetsTable } from './CodegenTargetsTable.js';
import { downloadTarget } from '../services/codegen-service.js';
// ... existing imports for the code viewer ...

const REGISTERED: ReadonlySet<Target> = new Set(['zod', 'typescript', 'json-schema']);

export interface CodePreviewPanelProps {
  namespace: string;
}

export function CodePreviewPanel({ namespace }: CodePreviewPanelProps): React.ReactElement {
  const activeTarget = useCodegenStore((s) => s.activeTarget);
  const setActiveTarget = useCodegenStore((s) => s.setActiveTarget);

  const namespaceTargets = useMemo(
    () => (Object.keys(TARGET_DESCRIPTORS) as Target[])
      .filter((t) => TARGET_DESCRIPTORS[t].contract === 'namespace' && REGISTERED.has(t)),
    []
  );

  const handleDownload = useCallback(async (target: Target) => {
    await downloadTarget(target);
  }, []);

  if (activeTarget == null) {
    return (
      <div className="code-preview-panel" data-testid="code-preview-panel">
        <CodegenTargetsTable
          registeredTargets={REGISTERED}
          onDownload={handleDownload}
        />
      </div>
    );
  }

  return (
    <div className="code-preview-panel" data-testid="code-preview-panel">
      <div className="code-preview-panel__toolbar">
        <button
          type="button"
          data-testid="back-to-targets"
          onClick={() => setActiveTarget(null)}
          className="flex items-center gap-1 text-xs"
        >
          <ArrowLeft className="size-3.5" /> Targets
        </button>
        <span className="text-xs">Previewing:</span>
        <select
          data-testid="preview-target-select"
          value={activeTarget}
          onChange={(e) => setActiveTarget(e.target.value as Target)}
        >
          {namespaceTargets.map((t) => (
            <option key={t} value={t}>{TARGET_DESCRIPTORS[t].label}</option>
          ))}
        </select>
      </div>
      {/* Preserve existing code-viewer rendering. Read activeTarget instead of codePreviewTarget. */}
    </div>
  );
}
```

**Important:** preserve all existing snapshot-rendering logic from the previous file. Only the toolbar header and the table-gating are new. Any reference to the old `codePreviewTarget` field becomes `activeTarget`.

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/studio test -- CodePreviewPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run all studio component tests**

```bash
pnpm --filter @rune-langium/studio test -- src/components
```

Expected: PASS (any old reference to `TargetSwitcher` will fail; address in Task 0.9).

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/components/CodePreviewPanel.tsx apps/studio/test/components/CodePreviewPanel.test.tsx
git commit -m "feat(studio): switch CodePreviewPanel to targets-table landing (018 Phase 0)"
```

## Task 0.9: Delete `TargetSwitcher` and dangling references

**Files:**
- Delete: `apps/studio/src/components/TargetSwitcher.tsx`
- Delete: `apps/studio/test/components/TargetSwitcher.test.tsx` (if exists)
- Modify: `apps/studio/src/components/codegen-ui.ts`

- [ ] **Step 1: Find references**

```bash
grep -rn "TargetSwitcher\|TARGET_OPTIONS" apps/studio/src apps/studio/test
```

- [ ] **Step 2: Simplify `codegen-ui.ts`**

Replace `apps/studio/src/components/codegen-ui.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { TARGET_DESCRIPTORS, type Target } from '@rune-langium/codegen';
export { TARGET_DESCRIPTORS } from '@rune-langium/codegen';

export const CODE_PREVIEW_PANEL_ID = 'code-preview-panel';
export const FORM_PREVIEW_PANEL_ID = 'form-preview-panel';

export const TARGET_LABELS: Record<Target, string> = Object.fromEntries(
  Object.entries(TARGET_DESCRIPTORS).map(([k, v]) => [k, v.label])
) as Record<Target, string>;
```

- [ ] **Step 3: Delete `TargetSwitcher`**

```bash
git rm apps/studio/src/components/TargetSwitcher.tsx
# If a test file exists:
test -f apps/studio/test/components/TargetSwitcher.test.tsx && git rm apps/studio/test/components/TargetSwitcher.test.tsx
```

- [ ] **Step 4: Run all studio tests**

```bash
pnpm --filter @rune-langium/studio test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A apps/studio/src/components apps/studio/test/components
git commit -m "refactor(studio): remove TargetSwitcher; re-export TARGET_DESCRIPTORS (018 Phase 0)"
```

## Task 0.10: Add `wrangler.toml` and Pages Function scaffold

**Files:**
- Create: `apps/studio/wrangler.toml`
- Create: `apps/studio/functions/api/codegen.ts` (stub)
- Modify: `apps/studio/package.json` (add `wrangler` devDep)

- [ ] **Step 1: Add wrangler config**

Create `apps/studio/wrangler.toml`:

```toml
name = "rune-studio"
compatibility_date = "2025-09-23"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = "./dist"
```

- [ ] **Step 2: Add the function stub**

Create `apps/studio/functions/api/codegen.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Cloudflare Pages Function: POST /api/codegen
 * Studio Download handler. Phase 0 ships a stub; Task 0.11 wires the pipeline.
 */

export const onRequestPost: PagesFunction = async () => {
  return new Response(
    JSON.stringify({ ok: false, error: 'Not implemented yet', diagnostics: [] }),
    { status: 501, headers: { 'Content-Type': 'application/json' } }
  );
};
```

- [ ] **Step 3: Add wrangler devDep**

In `apps/studio/package.json`, add to `devDependencies`:

```json
"wrangler": "^4.0.0"
```

```bash
pnpm install
```

- [ ] **Step 4: Verify it builds**

```bash
pnpm --filter @rune-langium/studio exec wrangler pages functions build --compatibility-date 2025-09-23 --outdir .wrangler/tmp-functions
```

Expected: build succeeds without errors.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/wrangler.toml apps/studio/functions/api/codegen.ts apps/studio/package.json pnpm-lock.yaml
git commit -m "feat(studio): add wrangler config and Pages Function scaffold (018 Phase 0)"
```

## Task 0.11: Implement Pages Function `/api/codegen`

**Files:**
- Modify: `apps/studio/functions/api/codegen.ts`
- Create: `apps/studio/functions/test/codegen.test.ts`
- Modify: `apps/studio/package.json` (add `jszip`)

- [ ] **Step 1: Add `jszip` dependency**

In `apps/studio/package.json`, add to `dependencies`:

```json
"jszip": "^3.10.1"
```

```bash
pnpm install
```

- [ ] **Step 2: Write the failing integration test**

Create `apps/studio/functions/test/codegen.test.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { onRequestPost } from '../api/codegen.js';

const RUNE_SOURCE = `
namespace cdm.base.math
type Quantity:
  amount number (1..1)
`;

function makeRequest(body: unknown): Request {
  return new Request('http://example.com/api/codegen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('POST /api/codegen', () => {
  it('returns 400 for malformed JSON', async () => {
    const req = new Request('http://example.com/api/codegen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json'
    });
    const res = await onRequestPost({ request: req } as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 for unknown target', async () => {
    const req = makeRequest({
      files: [{ path: 'test.rune', content: RUNE_SOURCE }],
      target: 'wat-target'
    });
    const res = await onRequestPost({ request: req } as never);
    expect(res.status).toBe(400);
  });

  it('returns a single file when outputs.length === 1', async () => {
    const req = makeRequest({
      files: [{ path: 'test.rune', content: RUNE_SOURCE }],
      target: 'typescript'
    });
    const res = await onRequestPost({ request: req } as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toMatch(/\.ts"/);
  });

  it('returns a zip when outputs include an aggregator', async () => {
    const req = makeRequest({
      files: [
        { path: 'a.rune', content: 'namespace a\ntype TA: a string (1..1)' },
        { path: 'b.rune', content: 'namespace b\ntype TB: b string (1..1)' }
      ],
      target: 'zod'
    });
    const res = await onRequestPost({ request: req } as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment; filename="zod-output\.zip"/);

    const buf = await res.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    expect(Object.keys(zip.files).some((n) => n.endsWith('.zod.ts'))).toBe(true);
  });

  it('returns JSON error envelope for fatal generation diagnostics', async () => {
    const req = makeRequest({
      files: [{ path: 'test.rune', content: 'namespace x\ntype Broken:' }],
      target: 'zod'
    });
    const res = await onRequestPost({ request: req } as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(Array.isArray(body.diagnostics)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/studio test -- functions/test/codegen.test.ts
```

Expected: FAIL — stub returns 501.

- [ ] **Step 4: Implement the function**

Replace `apps/studio/functions/api/codegen.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import {
  generate,
  TARGET_DESCRIPTORS,
  type GeneratorOptions,
  type GeneratorOutput,
  type Target
} from '@rune-langium/codegen';
import JSZip from 'jszip';

type CodegenRequest = {
  files: Array<{ path: string; content: string }>;
  target: Target;
  options?: GeneratorOptions;
};

const EXTENSION_TO_MIME: Record<string, string> = {
  '.ts': 'application/typescript',
  '.schema.json': 'application/json',
  '.sql': 'application/sql',
  '.md': 'text/markdown',
  '.graphql': 'application/graphql',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function isValidTarget(t: unknown): t is Target {
  return typeof t === 'string' && t in TARGET_DESCRIPTORS;
}

function badRequest(error: string, diagnostics: unknown[] = []): Response {
  return new Response(
    JSON.stringify({ ok: false, error, diagnostics }),
    { status: 400, headers: { 'Content-Type': 'application/json' } }
  );
}

function pickExtension(relativePath: string): string {
  if (relativePath.endsWith('.zod.ts')) return '.zod.ts';
  if (relativePath.endsWith('.schema.json')) return '.schema.json';
  const dot = relativePath.lastIndexOf('.');
  return dot >= 0 ? relativePath.substring(dot) : '';
}

export const onRequestPost: PagesFunction = async ({ request }) => {
  let body: CodegenRequest;
  try {
    body = (await request.json()) as CodegenRequest;
  } catch {
    return badRequest('Malformed JSON');
  }

  if (!Array.isArray(body.files) || body.files.length === 0) {
    return badRequest('No files provided');
  }
  if (!isValidTarget(body.target)) {
    return badRequest(`Unknown target '${String(body.target)}'`);
  }

  const services = createRuneDslServices({ workspaceUri: undefined }).RuneDsl;
  const docs = body.files.map((f) =>
    services.shared.workspace.LangiumDocumentFactory.fromString(
      f.content,
      URI.parse(`file:///${f.path}`)
    )
  );
  await services.shared.workspace.DocumentBuilder.build(docs, { validation: true });

  let outputs: GeneratorOutput[];
  try {
    outputs = await generate(docs, { ...body.options, target: body.target });
  } catch (err: unknown) {
    return badRequest((err as Error).message ?? 'Generation failed');
  }

  const fatals = outputs.flatMap((o) => o.diagnostics).filter((d) => d.severity === 'error');
  if (fatals.length > 0) {
    return badRequest('Fatal diagnostics', fatals);
  }

  if (outputs.length === 1) {
    const o = outputs[0];
    const ext = pickExtension(o.relativePath);
    const mime = o.mimeType ?? EXTENSION_TO_MIME[ext] ?? 'application/octet-stream';
    const filename = o.relativePath.split('/').pop() ?? o.relativePath;
    const payload = o.binary ?? new TextEncoder().encode(o.content);
    return new Response(payload, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  }

  const zip = new JSZip();
  for (const o of outputs) {
    if (o.binary) zip.file(o.relativePath, o.binary);
    else zip.file(o.relativePath, o.content);
  }
  const zipBuffer = await zip.generateAsync({ type: 'uint8array' });
  return new Response(zipBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${body.target}-output.zip"`
    }
  });
};
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/studio test -- functions/test/codegen.test.ts
```

Expected: PASS (5 assertions).

- [ ] **Step 6: Commit**

```bash
git add apps/studio/functions/api/codegen.ts apps/studio/functions/test/codegen.test.ts apps/studio/package.json pnpm-lock.yaml
git commit -m "feat(studio): implement /api/codegen Pages Function (018 Phase 0)"
```

## Task 0.12: Wire studio `downloadTarget` service

**Files:**
- Modify: `apps/studio/src/services/codegen-service.ts`
- Modify or create: `apps/studio/test/services/codegen-service.test.ts`

- [ ] **Step 1: Write the failing test**

Create or extend `apps/studio/test/services/codegen-service.test.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadTarget } from '../../src/services/codegen-service.js';
import { useWorkspaceStore } from '../../src/store/workspace-store.js';

describe('downloadTarget', () => {
  const originalFetch = global.fetch;
  let clickedAnchors: Array<{ href: string; download: string }> = [];

  beforeEach(() => {
    clickedAnchors = [];
    global.URL.createObjectURL = vi.fn(() => 'blob:fake');
    global.URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = function () {
      clickedAnchors.push({
        href: (this as HTMLAnchorElement).href,
        download: (this as HTMLAnchorElement).download
      });
    };
    useWorkspaceStore.setState({
      files: [{ path: 'test.rune', content: 'namespace x\ntype T: a string (1..1)', name: 'test.rune', dirty: false }]
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('POSTs to /api/codegen with files and target', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: {
        'Content-Type': 'application/typescript',
        'Content-Disposition': 'attachment; filename="x.ts"'
      }
    }));
    global.fetch = fetchMock;

    await downloadTarget('typescript');

    expect(fetchMock).toHaveBeenCalledWith('/api/codegen', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' })
    }));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.target).toBe('typescript');
    expect(Array.isArray(body.files)).toBe(true);
    expect(clickedAnchors).toHaveLength(1);
    expect(clickedAnchors[0].download).toBe('x.ts');
  });

  it('throws on non-200 response with the server-provided error', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false, error: 'Bad request', diagnostics: []
    }), { status: 400, headers: { 'Content-Type': 'application/json' } }));

    await expect(downloadTarget('typescript')).rejects.toThrow(/Bad request/);
  });
});
```

(Adjust the `useWorkspaceStore.setState({...})` call to match the actual `WorkspaceFile` shape — inspect the existing store before writing the seed.)

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/studio test -- codegen-service.test.ts
```

Expected: FAIL — `downloadTarget` is not exported.

- [ ] **Step 3: Implement `downloadTarget`**

In `apps/studio/src/services/codegen-service.ts`:

```ts
import type { Target } from '@rune-langium/codegen';
import { useWorkspaceStore } from '../store/workspace-store.js';

export async function downloadTarget(target: Target): Promise<void> {
  const files = useWorkspaceStore.getState().files.map((f) => ({
    path: f.path,
    content: f.content
  }));

  const response = await fetch('/api/codegen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files, target })
  });

  if (!response.ok) {
    let errorMessage = `Codegen failed with status ${response.status}`;
    try {
      const json = (await response.json()) as { error?: string };
      if (json.error) errorMessage = json.error;
    } catch {
      // body not JSON; keep generic message
    }
    throw new Error(errorMessage);
  }

  const cd = response.headers.get('Content-Disposition') ?? '';
  const filenameMatch = cd.match(/filename="([^"]+)"/);
  const filename = filenameMatch?.[1] ?? `${target}-output`;

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/studio test -- codegen-service.test.ts
```

Expected: PASS (2 assertions).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/services/codegen-service.ts apps/studio/test/services/codegen-service.test.ts
git commit -m "feat(studio): wire downloadTarget to /api/codegen Pages Function (018 Phase 0)"
```

## Task 0.13: Decide and wire local-dev tooling

**Files:**
- Modify: `apps/studio/package.json` (scripts)
- Modify: `apps/studio/README.md`

- [ ] **Step 1: Choose `wrangler pages dev`**

Use `wrangler pages dev` for v1 — Cloudflare-maintained, mature, well-documented.

- [ ] **Step 2: Add a `dev:pages` script**

In `apps/studio/package.json`, add to `scripts`:

```json
"dev:pages": "wrangler pages dev http://localhost:5173 --port 8788 --compatibility-date 2025-09-23 --compatibility-flags nodejs_compat"
```

- [ ] **Step 3: Document the dev flow**

Append to `apps/studio/README.md`:

```markdown
## Local development with Pages Functions

The studio's Download path uses a Cloudflare Pages Function at
`apps/studio/functions/api/codegen.ts`. To exercise it locally:

1. Start Vite (the SPA dev server):
   ```bash
   pnpm dev
   ```
2. In a second terminal, start the Pages dev proxy:
   ```bash
   pnpm dev:pages
   ```
3. Open `http://localhost:8788/` — same routes as production, with the
   Function served at `/api/codegen`.

Preview (per-namespace) does not require the Pages dev proxy — it runs
in the browser's codegen worker. Only Download needs the proxy.
```

- [ ] **Step 4: Manual smoke check**

Start both `pnpm dev` and `pnpm dev:pages`. Open `http://localhost:8788/`. Click Download on Zod. Verify a `zod-output.zip` is downloaded.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/package.json apps/studio/README.md
git commit -m "docs(studio): document local-dev flow with wrangler pages dev (018 Phase 0)"
```

## Task 0.14: Phase 0 e2e verification

**Files:**
- Create: `apps/studio/test/e2e/codegen-targets.spec.ts`

- [ ] **Step 1: Write the Playwright spec**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { test, expect } from '@playwright/test';

test.describe('Codegen targets table', () => {
  test('renders three rows for Phase 0', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="codegen-targets-table"]');
    await expect(page.getByRole('row', { name: /Zod/i })).toBeVisible();
    await expect(page.getByRole('row', { name: /TypeScript/i })).toBeVisible();
    await expect(page.getByRole('row', { name: /JSON Schema/i })).toBeVisible();
    await expect(page.getByRole('row', { name: /Excel/i })).toHaveCount(0);
  });

  test('Preview round-trip on Zod', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="codegen-targets-table"]');

    await page.getByTestId('preview-zod').click();
    await expect(page.getByTestId('back-to-targets')).toBeVisible();
    await expect(page.getByTestId('preview-target-select')).toBeVisible();

    await page.getByTestId('back-to-targets').click();
    await expect(page.getByTestId('codegen-targets-table')).toBeVisible();
  });

  test('Download triggers a network request and a download event', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="codegen-targets-table"]');

    const [download, request] = await Promise.all([
      page.waitForEvent('download'),
      page.waitForRequest((r) => r.url().includes('/api/codegen') && r.method() === 'POST'),
      page.getByTestId('download-typescript').click()
    ]);

    expect(request.url()).toContain('/api/codegen');
    expect(download.suggestedFilename()).toMatch(/\.(ts|zip)$/);
  });
});
```

- [ ] **Step 2: Run e2e**

The Download test requires the Pages dev proxy from Task 0.13. Update `playwright.config.ts` if needed to point at port 8788 instead of 5173.

```bash
pnpm --filter @rune-langium/studio test:e2e -- codegen-targets.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/studio/test/e2e/codegen-targets.spec.ts apps/studio/playwright.config.ts
git commit -m "test(studio): e2e for codegen targets table (018 Phase 0)"
```

---

# Phase 1 — Excel Emitter ✅ MERGED in PR #167

> Excel emitter shipped in `7fb790c8`. Tasks below describe the design as-planned; the current implementation lives in `packages/codegen/src/emit/excel-emitter.ts` and its fixture suite in `packages/codegen/test/emit/excel-emitter.test.ts`. Notable post-spec deltas:
> - `workbook.modified` is also pinned to epoch 0 (not just `workbook.created`) for SC-007 byte determinism.
> - Types sheet iterates `walk.emitOrder` (topo-sort) instead of `dataByName` insertion order.
> - `superType` / `typeAlias` base-type cells fall back to `$refText` for primitive bases that don't resolve to an AST node.
> - Conditions sheet's Expression column uses `condition.expression.$cstNode.text` (just the body), not the whole condition's text.

## Task 1.1: Add `exceljs` dependency

**Files:**
- Modify: `packages/codegen/package.json`

- [ ] **Step 1: Add the dependency**

In `packages/codegen/package.json`, add to `dependencies`:

```json
"exceljs": "^4.4.0"
```

```bash
pnpm install
```

- [ ] **Step 2: Commit**

```bash
git add packages/codegen/package.json pnpm-lock.yaml
git commit -m "build(codegen): add exceljs dependency (018 Phase 1)"
```

## Task 1.2: Implement Excel emitter — Types sheet

**Files:**
- Create: `packages/codegen/src/emit/excel-emitter.ts`
- Create: `packages/codegen/test/emit/excel-emitter.test.ts`
- Modify: `packages/codegen/src/generator.ts` (register `excel`)

- [ ] **Step 1: Write the failing test**

Create `packages/codegen/test/emit/excel-emitter.test.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../../src/index.js';

const RUNE_SOURCE = `
namespace cdm.base.math
type Quantity:
  amount number (1..1)
  currency string (0..1)
type MeasureBase:
  multiplier number (0..1)
type Mass extends MeasureBase:
  kilograms number (1..1)
`;

async function parse() {
  const services = createRuneDslServices({ workspaceUri: undefined }).RuneDsl;
  const doc = services.shared.workspace.LangiumDocumentFactory.fromString(
    RUNE_SOURCE, URI.parse('file:///test.rune')
  );
  await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });
  return doc;
}

describe('ExcelWholeModelEmitter — Types sheet', () => {
  it('produces a single .xlsx output', async () => {
    const doc = await parse();
    const outputs = await generate(doc, { target: 'excel' });
    expect(outputs).toHaveLength(1);
    expect(outputs[0].relativePath).toBe('model.xlsx');
    expect(outputs[0].mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(outputs[0].binary).toBeInstanceOf(Uint8Array);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(outputs[0].binary!.buffer as ArrayBuffer);
    const types = wb.getWorksheet('Types');
    expect(types).toBeDefined();

    const header = types!.getRow(1).values as unknown[];
    expect(header).toContain('Namespace');
    expect(header).toContain('Type');
    expect(header).toContain('Extends');
    expect(header).toContain('Attribute');
    expect(header).toContain('Attribute Type');
    expect(header).toContain('Cardinality');
  });

  it('marks Mass as extending MeasureBase', async () => {
    const doc = await parse();
    const outputs = await generate(doc, { target: 'excel' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(outputs[0].binary!.buffer as ArrayBuffer);
    const types = wb.getWorksheet('Types')!;
    const rows: string[][] = [];
    types.eachRow({ includeEmpty: false }, (row) => {
      rows.push((row.values as unknown[]).map((v) => String(v ?? '')));
    });
    const massHeader = rows.find((r) => r.includes('Mass') && r.includes('MeasureBase'));
    expect(massHeader).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/codegen test -- excel-emitter.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the emitter (Types sheet only)**

Create `packages/codegen/src/emit/excel-emitter.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import ExcelJS from 'exceljs';
import type { GeneratorOptions, GeneratorOutput } from '../types.js';
import type { WholeModelEmitter } from './namespace-emitter.js';
import type { NamespaceRegistry } from './namespace-registry.js';
import type { NamespaceWalkResult } from './namespace-walker.js';

const TYPES_HEADER = [
  'Namespace', 'Type', 'Extends', 'Description',
  'Attribute', 'Attribute Type', 'Cardinality',
  'Attribute Description', 'Inherited From'
] as const;

function cardinalityString(min: number | undefined, max: number | 'unbounded' | undefined): string {
  const lo = min ?? 0;
  const hi = max === undefined ? 1 : max;
  return `(${lo}..${hi})`;
}

export class ExcelWholeModelEmitter implements WholeModelEmitter {
  async emit(
    walks: ReadonlyMap<string, NamespaceWalkResult>,
    _registry: NamespaceRegistry,
    _options: GeneratorOptions
  ): Promise<GeneratorOutput[]> {
    const wb = new ExcelJS.Workbook();
    wb.creator = '@rune-langium/codegen';

    const typesSheet = wb.addWorksheet('Types');
    typesSheet.addRow(TYPES_HEADER as unknown as string[]);
    typesSheet.getRow(1).font = { bold: true };
    typesSheet.views = [{ state: 'frozen', ySplit: 1 }];
    typesSheet.autoFilter = { from: 'A1', to: `I1` };

    for (const [namespace, walk] of walks) {
      for (const typeName of Array.from(walk.dataByName.keys()).sort()) {
        const data = walk.dataByName.get(typeName)!;
        const parent = data.superType?.ref?.name ?? '';
        typesSheet.addRow([namespace, typeName, parent, data.description ?? '', '', '', '', '', '']);

        for (const attr of data.attributes ?? []) {
          const attrType = attr.type?.ref?.name ?? attr.type?.$refText ?? '';
          const card = cardinalityString(attr.cardinality?.min, attr.cardinality?.max);
          typesSheet.addRow([
            namespace, typeName, parent, '',
            attr.name, attrType, card,
            attr.description ?? '', ''
          ]);
        }
      }
    }

    typesSheet.columns?.forEach((col) => {
      let max = 10;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = String(cell.value ?? '').length;
        if (len > max) max = len;
      });
      col.width = Math.min(max + 2, 60);
    });

    const buffer = await wb.xlsx.writeBuffer();
    return [{
      relativePath: 'model.xlsx',
      content: '',
      sourceMap: [],
      diagnostics: [],
      funcs: [],
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      binary: new Uint8Array(buffer as ArrayBuffer)
    }];
  }
}
```

Register in `packages/codegen/src/generator.ts`:

```ts
import { ExcelWholeModelEmitter } from './emit/excel-emitter.js';
// In EMITTER_CLASSES:
excel: ExcelWholeModelEmitter
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/codegen test -- excel-emitter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/emit/excel-emitter.ts packages/codegen/src/generator.ts packages/codegen/test/emit/excel-emitter.test.ts
git commit -m "feat(codegen): Excel emitter — Types sheet and registration (018 Phase 1)"
```

## Task 1.3: Excel — Enums sheet

**Files:**
- Modify: `packages/codegen/src/emit/excel-emitter.ts`
- Modify: `packages/codegen/test/emit/excel-emitter.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `excel-emitter.test.ts`:

```ts
describe('ExcelWholeModelEmitter — Enums sheet', () => {
  it('emits an Enums sheet with one row per enum value', async () => {
    const source = `
namespace cdm.base.dates
enum DayCountFractionEnum:
  ACT_360 displayName "ACT/360"
  ACT_365_FIXED displayName "ACT/365.FIXED"
`;
    const services = createRuneDslServices({ workspaceUri: undefined }).RuneDsl;
    const doc = services.shared.workspace.LangiumDocumentFactory.fromString(
      source, URI.parse('file:///dates.rune')
    );
    await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });

    const outputs = await generate(doc, { target: 'excel' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(outputs[0].binary!.buffer as ArrayBuffer);
    const enums = wb.getWorksheet('Enums');
    expect(enums).toBeDefined();
    const header = enums!.getRow(1).values as unknown[];
    expect(header).toContain('Enum');
    expect(header).toContain('Value');
    expect(header).toContain('Display Name');

    const rows: string[][] = [];
    enums!.eachRow({ includeEmpty: false }, (r) => rows.push((r.values as unknown[]).map((v) => String(v ?? ''))));
    expect(rows.some((r) => r.includes('ACT_360'))).toBe(true);
    expect(rows.some((r) => r.includes('ACT/360'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/codegen test -- excel-emitter.test.ts
```

Expected: FAIL — no Enums sheet.

- [ ] **Step 3: Implement Enums sheet**

In `excel-emitter.ts`, before `writeBuffer`, add:

```ts
const enumsSheet = wb.addWorksheet('Enums');
enumsSheet.addRow(['Namespace', 'Enum', 'Description', 'Value', 'Display Name', 'Value Description']);
enumsSheet.getRow(1).font = { bold: true };
enumsSheet.views = [{ state: 'frozen', ySplit: 1 }];
enumsSheet.autoFilter = { from: 'A1', to: 'F1' };

for (const [namespace, walk] of walks) {
  for (const enumName of Array.from(walk.enumByName.keys()).sort()) {
    const e = walk.enumByName.get(enumName)!;
    enumsSheet.addRow([namespace, enumName, e.description ?? '', '', '', '']);
    for (const v of e.values ?? []) {
      enumsSheet.addRow([namespace, enumName, '', v.name, v.displayName ?? '', v.description ?? '']);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/codegen test -- excel-emitter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/emit/excel-emitter.ts packages/codegen/test/emit/excel-emitter.test.ts
git commit -m "feat(codegen): Excel emitter — Enums sheet (018 Phase 1)"
```

## Task 1.4: Excel — Conditions, Functions, Rules, Summary sheets

**Files:**
- Modify: `packages/codegen/src/emit/excel-emitter.ts`
- Modify: `packages/codegen/test/emit/excel-emitter.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `excel-emitter.test.ts`:

```ts
describe('ExcelWholeModelEmitter — remaining sheets', () => {
  it('emits Conditions, Functions, Rules, Summary sheets', async () => {
    const source = `
namespace cdm.base.math
type Quantity:
  amount number (1..1)
  condition NonNegative:
    amount >= 0
`;
    const services = createRuneDslServices({ workspaceUri: undefined }).RuneDsl;
    const doc = services.shared.workspace.LangiumDocumentFactory.fromString(
      source, URI.parse('file:///x.rune')
    );
    await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });
    const outputs = await generate(doc, { target: 'excel' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(outputs[0].binary!.buffer as ArrayBuffer);
    expect(wb.getWorksheet('Conditions')).toBeDefined();
    expect(wb.getWorksheet('Functions')).toBeDefined();
    expect(wb.getWorksheet('Rules')).toBeDefined();
    expect(wb.getWorksheet('Summary')).toBeDefined();

    const summary = wb.getWorksheet('Summary')!;
    const rows: unknown[][] = [];
    summary.eachRow({ includeEmpty: false }, (r) => rows.push(r.values as unknown[]));
    expect(rows.length).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/codegen test -- excel-emitter.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the remaining sheets**

In `excel-emitter.ts`, before `writeBuffer`, add:

```ts
const conditionsSheet = wb.addWorksheet('Conditions');
conditionsSheet.addRow(['Namespace', 'Type', 'Condition Name', 'Kind', 'Expression', 'Description']);
conditionsSheet.getRow(1).font = { bold: true };
conditionsSheet.views = [{ state: 'frozen', ySplit: 1 }];
conditionsSheet.autoFilter = { from: 'A1', to: 'F1' };

for (const [namespace, walk] of walks) {
  for (const [typeName, data] of walk.dataByName) {
    for (const cond of data.conditions ?? []) {
      conditionsSheet.addRow([
        namespace, typeName, cond.name ?? '',
        cond.kind ?? 'expression',
        cond.expression?.$cstNode?.text ?? '',
        cond.description ?? ''
      ]);
    }
  }
}

const functionsSheet = wb.addWorksheet('Functions');
functionsSheet.addRow(['Namespace', 'Function', 'Input Type', 'Output Type', 'Description']);
functionsSheet.getRow(1).font = { bold: true };
functionsSheet.views = [{ state: 'frozen', ySplit: 1 }];
functionsSheet.autoFilter = { from: 'A1', to: 'E1' };

for (const [namespace, walk] of walks) {
  for (const [funcName, func] of walk.libraryFuncsByName ?? new Map()) {
    const inputs = (func.params ?? []).map((p: { name: string; type?: { $refText?: string } }) =>
      `${p.name}: ${p.type?.$refText ?? '?'}`
    ).join(', ');
    const output = func.outputType?.$refText ?? '?';
    functionsSheet.addRow([namespace, funcName, inputs, output, func.description ?? '']);
  }
}

const rulesSheet = wb.addWorksheet('Rules');
rulesSheet.addRow(['Namespace', 'Rule', 'Kind', 'Input Type', 'Description']);
rulesSheet.getRow(1).font = { bold: true };
rulesSheet.views = [{ state: 'frozen', ySplit: 1 }];
rulesSheet.autoFilter = { from: 'A1', to: 'E1' };

for (const [namespace, walk] of walks) {
  for (const [ruleName, rule] of walk.rulesByName ?? new Map()) {
    rulesSheet.addRow([
      namespace, ruleName, rule.kind ?? 'eligibility',
      rule.inputType?.$refText ?? '?', rule.description ?? ''
    ]);
  }
}

const summarySheet = wb.addWorksheet('Summary');
summarySheet.addRow(['Namespace', 'Types', 'Enums', 'Conditions', 'Functions', 'Rules']);
summarySheet.getRow(1).font = { bold: true };
summarySheet.views = [{ state: 'frozen', ySplit: 1 }];
summarySheet.autoFilter = { from: 'A1', to: 'F1' };

for (const [namespace, walk] of walks) {
  let conditionCount = 0;
  for (const data of walk.dataByName.values()) {
    conditionCount += (data.conditions ?? []).length;
  }
  summarySheet.addRow([
    namespace,
    walk.dataByName.size,
    walk.enumByName.size,
    conditionCount,
    walk.libraryFuncsByName?.size ?? 0,
    walk.rulesByName?.size ?? 0
  ]);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/codegen test -- excel-emitter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/emit/excel-emitter.ts packages/codegen/test/emit/excel-emitter.test.ts
git commit -m "feat(codegen): Excel emitter — Conditions/Functions/Rules/Summary sheets (018 Phase 1)"
```

## Task 1.5: Excel — Cross-sheet hyperlinks for attribute types

**Files:**
- Modify: `packages/codegen/src/emit/excel-emitter.ts`
- Modify: `packages/codegen/test/emit/excel-emitter.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `excel-emitter.test.ts`:

```ts
describe('ExcelWholeModelEmitter — hyperlinks', () => {
  it('attribute type cells link to the corresponding Types-sheet row', async () => {
    const source = `
namespace cdm.base.math
type Quantity:
  amount number (1..1)
type Trade:
  notional Quantity (1..1)
`;
    const services = createRuneDslServices({ workspaceUri: undefined }).RuneDsl;
    const doc = services.shared.workspace.LangiumDocumentFactory.fromString(
      source, URI.parse('file:///x.rune')
    );
    await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });
    const outputs = await generate(doc, { target: 'excel' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(outputs[0].binary!.buffer as ArrayBuffer);
    const types = wb.getWorksheet('Types')!;

    let foundHyperlink = false;
    types.eachRow({ includeEmpty: false }, (row) => {
      const vals = row.values as unknown[];
      if (vals.includes('Trade') && vals.includes('notional')) {
        const typeCell = row.getCell(6);
        if (typeCell.value && typeof typeCell.value === 'object' && 'hyperlink' in typeCell.value) {
          foundHyperlink = true;
        }
      }
    });
    expect(foundHyperlink).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/codegen test -- excel-emitter.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Refactor to two-pass emission**

In `excel-emitter.ts`, replace the Types-sheet emission loop with a two-pass version. First pass tracks group-header row numbers per FQN; second pass scans attribute rows and adds hyperlinks where the target type is in the map:

```ts
const typeRowMap = new Map<string, number>(); // 'namespace.TypeName' -> group-header row
let currentRow = 1;

for (const [namespace, walk] of walks) {
  for (const typeName of Array.from(walk.dataByName.keys()).sort()) {
    const data = walk.dataByName.get(typeName)!;
    const parent = data.superType?.ref?.name ?? '';
    currentRow++;
    typeRowMap.set(`${namespace}.${typeName}`, currentRow);
    typesSheet.addRow([namespace, typeName, parent, data.description ?? '', '', '', '', '', '']);

    for (const attr of data.attributes ?? []) {
      currentRow++;
      const attrType = attr.type?.ref?.name ?? attr.type?.$refText ?? '';
      const card = cardinalityString(attr.cardinality?.min, attr.cardinality?.max);
      typesSheet.addRow([
        namespace, typeName, parent, '',
        attr.name, attrType, card,
        attr.description ?? '', ''
      ]);
    }
  }
}

// Second pass: add hyperlinks. Same-namespace first, then any.
typesSheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
  if (rowNum === 1) return;
  const typeCell = row.getCell(6);
  if (typeof typeCell.value !== 'string' || !typeCell.value) return;

  const ns = row.getCell(1).value as string;
  const sameNs = `${ns}.${typeCell.value}`;
  const sameNsRow = typeRowMap.get(sameNs);
  if (sameNsRow) {
    typeCell.value = { text: typeCell.value, hyperlink: `#'Types'!A${sameNsRow}` };
    return;
  }
  for (const [fqn, targetRow] of typeRowMap) {
    if (fqn.endsWith(`.${typeCell.value}`)) {
      typeCell.value = { text: typeCell.value, hyperlink: `#'Types'!A${targetRow}` };
      return;
    }
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/codegen test -- excel-emitter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/emit/excel-emitter.ts packages/codegen/test/emit/excel-emitter.test.ts
git commit -m "feat(codegen): Excel emitter — cross-sheet hyperlinks for attribute types (018 Phase 1)"
```

## Task 1.6: Excel — Conditional formatting on cardinality

**Files:**
- Modify: `packages/codegen/src/emit/excel-emitter.ts`
- Modify: `packages/codegen/test/emit/excel-emitter.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `excel-emitter.test.ts`:

```ts
describe('ExcelWholeModelEmitter — formatting', () => {
  it('applies conditional formatting on the Cardinality column', async () => {
    const source = `
namespace x
type T:
  a number (1..1)
  b number (0..1)
`;
    const services = createRuneDslServices({ workspaceUri: undefined }).RuneDsl;
    const doc = services.shared.workspace.LangiumDocumentFactory.fromString(
      source, URI.parse('file:///x.rune')
    );
    await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });
    const outputs = await generate(doc, { target: 'excel' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(outputs[0].binary!.buffer as ArrayBuffer);
    const types = wb.getWorksheet('Types')!;

    const cf = (types as unknown as { conditionalFormattings?: unknown[] }).conditionalFormattings;
    expect(Array.isArray(cf)).toBe(true);
    expect((cf as unknown[]).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/codegen test -- excel-emitter.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Add the conditional formatting**

In `excel-emitter.ts`, after the Types sheet rows are written, add:

```ts
typesSheet.addConditionalFormatting({
  ref: `G2:G${currentRow}`,
  rules: [
    { type: 'containsText', operator: 'containsText', text: '(1..1)', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFD0F0C0' } } }, priority: 1 },
    { type: 'containsText', operator: 'containsText', text: '(0..1)', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFF5C0' } } }, priority: 2 },
    { type: 'containsText', operator: 'containsText', text: '(1..*)', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC0E0FF' } } }, priority: 3 },
    { type: 'containsText', operator: 'containsText', text: '(0..*)', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFD0D0D0' } } }, priority: 4 }
  ]
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/codegen test -- excel-emitter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/emit/excel-emitter.ts packages/codegen/test/emit/excel-emitter.test.ts
git commit -m "feat(codegen): Excel emitter — conditional formatting on cardinality (018 Phase 1)"
```

## Task 1.7: CDM smoke test for Excel

**Files:**
- Modify: `packages/codegen/test/cdm-smoke.test.ts`

- [ ] **Step 1: Append the smoke test**

```ts
import ExcelJS from 'exceljs';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('CDM Excel smoke test', () => {
  it.skipIf(!existsSync('.resources/cdm/'))('produces an xlsx with row counts matching CDM size', async () => {
    const services = createRuneDslServices({ workspaceUri: undefined }).RuneDsl;
    const collect = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
      .flatMap((e) => e.isDirectory() ? collect(join(dir, e.name)) : (e.name.endsWith('.rune') ? [join(dir, e.name)] : []));
    const paths = collect('.resources/cdm');
    const docs = await Promise.all(paths.map(async (p) =>
      services.shared.workspace.LangiumDocumentFactory.fromString(await readFile(p, 'utf-8'), URI.file(p))
    ));
    await services.shared.workspace.DocumentBuilder.build(docs, { validation: false });

    const outputs = await generate(docs, { target: 'excel' });
    expect(outputs).toHaveLength(1);
    expect(outputs[0].binary).toBeInstanceOf(Uint8Array);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(outputs[0].binary!.buffer as ArrayBuffer);
    expect(wb.getWorksheet('Types')!.rowCount).toBeGreaterThan(100);
  });
});
```

- [ ] **Step 2: Run**

```bash
pnpm --filter @rune-langium/codegen test -- cdm-smoke.test.ts
```

Expected: SKIP (if `.resources/cdm/` absent) or PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/codegen/test/cdm-smoke.test.ts
git commit -m "test(codegen): CDM smoke test for Excel emitter (018 Phase 1)"
```

## Task 1.8: Register Excel in studio and e2e test

**Files:**
- Modify: `apps/studio/src/components/CodePreviewPanel.tsx`
- Modify: `apps/studio/test/e2e/codegen-targets.spec.ts`

- [ ] **Step 1: Extend REGISTERED**

```ts
const REGISTERED: ReadonlySet<Target> = new Set(['zod', 'typescript', 'json-schema', 'excel']);
```

- [ ] **Step 2: Add e2e for Excel Download**

Append to `apps/studio/test/e2e/codegen-targets.spec.ts`:

```ts
test('Excel Download returns an xlsx', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[data-testid="codegen-targets-table"]');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('download-excel').click()
  ]);
  expect(download.suggestedFilename()).toBe('model.xlsx');
});
```

- [ ] **Step 3: Run**

```bash
pnpm --filter @rune-langium/studio test:e2e -- codegen-targets.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/components/CodePreviewPanel.tsx apps/studio/test/e2e/codegen-targets.spec.ts
git commit -m "feat(studio): register Excel target (018 Phase 1)"
```

---

# Phase 2 — SQL DDL + Markdown Emitters ⏳ PENDING

> **Architecture update vs spec:** both SQL and Markdown are now per-namespace targets dispatched via `GenericModelEmitter` + `LanguageProfile` (the abstraction introduced in Phase 0.5). Each ships:
> - A `NamespaceEmitter` implementation (`SqlNamespaceEmitter`, `MarkdownNamespaceEmitter`) that respects `options.suppressBoilerplate`.
> - A `LanguageProfile` (`sqlProfile`, `markdownProfile`) with `makeBarrel` / `concatenate` / `makeSharedArtifacts`.
> - Registration in `NAMESPACE_EMITTERS` and `PROFILES`.
>
> The tasks below describe the design as-planned; refer to PR #167 (Excel) and the Phase 0.5 PRs for the post-LanguageProfile patterns to mirror.

Tasks 2A.* and 2B.* are independent; either can land first.

## Task 2A.1: SQL dialect strategy

**Files:**
- Modify: `packages/codegen/package.json` (add `node-sql-parser` as devDep)
- Create: `packages/codegen/src/emit/sql-dialect.ts`
- Create: `packages/codegen/test/emit/sql-dialect.test.ts`

- [ ] **Step 1: Add the dev dependency**

In `packages/codegen/package.json`, add to `devDependencies`:

```json
"node-sql-parser": "^5.3.0"
```

```bash
pnpm install
```

- [ ] **Step 2: Write the failing test**

Create `packages/codegen/test/emit/sql-dialect.test.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { PostgresDialect, SqlServerDialect, type SqlDialect } from '../../src/emit/sql-dialect.js';

describe('PostgresDialect', () => {
  const d: SqlDialect = new PostgresDialect();
  it('quotes identifiers with double quotes', () => {
    expect(d.quoteIdent('order')).toBe('"order"');
  });
  it('maps Rune types', () => {
    expect(d.typeOf('string')).toBe('TEXT');
    expect(d.typeOf('int')).toBe('INTEGER');
    expect(d.typeOf('number')).toBe('NUMERIC');
    expect(d.typeOf('boolean')).toBe('BOOLEAN');
    expect(d.typeOf('zonedDateTime')).toBe('TIMESTAMPTZ');
  });
});

describe('SqlServerDialect', () => {
  const d: SqlDialect = new SqlServerDialect();
  it('quotes identifiers with brackets', () => {
    expect(d.quoteIdent('order')).toBe('[order]');
  });
  it('maps Rune types', () => {
    expect(d.typeOf('string')).toBe('NVARCHAR(MAX)');
    expect(d.typeOf('boolean')).toBe('BIT');
    expect(d.typeOf('zonedDateTime')).toBe('DATETIMEOFFSET');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/codegen test -- sql-dialect.test.ts
```

Expected: FAIL — file does not exist.

- [ ] **Step 4: Implement the dialect**

Create `packages/codegen/src/emit/sql-dialect.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

export type RuneBasicType = 'string' | 'int' | 'number' | 'boolean' | 'date' | 'time' | 'zonedDateTime';

export interface SqlDialect {
  readonly name: 'postgres' | 'sqlserver';
  quoteIdent(name: string): string;
  typeOf(runeType: RuneBasicType): string;
  enumCheckConstraint(column: string, values: ReadonlyArray<string>): string;
}

export class PostgresDialect implements SqlDialect {
  readonly name = 'postgres';
  quoteIdent(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }
  typeOf(runeType: RuneBasicType): string {
    switch (runeType) {
      case 'string': return 'TEXT';
      case 'int': return 'INTEGER';
      case 'number': return 'NUMERIC';
      case 'boolean': return 'BOOLEAN';
      case 'date': return 'DATE';
      case 'time': return 'TIME';
      case 'zonedDateTime': return 'TIMESTAMPTZ';
    }
  }
  enumCheckConstraint(column: string, values: ReadonlyArray<string>): string {
    const list = values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ');
    return `CHECK (${this.quoteIdent(column)} IN (${list}))`;
  }
}

export class SqlServerDialect implements SqlDialect {
  readonly name = 'sqlserver';
  quoteIdent(name: string): string {
    return `[${name.replace(/]/g, ']]')}]`;
  }
  typeOf(runeType: RuneBasicType): string {
    switch (runeType) {
      case 'string': return 'NVARCHAR(MAX)';
      case 'int': return 'INT';
      case 'number': return 'DECIMAL(19,4)';
      case 'boolean': return 'BIT';
      case 'date': return 'DATE';
      case 'time': return 'TIME';
      case 'zonedDateTime': return 'DATETIMEOFFSET';
    }
  }
  enumCheckConstraint(column: string, values: ReadonlyArray<string>): string {
    const list = values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ');
    return `CHECK (${this.quoteIdent(column)} IN (${list}))`;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/codegen test -- sql-dialect.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/codegen/package.json pnpm-lock.yaml packages/codegen/src/emit/sql-dialect.ts packages/codegen/test/emit/sql-dialect.test.ts
git commit -m "feat(codegen): SQL dialect strategy (Postgres + SQL Server) (018 Phase 2A)"
```

## Task 2A.2: SQL emitter — single-table, scalars, CHECK enums

**Files:**
- Create: `packages/codegen/src/emit/sql-emitter.ts`
- Create: `packages/codegen/test/emit/sql-emitter.test.ts`
- Modify: `packages/codegen/src/generator.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/codegen/test/emit/sql-emitter.test.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { Parser } from 'node-sql-parser';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../../src/index.js';

async function gen(source: string, options: Parameters<typeof generate>[1] = {}): Promise<string> {
  const services = createRuneDslServices({ workspaceUri: undefined }).RuneDsl;
  const doc = services.shared.workspace.LangiumDocumentFactory.fromString(
    source, URI.parse('file:///x.rune')
  );
  await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });
  const outputs = await generate(doc, { ...options, target: 'sql' });
  return outputs.filter((o) => o.relativePath !== '_all.sql').map((o) => o.content).join('\n');
}

describe('SQL emitter — Postgres', () => {
  it('emits CREATE TABLE with NOT NULL and nullable per cardinality', async () => {
    const sql = await gen(`
namespace x
type T:
  required_field string (1..1)
  optional_field number (0..1)
`);
    expect(sql).toMatch(/CREATE TABLE\s+"x_T"/);
    expect(sql).toMatch(/"required_field"\s+TEXT\s+NOT NULL/);
    expect(sql).toMatch(/"optional_field"\s+NUMERIC(?!\s+NOT NULL)/);
  });

  it('parses cleanly via node-sql-parser', async () => {
    const sql = await gen(`
namespace x
type T:
  a string (1..1)
`);
    const parser = new Parser();
    expect(() => parser.astify(sql, { database: 'postgresql' })).not.toThrow();
  });

  it('emits _type discriminator for single-table inheritance', async () => {
    const sql = await gen(`
namespace x
type Parent:
  pa string (1..1)
type Child extends Parent:
  ca string (1..1)
`);
    expect(sql).toMatch(/"_type"\s+TEXT\s+NOT NULL/);
  });

  it('emits CHECK constraint for enum', async () => {
    const sql = await gen(`
namespace x
enum Color:
  RED
  BLUE
type T:
  c Color (1..1)
`);
    expect(sql).toMatch(/CHECK\s*\(\s*"c"\s+IN\s*\(\s*'RED'\s*,\s*'BLUE'\s*\)\s*\)/);
  });
});

describe('SQL emitter — SQL Server', () => {
  it('uses bracket quoting and BIT for boolean', async () => {
    const sql = await gen(`
namespace x
type T:
  flag boolean (1..1)
`, { sql: { dialect: 'sqlserver' } } as never);
    expect(sql).toMatch(/CREATE TABLE\s+\[x_T\]/);
    expect(sql).toMatch(/\[flag\]\s+BIT\s+NOT NULL/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/codegen test -- sql-emitter.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the emitter**

Create `packages/codegen/src/emit/sql-emitter.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { Data, RosettaEnumeration } from '@rune-langium/core';
import type { GeneratorOptions, GeneratorOutput } from '../types.js';
import type { NamespaceEmitter } from './namespace-emitter.js';
import type { NamespaceRegistry } from './namespace-registry.js';
import { getTargetRelativePath, type NamespaceWalkResult } from './namespace-walker.js';
import { PostgresDialect, SqlServerDialect, type RuneBasicType, type SqlDialect } from './sql-dialect.js';

const BASIC_TYPES: ReadonlySet<string> = new Set([
  'string', 'int', 'number', 'boolean', 'date', 'time', 'zonedDateTime'
]);

function toSnakeCase(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
}

export interface SqlOptions {
  dialect?: 'postgres' | 'sqlserver';
  inheritance?: 'single-table' | 'table-per-type';
  enumStrategy?: 'check' | 'table';
}

interface ExtendedOptions extends GeneratorOptions {
  sql?: SqlOptions;
}

export class SqlNamespaceEmitter implements NamespaceEmitter {
  private readonly dialect: SqlDialect;
  private readonly inheritance: 'single-table' | 'table-per-type';
  private readonly enumStrategy: 'check' | 'table';
  private readonly enums = new Map<string, RosettaEnumeration>();
  private readonly out: string[] = [];

  constructor(
    private readonly model: NamespaceWalkResult,
    options: GeneratorOptions,
    private readonly _registry: NamespaceRegistry
  ) {
    const sql = (options as ExtendedOptions).sql ?? {};
    this.dialect = sql.dialect === 'sqlserver' ? new SqlServerDialect() : new PostgresDialect();
    this.inheritance = sql.inheritance ?? 'single-table';
    this.enumStrategy = sql.enumStrategy ?? 'check';
  }

  emitEnumeration(e: RosettaEnumeration): void {
    this.enums.set(e.name, e);
    if (this.enumStrategy === 'table') {
      const table = this.dialect.quoteIdent(toSnakeCase(`${this.model.namespace.replace(/\./g, '_')}_${e.name}_enum`));
      this.out.push(`CREATE TABLE ${table} (`);
      this.out.push(`  ${this.dialect.quoteIdent('value')} ${this.dialect.typeOf('string')} PRIMARY KEY`);
      this.out.push(`);`);
      for (const v of e.values ?? []) {
        this.out.push(`INSERT INTO ${table} VALUES ('${v.name.replace(/'/g, "''")}');`);
      }
      this.out.push('');
    }
  }

  emitTypeAlias(): void { /* skipped in SQL */ }

  emitData(data: Data): void {
    const ns = this.model.namespace.replace(/\./g, '_');
    const tableName = this.dialect.quoteIdent(`${ns}_${data.name}`);
    this.out.push(`CREATE TABLE ${tableName} (`);

    const lines: string[] = [`  ${this.dialect.quoteIdent('id')} ${this.dialect.typeOf('string')} PRIMARY KEY`];

    const attrs: Array<{ name: string; type: string; nullable: boolean; isMulti: boolean }> = [];
    const collectFrom = (d: Data | undefined): void => {
      if (!d) return;
      if (this.inheritance === 'single-table' && d.superType?.ref) {
        collectFrom(d.superType.ref as Data);
      }
      for (const a of d.attributes ?? []) {
        const card = a.cardinality;
        const isMulti = (card?.max === 'unbounded') || (typeof card?.max === 'number' && card.max > 1);
        const nullable = (card?.min ?? 0) === 0;
        const typeName = a.type?.$refText ?? a.type?.ref?.name ?? 'string';
        attrs.push({ name: toSnakeCase(a.name), type: typeName, nullable, isMulti });
      }
    };
    collectFrom(data);

    for (const a of attrs) {
      if (a.isMulti) continue;
      let colType: string;
      let check = '';
      if (BASIC_TYPES.has(a.type)) {
        colType = this.dialect.typeOf(a.type as RuneBasicType);
      } else if (this.enums.has(a.type)) {
        colType = this.dialect.typeOf('string');
        if (this.enumStrategy === 'check') {
          const e = this.enums.get(a.type)!;
          const vals = (e.values ?? []).map((v) => v.name);
          check = ' ' + this.dialect.enumCheckConstraint(a.name, vals);
        }
      } else {
        colType = this.dialect.typeOf('string');
      }
      const notNull = a.nullable ? '' : ' NOT NULL';
      lines.push(`  ${this.dialect.quoteIdent(a.name)} ${colType}${notNull}${check}`);
    }

    if (this.inheritance === 'single-table') {
      lines.push(`  ${this.dialect.quoteIdent('_type')} ${this.dialect.typeOf('string')} NOT NULL`);
    }

    this.out.push(lines.join(',\n'));
    this.out.push(`);`);
    this.out.push('');

    for (const a of attrs) {
      if (!a.isMulti) continue;
      const jt = this.dialect.quoteIdent(`${ns}_${data.name}_${a.name}`);
      const colType = BASIC_TYPES.has(a.type)
        ? this.dialect.typeOf(a.type as RuneBasicType)
        : this.dialect.typeOf('string');
      this.out.push(`CREATE TABLE ${jt} (`);
      this.out.push(`  ${this.dialect.quoteIdent('parent_id')} ${this.dialect.typeOf('string')} NOT NULL,`);
      this.out.push(`  ${this.dialect.quoteIdent('position')} INTEGER NOT NULL,`);
      this.out.push(`  ${this.dialect.quoteIdent(a.name)} ${colType} NOT NULL,`);
      this.out.push(`  PRIMARY KEY (${this.dialect.quoteIdent('parent_id')}, ${this.dialect.quoteIdent('position')}),`);
      this.out.push(`  FOREIGN KEY (${this.dialect.quoteIdent('parent_id')}) REFERENCES ${tableName} (${this.dialect.quoteIdent('id')})`);
      this.out.push(`);`);
      this.out.push('');
    }
  }

  finalize(): GeneratorOutput {
    return {
      relativePath: getTargetRelativePath(this.model.namespace, 'sql'),
      content: this.out.join('\n'),
      sourceMap: [],
      diagnostics: [],
      funcs: []
    };
  }
}
```

Register in `packages/codegen/src/generator.ts`:

```ts
import { SqlNamespaceEmitter } from './emit/sql-emitter.js';
// In EMITTER_CLASSES:
sql: SqlNamespaceEmitter
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/codegen test -- sql-emitter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/emit/sql-emitter.ts packages/codegen/src/generator.ts packages/codegen/test/emit/sql-emitter.test.ts
git commit -m "feat(codegen): SQL emitter — Postgres+SQLServer, single-table, CHECK enums (018 Phase 2A)"
```

## Task 2A.3: SQL — table-per-type inheritance

**Files:**
- Modify: `packages/codegen/src/emit/sql-emitter.ts`
- Modify: `packages/codegen/test/emit/sql-emitter.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
describe('SQL emitter — table-per-type inheritance', () => {
  it('emits FK from child to parent', async () => {
    const sql = await gen(`
namespace x
type Parent:
  pa string (1..1)
type Child extends Parent:
  ca string (1..1)
`, { sql: { inheritance: 'table-per-type' } } as never);
    expect(sql).toMatch(/CREATE TABLE\s+"x_Child"/);
    expect(sql).toMatch(/FOREIGN KEY.*REFERENCES\s+"x_Parent"/);
    expect(sql).not.toMatch(/"_type"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/codegen test -- sql-emitter.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement TPT**

In `emitData`, branch on `this.inheritance`:

```ts
if (this.inheritance === 'table-per-type' && data.superType?.ref) {
  const parentNs = ((data.superType.ref as Data).$container as { name?: string })?.name ?? this.model.namespace;
  const parentTable = this.dialect.quoteIdent(`${parentNs.replace(/\./g, '_')}_${data.superType.ref.name}`);
  lines.push(`  FOREIGN KEY (${this.dialect.quoteIdent('id')}) REFERENCES ${parentTable} (${this.dialect.quoteIdent('id')})`);
}
```

Also, only add the `_type` discriminator when `this.inheritance === 'single-table'` — guard the existing `if` clause appropriately.

In `collectFrom`, when inheritance is `'table-per-type'`, don't walk parents — only emit own attributes.

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/codegen test -- sql-emitter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/emit/sql-emitter.ts packages/codegen/test/emit/sql-emitter.test.ts
git commit -m "feat(codegen): SQL emitter — table-per-type inheritance (018 Phase 2A)"
```

## Task 2A.4: SQL — `_all.sql` aggregator

**Files:**
- Modify: `packages/codegen/src/generator.ts`
- Modify: `packages/codegen/test/emit/sql-emitter.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
describe('SQL emitter — _all.sql aggregator', () => {
  it('emits an aggregator that sources each namespace file', async () => {
    const services = createRuneDslServices({ workspaceUri: undefined }).RuneDsl;
    const docA = services.shared.workspace.LangiumDocumentFactory.fromString(
      'namespace a\ntype TA: a string (1..1)', URI.parse('file:///a.rune')
    );
    const docB = services.shared.workspace.LangiumDocumentFactory.fromString(
      'namespace b\ntype TB: b string (1..1)', URI.parse('file:///b.rune')
    );
    await services.shared.workspace.DocumentBuilder.build([docA, docB], { validation: true });
    const outputs = await generate([docA, docB], { target: 'sql' });
    const aggregator = outputs.find((o) => o.relativePath === '_all.sql');
    expect(aggregator).toBeDefined();
    expect(aggregator!.content).toMatch(/\\i\s+'a\.sql'/);
    expect(aggregator!.content).toMatch(/\\i\s+'b\.sql'/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/codegen test -- sql-emitter.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Add the aggregator post-step**

In `runGenerate` (in `packages/codegen/src/generator.ts`), after the per-namespace loop and before `outputs.sort(...)`:

```ts
if (target === 'sql' && outputs.length > 0) {
  const namespaces = outputs.map((o) => o.relativePath.split('/').pop()!.replace(/\.sql$/, ''));
  const includeKeyword = (options as { sql?: { dialect?: string } }).sql?.dialect === 'sqlserver' ? ':r' : '\\i';
  const content = namespaces.map((n) => `${includeKeyword} '${n}.sql'`).join('\n');
  outputs.push({
    relativePath: '_all.sql',
    content,
    sourceMap: [],
    diagnostics: [],
    funcs: []
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/codegen test -- sql-emitter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/generator.ts packages/codegen/test/emit/sql-emitter.test.ts
git commit -m "feat(codegen): SQL — _all.sql aggregator (018 Phase 2A)"
```

## Task 2A.5: SQL CDM smoke test (parse-only)

**Files:**
- Modify: `packages/codegen/test/cdm-smoke.test.ts`

- [ ] **Step 1: Append the smoke test**

```ts
import { Parser } from 'node-sql-parser';

describe('CDM SQL smoke test', () => {
  it.skipIf(!existsSync('.resources/cdm/'))('generated DDL parses with node-sql-parser', async () => {
    // (Reuse the CDM fixture loading from the Excel smoke test.)
    const services = createRuneDslServices({ workspaceUri: undefined }).RuneDsl;
    const collect = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
      .flatMap((e) => e.isDirectory() ? collect(join(dir, e.name)) : (e.name.endsWith('.rune') ? [join(dir, e.name)] : []));
    const paths = collect('.resources/cdm');
    const docs = await Promise.all(paths.map(async (p) =>
      services.shared.workspace.LangiumDocumentFactory.fromString(await readFile(p, 'utf-8'), URI.file(p))
    ));
    await services.shared.workspace.DocumentBuilder.build(docs, { validation: false });
    const outputs = await generate(docs, { target: 'sql' });
    const parser = new Parser();
    for (const o of outputs.filter((x) => x.relativePath !== '_all.sql')) {
      expect(() => parser.astify(o.content, { database: 'postgresql' })).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run and commit**

```bash
pnpm --filter @rune-langium/codegen test -- cdm-smoke.test.ts
git add packages/codegen/test/cdm-smoke.test.ts
git commit -m "test(codegen): CDM SQL parse-only smoke test (018 Phase 2A)"
```

## Task 2B.1: Markdown emitter

**Files:**
- Create: `packages/codegen/src/emit/markdown-emitter.ts`
- Create: `packages/codegen/test/emit/markdown-emitter.test.ts`
- Modify: `packages/codegen/src/generator.ts` (register + emit `index.md`)

- [ ] **Step 1: Write the failing test**

Create `packages/codegen/test/emit/markdown-emitter.test.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../../src/index.js';

async function gen(source: string): Promise<{ path: string; content: string }[]> {
  const services = createRuneDslServices({ workspaceUri: undefined }).RuneDsl;
  const doc = services.shared.workspace.LangiumDocumentFactory.fromString(
    source, URI.parse('file:///x.rune')
  );
  await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });
  const outputs = await generate(doc, { target: 'markdown' });
  return outputs.map((o) => ({ path: o.relativePath, content: o.content }));
}

describe('Markdown emitter', () => {
  it('emits one .md per namespace plus index.md', async () => {
    const files = await gen(`
namespace cdm.base.math
type Quantity:
  amount number (1..1)
`);
    expect(files.find((f) => f.path === 'cdm/base/math.md')).toBeDefined();
    expect(files.find((f) => f.path === 'index.md')).toBeDefined();
  });

  it('emits attribute tables with cardinality', async () => {
    const files = await gen(`
namespace x
type T:
  a string (1..1)
  b number (0..1)
`);
    const md = files.find((f) => f.path === 'x.md')!.content;
    expect(md).toMatch(/\| Attribute\s+\| Type\s+\| Cardinality/);
    expect(md).toMatch(/\| a\s+\| `string`\s+\| \(1\.\.1\)/);
  });

  it('renders inheritance as "extends [Parent](#parent)"', async () => {
    const files = await gen(`
namespace x
type Parent:
  p string (1..1)
type Child extends Parent:
  c string (1..1)
`);
    const md = files.find((f) => f.path === 'x.md')!.content;
    expect(md).toMatch(/### Child[\s\S]*\*extends \[Parent\]\(#parent\)\*/);
  });

  it('emits enum tables', async () => {
    const files = await gen(`
namespace x
enum Color:
  RED displayName "Red"
  BLUE displayName "Blue"
`);
    const md = files.find((f) => f.path === 'x.md')!.content;
    expect(md).toMatch(/### Color/);
    expect(md).toMatch(/\| `RED`\s+\| Red/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/codegen test -- markdown-emitter.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the emitter**

Create `packages/codegen/src/emit/markdown-emitter.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { Data, RosettaEnumeration } from '@rune-langium/core';
import type { GeneratorOptions, GeneratorOutput } from '../types.js';
import type { NamespaceEmitter } from './namespace-emitter.js';
import type { NamespaceRegistry } from './namespace-registry.js';
import { getTargetRelativePath, type NamespaceWalkResult } from './namespace-walker.js';

const BASIC_TYPES: ReadonlySet<string> = new Set([
  'string', 'int', 'number', 'boolean', 'date', 'time', 'zonedDateTime'
]);

function cardinalityString(min?: number, max?: number | 'unbounded'): string {
  return `(${min ?? 0}..${max === undefined ? 1 : max})`;
}

function anchor(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export class MarkdownNamespaceEmitter implements NamespaceEmitter {
  private readonly typeSection: string[] = [];
  private readonly enumSection: string[] = [];

  constructor(
    private readonly model: NamespaceWalkResult,
    _options: GeneratorOptions,
    private readonly _registry: NamespaceRegistry
  ) {}

  emitEnumeration(e: RosettaEnumeration): void {
    this.enumSection.push(`### ${e.name}`);
    if (e.description) this.enumSection.push(`\n> ${e.description}\n`);
    this.enumSection.push('\n| Value | Display Name | Description |');
    this.enumSection.push('|-------|-------------|-------------|');
    for (const v of e.values ?? []) {
      this.enumSection.push(`| \`${v.name}\` | ${v.displayName ?? ''} | ${v.description ?? ''} |`);
    }
    this.enumSection.push('');
  }

  emitTypeAlias(): void { /* skipped in v1 */ }

  emitData(data: Data): void {
    this.typeSection.push(`### ${data.name}`);
    if (data.superType?.ref) {
      this.typeSection.push(`*extends [${data.superType.ref.name}](#${anchor(data.superType.ref.name)})*\n`);
    } else {
      this.typeSection.push('');
    }
    if (data.description) this.typeSection.push(`> ${data.description}\n`);
    this.typeSection.push('| Attribute | Type | Cardinality | Description |');
    this.typeSection.push('|-----------|------|-------------|-------------|');
    for (const a of data.attributes ?? []) {
      const typeName = a.type?.$refText ?? a.type?.ref?.name ?? '?';
      const typeCell = BASIC_TYPES.has(typeName) ? `\`${typeName}\`` : `[${typeName}](#${anchor(typeName)})`;
      const card = cardinalityString(a.cardinality?.min, a.cardinality?.max);
      this.typeSection.push(`| ${a.name} | ${typeCell} | ${card} | ${a.description ?? ''} |`);
    }
    if (data.conditions && data.conditions.length > 0) {
      this.typeSection.push('\n#### Constraints');
      for (const c of data.conditions) {
        this.typeSection.push(`- **${c.name ?? 'unnamed'}** (${c.kind ?? 'expression'}): \`${c.expression?.$cstNode?.text ?? ''}\``);
      }
    }
    this.typeSection.push('');
  }

  finalize(): GeneratorOutput {
    const parts: string[] = [`# ${this.model.namespace}`, ''];
    if (this.typeSection.length > 0) {
      parts.push('## Types', '', ...this.typeSection);
    }
    if (this.enumSection.length > 0) {
      parts.push('## Enums', '', ...this.enumSection);
    }
    return {
      relativePath: getTargetRelativePath(this.model.namespace, 'markdown'),
      content: parts.join('\n'),
      sourceMap: [],
      diagnostics: [],
      funcs: []
    };
  }
}
```

Register in `packages/codegen/src/generator.ts`:

```ts
import { MarkdownNamespaceEmitter } from './emit/markdown-emitter.js';
// In EMITTER_CLASSES:
markdown: MarkdownNamespaceEmitter
```

And add the index.md aggregator post-step in `runGenerate` (next to the SQL `_all.sql` block):

```ts
if (target === 'markdown' && outputs.length > 0) {
  const links = outputs.map((o) => {
    const ns = o.relativePath.replace(/^.*\//, '').replace(/\.md$/, '');
    return `- [${ns}](${o.relativePath})`;
  });
  outputs.push({
    relativePath: 'index.md',
    content: `# Index\n\n${links.join('\n')}\n`,
    sourceMap: [],
    diagnostics: [],
    funcs: []
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/codegen test -- markdown-emitter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/emit/markdown-emitter.ts packages/codegen/src/generator.ts packages/codegen/test/emit/markdown-emitter.test.ts
git commit -m "feat(codegen): Markdown emitter + index.md aggregator (018 Phase 2B)"
```

## Task 2B.2: Markdown CDM smoke test

**Files:**
- Modify: `packages/codegen/test/cdm-smoke.test.ts`

- [ ] **Step 1: Append the smoke test**

```ts
describe('CDM Markdown smoke test', () => {
  it.skipIf(!existsSync('.resources/cdm/'))('all cross-namespace refs resolve to emitted files', async () => {
    const services = createRuneDslServices({ workspaceUri: undefined }).RuneDsl;
    const collect = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
      .flatMap((e) => e.isDirectory() ? collect(join(dir, e.name)) : (e.name.endsWith('.rune') ? [join(dir, e.name)] : []));
    const paths = collect('.resources/cdm');
    const docs = await Promise.all(paths.map(async (p) =>
      services.shared.workspace.LangiumDocumentFactory.fromString(await readFile(p, 'utf-8'), URI.file(p))
    ));
    await services.shared.workspace.DocumentBuilder.build(docs, { validation: false });
    const outputs = await generate(docs, { target: 'markdown' });
    const emittedPaths = new Set(outputs.map((o) => o.relativePath));
    const refRegex = /\]\(([a-zA-Z0-9._\/\\-]+\.md)#?[^)]*\)/g;
    for (const o of outputs) {
      let m: RegExpExecArray | null;
      while ((m = refRegex.exec(o.content)) !== null) {
        const target = m[1];
        if (target.startsWith('#')) continue;
        expect(emittedPaths.has(target)).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Run and commit**

```bash
pnpm --filter @rune-langium/codegen test -- cdm-smoke.test.ts
git add packages/codegen/test/cdm-smoke.test.ts
git commit -m "test(codegen): CDM Markdown smoke test (018 Phase 2B)"
```

## Task 2.3: Register SQL + Markdown in studio

**Files:**
- Modify: `apps/studio/src/components/CodePreviewPanel.tsx`

- [ ] **Step 1: Extend REGISTERED**

```ts
const REGISTERED: ReadonlySet<Target> = new Set(['zod', 'typescript', 'json-schema', 'excel', 'sql', 'markdown']);
```

- [ ] **Step 2: Run e2e**

```bash
pnpm --filter @rune-langium/studio test:e2e -- codegen-targets.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/studio/src/components/CodePreviewPanel.tsx
git commit -m "feat(studio): register SQL and Markdown targets (018 Phase 2)"
```

---

# Phase 3 — GraphQL SDL Emitter ⏳ PENDING

> **Architecture update vs spec:** hand-rolled `WholeModelEmitter` (like Excel in Phase 1). Single `schema.graphql` output. Registration in `WHOLE_MODEL_EMITTERS['graphql']`. Optional `LanguageProfile` for sidecar metadata (e.g. a README explaining the schema layout) if useful — `GenericModelEmitter` is NOT used since GraphQL doesn't fit the per-namespace-then-aggregate pattern. The studio's targets table will pick it up automatically once registered (Download-only affordance per the whole-model contract).

## Task 3.1: GraphQL emitter

**Files:**
- Modify: `packages/codegen/package.json` (add `graphql` as devDep)
- Create: `packages/codegen/src/emit/graphql-emitter.ts`
- Create: `packages/codegen/test/emit/graphql-emitter.test.ts`
- Modify: `packages/codegen/src/generator.ts`

- [ ] **Step 1: Add the dependency**

In `packages/codegen/package.json`, add to `devDependencies`:

```json
"graphql": "^16.10.0"
```

```bash
pnpm install
```

- [ ] **Step 2: Write the failing test**

Create `packages/codegen/test/emit/graphql-emitter.test.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { buildSchema, parse } from 'graphql';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../../src/index.js';

async function gen(source: string): Promise<string> {
  const services = createRuneDslServices({ workspaceUri: undefined }).RuneDsl;
  const doc = services.shared.workspace.LangiumDocumentFactory.fromString(
    source, URI.parse('file:///x.rune')
  );
  await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });
  const outputs = await generate(doc, { target: 'graphql' });
  expect(outputs).toHaveLength(1);
  return outputs[0].content;
}

describe('GraphQL emitter', () => {
  it('emits object types with cardinality decorations', async () => {
    const sdl = await gen(`
namespace x
type T:
  required string (1..1)
  optional string (0..1)
  manyRequired string (1..*)
  manyOptional string (0..*)
`);
    expect(sdl).toMatch(/type T \{/);
    expect(sdl).toMatch(/required:\s+String!/);
    expect(sdl).toMatch(/optional:\s+String\b/);
    expect(sdl).toMatch(/manyRequired:\s+\[String!\]!/);
    expect(sdl).toMatch(/manyOptional:\s+\[String!\]/);
  });

  it('emits enums', async () => {
    const sdl = await gen(`
namespace x
enum Color:
  RED
  BLUE
`);
    expect(sdl).toMatch(/enum Color \{[\s\S]*RED[\s\S]*BLUE[\s\S]*\}/);
  });

  it('emits interface + implements for inheritance', async () => {
    const sdl = await gen(`
namespace x
type Parent:
  p string (1..1)
type Child extends Parent:
  c string (1..1)
`);
    expect(sdl).toMatch(/interface Parent \{/);
    expect(sdl).toMatch(/type Child implements Parent \{/);
  });

  it('emits @constraint directive definition and applies it', async () => {
    const sdl = await gen(`
namespace x
type T:
  a number (1..1)
  condition NonNegative:
    a >= 0
`);
    expect(sdl).toMatch(/directive @constraint/);
    expect(sdl).toMatch(/type T @constraint\(name:\s*"NonNegative"/);
  });

  it('parses cleanly with graphql-js', async () => {
    const sdl = await gen(`
namespace x
type T:
  a string (1..1)
`);
    expect(() => parse(sdl)).not.toThrow();
    expect(() => buildSchema(sdl)).not.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/codegen test -- graphql-emitter.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement the emitter**

Create `packages/codegen/src/emit/graphql-emitter.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { GeneratorOptions, GeneratorOutput } from '../types.js';
import type { WholeModelEmitter } from './namespace-emitter.js';
import type { NamespaceRegistry } from './namespace-registry.js';
import type { NamespaceWalkResult } from './namespace-walker.js';

const SCALAR_MAP: Record<string, string> = {
  string: 'String',
  int: 'Int',
  number: 'Float',
  boolean: 'Boolean',
  date: 'String',
  time: 'String',
  zonedDateTime: 'String'
};

const PREAMBLE = `directive @constraint(name: String!, kind: String!, expression: String) on OBJECT | INTERFACE\n`;

function fieldType(typeName: string, min: number, max: number | 'unbounded' | undefined): string {
  const baseType = SCALAR_MAP[typeName] ?? typeName;
  const isMulti = max === 'unbounded' || (typeof max === 'number' && max > 1);
  if (isMulti) return min === 0 ? `[${baseType}!]` : `[${baseType}!]!`;
  return min === 0 ? baseType : `${baseType}!`;
}

export class GraphqlWholeModelEmitter implements WholeModelEmitter {
  async emit(
    walks: ReadonlyMap<string, NamespaceWalkResult>,
    _registry: NamespaceRegistry,
    _options: GeneratorOptions
  ): Promise<GeneratorOutput[]> {
    const out: string[] = [PREAMBLE];

    const childrenByParent = new Map<string, string[]>();
    for (const walk of walks.values()) {
      for (const [name, data] of walk.dataByName) {
        const parent = data.superType?.ref?.name;
        if (parent) {
          const arr = childrenByParent.get(parent) ?? [];
          arr.push(name);
          childrenByParent.set(parent, arr);
        }
      }
    }

    for (const walk of walks.values()) {
      for (const [name, e] of walk.enumByName) {
        const values = (e.values ?? []).map((v) => v.name).join('\n  ');
        out.push(`enum ${name} {\n  ${values}\n}\n`);
      }
      for (const [name, data] of walk.dataByName) {
        const isInterface = childrenByParent.has(name);
        const kw = isInterface ? 'interface' : 'type';
        const impl = data.superType?.ref ? ` implements ${data.superType.ref.name}` : '';
        const constraints = (data.conditions ?? []).map((c) =>
          `@constraint(name: "${c.name ?? 'unnamed'}", kind: "${c.kind ?? 'expression'}", expression: "${(c.expression?.$cstNode?.text ?? '').replace(/"/g, '\\"')}")`
        ).join(' ');
        const constraintsPart = constraints ? ` ${constraints}` : '';
        out.push(`${kw} ${name}${impl}${constraintsPart} {`);
        for (const a of data.attributes ?? []) {
          const typeName = a.type?.$refText ?? a.type?.ref?.name ?? 'String';
          const min = a.cardinality?.min ?? 0;
          const max = a.cardinality?.max;
          out.push(`  ${a.name}: ${fieldType(typeName, min, max)}`);
        }
        out.push('}\n');
      }
    }

    return [{
      relativePath: 'schema.graphql',
      content: out.join('\n'),
      sourceMap: [],
      diagnostics: [],
      funcs: [],
      mimeType: 'application/graphql'
    }];
  }
}
```

Register in `generator.ts`:

```ts
import { GraphqlWholeModelEmitter } from './emit/graphql-emitter.js';
// In EMITTER_CLASSES:
graphql: GraphqlWholeModelEmitter
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/codegen test -- graphql-emitter.test.ts
```

Expected: PASS.

- [ ] **Step 6: Register in studio**

In `apps/studio/src/components/CodePreviewPanel.tsx`:

```ts
const REGISTERED: ReadonlySet<Target> = new Set([
  'zod', 'typescript', 'json-schema', 'excel', 'sql', 'markdown', 'graphql'
]);
```

- [ ] **Step 7: Commit**

```bash
git add packages/codegen/src/emit/graphql-emitter.ts packages/codegen/src/generator.ts packages/codegen/package.json pnpm-lock.yaml packages/codegen/test/emit/graphql-emitter.test.ts apps/studio/src/components/CodePreviewPanel.tsx
git commit -m "feat(codegen): GraphQL SDL emitter; register in studio (018 Phase 3)"
```

## Task 3.2: GraphQL CDM smoke test

**Files:**
- Modify: `packages/codegen/test/cdm-smoke.test.ts`

- [ ] **Step 1: Append the smoke test**

```ts
describe('CDM GraphQL smoke test', () => {
  it.skipIf(!existsSync('.resources/cdm/'))('generated SDL parses and builds with graphql-js', async () => {
    const services = createRuneDslServices({ workspaceUri: undefined }).RuneDsl;
    const collect = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
      .flatMap((e) => e.isDirectory() ? collect(join(dir, e.name)) : (e.name.endsWith('.rune') ? [join(dir, e.name)] : []));
    const paths = collect('.resources/cdm');
    const docs = await Promise.all(paths.map(async (p) =>
      services.shared.workspace.LangiumDocumentFactory.fromString(await readFile(p, 'utf-8'), URI.file(p))
    ));
    await services.shared.workspace.DocumentBuilder.build(docs, { validation: false });
    const outputs = await generate(docs, { target: 'graphql' });
    expect(outputs).toHaveLength(1);
    const { buildSchema } = await import('graphql');
    expect(() => buildSchema(outputs[0].content)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run and commit**

```bash
pnpm --filter @rune-langium/codegen test -- cdm-smoke.test.ts
git add packages/codegen/test/cdm-smoke.test.ts
git commit -m "test(codegen): CDM GraphQL smoke test (018 Phase 3)"
```

---

# Final Verification

## Task F.1: Full suite + type-check + lint

- [ ] **Step 1: All tests**

```bash
pnpm test
```

Expected: PASS across all packages.

- [ ] **Step 2: Type-check**

```bash
pnpm run type-check
```

Expected: PASS.

- [ ] **Step 3: Lint**

```bash
pnpm run lint
```

Expected: PASS.

## Task F.2: CHANGELOG entries

**Files:**
- Modify: `packages/codegen/CHANGELOG.md`
- Modify: `apps/studio/CHANGELOG.md`

- [ ] **Step 1: Add codegen CHANGELOG**

```markdown
## Unreleased

### Added
- New emitter targets: `excel`, `sql`, `markdown`, `graphql`.
- `WholeModelEmitter` contract for emitters that consume the entire model at once.
- `TARGET_DESCRIPTORS` export for UI tooling.
- `GeneratorOutput.binary` and `GeneratorOutput.mimeType` fields for binary outputs.

### Changed
- `generate()` is now async. Callers must `await` the result.
- `Target` union extended from `'zod' | 'json-schema' | 'typescript'` to include `'sql' | 'markdown' | 'excel' | 'graphql'`.
- `getTargetRelativePath()` throws for whole-model targets (excel/graphql).
```

- [ ] **Step 2: Add studio CHANGELOG**

```markdown
## Unreleased

### Added
- Codegen targets table replaces the inline target switcher.
- Download buttons for every registered target. Per-namespace targets also expose Preview.
- Downloads execute server-side via a Cloudflare Pages Function at `/api/codegen`.

### Removed
- `TargetSwitcher` component.
```

- [ ] **Step 3: Commit**

```bash
git add packages/codegen/CHANGELOG.md apps/studio/CHANGELOG.md
git commit -m "docs: CHANGELOG entries for 018 codegen additional targets"
```
