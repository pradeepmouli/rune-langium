# Contract — Generator API (`@rune-langium/codegen`)

**Surface**: Public TypeScript API of the new MIT-licensed
`packages/codegen` package.
**Spec hooks**: FR-001–FR-032, SC-001, SC-002, SC-006, SC-007, SC-009.

---

## Public exports

```ts
// packages/codegen/src/index.ts

/** Primary entry point: generate code from Langium documents. */
export function generate(
  documents: LangiumDocument | LangiumDocument[],
  options?: GeneratorOptions
): GeneratorOutput[];

/** The three generator targets. */
export type Target = 'zod' | 'json-schema' | 'typescript';

/** Options for a generation run. */
export interface GeneratorOptions {
  target?: Target;       // default: 'zod'
  strict?: boolean;      // default: false
  headerComment?: string; // optional file header prefix
}

/** One emitted output file. */
export interface GeneratorOutput {
  relativePath: string;
  content: string;
  sourceMap: SourceMapEntry[];
  diagnostics: GeneratorDiagnostic[];
  /**
   * Emitted function declarations for this namespace.
   * Non-empty only when `target === 'typescript'` (FR-028, FR-031).
   * Empty array for 'zod' and 'json-schema' targets — funcs are silently
   * skipped (FR-031).
   */
  funcs: GeneratedFunc[];
}

/**
 * Metadata for a single emitted Rune `func` (TypeScript target only).
 * The function's text is included inline in `content`; this record
 * provides addressable metadata for tooling (source-map lookup,
 * documentation generation, etc.).
 */
export interface GeneratedFunc {
  /** The func's identifier as declared in the Rune model. */
  name: string;
  /**
   * The relative output path of the module file containing this func
   * (same as the enclosing `GeneratorOutput.relativePath`).
   */
  relativePath: string;
  /**
   * The full text of just the emitted function declaration (subset of
   * `GeneratorOutput.content`). Useful for unit-testing the emitter in
   * isolation without parsing the full file.
   */
  fileContents: string;
  /**
   * Source-map entries scoped to this function's output lines.
   * A subset of the enclosing `GeneratorOutput.sourceMap`.
   */
  sourceMap: SourceMapEntry[];
}

/** One source-map entry: output line → source location. */
export interface SourceMapEntry {
  outputLine: number;   // zero-based
  sourceUri: string;
  sourceLine: number;   // one-based
  sourceChar: number;   // one-based
}

/** A generator-time diagnostic (not a Langium validation diagnostic). */
export interface GeneratorDiagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  code: string;
  sourceUri?: string;
  line?: number;
  char?: number;
}
```

---

## `generate()` — full signature

```ts
generate(
  documents: LangiumDocument | LangiumDocument[],
  options?: GeneratorOptions
): GeneratorOutput[]
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `documents` | `LangiumDocument \| LangiumDocument[]` | yes | One or more parsed Langium documents. The generator does not re-parse; it reads the documents' ASTs directly. All documents must share a resolved `LangiumServices` context (cross-reference resolution must already have run). |
| `options.target` | `Target` | no (default `'zod'`) | Selects the emitter pipeline. |
| `options.strict` | `boolean` | no (default `false`) | If `true`, any `GeneratorDiagnostic` with `severity: 'error'` causes `generate()` to throw a `GeneratorError` instead of returning a partial result. |
| `options.headerComment` | `string` | no | Prepended to each emitted file's header comment. Do NOT set this when requiring byte-identical output (SC-007). |

### Return value

An array of `GeneratorOutput`, one per Rune namespace detected in
the input documents. The array is sorted by `relativePath`
(lexicographic, ascending) for determinism.

### Errors

| Condition | Behaviour |
|-----------|-----------|
| `documents` is empty or none have Rune content | Returns `[]` with no diagnostics |
| Unresolved cross-references in any document | Emits `GeneratorDiagnostic { code: 'unresolved-ref', severity: 'warning' }` per unresolved reference; partial generation continues |
| Mis-spelled attribute in a `condition` block | Emits `GeneratorDiagnostic { code: 'unknown-attribute', severity: 'error' }` per bad reference; emits a comment placeholder in the predicate body that fails `tsc --noEmit` deterministically (FR-025) |
| `options.strict === true` and any error diagnostic | Throws `GeneratorError extends Error` with `.diagnostics: GeneratorDiagnostic[]` |

### Example — Node.js CLI context

```ts
import { createRuneServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '@rune-langium/codegen';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const services = createRuneServices();
const doc = await services.shared.workspace.LangiumDocuments
  .getOrCreateDocument(URI.file('/path/to/model.rune'));
await services.shared.workspace.DocumentBuilder.build([doc]);

const outputs = generate(doc, { target: 'zod' });
for (const out of outputs) {
  const dest = join('/out', out.relativePath);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, out.content, 'utf-8');
}
```

### Example — Browser / Web Worker context

```ts
import { generate } from '@rune-langium/codegen';

// documents come from the LSP worker's LangiumDocuments store
const outputs = generate(openDocuments, { target: 'json-schema' });

// deliver output strings + source maps to the main thread
self.postMessage({
  type: 'codegen:result',
  outputs: outputs.map(o => ({
    relativePath: o.relativePath,
    content: o.content,
    sourceMap: o.sourceMap,
  })),
});
```

---

## Emitter behaviour by target

### `'zod'` (FR-002–FR-014, FR-021)

Each Rune namespace produces one `*.zod.ts` file. File structure:

```ts
// generated by rune-codegen 0.1.0 — DO NOT EDIT
// SPDX-License-Identifier: MIT

import { z } from 'zod';
import { ParentSchema } from './parent.zod.js'; // cross-namespace import

// --- rune-codegen runtime helpers (inlined) ---
const runeCheckOneOf = (...) => ...;
const runeCount = (...) => ...;
const runeAttrExists = (...) => ...;
// --- end runtime helpers ---

export const PartyRoleEnum = z.enum(['Client', 'Counterparty']);
export type PartyRole = z.infer<typeof PartyRoleEnum>;

export const PartyRoleDisplayNames: Record<PartyRole, string> = {
  Client: 'Client',
  Counterparty: 'Counterparty',
};

export const PartySchema = ParentSchema.extend({
  partyId: z.string(),
  accounts: z.array(AccountSchema).min(1),
  role: PartyRoleEnum.optional(),
}).superRefine((val, ctx) => {
  // condition: OnePartyId
  if (!runeAttrExists(val.partyId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom,
      message: 'Party.OnePartyId: partyId must exist', path: ['partyId'] });
  }
});

export type Party = z.infer<typeof PartySchema>;
```

Rune `func` declarations are silently skipped for this target (FR-031).
The `funcs` field of each `GeneratorOutput` is always an empty array
when `target === 'zod'`.

**Cardinality encoding** (FR-003):

| Rune cardinality | Zod expression |
|-----------------|----------------|
| `(1..1)` | `z.T()` (required scalar) |
| `(0..1)` | `z.T().optional()` |
| `(0..*)` | `z.array(z.T())` |
| `(1..*)` | `z.array(z.T()).min(1)` |
| `(n..m)` | `z.array(z.T()).min(n).max(m)` |
| `(n..n)` n > 1 | `z.array(z.T()).length(n)` |

### `'json-schema'` (FR-019)

Each Rune namespace produces one `*.schema.json` file:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "cdm/base/math.schema.json",
  "title": "cdm.base.math",
  "$defs": {
    "Quantity": {
      "type": "object",
      "properties": {
        "amount": { "type": "number" },
        "unit": { "$ref": "#/$defs/UnitType" }
      },
      "required": ["amount"],
      "additionalProperties": false
    }
  }
}
```

Enums emit as `{ "enum": ["Buy", "Sell"] }`. Cardinality encodes
as `"type": "array", "minItems": n, "maxItems": m` (omit `maxItems`
for unbounded).

Rune `func` declarations are silently skipped (FR-031). No JSON Schema
entry is emitted for funcs; the `funcs` field of the `GeneratorOutput`
is always an empty array for this target.

### `'typescript'` (FR-020)

Each Rune namespace produces one `*.ts` file with zero Zod imports:

```ts
// generated by rune-codegen 0.1.0 — DO NOT EDIT
// SPDX-License-Identifier: MIT

// --- rune-codegen runtime helpers (inlined) ---
const runeCheckOneOf = (...) => ...;
const runeCount = (...) => ...;
const runeAttrExists = (...) => ...;
// --- end runtime helpers ---

export interface PartyShape {
  partyId: string;
  accounts: Account[];
  role?: PartyRole;
}

export class Party implements PartyShape {
  partyId: string;
  accounts: Account[];
  role?: PartyRole;

  private constructor(data: PartyShape) {
    this.partyId = data.partyId;
    this.accounts = data.accounts;
    this.role = data.role;
  }

  static from(json: unknown): Party {
    if (!isParty(json)) {
      throw new TypeError('Party.from: invalid shape');
    }
    return new Party(json as PartyShape);
  }

  validateOnePartyId(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!runeAttrExists(this.partyId)) {
      errors.push('Party.OnePartyId: partyId must exist');
    }
    return { valid: errors.length === 0, errors };
  }
}

export function isParty(x: unknown): x is Party {
  return (
    typeof x === 'object' && x !== null &&
    typeof (x as PartyShape).partyId === 'string' &&
    Array.isArray((x as PartyShape).accounts)
  );
}
```

---

### Function declarations (TS target only — FR-028–FR-032, US6)

Only the `typescript` target produces non-empty `funcs` output. The
`'zod'` and `'json-schema'` targets silently skip all Rune `func`
declarations (FR-031); their `funcs` arrays are always `[]`.

**Rune source** (6 lines):

```rune
func AddTwo:
  inputs:
    a int (1..1)
    b int (1..1)
  output:
    result int (1..1)
  set result: a + b
```

**TypeScript output** (~12 lines, emitted inside the namespace `*.ts` module):

```ts
/**
 * func AddTwo — generated by rune-codegen 0.1.0
 * Source: cdm/base/math.rune:1
 */
export function AddTwo(input: { a: number; b: number }): number {
  let result: number;
  result = input.a + input.b;
  return result;
}
```

**Call site** (consumer code, after importing the generated module):

```ts
import { AddTwo } from './generated/cdm/base/math.js';

const sum = AddTwo({ a: 2, b: 3 }); // → 5
```

**`GeneratedFunc` metadata** (returned in `GeneratorOutput.funcs[n]`):

```ts
{
  name: 'AddTwo',
  relativePath: 'cdm/base/math.ts',
  fileContents: 'export function AddTwo(input: { a: number; b: number }): number { ... }',
  sourceMap: [
    { outputLine: 5, sourceUri: 'file:///path/to/cdm/base/math.rune', sourceLine: 1, sourceChar: 1 },
    { outputLine: 7, sourceUri: 'file:///path/to/cdm/base/math.rune', sourceLine: 8, sourceChar: 3 },
  ]
}
```

**Pre/post condition wrapping**: A func with a pre-condition emits the
condition check immediately after the `let result` declaration and before
any `set`/`add` statements; a func with a post-condition emits the check
after the last statement and before `return result`. Both throw
`new Error('Diagnostic: <ConditionName> failed')` on violation (FR-029).

**Abstract funcs** (FR-032): A func with no `set`/`add` body emits a
function whose body (after pre-conditions) is:
```ts
throw new Error('Diagnostic: AddTwo — not_implemented. Add a func body to implement this function.');
```
The generator also emits a non-fatal `GeneratorDiagnostic { code:
'abstract-func', severity: 'info' }` reminding the author to add a body.

---

## Error modes

| Error | Type | When |
|-------|------|------|
| `GeneratorError` | thrown | `strict: true` + any `severity: 'error'` diagnostic |
| Non-empty `diagnostics` in output | returned | partial output; caller decides |
| `[]` return | returned | empty input or no Rune content |

```ts
export class GeneratorError extends Error {
  readonly diagnostics: GeneratorDiagnostic[];
  constructor(message: string, diagnostics: GeneratorDiagnostic[]) {
    super(message);
    this.name = 'GeneratorError';
    this.diagnostics = diagnostics;
  }
}
```

---

## Package metadata

```jsonc
// packages/codegen/package.json (new, MIT)
{
  "name": "@rune-langium/codegen",
  "version": "0.1.0",
  "license": "MIT",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "dependencies": {
    "@rune-langium/core": "workspace:*",
    "langium": "^4.2.0"
  },
  "devDependencies": {
    "zod": "^4.3.6",    // fixture tests only; NOT a runtime dep
    "vitest": "^4.x",
    "typescript": "^5.9.x"
  }
}
```

`zod` is a **devDependency only**. The generator emits Zod code but
does not call Zod APIs at generation time. Consumers of Zod-target
output add `zod` to their own dependencies.
