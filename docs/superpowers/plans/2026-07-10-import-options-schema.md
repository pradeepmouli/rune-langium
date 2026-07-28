# Import Options Schema + Merge Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each of the 4 import readers (JSON Schema, OpenAPI, SQL, XSD) a real, user-configurable Zod options schema rendered as a form in `ImportDialog` via the existing `?z2f` mechanism, and make the merge-collision strategy (skip/overwrite/rename) configurable instead of hard-coded to skip.

**Architecture:** Each reader's plain-TS options interface becomes a Zod schema in `packages/codegen/src/options/` (mirroring the already-shipped `ExcelOptionsSchema`), with new fields whose defaults exactly preserve current behavior. `mergeImportedText` gains a third `MergeOptions` parameter driving `skip`/`overwrite`/`rename`. Studio gets 4 thin `.schema.ts` re-export files + 4 z2f adapter components (mirroring `ExcelOptionsFormAdapter`) so the `?z2f` Vite-plugin import never lands in `ImportDialog.tsx` itself — `ExplorePerspective.tsx` (the existing wiring site) imports all 4 adapters and passes them down as a `format → component` map.

**Tech Stack:** Zod v4, `@zod-to-form/vite`'s `?z2f` plugin, React 19, `@rune-langium/core`'s `parse()`.

## Global Constraints

- **Every new option's default preserves current reader behavior exactly.** Enabling any new field is opt-in; calling a reader with no options object (or `{}`) must produce byte-identical output to before this plan.
- **`?z2f` imports never appear in `ImportDialog.tsx` or `ImportDialog.test.tsx`.** Only the 4 new adapter components import `?z2f`; only `ExplorePerspective.tsx` imports the adapters. This mirrors `ExcelOptionsFormAdapter.tsx`'s own header comment exactly — violating it breaks `ImportDialog.test.tsx` (plain vitest does not run the Vite plugin transform).
- **SPDX headers:** `packages/codegen/**` = MIT; `apps/studio/**` = FSL-1.1-ALv2. Every new file needs the correct header + `// Copyright (c) 2026 Pradeep Mouli`.
- **`namespace` stays a dedicated dialog field**, never part of any options schema.
- **`skipConditions`/`dialect` keep their reader-native names** in the new Zod schemas (do not rename to match `ImportOptions`'s legacy `conditions`/`sqlDialect` CLI-flag naming) — `ImportDialog.tsx` (Task 8) is responsible for translating between the two at the `importModel()` call site, exactly as `importModel()` already translates `conditions: false → skipConditions: true` internally today.
- **Design doc:** `docs/superpowers/specs/2026-07-10-import-options-schema-design.md` is the source of truth for field names, defaults, and their grounding against each reader's actual current behavior. Read it before Task 1.

## File Structure

- **`packages/codegen/src/options/json-schema-import-options.ts`** (new, MIT) — `JsonSchemaImportOptionsSchema`.
- **`packages/codegen/src/options/openapi-import-options.ts`** (new, MIT) — `OpenApiImportOptionsSchema` (extends the above).
- **`packages/codegen/src/options/sql-import-options.ts`** (new, MIT) — `SqlImportOptionsSchema`.
- **`packages/codegen/src/options/xsd-import-options.ts`** (new, MIT) — `XsdImportOptionsSchema`.
- **`packages/codegen/src/import/sources/json-schema-reader.ts`** (modify) — `JsonSchemaImportOptions` becomes `z.infer<typeof JsonSchemaImportOptionsSchema>`; `readJsonSchema` honors `includeUnreferencedDefs`.
- **`packages/codegen/src/import/sources/openapi-reader.ts`** (modify) — same pattern; `readOpenApi` honors `includeOperations`.
- **`packages/codegen/src/import/sources/sql-reader.ts`** (modify) — `SqlImportOptions` becomes `z.infer<typeof SqlImportOptionsSchema>` (behavior unchanged — schema only).
- **`packages/codegen/src/import/sources/xsd-reader.ts`** (modify) — same pattern; `readXsd` honors `importTopLevelElements`.
- **`packages/codegen/src/import/index.ts`** (modify) — `ImportOptions` gains 3 new optional fields; `importModel`'s reader dispatch threads them through.
- **`apps/studio/src/shell/import-merge-options.ts`** (new, FSL) — `MergeOptionsSchema`.
- **`apps/studio/src/shell/import-merge.ts`** (modify) — `mergeImportedText` gains `options?: MergeOptions`; `overwrite`/`rename` logic.
- **`apps/studio/src/codegen-forms/{json-schema,openapi,sql,xsd}-import-options.schema.ts`** (new ×4, FSL) — thin `?z2f` re-exports.
- **`apps/studio/src/codegen-forms/{JsonSchema,OpenApi,Sql,Xsd}ImportOptionsFormAdapter.tsx`** (new ×4, FSL) — z2f adapters.
- **`apps/studio/src/components/ImportDialog.tsx`** (modify) — accepts `optionsFormsByFormat` + `onCollision` selector; threads options into `importModel`/`mergeImportedText`.
- **`apps/studio/src/shell/ExplorePerspective.tsx`** (modify) — imports the 4 adapters, builds the map, passes it + wires collision strategy.
- Tests: `packages/codegen/test/options/{format}-import-options.test.ts` (×4, new), extensions to each reader's existing test file, `apps/studio/test/shell/import-merge.test.ts`, `apps/studio/test/components/ImportDialog.test.tsx`.

---

### Task 1: `JsonSchemaImportOptionsSchema` + `readJsonSchema` honors `includeUnreferencedDefs`

**Files:**
- Create: `packages/codegen/src/options/json-schema-import-options.ts`
- Modify: `packages/codegen/src/import/sources/json-schema-reader.ts:119-124` (interface → schema-derived type), `packages/codegen/src/import/sources/json-schema-reader.ts:132-169` (`readJsonSchema` honors the new field)
- Test: `packages/codegen/test/options/json-schema-import-options.test.ts` (new), `packages/codegen/test/import/json-schema-reader.test.ts` (extend)

**Interfaces:**
- Produces: `JsonSchemaImportOptionsSchema`, `type JsonSchemaImportOptions = z.infer<typeof JsonSchemaImportOptionsSchema>` — consumed by Task 2 (OpenAPI extends this), Task 5, Task 7.

- [ ] **Step 1: Write the failing schema test**

```ts
// packages/codegen/test/options/json-schema-import-options.test.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { JsonSchemaImportOptionsSchema } from '../../src/options/json-schema-import-options.js';

describe('JsonSchemaImportOptionsSchema', () => {
  it('defaults skipConditions to false and includeUnreferencedDefs to true', () => {
    const parsed = JsonSchemaImportOptionsSchema.parse({});
    expect(parsed).toEqual({ skipConditions: false, includeUnreferencedDefs: true });
  });

  it('accepts explicit overrides', () => {
    const parsed = JsonSchemaImportOptionsSchema.parse({ skipConditions: true, includeUnreferencedDefs: false });
    expect(parsed).toEqual({ skipConditions: true, includeUnreferencedDefs: false });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/options/json-schema-import-options.test.ts`
Expected: FAIL — `Cannot find module '../../src/options/json-schema-import-options.js'`

- [ ] **Step 3: Create the schema**

```ts
// packages/codegen/src/options/json-schema-import-options.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { z } from 'zod';

/**
 * Options for the JSON Schema import reader (`readJsonSchema`). Also the
 * base schema `OpenApiImportOptionsSchema` extends — OpenAPI's schema
 * conversion delegates to `readJsonSchema` internally.
 */
export const JsonSchemaImportOptionsSchema = z.object({
  skipConditions: z
    .boolean()
    .optional()
    .default(false)
    .describe('Structural import only — never populate constraints arrays.'),
  includeUnreferencedDefs: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      'Import every $defs/definitions entry (current behavior). Turn off to only import defs transitively referenced from the root schema.'
    )
});

export type JsonSchemaImportOptions = z.infer<typeof JsonSchemaImportOptionsSchema>;
```

- [ ] **Step 4: Run the schema test to verify it passes**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/options/json-schema-import-options.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Point the reader at the new type and implement `includeUnreferencedDefs`**

In `packages/codegen/src/import/sources/json-schema-reader.ts`, delete the existing hand-written interface:

```ts
export interface JsonSchemaImportOptions {
  /** Overrides namespace derivation from `$id` (spec.md CLI `--namespace`). */
  namespace?: string;
  /** Structural import only — never populate `constraints` arrays (spec.md CLI `--no-conditions`). Default: translate constraints. */
  skipConditions?: boolean;
}
```

Replace it with:

```ts
import type { z } from 'zod';
import type { JsonSchemaImportOptionsSchema } from '../../options/json-schema-import-options.js';

/**
 * `namespace` isn't part of the Zod schema (dedicated dialog field) — extend
 * the schema's INPUT type (not `z.infer`/output) with it here. `z.input`
 * keeps every `.optional().default(...)` field genuinely optional for
 * callers; `z.infer` resolves to the OUTPUT type, where defaulted fields
 * become required — which breaks every existing call site that omits them
 * (e.g. `readJsonSchema(schema, { namespace: 'x' })`).
 */
export interface JsonSchemaImportOptions extends z.input<typeof JsonSchemaImportOptionsSchema> {
  /** Overrides namespace derivation from `$id` (spec.md CLI `--namespace`). */
  namespace?: string;
}
```

Then, in `readJsonSchema` (currently iterating `Object.entries(defs)` unconditionally), add reachability filtering when `includeUnreferencedDefs === false`. Reachability is computed by walking every `$ref` in the raw def bodies (before `asNode` conversion) starting from... **there is no "root schema" entry point today** (per the design doc: `readJsonSchema` only ever converts `$defs`/`definitions`, never the schema's own top-level properties) — so "referenced" here means "referenced by at least one OTHER def", starting the reachable set from any def with no incoming `$ref` from another def (a def nobody points to is itself a root for this purpose). Implement as:

```ts
function collectRefTargets(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectRefTargets(item, out);
    return;
  }
  if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === '$ref' && typeof value === 'string') {
        const match = /^#\/(?:\$defs|definitions)\/(.+)$/.exec(value);
        if (match) out.add(match[1]!);
        continue;
      }
      collectRefTargets(value, out);
    }
  }
}

function filterUnreferencedDefs(
  defs: Record<string, JsonSchemaNode>,
  rawDefs: Record<string, JSONSchema7Definition>
): Record<string, JsonSchemaNode> {
  const referenced = new Set<string>();
  for (const def of Object.values(rawDefs)) collectRefTargets(def, referenced);
  const defNames = new Set(Object.keys(defs));
  const referencedByOthers = new Set([...referenced].filter((n) => defNames.has(n)));
  // A def with no incoming ref from another def is itself a root — keep it
  // and everything IT (transitively) references.
  const keep = new Set<string>();
  const stack = Object.keys(defs).filter((name) => !referencedByOthers.has(name) || keep.has(name));
  while (stack.length > 0) {
    const name = stack.pop()!;
    if (keep.has(name)) continue;
    keep.add(name);
    const refsHere = new Set<string>();
    collectRefTargets(rawDefs[name], refsHere);
    for (const r of refsHere) if (defNames.has(r) && !keep.has(r)) stack.push(r);
  }
  return Object.fromEntries(Object.entries(defs).filter(([name]) => keep.has(name)));
}
```

Then in `readJsonSchema`, right after `const defs: Record<string, JsonSchemaNode> = ...` (line 139-141), add:

```ts
const effectiveDefs = options.includeUnreferencedDefs === false ? filterUnreferencedDefs(defs, rawDefs) : defs;
```

and change the loop at line 146 from `for (const [key, def] of Object.entries(defs))` to `for (const [key, def] of Object.entries(effectiveDefs))`.

- [ ] **Step 6: Write the failing reader test for the new option**

Add to `packages/codegen/test/import/json-schema-reader.test.ts`:

```ts
it('includeUnreferencedDefs: false drops defs no other def references', () => {
  const schema = {
    $defs: {
      Root: { type: 'object', properties: { child: { $ref: '#/$defs/Referenced' } } },
      Referenced: { type: 'object', properties: { x: { type: 'string' } } },
      Orphan: { type: 'object', properties: { y: { type: 'string' } } }
    }
  } as unknown as Parameters<typeof readJsonSchema>[0];
  const { model } = readJsonSchema(schema, { includeUnreferencedDefs: false });
  const names = model.types.map((t) => t.name);
  expect(names).toContain('Root');
  expect(names).toContain('Referenced');
  expect(names).not.toContain('Orphan');
});

it('includeUnreferencedDefs: true (default) imports every def regardless of reachability', () => {
  const schema = {
    $defs: {
      Root: { type: 'object', properties: { child: { $ref: '#/$defs/Referenced' } } },
      Referenced: { type: 'object', properties: { x: { type: 'string' } } },
      Orphan: { type: 'object', properties: { y: { type: 'string' } } }
    }
  } as unknown as Parameters<typeof readJsonSchema>[0];
  const { model } = readJsonSchema(schema);
  expect(model.types.map((t) => t.name)).toContain('Orphan');
});
```

- [ ] **Step 7: Run the reader tests to verify they pass, and the full existing suite for regressions**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/import/json-schema-reader.test.ts test/options/json-schema-import-options.test.ts`
Expected: all PASS, including every pre-existing case in `json-schema-reader.test.ts` (regression check — default behavior unchanged).

- [ ] **Step 8: Commit**

```bash
git add packages/codegen/src/options/json-schema-import-options.ts \
        packages/codegen/src/import/sources/json-schema-reader.ts \
        packages/codegen/test/options/json-schema-import-options.test.ts \
        packages/codegen/test/import/json-schema-reader.test.ts
git commit -m "feat(codegen): JsonSchemaImportOptionsSchema + includeUnreferencedDefs"
```

---

### Task 2: `OpenApiImportOptionsSchema` + `readOpenApi` honors `includeOperations`

**Files:**
- Create: `packages/codegen/src/options/openapi-import-options.ts`
- Modify: `packages/codegen/src/import/sources/openapi-reader.ts:70` (interface → schema-derived type), `packages/codegen/src/import/sources/openapi-reader.ts:96-137` (`readOpenApi` honors the new field)
- Test: `packages/codegen/test/options/openapi-import-options.test.ts` (new), `packages/codegen/test/import/openapi-reader.test.ts` (extend)

**Interfaces:**
- Consumes: `JsonSchemaImportOptionsSchema` (Task 1).
- Produces: `OpenApiImportOptionsSchema`, `type OpenApiImportOptions = z.infer<typeof OpenApiImportOptionsSchema>` — consumed by Task 5, Task 7.

- [ ] **Step 1: Write the failing schema test**

```ts
// packages/codegen/test/options/openapi-import-options.test.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { OpenApiImportOptionsSchema } from '../../src/options/openapi-import-options.js';

describe('OpenApiImportOptionsSchema', () => {
  it('defaults preserve current behavior (all fields on)', () => {
    expect(OpenApiImportOptionsSchema.parse({})).toEqual({
      skipConditions: false,
      includeUnreferencedDefs: true,
      includeOperations: true
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/options/openapi-import-options.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the schema**

```ts
// packages/codegen/src/options/openapi-import-options.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { z } from 'zod';
import { JsonSchemaImportOptionsSchema } from './json-schema-import-options.js';

/**
 * Options for the OpenAPI import reader (`readOpenApi`). Extends the JSON
 * Schema options — `readOpenApi` normalizes `components.schemas` into a
 * JSON-Schema-shaped document and delegates conversion to `readJsonSchema`.
 */
export const OpenApiImportOptionsSchema = JsonSchemaImportOptionsSchema.extend({
  includeOperations: z
    .boolean()
    .optional()
    .default(true)
    .describe('Convert OpenAPI paths into Rune functions (current behavior). Turn off to import types/enums only.')
});

export type OpenApiImportOptions = z.infer<typeof OpenApiImportOptionsSchema>;
```

- [ ] **Step 4: Run the schema test to verify it passes**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/options/openapi-import-options.test.ts`
Expected: PASS (1/1)

- [ ] **Step 5: Point the reader at the new type and implement `includeOperations`**

In `packages/codegen/src/import/sources/openapi-reader.ts`, replace:

```ts
export interface OpenApiImportOptions extends JsonSchemaImportOptions {}
```

with:

```ts
import type { z } from 'zod';
import type { OpenApiImportOptionsSchema } from '../../options/openapi-import-options.js';

/** See json-schema-reader.ts's `JsonSchemaImportOptions` for why this extends `z.input`, not `z.infer`. */
export interface OpenApiImportOptions extends z.input<typeof OpenApiImportOptionsSchema> {
  /** Overrides namespace derivation (spec.md CLI `--namespace`). */
  namespace?: string;
}
```

Then in `readOpenApi` (line 127 today: `const funcs = readOperations(...)` runs unconditionally), change to:

```ts
const funcs = options.includeOperations === false
  ? []
  : readOperations((document.paths ?? {}) as unknown as Record<string, LooseSchema>, diagnostics);
```

- [ ] **Step 6: Write the failing reader test**

Add to `packages/codegen/test/import/openapi-reader.test.ts`:

```ts
it('includeOperations: false skips path-derived functions', () => {
  const doc = {
    openapi: '3.0.3',
    info: { title: 'Demo', version: '1.0.0' },
    paths: { '/widgets': { get: { operationId: 'listWidgets', responses: { '200': { description: 'ok' } } } } },
    components: { schemas: { Widget: { type: 'object', properties: { id: { type: 'string' } } } } }
  };
  const { model } = readOpenApi(doc, { includeOperations: false });
  expect(model.funcs).toEqual([]);
  expect(model.types.map((t) => t.name)).toContain('Widget');
});
```

- [ ] **Step 7: Run the reader tests to verify they pass, and the full existing suite for regressions**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/import/openapi-reader.test.ts test/import/openapi-operations.test.ts test/options/openapi-import-options.test.ts`
Expected: all PASS, no regressions.

- [ ] **Step 8: Commit**

```bash
git add packages/codegen/src/options/openapi-import-options.ts \
        packages/codegen/src/import/sources/openapi-reader.ts \
        packages/codegen/test/options/openapi-import-options.test.ts \
        packages/codegen/test/import/openapi-reader.test.ts
git commit -m "feat(codegen): OpenApiImportOptionsSchema + includeOperations"
```

---

### Task 3: `SqlImportOptionsSchema` (schema only — no behavior change)

**Files:**
- Create: `packages/codegen/src/options/sql-import-options.ts`
- Modify: `packages/codegen/src/import/sources/sql-reader.ts:163-182` (interface → schema-derived type)
- Test: `packages/codegen/test/options/sql-import-options.test.ts` (new)

**Interfaces:**
- Produces: `SqlImportOptionsSchema`, `type SqlImportOptions = z.infer<typeof SqlImportOptionsSchema>` — consumed by Task 5, Task 7.

- [ ] **Step 1: Write the failing schema test**

```ts
// packages/codegen/test/options/sql-import-options.test.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { SqlImportOptionsSchema } from '../../src/options/sql-import-options.js';

describe('SqlImportOptionsSchema', () => {
  it('defaults dialect to postgres and skipConditions to false', () => {
    expect(SqlImportOptionsSchema.parse({})).toEqual({ dialect: 'postgres', skipConditions: false });
  });

  it('accepts sqlserver', () => {
    expect(SqlImportOptionsSchema.parse({ dialect: 'sqlserver' }).dialect).toBe('sqlserver');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/options/sql-import-options.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the schema**

```ts
// packages/codegen/src/options/sql-import-options.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { z } from 'zod';

/**
 * Options for the SQL DDL import reader (`readSql`). No node-kind filter —
 * SQL DDL is already flat (one declaration per CREATE TABLE), there is no
 * other top-level construct kind to filter today. `wasmSource` (browser
 * WASM-loading override) deliberately stays out of this schema/form — it
 * is an internal detail, not a user-facing setting.
 */
export const SqlImportOptionsSchema = z.object({
  dialect: z
    .enum(['postgres', 'sqlserver'])
    .optional()
    .default('postgres')
    .describe('Matches the outbound SQL emitter default; currently informational (the tree-sitter grammar is dialect-tolerant).'),
  skipConditions: z
    .boolean()
    .optional()
    .default(false)
    .describe('Structural import only — never populate constraints arrays.')
});

export type SqlImportOptions = z.infer<typeof SqlImportOptionsSchema>;
```

- [ ] **Step 4: Run the schema test to verify it passes**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/options/sql-import-options.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Point the reader at the new type**

In `packages/codegen/src/import/sources/sql-reader.ts`, replace the existing hand-written `SqlImportOptions` interface (lines 163-182) with:

```ts
import type { z } from 'zod';
import type { SqlImportOptionsSchema } from '../../options/sql-import-options.js';

/** See json-schema-reader.ts's `JsonSchemaImportOptions` for why this extends `z.input`, not `z.infer`. */
export interface SqlImportOptions extends z.input<typeof SqlImportOptionsSchema> {
  /** Rune namespace (SQL DDL has no namespace concept of its own — always required). */
  namespace: string;
  /** Overrides the default `web-tree-sitter` wasm loading — primarily for browser callers. */
  wasmSource?: WasmSource;
}
```

No change to `readSql`'s body — `dialect`/`skipConditions` are already read exactly as the schema now types them.

- [ ] **Step 6: Run the full existing SQL reader suite for regressions**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/import/sql-reader.test.ts test/import/sql-reader-constraints.test.ts test/options/sql-import-options.test.ts`
Expected: all PASS, no regressions (this task is schema-only, zero behavior change).

- [ ] **Step 7: Commit**

```bash
git add packages/codegen/src/options/sql-import-options.ts packages/codegen/src/import/sources/sql-reader.ts \
        packages/codegen/test/options/sql-import-options.test.ts
git commit -m "feat(codegen): SqlImportOptionsSchema (schema-only, no behavior change)"
```

---

### Task 4: `XsdImportOptionsSchema` + `readXsd` honors `importTopLevelElements`

**Files:**
- Create: `packages/codegen/src/options/xsd-import-options.ts`
- Modify: `packages/codegen/src/import/sources/xsd-reader.ts:300-305` (interface → schema-derived type), `packages/codegen/src/import/sources/xsd-reader.ts:814-937` (`readXsd` honors the new field)
- Test: `packages/codegen/test/options/xsd-import-options.test.ts` (new), `packages/codegen/test/import/xsd-reader.test.ts` (extend)

**Interfaces:**
- Produces: `XsdImportOptionsSchema`, `type XsdImportOptions = z.infer<typeof XsdImportOptionsSchema>` — consumed by Task 5, Task 7.

- [ ] **Step 1: Write the failing schema test**

```ts
// packages/codegen/test/options/xsd-import-options.test.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { XsdImportOptionsSchema } from '../../src/options/xsd-import-options.js';

describe('XsdImportOptionsSchema', () => {
  it('defaults skipConditions to false and importTopLevelElements to false', () => {
    expect(XsdImportOptionsSchema.parse({})).toEqual({ skipConditions: false, importTopLevelElements: false });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/options/xsd-import-options.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the schema**

```ts
// packages/codegen/src/options/xsd-import-options.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { z } from 'zod';

/** Options for the XSD import reader (`readXsd`). */
export const XsdImportOptionsSchema = z.object({
  skipConditions: z
    .boolean()
    .optional()
    .default(false)
    .describe('Structural import only — never populate constraints arrays.'),
  importTopLevelElements: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Also import top-level xs:element declarations as standalone types. Off by default (current behavior): top-level elements are only used for ref= resolution and diagnostics.'
    )
});

export type XsdImportOptions = z.infer<typeof XsdImportOptionsSchema>;
```

- [ ] **Step 4: Run the schema test to verify it passes**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/options/xsd-import-options.test.ts`
Expected: PASS (1/1)

- [ ] **Step 5: Point the reader at the new type and implement `importTopLevelElements`**

In `packages/codegen/src/import/sources/xsd-reader.ts`, replace the existing hand-written `XsdImportOptions` interface (lines 300-305) with:

```ts
import type { z } from 'zod';
import type { XsdImportOptionsSchema } from '../../options/xsd-import-options.js';

/** See json-schema-reader.ts's `JsonSchemaImportOptions` for why this extends `z.input`, not `z.infer`. */
export interface XsdImportOptions extends z.input<typeof XsdImportOptionsSchema> {
  /** Overrides namespace derivation; falls back to a sanitized targetNamespace when omitted. */
  namespace?: string;
}
```

In `readXsd`, `topLevelElementList` (built at line 896-899) is currently only consumed for `ref=` lookups (`topLevelElementsByName`, passed into `buildType`) and the abstract/substitutionGroup diagnostics loop (lines 916-931) — it never becomes a `SourceType`. Add, right after the existing `types` array is built (after line 914, before the `for (const el of topLevelElementList)` diagnostics loop):

```ts
if (options.importTopLevelElements) {
  for (const el of topLevelElementList) {
    // Elements already covered by a same-named complexType (referenced via
    // its own top-level xs:element wrapper) are not duplicated — buildType
    // already produced a type for the complexType itself.
    if (types.some((t) => t.name === el.name)) continue;
    types.push(
      buildType(
        // A bare top-level element with no inline complexType has no
        // attributes of its own in this reader's model — readElementLike
        // (called when topLevelElementList was built) already resolved its
        // type reference; buildType needs a ComplexTypeShape, so wrap the
        // element as a single-attribute passthrough carrying its own type
        // reference. readComplexType's shape only requires a name + attribute
        // list, both derivable from the already-parsed `el`.
        { name: el.name, attributes: [], extends: undefined },
        nsMap,
        xsdPrefix,
        simpleTypesByName,
        diagnostics,
        options.skipConditions ?? false,
        topLevelElementsByName
      )
    );
  }
}
```

**Note for the implementer:** the exact shape `buildType`/`readComplexType` expect for a bare top-level element (one with no inline `complexType` child, just a `type=` attribute reference) needs verifying against `readComplexType`'s actual signature (`xsd-reader.ts`) before this compiles — the brief above describes the *intent* (produce a `SourceType` per un-covered top-level element, reusing the existing `buildType` pipeline rather than a new one), not a guaranteed-correct call. If `readComplexType`'s shape doesn't accept a synthesized zero-attribute shim, use `readElementLike`'s already-resolved type reference to build a minimal type-alias-shaped `SourceType` by hand instead — check the `SourceType` shape in `source-model.ts` for what's structurally required.

- [ ] **Step 6: Write the failing reader test**

Add to `packages/codegen/test/import/xsd-reader.test.ts`:

```ts
it('importTopLevelElements: true imports a bare top-level xs:element as a standalone type', () => {
  const xml = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:demo">
  <xs:element name="RootThing" type="xs:string"/>
</xs:schema>`;
  const withoutOption = readXsd(xml, { namespace: 'demo' });
  expect(withoutOption.model.types.map((t) => t.name)).not.toContain('RootThing');

  const withOption = readXsd(xml, { namespace: 'demo', importTopLevelElements: true });
  expect(withOption.model.types.map((t) => t.name)).toContain('RootThing');
});
```

- [ ] **Step 7: Run the reader tests to verify they pass, and the full existing suite for regressions**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/import/xsd-reader.test.ts test/import/xsd-reader-constraints.test.ts test/options/xsd-import-options.test.ts`
Expected: all PASS. If Step 5's `buildType` call doesn't compile or the new test fails on shape mismatch, resolve per the implementer note above before proceeding — do not weaken the test to fit a broken implementation.

- [ ] **Step 8: Commit**

```bash
git add packages/codegen/src/options/xsd-import-options.ts packages/codegen/src/import/sources/xsd-reader.ts \
        packages/codegen/test/options/xsd-import-options.test.ts packages/codegen/test/import/xsd-reader.test.ts
git commit -m "feat(codegen): XsdImportOptionsSchema + importTopLevelElements"
```

---

### Task 5: Thread the 4 new fields through `importModel()`

**Files:**
- Modify: `packages/codegen/src/import/index.ts:58-77` (`ImportOptions` interface), `packages/codegen/src/import/index.ts:101-143` (`importModel`'s reader dispatch)
- Test: `packages/codegen/test/import/import-model.test.ts` (extend if it exists; otherwise add cases to the nearest existing `importModel` integration test — check `packages/codegen/test/bin/import-cli.test.ts` and `packages/codegen/test/import/openapi-fixtures.test.ts` for the established `importModel` test-call pattern before creating a new file)

**Interfaces:**
- Consumes: `JsonSchemaImportOptions`, `OpenApiImportOptions`, `XsdImportOptions` (Tasks 1, 2, 4) — only for the field names being added to `readerOptions`, not the full types.
- Produces: `ImportOptions` (extended) — consumed by Task 8 (`ImportDialog.tsx`'s `importModel()` call).

- [ ] **Step 1: Write the failing test**

Add a new file `packages/codegen/test/import/import-model-options.test.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { importModel } from '../../src/import/index.js';

describe('importModel — new per-format options pass through', () => {
  it('includeUnreferencedDefs: false narrows json-schema output', async () => {
    const source = JSON.stringify({
      $defs: {
        Root: { type: 'object', properties: { child: { $ref: '#/$defs/Referenced' } } },
        Referenced: { type: 'object', properties: { x: { type: 'string' } } },
        Orphan: { type: 'object', properties: { y: { type: 'string' } } }
      }
    });
    const result = await importModel(source, {
      from: 'json-schema',
      namespace: 'demo',
      includeUnreferencedDefs: false
    } as never);
    expect(result.model.types.map((t) => t.name)).not.toContain('Orphan');
  });

  it('importTopLevelElements: true reaches the xsd reader', async () => {
    const source = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:demo">
  <xs:element name="RootThing" type="xs:string"/>
</xs:schema>`;
    const result = await importModel(source, {
      from: 'xsd',
      namespace: 'demo',
      importTopLevelElements: true
    } as never);
    expect(result.model.types.map((t) => t.name)).toContain('RootThing');
  });
});
```

(The `as never` casts are temporary — Step 3 below adds the real fields to `ImportOptions`, at which point remove the casts.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/import/import-model-options.test.ts`
Expected: FAIL — `Orphan` is still present (option not threaded); `RootThing` is absent.

- [ ] **Step 3: Extend `ImportOptions` and the reader dispatch**

In `packages/codegen/src/import/index.ts`, add to the `ImportOptions` interface (after the existing `sqlDialect?` field):

```ts
  /** `from: 'json-schema' | 'openapi'` only. Default: true (current behavior — import every def regardless of reachability). */
  includeUnreferencedDefs?: boolean;
  /** `from: 'openapi'` only. Default: true (current behavior — always convert paths into funcs). */
  includeOperations?: boolean;
  /** `from: 'xsd'` only. Default: false (current behavior — top-level elements are never their own type). */
  importTopLevelElements?: boolean;
```

Then update the `readerOptions` construction (currently):

```ts
const readerOptions = {
  ...(options.namespace !== undefined && { namespace: options.namespace }),
  ...(options.conditions === false && { skipConditions: true })
};
```

to:

```ts
const readerOptions = {
  ...(options.namespace !== undefined && { namespace: options.namespace }),
  ...(options.conditions === false && { skipConditions: true }),
  ...(options.includeUnreferencedDefs !== undefined && { includeUnreferencedDefs: options.includeUnreferencedDefs }),
  ...(options.includeOperations !== undefined && { includeOperations: options.includeOperations }),
  ...(options.importTopLevelElements !== undefined && { importTopLevelElements: options.importTopLevelElements })
};
```

`readerOptions` is spread into whichever reader call matches `options.from` — every reader function already ignores fields it doesn't declare in its own options type, so passing all 3 new fields into `readerOptions` unconditionally (rather than branching per-`from`) is safe and matches the existing `namespace`/`skipConditions` pattern exactly.

- [ ] **Step 4: Remove the `as never` casts from Step 1's test and run it to verify it passes**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/import/import-model-options.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Run the full codegen package suite for regressions**

Run: `pnpm --filter @rune-langium/codegen run test`
Expected: all pass, no regressions (existing `importModel` callers pass no new fields — behavior unchanged for them).

- [ ] **Step 6: Commit**

```bash
git add packages/codegen/src/import/index.ts packages/codegen/test/import/import-model-options.test.ts
git commit -m "feat(codegen): thread includeUnreferencedDefs/includeOperations/importTopLevelElements through importModel"
```

---

### Task 6: `MergeOptionsSchema` + `mergeImportedText` overwrite/rename

**Files:**
- Create: `apps/studio/src/shell/import-merge-options.ts`
- Modify: `apps/studio/src/shell/import-merge.ts` (full rewrite of the merge loop to branch on `onCollision`)
- Test: `apps/studio/test/shell/import-merge.test.ts` (extend)

**Interfaces:**
- Produces: `MergeOptionsSchema`, `type MergeOptions`, extended `MergeResult` (adds `overwritten: string[]`, `renamed: { from: string; to: string }[]`) — consumed by Task 7 (z2f form), Task 8 (`ImportDialog.tsx`'s `mergeImportedText` call).

- [ ] **Step 1: Write the failing schema test**

```ts
// apps/studio/test/shell/import-merge-options.test.ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { MergeOptionsSchema } from '../../src/shell/import-merge-options.js';

describe('MergeOptionsSchema', () => {
  it('defaults onCollision to skip', () => {
    expect(MergeOptionsSchema.parse({})).toEqual({ onCollision: 'skip' });
  });

  it('accepts overwrite and rename', () => {
    expect(MergeOptionsSchema.parse({ onCollision: 'overwrite' }).onCollision).toBe('overwrite');
    expect(MergeOptionsSchema.parse({ onCollision: 'rename' }).onCollision).toBe('rename');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/import-merge-options.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the schema**

```ts
// apps/studio/src/shell/import-merge-options.ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { z } from 'zod';

/** How `mergeImportedText` resolves a top-level-element name collision. */
export const MergeOptionsSchema = z.object({
  onCollision: z
    .enum(['skip', 'overwrite', 'rename'])
    .optional()
    .default('skip')
    .describe(
      'skip: keep the existing declaration, drop the incoming one (current, only behavior). ' +
        'overwrite: replace the existing declaration with the incoming one. ' +
        'rename: keep both, renaming the incoming declaration.'
    )
});

export type MergeOptions = z.infer<typeof MergeOptionsSchema>;
```

- [ ] **Step 4: Run the schema test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/import-merge-options.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Write the failing `mergeImportedText` tests for `overwrite`/`rename`**

Add to `apps/studio/test/shell/import-merge.test.ts` (mirroring the existing collision test's fixture shape):

```ts
describe('mergeImportedText — onCollision', () => {
  const existingText = 'namespace demo\n\ntype Foo:\n\ta string (1..1)\n';
  const importedText = 'namespace demo\n\ntype Foo:\n\tb string (1..1)\n\ntype Bar:\n\tc string (1..1)\n';

  it('overwrite replaces the existing Foo with the incoming Foo, keeps Bar', async () => {
    const result = await mergeImportedText(existingText, importedText, { onCollision: 'overwrite' });
    expect(result.mergedText).toContain('b string');
    expect(result.mergedText).not.toContain('a string');
    expect(result.mergedText).toContain('type Bar');
    expect(result.overwritten).toEqual(['Foo']);
    expect(result.skipped).toEqual([]);
  });

  it('rename keeps both Foo declarations under distinct names', async () => {
    const result = await mergeImportedText(existingText, importedText, { onCollision: 'rename' });
    expect(result.mergedText).toContain('type Foo:');
    expect(result.mergedText).toContain('type Foo_2:');
    expect(result.mergedText).toContain('type Bar');
    expect(result.renamed).toEqual([{ from: 'Foo', to: 'Foo_2' }]);
    expect(result.skipped).toEqual([]);
  });

  it('skip (default, no options arg) is unchanged from before this task', async () => {
    const result = await mergeImportedText(existingText, importedText);
    expect(result.mergedText).toContain('a string');
    expect(result.mergedText).not.toContain('b string');
    expect(result.skipped).toEqual(['Foo']);
  });
});
```

- [ ] **Step 6: Run the new tests to verify they fail**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/import-merge.test.ts`
Expected: the `skip` case passes (unchanged code path); `overwrite`/`rename` FAIL (`mergeImportedText` doesn't accept a 3rd argument yet, `overwritten`/`renamed` don't exist on the result).

- [ ] **Step 7: Implement `overwrite`/`rename` in `mergeImportedText`**

Replace the whole file:

```ts
// apps/studio/src/shell/import-merge.ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Text+CST-level merge for ImportDialog's "merge into an open file" path
 * (spec 021 Phase 4 consumer — see
 * docs/superpowers/specs/2026-07-06-explorer-import-dialog-design.md and
 * docs/superpowers/specs/2026-07-10-import-options-schema-design.md).
 * Operates only on top-level elements (types/enums/choices/functions);
 * never rewrites an existing declaration's body. `onCollision` (default
 * 'skip') controls how a name collision is resolved:
 *   - skip: keep what's already there, drop the incoming one (original,
 *     only-ever behavior before this option existed).
 *   - overwrite: drop the EXISTING element's span, splice the incoming
 *     element's span in its place (same position in the target file).
 *   - rename: keep both — the incoming element's own name token is
 *     rewritten (a numeric suffix, same convention as `uniqueFilePath`)
 *     before its span is appended. This never touches the existing
 *     declaration or either declaration's body — only the incoming
 *     declaration's own leading name token.
 */

import { parse } from '@rune-langium/core';
import type { MergeOptions } from './import-merge-options.js';

export interface MergeResult {
  mergedText: string;
  /** Element names dropped due to a name collision with the target file (onCollision: 'skip'). */
  skipped: string[];
  /** Element names whose EXISTING declaration was replaced by the incoming one (onCollision: 'overwrite'). */
  overwritten: string[];
  /** Incoming elements renamed to avoid a collision (onCollision: 'rename'). */
  renamed: { from: string; to: string }[];
}

const DECL_NAME_RE = /^(type|enum|choice|func)\s+(\w+)/;

function renameDeclaration(spanText: string, newName: string): string {
  const match = DECL_NAME_RE.exec(spanText);
  if (!match) {
    throw new Error(`mergeImportedText: could not locate a declaration name to rename in: ${spanText.slice(0, 40)}...`);
  }
  return spanText.slice(0, match[1]!.length) + spanText.slice(match[1]!.length).replace(match[2]!, newName);
}

function uniqueDeclarationName(candidate: string, taken: ReadonlySet<string>): string {
  if (!taken.has(candidate)) return candidate;
  let n = 2;
  let next = `${candidate}_${n}`;
  while (taken.has(next)) {
    n += 1;
    next = `${candidate}_${n}`;
  }
  return next;
}

/**
 * Merges `importedText`'s top-level elements into `existingText`. Throws if
 * either input, or the merged result, fails to parse — that is this
 * function's own invariant (importModel() already guarantees importedText
 * parses cleanly; a failure here means a bug in this splice logic, not a
 * user input error).
 */
export async function mergeImportedText(
  existingText: string,
  importedText: string,
  options: MergeOptions = { onCollision: 'skip' }
): Promise<MergeResult> {
  const [existingParse, importedParse] = await Promise.all([
    parse(existingText, 'inmemory:///existing.rosetta'),
    parse(importedText, 'inmemory:///imported.rosetta')
  ]);
  if (existingParse.hasErrors) {
    throw new Error('mergeImportedText: existingText failed to parse.');
  }
  if (importedParse.hasErrors) {
    throw new Error('mergeImportedText: importedText failed to parse.');
  }

  const existingElements = existingParse.value.elements as ReadonlyArray<{ name?: string; $cstNode?: { offset: number; length: number } }>;
  const existingByName = new Map(
    existingElements
      .filter((el): el is typeof el & { name: string } => el.name !== undefined)
      .map((el) => [el.name, el])
  );
  const allNames = new Set(existingByName.keys());

  const skipped: string[] = [];
  const overwritten: string[] = [];
  const renamed: { from: string; to: string }[] = [];
  const appendSpans: string[] = [];
  // Existing-text edits (overwrite only) are collected as [start, end, replacement]
  // and applied in one pass, offset-safe by processing in descending start order.
  const existingEdits: { start: number; end: number; replacement: string }[] = [];

  for (const el of importedParse.value.elements as ReadonlyArray<{ name?: string; $cstNode?: { offset: number; length: number } }>) {
    const name = el.name;
    const cst = el.$cstNode;
    if (!cst) continue;
    const spanText = importedText.slice(cst.offset, cst.offset + cst.length);
    const collision = name !== undefined && existingByName.has(name);

    if (!collision) {
      appendSpans.push(spanText);
      if (name !== undefined) allNames.add(name);
      continue;
    }

    if (options.onCollision === 'skip') {
      skipped.push(name!);
      continue;
    }

    if (options.onCollision === 'overwrite') {
      const existingEl = existingByName.get(name!)!;
      const existingCst = existingEl.$cstNode!;
      existingEdits.push({ start: existingCst.offset, end: existingCst.offset + existingCst.length, replacement: spanText });
      overwritten.push(name!);
      continue;
    }

    // rename
    const newName = uniqueDeclarationName(name!, allNames);
    allNames.add(newName);
    renamed.push({ from: name!, to: newName });
    appendSpans.push(renameDeclaration(spanText, newName));
  }

  let mergedExisting = existingText;
  for (const edit of existingEdits.sort((a, b) => b.start - a.start)) {
    mergedExisting = mergedExisting.slice(0, edit.start) + edit.replacement + mergedExisting.slice(edit.end);
  }

  const mergedText = appendSpans.length === 0 ? mergedExisting : `${mergedExisting}\n\n${appendSpans.join('\n\n')}`;

  const mergedParse = await parse(mergedText, 'inmemory:///merged.rosetta');
  if (mergedParse.hasErrors) {
    throw new Error('mergeImportedText: merged output failed to re-parse.');
  }

  return { mergedText, skipped, overwritten, renamed };
}
```

- [ ] **Step 8: Run the merge tests to verify they pass**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/import-merge.test.ts test/shell/import-merge-options.test.ts`
Expected: PASS. If `renameDeclaration`'s regex doesn't match your test fixture's exact whitespace, adjust the fixture (not the regex's `\s+` — keep it whitespace-tolerant) — check the ACTUAL Rune grammar keyword set (`type`/`enum`/`choice`/`func`) is complete by cross-checking `RosettaModel.elements`'s member `$type` values in `@rune-langium/core`'s generated AST if any case is missed.

- [ ] **Step 9: Run the full studio suite for regressions**

Run: `pnpm --filter @rune-langium/studio run test`
Expected: all pass — `ImportDialog.test.tsx`'s existing mocked calls to `mergeImportedText` still resolve fine (they mock the whole function; Task 8 updates the mock's return shape).

Note: this step will likely surface `ImportDialog.test.tsx` mock-shape failures (its mocked `mergeImportedText` return values won't have `overwritten`/`renamed` yet) — that's expected and is Task 8's job to fix, not this task's. Confirm the failures are ONLY in `ImportDialog.test.tsx` before committing.

- [ ] **Step 10: Commit**

```bash
git add apps/studio/src/shell/import-merge-options.ts apps/studio/src/shell/import-merge.ts \
        apps/studio/test/shell/import-merge.test.ts apps/studio/test/shell/import-merge-options.test.ts
git commit -m "feat(studio): MergeOptionsSchema + overwrite/rename collision strategies"
```

---

### Task 7: z2f schema re-exports + adapter components (×4 formats)

**Files:**
- Create: `apps/studio/src/codegen-forms/json-schema-import-options.schema.ts`, `apps/studio/src/codegen-forms/openapi-import-options.schema.ts`, `apps/studio/src/codegen-forms/sql-import-options.schema.ts`, `apps/studio/src/codegen-forms/xsd-import-options.schema.ts`
- Create: `apps/studio/src/codegen-forms/JsonSchemaImportOptionsFormAdapter.tsx`, `apps/studio/src/codegen-forms/OpenApiImportOptionsFormAdapter.tsx`, `apps/studio/src/codegen-forms/SqlImportOptionsFormAdapter.tsx`, `apps/studio/src/codegen-forms/XsdImportOptionsFormAdapter.tsx`
- Modify: `packages/codegen/src/import/index.ts` — re-export the 4 new option schemas so studio can import them via the public `@rune-langium/codegen/import` subpath (mirroring how `@rune-langium/codegen/export` already re-exports `ExcelOptionsSchema`)

**Interfaces:**
- Consumes: `JsonSchemaImportOptionsSchema`, `OpenApiImportOptionsSchema`, `SqlImportOptionsSchema`, `XsdImportOptionsSchema` (Tasks 1-4).
- Produces: 4 adapter components, each `(props: { value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) => React.ReactElement` — consumed by Task 9 (`ExplorePerspective.tsx`).

- [ ] **Step 1: Re-export the 4 schemas from `@rune-langium/codegen/import`**

In `packages/codegen/src/import/index.ts`, add near the top with the other re-exports:

```ts
export { JsonSchemaImportOptionsSchema } from '../options/json-schema-import-options.js';
export { OpenApiImportOptionsSchema } from '../options/openapi-import-options.js';
export { SqlImportOptionsSchema } from '../options/sql-import-options.js';
export { XsdImportOptionsSchema } from '../options/xsd-import-options.js';
```

Only the schema VALUES are re-exported here — the `?z2f` adapters (Step 3) import only the schema, not any type. No type re-export is needed: nothing downstream in this plan (adapters, `ImportDialog`, `ExplorePerspective`) consumes a typed `{Format}ImportOptions` shape from this subpath, and each reader's own `sources/*.ts` module already exports its own same-named `{Format}ImportOptions` interface (Tasks 1-4) — re-exporting a same-named type here too would collide with no consumer to justify it.

- [ ] **Step 2: Create the 4 thin `.schema.ts` re-export files**

```ts
// apps/studio/src/codegen-forms/json-schema-import-options.schema.ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Studio-local re-export of JsonSchemaImportOptionsSchema for the ?z2f Vite
 * plugin. See excel-options.schema.ts for the established pattern this
 * mirrors. Keep this a thin re-export — no studio-local state or React.
 */
export { JsonSchemaImportOptionsSchema as default, JsonSchemaImportOptionsSchema } from '@rune-langium/codegen/import';
```

```ts
// apps/studio/src/codegen-forms/openapi-import-options.schema.ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

export { OpenApiImportOptionsSchema as default, OpenApiImportOptionsSchema } from '@rune-langium/codegen/import';
```

```ts
// apps/studio/src/codegen-forms/sql-import-options.schema.ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

export { SqlImportOptionsSchema as default, SqlImportOptionsSchema } from '@rune-langium/codegen/import';
```

```ts
// apps/studio/src/codegen-forms/xsd-import-options.schema.ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

export { XsdImportOptionsSchema as default, XsdImportOptionsSchema } from '@rune-langium/codegen/import';
```

- [ ] **Step 3: Create the 4 adapter components**

```tsx
// apps/studio/src/codegen-forms/JsonSchemaImportOptionsFormAdapter.tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Adapter that wraps the ?z2f-generated JsonSchemaImportOptionsForm with the
 * controlled `{ value, onChange }` contract ImportDialog expects.
 *
 * IMPORTANT: this file imports `?z2f` and MUST NOT be imported from
 * ImportDialog.tsx or any test that exercises it in isolation. Only
 * ExplorePerspective.tsx (the wiring site) should import this module.
 */

import React from 'react';
import GeneratedJsonSchemaImportOptionsForm from './json-schema-import-options.schema?z2f';

export interface JsonSchemaImportOptionsFormAdapterProps {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}

export function JsonSchemaImportOptionsFormAdapter({
  value,
  onChange
}: JsonSchemaImportOptionsFormAdapterProps): React.ReactElement {
  return <GeneratedJsonSchemaImportOptionsForm defaultValues={value} onSubmit={(data: unknown) => onChange(data as Record<string, unknown>)} />;
}
```

```tsx
// apps/studio/src/codegen-forms/OpenApiImportOptionsFormAdapter.tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import React from 'react';
import GeneratedOpenApiImportOptionsForm from './openapi-import-options.schema?z2f';

export interface OpenApiImportOptionsFormAdapterProps {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}

export function OpenApiImportOptionsFormAdapter({
  value,
  onChange
}: OpenApiImportOptionsFormAdapterProps): React.ReactElement {
  return <GeneratedOpenApiImportOptionsForm defaultValues={value} onSubmit={(data: unknown) => onChange(data as Record<string, unknown>)} />;
}
```

```tsx
// apps/studio/src/codegen-forms/SqlImportOptionsFormAdapter.tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import React from 'react';
import GeneratedSqlImportOptionsForm from './sql-import-options.schema?z2f';

export interface SqlImportOptionsFormAdapterProps {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}

export function SqlImportOptionsFormAdapter({ value, onChange }: SqlImportOptionsFormAdapterProps): React.ReactElement {
  return <GeneratedSqlImportOptionsForm defaultValues={value} onSubmit={(data: unknown) => onChange(data as Record<string, unknown>)} />;
}
```

```tsx
// apps/studio/src/codegen-forms/XsdImportOptionsFormAdapter.tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import React from 'react';
import GeneratedXsdImportOptionsForm from './xsd-import-options.schema?z2f';

export interface XsdImportOptionsFormAdapterProps {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}

export function XsdImportOptionsFormAdapter({ value, onChange }: XsdImportOptionsFormAdapterProps): React.ReactElement {
  return <GeneratedXsdImportOptionsForm defaultValues={value} onSubmit={(data: unknown) => onChange(data as Record<string, unknown>)} />;
}
```

- [ ] **Step 4: Verify the build picks up the new `?z2f` modules**

Run: `pnpm --filter @rune-langium/studio run build`
Expected: build succeeds — the `?z2f` Vite plugin generates a form for each of the 4 new `.schema.ts` files with no errors. If the plugin requires an explicit registration list (check `vite.config.ts`/`z2f`-related config for whether `excel-options.schema.ts` needed to be listed anywhere, or whether the plugin auto-discovers any `*.schema.ts?z2f` import) — mirror whatever `excel-options.schema.ts` required exactly; do not assume auto-discovery without checking.

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/import/index.ts \
        apps/studio/src/codegen-forms/json-schema-import-options.schema.ts \
        apps/studio/src/codegen-forms/openapi-import-options.schema.ts \
        apps/studio/src/codegen-forms/sql-import-options.schema.ts \
        apps/studio/src/codegen-forms/xsd-import-options.schema.ts \
        apps/studio/src/codegen-forms/JsonSchemaImportOptionsFormAdapter.tsx \
        apps/studio/src/codegen-forms/OpenApiImportOptionsFormAdapter.tsx \
        apps/studio/src/codegen-forms/SqlImportOptionsFormAdapter.tsx \
        apps/studio/src/codegen-forms/XsdImportOptionsFormAdapter.tsx
git commit -m "feat(studio): z2f-generated options forms for the 4 import readers"
```

---

### Task 8: `ImportDialog.tsx` — options form + collision selector

**Files:**
- Modify: `apps/studio/src/components/ImportDialog.tsx` (full description below)
- Test: `apps/studio/test/components/ImportDialog.test.tsx` (extend)

**Interfaces:**
- Consumes: `MergeOptionsSchema`/`MergeOptions` (Task 6); the 4 adapter components' `{value, onChange}` contract (Task 7, but received as a PROP, never imported directly — see Global Constraints).
- Produces: extended `ImportDialogProps` (`optionsFormsByFormat`) — consumed by Task 9.

- [ ] **Step 1: Write the failing test for the new props**

Add to `apps/studio/test/components/ImportDialog.test.tsx` (following the file's existing mock-setup conventions for `importModel`/`mergeImportedText`):

```ts
function MockOptionsForm({ value, onChange }: { value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  return (
    <button data-testid="mock-options-form" onClick={() => onChange({ skipConditions: true })}>
      {JSON.stringify(value)}
    </button>
  );
}

const optionsFormsByFormat = {
  'json-schema': MockOptionsForm,
  openapi: MockOptionsForm,
  sql: MockOptionsForm,
  xsd: MockOptionsForm
};

it('renders the options form for the selected format and threads its value into importModel', async () => {
  mockImportModel.mockResolvedValue({
    text: 'namespace demo\n\ntype Foo:\n\ta string (1..1)\n',
    model: { namespace: 'demo', types: [{ name: 'Foo' }], enums: [], funcs: [] },
    diagnostics: []
  });
  render(
    <ImportDialog
      open
      onClose={vi.fn()}
      files={[]}
      onFilesChange={vi.fn()}
      onFileFocused={vi.fn()}
      namespaceToFile={new Map()}
      optionsFormsByFormat={optionsFormsByFormat}
    />
  );
  expect(screen.getByTestId('mock-options-form')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('mock-options-form'));
  fireEvent.change(screen.getByTestId('import-dialog__source'), { target: { value: '{}' } });
  fireEvent.click(screen.getByText('Preview'));
  await waitFor(() =>
    expect(mockImportModel).toHaveBeenCalledWith(
      '{}',
      expect.objectContaining({ from: 'json-schema', skipConditions: true })
    )
  );
});

it('always shows the onCollision selector defaulting to skip', () => {
  render(
    <ImportDialog
      open
      onClose={vi.fn()}
      files={[]}
      onFilesChange={vi.fn()}
      onFileFocused={vi.fn()}
      namespaceToFile={new Map()}
      optionsFormsByFormat={optionsFormsByFormat}
    />
  );
  expect(screen.getByTestId('import-dialog__on-collision')).toHaveTextContent(/skip/i);
});
```

Also update every EXISTING test's `mergeImportedText` mock return values to include `overwritten: []`/`renamed: []` (Task 6 widened `MergeResult`) — grep the file for `mockResolvedValue` calls returning a `MergeResult`-shaped object and add both fields to each.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/components/ImportDialog.test.tsx`
Expected: FAIL — `optionsFormsByFormat` prop doesn't exist yet; no options form or collision selector rendered.

- [ ] **Step 3: Update `ImportDialogProps` and add local state**

At the top of `ImportDialog.tsx`, add:

```ts
import { MergeOptionsSchema, type MergeOptions } from '../shell/import-merge-options.js';

export interface ImportOptionsFormProps {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}

export interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  files: readonly WorkspaceFile[];
  onFilesChange: (files: WorkspaceFile[]) => void;
  onFileFocused: (path: string) => void;
  namespaceToFile: ReadonlyMap<string, string>;
  /** format → z2f-generated options-form component. Supplied by the mount site (ExplorePerspective) so ImportDialog itself never imports a `?z2f` module — see the plan's Global Constraints. */
  optionsFormsByFormat: Record<ImportFormat, React.ComponentType<ImportOptionsFormProps>>;
}
```

(Adjust to match whatever `ImportDialogProps`/`WorkspaceFile` import already look like in the file — this is additive to the existing prop list, not a replacement.)

Add local state (alongside the existing `format`/`sourceText`/`namespaceField`/`phase` state):

```ts
const [formatOptions, setFormatOptions] = useState<Record<string, unknown>>({});
const [onCollision, setOnCollision] = useState<MergeOptions['onCollision']>(MergeOptionsSchema.parse({}).onCollision);
```

Reset `formatOptions` on format change (alongside the existing `useEffect(() => setPhase({ kind: 'idle' }), [format])`):

```ts
useEffect(() => {
  setFormatOptions({});
}, [format]);
```

- [ ] **Step 4: Thread `formatOptions`/`onCollision` into `handlePreview`**

Change the `importModel` call from:

```ts
const result = await importModel(sourceText, {
  from: format,
  namespace: namespaceField.trim() || undefined
});
```

to:

```ts
const result = await importModel(sourceText, {
  from: format,
  namespace: namespaceField.trim() || undefined,
  ...formatOptions
});
```

Change the `mergeImportedText` call from:

```ts
const merge = await mergeImportedText(existing.content, result.text);
```

to:

```ts
const merge = await mergeImportedText(existing.content, result.text, { onCollision });
```

Add `formatOptions`/`onCollision` to `handlePreview`'s `useCallback` dependency array.

- [ ] **Step 5: Render the options form and the collision selector**

Add the options form right after the existing namespace/Preview row:

```tsx
{(() => {
  const OptionsForm = optionsFormsByFormat[format];
  return <OptionsForm value={formatOptions} onChange={setFormatOptions} />;
})()}

<div className="flex items-center gap-3">
  <label className="text-sm font-medium" htmlFor="import-dialog-on-collision">
    On collision:
  </label>
  <Select value={onCollision} onValueChange={(v) => setOnCollision(v as MergeOptions['onCollision'])}>
    <SelectTrigger id="import-dialog-on-collision" size="sm" className="w-40" data-testid="import-dialog__on-collision">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="skip">Skip</SelectItem>
      <SelectItem value="overwrite">Overwrite</SelectItem>
      <SelectItem value="rename">Rename</SelectItem>
    </SelectContent>
  </Select>
</div>
```

- [ ] **Step 6: Update the merge banner to reflect `overwritten`/`renamed`**

The existing merge banner only reports `phase.merge.skipped`. Extend it:

```tsx
{phase.matchedPath && phase.merge && (
  <Alert data-testid="import-dialog__merge-banner">
    <AlertDescription>
      Will merge into <span className="font-mono">{phase.matchedPath}</span>
      {phase.merge.skipped.length > 0 &&
        ` — ${phase.merge.skipped.length} declaration(s) skipped, already exist: ${phase.merge.skipped.join(', ')}`}
      {phase.merge.overwritten.length > 0 &&
        ` — ${phase.merge.overwritten.length} declaration(s) will be overwritten: ${phase.merge.overwritten.join(', ')}`}
      {phase.merge.renamed.length > 0 &&
        ` — ${phase.merge.renamed.length} declaration(s) renamed to avoid collision: ${phase.merge.renamed.map((r) => `${r.from} → ${r.to}`).join(', ')}`}
    </AlertDescription>
  </Alert>
)}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/components/ImportDialog.test.tsx`
Expected: PASS, including every pre-existing case (with their `mergeImportedText` mock return values widened per Step 1).

- [ ] **Step 8: Run the full studio suite and type-check for regressions**

Run: `pnpm --filter @rune-langium/studio run test && pnpm --filter @rune-langium/studio run type-check`
Expected: all pass, clean.

- [ ] **Step 9: Commit**

```bash
git add apps/studio/src/components/ImportDialog.tsx apps/studio/test/components/ImportDialog.test.tsx
git commit -m "feat(studio): ImportDialog options form + onCollision selector"
```

---

### Task 9: Wire the 4 adapters + collision options through `ExplorePerspective`

**Files:**
- Modify: `apps/studio/src/shell/ExplorePerspective.tsx` (the existing `<ImportDialog>` mount site)

**Interfaces:**
- Consumes: the 4 adapter components (Task 7), `ImportDialogProps.optionsFormsByFormat` (Task 8).

- [ ] **Step 1: Import the 4 adapters**

Add near `ExplorePerspective.tsx`'s other component imports:

```ts
import { JsonSchemaImportOptionsFormAdapter } from '../codegen-forms/JsonSchemaImportOptionsFormAdapter.js';
import { OpenApiImportOptionsFormAdapter } from '../codegen-forms/OpenApiImportOptionsFormAdapter.js';
import { SqlImportOptionsFormAdapter } from '../codegen-forms/SqlImportOptionsFormAdapter.js';
import { XsdImportOptionsFormAdapter } from '../codegen-forms/XsdImportOptionsFormAdapter.js';
```

- [ ] **Step 2: Build the format→adapter map**

Add a module-level constant (outside the component, so it isn't recreated every render — matches `EMPTY_EXPANSION_MAP`-style constants already used elsewhere in this codebase for the same reason):

```ts
const IMPORT_OPTIONS_FORMS_BY_FORMAT = {
  'json-schema': JsonSchemaImportOptionsFormAdapter,
  openapi: OpenApiImportOptionsFormAdapter,
  sql: SqlImportOptionsFormAdapter,
  xsd: XsdImportOptionsFormAdapter
} as const;
```

- [ ] **Step 3: Pass it to `<ImportDialog>`**

Change the existing mount:

```tsx
<ImportDialog
  open={showImportDialog}
  onClose={() => setShowImportDialog(false)}
  files={files}
  onFilesChange={(next) => onFilesChange?.(next)}
  onFileFocused={openFileInSource}
  namespaceToFile={namespaceToFile}
/>
```

to:

```tsx
<ImportDialog
  open={showImportDialog}
  onClose={() => setShowImportDialog(false)}
  files={files}
  onFilesChange={(next) => onFilesChange?.(next)}
  onFileFocused={openFileInSource}
  namespaceToFile={namespaceToFile}
  optionsFormsByFormat={IMPORT_OPTIONS_FORMS_BY_FORMAT}
/>
```

- [ ] **Step 4: Run the full studio suite, type-check, and build for regressions**

Run: `pnpm --filter @rune-langium/studio run test && pnpm --filter @rune-langium/studio run type-check && pnpm --filter @rune-langium/studio run build`
Expected: all pass. The build step is the real proof the `?z2f` wiring works end-to-end (vitest never runs the Vite plugin transform, so this is the first point in the whole task sequence that actually exercises it for real).

- [ ] **Step 5: Manual smoke check**

Run `pnpm run dev:studio`, open the Explore perspective, click Import, switch between all 4 formats and confirm each shows its own options form, change the "On collision" selector, and run one Preview → Add-to-workspace flow end to end.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/shell/ExplorePerspective.tsx
git commit -m "feat(studio): wire the 4 import-options adapters into ExplorePerspective"
```

## Self-Review Notes (for the plan author, not a task)

- **Spec coverage:** Task 1-4 cover the 4 reader options schemas; Task 5 covers `importModel` threading; Task 6 covers merge options; Task 7-9 cover z2f wiring end to end. All sections of the design doc are represented.
- **Known risk flagged inline, not hidden:** Task 4 Step 5 (XSD `importTopLevelElements`) is marked as needing verification against the real code during implementation — it is grounded in what the design doc and prior investigation established, but the exact `buildType`/`readComplexType` call shape was not read in full before this plan was written. A task reviewer should treat this as the highest-scrutiny spot in the whole plan.
- **Correction (post-Task-1 implementation):** Tasks 1-4's reader-facing `{Format}ImportOptions` interfaces were originally specified to extend `z.infer<typeof {Format}ImportOptionsSchema>` (the schema's OUTPUT type). Since every field uses `.optional().default(...)`, `z.infer`/`z.output` resolves those fields to REQUIRED (defaults guarantee they're always present post-parse) — which broke every existing call site that omits them (e.g. `readJsonSchema(schema, { namespace: 'x' })`), confirmed by real compiler diagnostics during Task 1's implementation. Fixed by extending `z.input<typeof {Format}ImportOptionsSchema>` instead (keeps every defaulted field genuinely optional for callers — the same pattern `resolveExcelSheets` in `excel-options.ts` uses, just applied at the type level instead of via an explicit `Partial<>` parameter). All 4 tasks' Step 5 code blocks above already reflect this fix. This also removed the Task 7 naming-collision risk noted in an earlier version of this section — Task 7 no longer re-exports any type, only the schema values, so there is nothing to collide with.
