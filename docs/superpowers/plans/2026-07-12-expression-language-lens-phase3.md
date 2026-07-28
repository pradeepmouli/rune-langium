# Expression Language Lens — Phase 3 (Python Lens) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Python projection of the same `RosettaExpression` lens Phase 1 (TypeScript, conditions) and Phase 2 (function bodies) already ship — same `LanguageLens<L>` interface, same subset `S`, same "refuse, don't degrade" contract, new `python` adapter.

**Architecture:** `packages/codegen/src/lens/python/` mirrors `packages/codegen/src/lens/typescript/` file-for-file: a grammar loader, a `render-py.ts` (`RosettaExpression → Python text`), and a `parse-py.ts` (`Python text → LensResult`). Both `subset.ts` (the `$type` allowlist) and `language-lens.ts` (the interface) are **reused unmodified** — every one of the 12 types Phase 1 defined turns out to be representable in Python too, just via different tokens/idioms per type. The one genuinely new piece of design is `RosettaFeatureCall`'s Python projection: Python has no `?.`-equivalent operator, so it's represented via the built-in `getattr(receiver, "field", None)` call — verified empirically (see Global Constraints) to be a deterministic, reversible, and idiomatically-recognizable mapping, the same "recognized helper call" pattern the spec already established for `count`/`one-of` in conditions.

**Tech Stack:** `@vscode/tree-sitter-wasm@0.3.1` (already a dependency from Phase 1 — ships `wasm/tree-sitter-python.wasm` alongside the TypeScript grammar already in use, confirmed present on disk during planning), `web-tree-sitter` (already a dependency).

## Global Constraints

- Canonical form is always Rune text; Python is a lossless projection with no persistence (same as TS — spec: "Canonical Form Is Always Pure Rune").
- Refuse, never degrade: any construct outside subset `S`, or any Python construct with no faithful Rune equivalent, must produce `null` (render) or a `RefusalReason` (parse) — never an approximate result.
- Subset `S` (`packages/codegen/src/lens/subset.ts`) is **not modified by this plan** — all 12 existing types are representable in Python. Do not add or remove entries; if a task in this plan seems to need a `subset.ts` change, stop and re-check against this constraint before proceeding.
- Exact round-trip fidelity: the Python↔Rune↔Python write-back direction must reproduce the exact original Python text (`expect(py2).toBe(py)` — same bar Phase 1/2 hold for TypeScript), not merely a semantically-equivalent rewording.
- Three subset-boundary decisions, resolved during planning via real tree-sitter-python parses (do not re-litigate — implement per these decisions):
  1. **`**` (power) and `//` (floor division) have no Rune equivalent** — Rune's `ArithmeticOperation` only supports `+ - * /`. Both tokens must be refused outright on parse (no rendering concern — Rune can never produce them).
  2. **General boolean negation (`not x`) has no Rune equivalent** — Rune's grammar has no unary "not" `$type` at all (see `subset.ts`'s own existing note). Refuse Python's `not_operator` outright, same as TS's `!` is already unsupported.
  3. **`RosettaFeatureCall`'s optional-propagation (`a -> b`) is represented in Python via `getattr(receiver, "field", None)`** — the 3-argument form specifically. The 2-argument form (`getattr(a, "b")`, no default) must be refused: without the default it raises `AttributeError` instead of propagating `None`, which is not semantically equivalent to Rune's optional propagation. A plain `.` attribute access (Python's `attribute` node) must also always be refused — same reasoning TS already applies to unguarded `.` (no propagation semantics).
  4. **Chained comparisons (`a < b < c`) have no Rune equivalent** — Rune's `ComparisonOperation` is a strict binary `left`/`operator`/`right` shape with no chaining. Python's `comparison_operator` node natively supports N-way chains as a single node with `childCount > 3`; any such node must be refused.
- `packages/` is MIT-licensed — SPDX header `// SPDX-License-Identifier: MIT` / `// Copyright (c) 2026 Pradeep Mouli` on every new file (matching every existing file under `packages/codegen/src/lens/`).
- Tests depending on `.resources/` must use `describe.skipIf(!RESOURCES_EXIST)` (established convention).

---

### Task 1: `py-grammar-loader.ts` — load the tree-sitter Python grammar

**Files:**
- Create: `packages/codegen/src/lens/python/py-grammar-loader.ts`
- Test: `packages/codegen/test/lens/python/py-grammar-loader.test.ts`

**Interfaces:**
- Produces: `loadPyGrammar(source?: WasmSource): Promise<Language>` and `createPyParser(source?: WasmSource): Promise<Parser>` — same shape and same `WasmSource` type as `ts-grammar-loader.ts`'s `loadTsGrammar`/`createTsParser`. `WasmSource` is re-exported from `ts-grammar-loader.ts` (do not redefine the type — import it).

This file is a near-verbatim mirror of the current `packages/codegen/src/lens/typescript/ts-grammar-loader.ts` (read it first — reproduced below for reference), with exactly two differences: it resolves `wasm/tree-sitter-python.wasm` instead of `wasm/tree-sitter-typescript.wasm`, and it has its own module-level cache (do not share the TS loader's cache — a Python `Language` and a TypeScript `Language` are different objects and must not collide under the same `cachedLanguage`/`cachedSource` pair).

- [ ] **Step 1: Write the file**

```typescript
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * py-grammar-loader — loads the tree-sitter Python grammar
 * (`web-tree-sitter` WASM runtime) for `parse-py.ts`.
 *
 * Mirrors `../typescript/ts-grammar-loader.ts` exactly. `@vscode/tree-sitter-wasm`
 * (already a Phase 1 dependency) ships `wasm/tree-sitter-python.wasm` in the
 * same package as `wasm/tree-sitter-typescript.wasm` — confirmed present on
 * disk and confirmed to load and parse real Python expressions correctly
 * during Phase 3 planning (no new dependency needed).
 */
import { Language, Parser } from 'web-tree-sitter';
import type { WasmSource } from '../typescript/ts-grammar-loader.js';

let cachedLanguage: Language | undefined;
let cachedSource: WasmSource | undefined;

/**
 * Resolves `@vscode/tree-sitter-wasm`'s published `tree-sitter-python.wasm`
 * path via Node's own CommonJS-style resolution. Node-only — never invoked
 * when a caller supplies `WasmSource` bytes directly. Both Node builtins are
 * imported dynamically, inside this function, so a bundler doing static
 * analysis never sees a Node-builtin import anywhere in this file's module
 * graph (same reasoning as `ts-grammar-loader.ts`'s identical structure).
 */
async function resolveDefaultWasmPath(): Promise<string> {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const pkgJsonPath = require.resolve('@vscode/tree-sitter-wasm/package.json');
  return pkgJsonPath.replace(/package\.json$/, 'wasm/tree-sitter-python.wasm');
}

/**
 * Loads (and caches) the tree-sitter Python `Language`. Cached by `source`
 * reference — same reasoning as `loadTsGrammar`.
 */
export async function loadPyGrammar(source?: WasmSource): Promise<Language> {
  if (cachedLanguage && source === cachedSource) return cachedLanguage;

  await Parser.init();
  const bytes = source instanceof Uint8Array ? source : await readWasmBytes(source);
  const language = await Language.load(bytes);
  cachedLanguage = language;
  cachedSource = source;
  return language;
}

async function readWasmBytes(pathOverride: string | undefined): Promise<Uint8Array> {
  const path = pathOverride ?? (await resolveDefaultWasmPath());
  const { readFile } = await import('node:fs/promises');
  const buf = await readFile(path);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/** Creates a `Parser` configured with the loaded Python grammar. */
export async function createPyParser(source?: WasmSource): Promise<Parser> {
  const language = await loadPyGrammar(source);
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { createPyParser, loadPyGrammar } from '../../../src/lens/python/py-grammar-loader.js';

describe('py-grammar-loader', () => {
  it('loads the Python grammar and parses a trivial expression', async () => {
    const parser = await createPyParser();
    const tree = parser.parse('a + b');
    expect(tree).not.toBeNull();
    expect(tree!.rootNode.hasError).toBe(false);
  });

  it('caches the grammar by source reference, same as loadTsGrammar', async () => {
    const bytesA = new Uint8Array([1]); // not real WASM bytes — this test only proves cache identity, not a real parse
    // Use the real default path instead for an actual cache-hit proof:
    const langA = await loadPyGrammar();
    const langB = await loadPyGrammar();
    expect(langA).toBe(langB);
    void bytesA;
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/lens/python/py-grammar-loader.test.ts`
Expected: FAIL with "Cannot find module '../../../src/lens/python/py-grammar-loader.js'"

- [ ] **Step 4: Confirm it passes once Step 1's file exists**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/lens/python/py-grammar-loader.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/lens/python/py-grammar-loader.ts packages/codegen/test/lens/python/py-grammar-loader.test.ts
git commit -m "feat(codegen/lens): py-grammar-loader — load tree-sitter Python grammar"
```

---

### Task 2: `render-py.ts` — `RosettaExpression` → Python text

**Files:**
- Create: `packages/codegen/src/lens/python/render-py.ts`
- Test: `packages/codegen/test/lens/python/render-py.test.ts`

**Interfaces:**
- Consumes: `isInSubsetS` from `../subset.js` (unchanged, reused as-is).
- Produces: `renderPy(node: RosettaExpression): string | null` — same signature as `renderTs`.

This mirrors `packages/codegen/src/lens/typescript/render-ts.ts`'s structure exactly (precedence-tier-aware `r()`/`rTight()` helpers, `dispatch()` over the 12 `SUBSET_S_TYPES`), with these per-type differences (all confirmed via real tree-sitter-python parses during planning — Python precedence tiers use the SAME relative ordering as TS's, since Python's own operator precedence table has the identical relative ordering: `*`/`/` tighter than `+`/`-` tighter than comparisons tighter than equality tighter than `and` tighter than `or`):

| Rune construct | TS projection (existing) | Python projection (this task) |
|---|---|---|
| `RosettaBooleanLiteral` | `true`/`false` | `True`/`False` |
| `RosettaIntLiteral`/`RosettaNumberLiteral` | `String(value)` | `String(value)` (identical — Python's numeric literal syntax for a plain int/decimal is textually the same as JS's) |
| `RosettaStringLiteral` | `JSON.stringify(value)` (double-quoted) | `JSON.stringify(value)` (double-quoted — Python accepts double-quoted strings identically to JS/JSON syntax for the plain, non-triple-quoted case) |
| `RosettaSymbolReference` | bare identifier, refuse if `explicitArguments` | bare identifier, refuse if `explicitArguments` (unchanged) |
| `RosettaFeatureCall` | `receiver?.feature` | `` getattr(${receiver}, "${feature}", None) `` — receiver rendered via `rTight` (attribute/call binds tighter than every operator tier, same reasoning as TS's `?.`) |
| `RosettaExistsExpression` | `${argument} != null` | `${argument} is not None` |
| `RosettaAbsentExpression` | `${argument} == null` | `${argument} is None` |
| `ArithmeticOperation` (`+ - * /`) | same tokens | same tokens (Python's `+ - * /` are textually identical to Rune's) |
| `ComparisonOperation` (`< <= > >=`) | same tokens | same tokens |
| `EqualityOperation` (`= <>`) | `===`/`!==` | `==`/`!=` |
| `LogicalOperation` (`and`/`or`) | `&&`/`\|\|` | `and`/`or` (Python's own keywords — no translation needed) |

- [ ] **Step 1: Write the failing test**

```typescript
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parseExpression } from '@rune-langium/core';
import { renderPy } from '../../../src/lens/python/render-py.js';

function render(rune: string): string | null {
  const p = parseExpression(rune);
  if (p.hasErrors) throw new Error(`must parse: ${rune}`);
  return renderPy(p.value);
}

describe('renderPy', () => {
  it('renders literals', () => {
    expect(render('True')).toBe('True');
    expect(render('3')).toBe('3');
    expect(render('3.5')).toBe('3.5');
    expect(render('"USD"')).toBe('"USD"');
  });

  it('renders exists/absent as is not None / is None', () => {
    expect(render('currency exists')).toBe('currency is not None');
    expect(render('currency absent')).toBe('currency is None');
  });

  it('renders a feature call as a 3-arg getattr with None default', () => {
    expect(render('trade -> quantity')).toBe('getattr(trade, "quantity", None)');
  });

  it('renders a multi-hop feature call as nested getattr calls', () => {
    expect(render('trade -> quantity -> amount')).toBe('getattr(getattr(trade, "quantity", None), "amount", None)');
  });

  it('renders equality using Python == / !=, not TS === / !==', () => {
    expect(render('value = 0')).toBe('value == 0');
    expect(render('value <> 0')).toBe('value != 0');
  });

  it('renders logical operators using Python and/or keywords', () => {
    expect(render('a and b')).toBe('a and b');
    expect(render('a or b')).toBe('a or b');
  });

  it('preserves precedence with minimal parenthesization, same tier-aware rule as render-ts.ts', () => {
    expect(render('(a + b) * c')).toBe('(a + b) * c');
    expect(render('a * b + c')).toBe('a * b + c');
    expect(render('a and b and c')).toBe('a and b and c'); // same-tier left chain — no spurious parens
  });

  it('refuses a function-call symbol reference (explicitArguments)', () => {
    // parseExpression on a call form — construct the node directly since
    // Rune's own grammar for a bare call reference may not parse standalone;
    // verify against the real AST shape from packages/core before finalizing
    // this test (see Task 3 of the merged Phase 1 plan for the analogous
    // precedent — RosettaSymbolReference's explicitArguments field).
    const node = {
      $type: 'RosettaSymbolReference',
      explicitArguments: true,
      rawArgs: [],
      symbol: { $refText: 'EmptyTransferHistory' }
    } as any;
    expect(renderPy(node)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/lens/python/render-py.test.ts`
Expected: FAIL with "Cannot find module '../../../src/lens/python/render-py.js'"

- [ ] **Step 3: Write the implementation**

```typescript
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Rune → Python projection over subset `S` (see ../subset.ts).
 *
 * Mirrors `../typescript/render-ts.ts`'s precedence-tier-aware structure
 * exactly — Python's operator precedence has the same RELATIVE ordering as
 * TS's for the 4 binary tiers this lens emits (multiplicative tightest,
 * then additive, then comparison, then equality, then `and`, then `or`
 * loosest), so the same `r()`/`rTight()` parenthesization logic applies
 * unchanged; only the token tables and two per-`$type` idioms differ
 * (exists/absent → `is not None`/`is None`; feature-call → `getattr(...)`,
 * since Python has no `?.`-equivalent operator — verified via real
 * tree-sitter-python parses during Phase 3 planning, see the plan's Global
 * Constraints for the full reasoning).
 *
 * Returns `null` for any node outside `S` — never an approximate rendering.
 */
import type { RosettaExpression } from '@rune-langium/core';
import { isInSubsetS } from '../subset.js';

type AnyNode = RosettaExpression & Record<string, unknown>;

const COMPARISON_PY: Record<string, string> = { '<': '<', '<=': '<=', '>': '>', '>=': '>=' };
const EQUALITY_PY: Record<string, string> = { '=': '==', '<>': '!=' };
const LOGICAL_PY: Record<string, string> = { and: 'and', or: 'or' };
const ARITHMETIC_PY: Record<string, string> = { '+': '+', '-': '-', '*': '*', '/': '/' };

/** Same tier table as render-ts.ts's precedenceTier — Python's relative operator precedence matches TS's for these 4 tiers. */
function precedenceTier(kind: string, operator: unknown): number | null {
  switch (kind) {
    case 'LogicalOperation':
      return operator === 'or' ? 1 : 2;
    case 'EqualityOperation':
      return 3;
    case 'ComparisonOperation':
      return 4;
    case 'ArithmeticOperation':
      return operator === '+' || operator === '-' ? 5 : 6;
    default:
      return null;
  }
}

/** Identical logic to render-ts.ts's r() — see that file's docstring for the same-tier-right-needs-parens reasoning. */
function r(child: RosettaExpression, parentTier: number, side: 'left' | 'right'): string {
  const node = child as AnyNode;
  const text = renderPy(child);
  if (text === null) throw new UnsupportedInChild();
  const childTier = precedenceTier(node.$type, node['operator']);
  if (childTier === null) return text;
  const needsParens = childTier < parentTier || (childTier === parentTier && side === 'right');
  return needsParens ? `(${text})` : text;
}

/** Identical logic to render-ts.ts's rTight() — used only for RosettaFeatureCall's receiver, since attribute/call access binds tighter than every tier in `precedenceTier`. */
function rTight(child: RosettaExpression): string {
  const node = child as AnyNode;
  const text = renderPy(child);
  if (text === null) throw new UnsupportedInChild();
  const needsParens =
    node.$type === 'LogicalOperation' ||
    node.$type === 'ComparisonOperation' ||
    node.$type === 'EqualityOperation' ||
    node.$type === 'ArithmeticOperation';
  return needsParens ? `(${text})` : text;
}

class UnsupportedInChild extends Error {}

export function renderPy(node: RosettaExpression): string | null {
  try {
    return dispatch(node as AnyNode);
  } catch (e) {
    if (e instanceof UnsupportedInChild) return null;
    throw e;
  }
}

function dispatch(node: AnyNode): string {
  if (!isInSubsetS(node)) throw new UnsupportedInChild();

  switch (node.$type) {
    case 'RosettaBooleanLiteral':
      return node['value'] ? 'True' : 'False';
    case 'RosettaIntLiteral':
    case 'RosettaNumberLiteral':
      return String(node['value']);
    case 'RosettaStringLiteral':
      return JSON.stringify(String(node['value']));
    case 'RosettaSymbolReference': {
      const symbol = node['symbol'] as { $refText?: string } | undefined;
      if (node['explicitArguments']) throw new UnsupportedInChild();
      if (!symbol?.$refText) throw new UnsupportedInChild();
      return symbol.$refText;
    }
    case 'RosettaFeatureCall': {
      const receiver = rTight(node['receiver'] as RosettaExpression);
      const feature = node['feature'] as { $refText?: string } | undefined;
      if (!feature?.$refText) throw new UnsupportedInChild();
      return `getattr(${receiver}, ${JSON.stringify(feature.$refText)}, None)`;
    }
    case 'RosettaExistsExpression': {
      const argument = r(node['argument'] as RosettaExpression, 3, 'left');
      return `${argument} is not None`;
    }
    case 'RosettaAbsentExpression': {
      const argument = r(node['argument'] as RosettaExpression, 3, 'left');
      return `${argument} is None`;
    }
    case 'ArithmeticOperation': {
      const opKey = node['operator'] as string;
      const op = ARITHMETIC_PY[opKey];
      if (op === undefined) throw new UnsupportedInChild();
      const tier = precedenceTier('ArithmeticOperation', opKey)!;
      const left = r(node['left'] as RosettaExpression, tier, 'left');
      const right = r(node['right'] as RosettaExpression, tier, 'right');
      return `${left} ${op} ${right}`;
    }
    case 'ComparisonOperation': {
      if (node['cardMod']) throw new UnsupportedInChild();
      const opKey = node['operator'] as string;
      const op = COMPARISON_PY[opKey];
      if (op === undefined) throw new UnsupportedInChild();
      const tier = precedenceTier('ComparisonOperation', opKey)!;
      const left = r(node['left'] as RosettaExpression, tier, 'left');
      const right = r(node['right'] as RosettaExpression, tier, 'right');
      return `${left} ${op} ${right}`;
    }
    case 'EqualityOperation': {
      if (node['cardMod']) throw new UnsupportedInChild();
      const opKey = node['operator'] as string;
      const op = EQUALITY_PY[opKey];
      if (op === undefined) throw new UnsupportedInChild();
      const tier = precedenceTier('EqualityOperation', opKey)!;
      const left = r(node['left'] as RosettaExpression, tier, 'left');
      const right = r(node['right'] as RosettaExpression, tier, 'right');
      return `${left} ${op} ${right}`;
    }
    case 'LogicalOperation': {
      const opKey = node['operator'] as string;
      const op = LOGICAL_PY[opKey];
      if (op === undefined) throw new UnsupportedInChild();
      const tier = precedenceTier('LogicalOperation', opKey)!;
      const left = r(node['left'] as RosettaExpression, tier, 'left');
      const right = r(node['right'] as RosettaExpression, tier, 'right');
      return `${left} ${op} ${right}`;
    }
    default:
      throw new UnsupportedInChild();
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/lens/python/render-py.test.ts`
Expected: PASS (8/8). If the `explicitArguments` test's hand-built node shape doesn't match `RosettaSymbolReference`'s real fields (check `packages/core/src/generated/ast.ts`), fix the test's fixture to match — do not change the guard.

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/lens/python/render-py.ts packages/codegen/test/lens/python/render-py.test.ts
git commit -m "feat(codegen/lens): render-py — RosettaExpression to Python projection"
```

---

### Task 3: `parse-py.ts` — Python text → `LensResult`

**Files:**
- Create: `packages/codegen/src/lens/python/parse-py.ts`
- Test: `packages/codegen/test/lens/python/parse-py.test.ts`

**Interfaces:**
- Consumes: `createPyParser`, `WasmSource` from `./py-grammar-loader.js` (Task 1); `LensResult`, `RefusalReason` from `../language-lens.js`.
- Produces: `parsePy(text: string, wasmSource?: WasmSource): Promise<LensResult>` — same signature shape as `parseTs`.

This mirrors `packages/codegen/src/lens/typescript/parse-ts.ts`'s structure (a `toRosetta(node: TsNode): RosettaExpression` dispatcher throwing a local `OutOfSubset` class, wrapped by the exported `parsePy` which converts thrown errors into a `RefusalReason`). Node type names and field names below were confirmed against real tree-sitter-python parses during planning (not assumed) — see the plan's Global Constraints for the samples parsed.

**Top-level shape check:** Python's tree-sitter grammar wraps everything in a `module` node (not the `program` root TS uses) whose single statement must be an `expression_statement`. Confirm this via `root.type === 'module'` before checking `childCount`/`child(0).type`.

**Dispatch cases needed** (confirmed node types and fields from planning spikes):

- `boolean_operator` (fields `left`, `operator`, `right` — operator text `and`/`or`, maps directly to `LogicalOperation`).
- `comparison_operator` (operands are **positional**, not named fields — `child(0)` and the LAST child; operator has field name `operators` (plural). **Must refuse chained comparisons**: if `childCount !== 3`, refuse — a chain like `a < b < c` produces `childCount === 5`. The `is`/`is not` operator tokens (confirmed as single tokens with text `is`/`is not`, not two separate children) against a `none` right operand are the exists/absent idiom, mirroring TS's `!=`/`==`-against-`null` detection exactly.
- `binary_operator` (fields `left`, `operator`, `right` — arithmetic `+ - * /`; refuse `**`/`//` per Global Constraints; refuse any other operator).
- `unary_operator` (fields `operator`, `argument` — same field names as TS's `unary_expression`. Accept only `operator.text === '-' && argument.type === 'integer'` (Python's plain-int node type; note Python uses `integer`/`float` as its literal type names, NOT `number` — do not reuse TS's node-type string). Refuse every other unary shape.
- `not_operator` (field `argument`) — always refuse (Global Constraint: no Rune `not` equivalent).
- `attribute` (fields `object`, `attribute`) — always refuse (Global Constraint: plain `.` has no propagation semantics; only the `getattr(...)` call form below is accepted).
- `call` — accept ONLY when `function` field is an `identifier` with text `getattr` AND `arguments` field has exactly 3 named children AND the 3rd argument is a `none` node. Extract: 1st argument → recursively `toRosetta` (the receiver), 2nd argument must be a `string` node → decode via the same double-quote-only + `JSON.parse` logic as string literals (refuse if not a double-quoted string) → the feature name. Refuse the 2-argument form (no default) and any non-`getattr` call.
- `identifier` — same as TS's `identifier` case, `RosettaSymbolReference` with `explicitArguments: false`.
- `true`/`false` keywords — Python's tree-sitter grammar node types: confirm the exact type strings via a real parse before writing this case (TS used lowercase `true`/`false`; Python's grammar may use `true`/`false` identically or a different casing/type name — verify, do not assume, per this file's own established discipline).
- `integer`/`float` — Python's literal type names (NOT `number`, unlike TS). Refuse hex/octal/binary/underscore/complex forms via a widened character class `/[xXoObBjJ_]/` (adds `j`/`J` for Python's complex-number suffix, confirmed via planning spike that `1j` parses as a plain `integer` node with no distinct complex type — the suffix is baked into the token text). Apply the SAME Rune-`BigDecimal`-grammar exponent-requires-decimal-point check as `numberNodeToRosetta` in `parse-ts.ts` (Python's `float` grammar accepts bare-integer-with-exponent like `1e5` too, confirmed via planning spike — same refusal, not normalization, applies for the same round-trip-fidelity reason).
- `string` — Python's tree-sitter grammar wraps this as `string(string_start, string_content, string_end)`, NOT a flat `.text`-includes-quotes node like TS's. Extract via `node.childForFieldName('string_start')`/`'string_content'`/`'string_end'` or by iterating children (verify the exact field names via a real parse before writing this case — the planning spike confirmed the node SHAPE but not whether `string_start`/`content`/`end` are named fields or positional children; check both before assuming). Only double-quoted strings are accepted (same reasoning as TS: matches this lens's own emission convention, keeps write-back round-trip well-defined) — refuse single-quoted Python strings even though they're valid Python, for the same reason TS refuses single-quoted TS strings.
- `none` — never appears as a standalone case (only ever consulted as a child of `comparison_operator` for the `is`/`is not` idiom, or as the 3rd argument of a `getattr` call) — falling through to `default:` for a bare `None` literal on its own should refuse, matching TS's parser having no bare-`null`-literal case either.
- `default:` — refuse with `` `'${node.type}' is not supported` ``, same as TS.

- [ ] **Step 1: Spike-verify the remaining unconfirmed node shapes before writing the dispatcher**

Before writing `parse-py.ts`, run a throwaway script (do not commit it) parsing these specific samples and inspecting the real node structure, to resolve every "verify before assuming" note above:

```javascript
// Run from packages/codegen/, adjusting the wasm path to match your pnpm store layout
import { Parser, Language } from 'web-tree-sitter';
import { readFile } from 'node:fs/promises';
await Parser.init();
const bytes = await readFile(/* resolve @vscode/tree-sitter-wasm's wasm/tree-sitter-python.wasm the same way py-grammar-loader.ts does, or hardcode your local pnpm store path for this one-off script */ 'PATH_TO_tree-sitter-python.wasm');
const lang = await Language.load(bytes);
const parser = new Parser();
parser.setLanguage(lang);

function dump(text) {
  const tree = parser.parse(text);
  const stmt = tree.rootNode.namedChild(0).namedChild(0);
  console.log('---', JSON.stringify(text), '---');
  console.log(stmt.toString());
  for (let i = 0; i < stmt.childCount; i++) {
    const c = stmt.child(i);
    console.log(' ', i, c.type, JSON.stringify(c.text), 'field:', stmt.fieldNameForChild(i));
  }
}
['True', 'False', '"USD"', 'getattr(trade, "quantity", None)'].forEach(dump);
```

Confirm: the exact `true`/`false` keyword node type strings, and whether `string`'s `string_start`/`string_content`/`string_end` are accessible via `childForFieldName` or only positionally. Adjust the dispatcher code below if either differs from what's assumed.

- [ ] **Step 2: Write the failing test**

```typescript
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parsePy } from '../../../src/lens/python/parse-py.js';

describe('parsePy', () => {
  it('parses literals', async () => {
    const r1 = await parsePy('True');
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.node).toMatchObject({ $type: 'RosettaBooleanLiteral', value: true });

    const r2 = await parsePy('3');
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.node).toMatchObject({ $type: 'RosettaIntLiteral', value: 3n });
  });

  it('parses is not None / is None as exists/absent', async () => {
    const r1 = await parsePy('currency is not None');
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.node.$type).toBe('RosettaExistsExpression');

    const r2 = await parsePy('currency is None');
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.node.$type).toBe('RosettaAbsentExpression');
  });

  it('parses a 3-arg getattr call as a feature call', async () => {
    const r = await parsePy('getattr(trade, "quantity", None)');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.node.$type).toBe('RosettaFeatureCall');
      expect((r.node as any).feature.$refText).toBe('quantity');
    }
  });

  it('refuses the 2-arg getattr form (no default)', async () => {
    const r = await parsePy('getattr(trade, "quantity")');
    expect(r.ok).toBe(false);
  });

  it('refuses a non-getattr call', async () => {
    const r = await parsePy('len(trade)');
    expect(r.ok).toBe(false);
  });

  it('refuses plain attribute access', async () => {
    const r = await parsePy('trade.quantity');
    expect(r.ok).toBe(false);
  });

  it('refuses chained comparisons', async () => {
    const r = await parsePy('a < b < c');
    expect(r.ok).toBe(false);
  });

  it('refuses ** and //', async () => {
    expect((await parsePy('a ** 2')).ok).toBe(false);
    expect((await parsePy('a // b')).ok).toBe(false);
  });

  it('refuses not', async () => {
    expect((await parsePy('not x')).ok).toBe(false);
  });

  it('parses negative numeric literals via unary_operator', async () => {
    const r = await parsePy('value > -1');
    expect(r.ok).toBe(true);
  });

  it('refuses exponent-without-decimal, same Rune BigDecimal grammar constraint as parse-ts.ts', async () => {
    const r = await parsePy('value > 1e5');
    expect(r.ok).toBe(false);
  });

  it('refuses complex number literals', async () => {
    expect((await parsePy('value > 1j')).ok).toBe(false);
  });

  it('refuses single-quoted strings', async () => {
    const r = await parsePy("value == 'USD'");
    expect(r.ok).toBe(false);
  });

  it('accepts double-quoted strings', async () => {
    const r = await parsePy('value == "USD"');
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/lens/python/parse-py.test.ts`
Expected: FAIL with "Cannot find module '../../../src/lens/python/parse-py.js'"

- [ ] **Step 4: Write the implementation**

Using the node shapes confirmed in Step 1 (fill in the `true`/`false` node type strings and the `string` field-access approach with whatever Step 1's spike actually found — the code below assumes they match TS's lowercase `true`/`false` type names and that `string_content` is accessible via `childForFieldName`, both plausible but NOT verified during planning; correct them here if Step 1 found otherwise):

```typescript
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Python text → `LensResult` (parse-back), via tree-sitter.
 *
 * Mirrors `../typescript/parse-ts.ts`'s structure. Node type/field names
 * below were confirmed against real tree-sitter-python parses during Phase
 * 3 planning and Task 3 Step 1 — not assumed from grammar documentation.
 */
import type { Node as PyNode } from 'web-tree-sitter';
import type { RosettaExpression } from '@rune-langium/core';
import type { LensResult, RefusalReason } from '../language-lens.js';
import { createPyParser, type WasmSource } from './py-grammar-loader.js';

function refusal(kind: RefusalReason['kind'], message: string, offset: number, length: number): LensResult {
  return { ok: false, reason: { kind, message, offset, length } };
}

export async function parsePy(text: string, wasmSource?: WasmSource): Promise<LensResult> {
  const parser = await createPyParser(wasmSource);
  const tree = parser.parse(text);
  if (tree === null) {
    return refusal('syntax-error', 'the Python parser returned no tree (empty input?)', 0, text.length);
  }
  const root = tree.rootNode;

  if (root.hasError) {
    const errorNode = root.descendantsOfType('ERROR')[0] ?? root;
    return refusal(
      'syntax-error',
      'syntax error in Python expression',
      errorNode.startIndex,
      errorNode.endIndex - errorNode.startIndex
    );
  }

  if (root.type !== 'module' || root.childCount !== 1 || root.child(0)?.type !== 'expression_statement') {
    return refusal('syntax-error', 'expected a single expression', 0, text.length);
  }

  const exprStatement = root.child(0)!;
  const expr = exprStatement.child(0);
  if (!expr) return refusal('syntax-error', 'expected a single expression', 0, text.length);

  try {
    return { ok: true, node: toRosetta(expr) };
  } catch (e) {
    if (e instanceof OutOfSubset) {
      return refusal('out-of-subset', e.message, e.pyNode.startIndex, e.pyNode.endIndex - e.pyNode.startIndex);
    }
    throw e;
  }
}

class OutOfSubset extends Error {
  constructor(
    message: string,
    public readonly pyNode: PyNode
  ) {
    super(message);
  }
}

const COMPARISON_FROM_PY: Record<string, string> = { '<': '<', '<=': '<=', '>': '>', '>=': '>=' };
const EQUALITY_FROM_PY: Record<string, string> = { '==': '=', '!=': '<>' };
const LOGICAL_FROM_PY: Record<string, string> = { and: 'and', or: 'or' };
const ARITHMETIC_FROM_PY: Record<string, string> = { '+': '+', '-': '-', '*': '*', '/': '/' };

function child(node: PyNode, i: number): PyNode {
  const c = node.child(i);
  if (!c) throw new OutOfSubset('malformed expression', node);
  return c;
}

function field(node: PyNode, name: string): PyNode {
  const c = node.childForFieldName(name);
  if (!c) throw new OutOfSubset(`malformed '${node.type}' (missing ${name})`, node);
  return c;
}

/** Shared by `case 'integer'/'float':` and the unary negative-literal case — mirrors parse-ts.ts's numberNodeToRosetta exactly, including the Rune BigDecimal grammar constraint. Python's own complex-number `j`/`J` suffix folds into the same refused-character-class check (confirmed via planning spike: `1j` parses as a plain `integer` node, no distinct complex type). */
function numberNodeToRosetta(text: string, node: PyNode): RosettaExpression {
  if (/[xXoObBjJ_]/.test(text)) {
    throw new OutOfSubset(
      `number literal '${text}' is not supported (hex/octal/binary/complex/separator forms have no Rune equivalent)`,
      node
    );
  }
  if (/[eE]/.test(text) && !text.includes('.')) {
    throw new OutOfSubset(
      `number literal '${text}' is not supported (Rune's BigDecimal grammar requires a decimal point before an exponent — use e.g. '1.0e5' instead of '1e5')`,
      node
    );
  }
  if (/[.eE]/.test(text)) {
    return { $type: 'RosettaNumberLiteral', value: text } as unknown as RosettaExpression;
  }
  return { $type: 'RosettaIntLiteral', value: BigInt(text) } as unknown as RosettaExpression;
}

/** Decode a Python double-quoted string node's text (child of a `string` node's `string_content` field, or the whole node if Step 1 found no such field) via the same double-quote-only + JSON.parse convention as parse-ts.ts. Adjust the extraction to match whatever Step 1's real parse confirmed. */
function stringNodeToRosetta(node: PyNode): RosettaExpression {
  if (!node.text.startsWith('"')) {
    throw new OutOfSubset('string literals must be double-quoted', node);
  }
  let value: string;
  try {
    value = JSON.parse(node.text) as string;
  } catch {
    throw new OutOfSubset(`string literal '${node.text}' could not be decoded`, node);
  }
  return { $type: 'RosettaStringLiteral', value } as unknown as RosettaExpression;
}

function toRosetta(node: PyNode): RosettaExpression {
  switch (node.type) {
    case 'boolean_operator': {
      const left = field(node, 'left');
      const right = field(node, 'right');
      const op = field(node, 'operator').text;
      if (op in LOGICAL_FROM_PY) {
        return {
          $type: 'LogicalOperation',
          left: toRosetta(left),
          operator: LOGICAL_FROM_PY[op],
          right: toRosetta(right)
        } as unknown as RosettaExpression;
      }
      throw new OutOfSubset(`operator '${op}' is not supported`, node);
    }

    case 'comparison_operator': {
      // Operands are positional, not named fields (confirmed via planning
      // spike). A chained comparison (`a < b < c`) produces childCount 5
      // (3 operands, 2 operators) — no Rune equivalent, refuse outright.
      if (node.childCount !== 3) {
        throw new OutOfSubset('chained comparisons are not supported', node);
      }
      const left = child(node, 0);
      const right = child(node, 2);
      const op = child(node, 1).text;

      // `x is not None` / `x is None` are the presence idiom — confirmed
      // via planning spike that `is not` is a SINGLE token (not two
      // children), so a direct text comparison is sufficient.
      if (op === 'is not' && right.type === 'none') {
        return {
          $type: 'RosettaExistsExpression',
          argument: toRosetta(left),
          operator: 'exists'
        } as unknown as RosettaExpression;
      }
      if (op === 'is' && right.type === 'none') {
        return {
          $type: 'RosettaAbsentExpression',
          argument: toRosetta(left),
          operator: 'absent'
        } as unknown as RosettaExpression;
      }

      if (op in COMPARISON_FROM_PY) {
        return {
          $type: 'ComparisonOperation',
          left: toRosetta(left),
          operator: COMPARISON_FROM_PY[op],
          right: toRosetta(right)
        } as unknown as RosettaExpression;
      }
      if (op in EQUALITY_FROM_PY) {
        return {
          $type: 'EqualityOperation',
          left: toRosetta(left),
          operator: EQUALITY_FROM_PY[op],
          right: toRosetta(right)
        } as unknown as RosettaExpression;
      }
      throw new OutOfSubset(`operator '${op}' is not supported`, node);
    }

    case 'binary_operator': {
      const left = field(node, 'left');
      const right = field(node, 'right');
      const op = field(node, 'operator').text;
      if (op in ARITHMETIC_FROM_PY) {
        return {
          $type: 'ArithmeticOperation',
          left: toRosetta(left),
          operator: ARITHMETIC_FROM_PY[op],
          right: toRosetta(right)
        } as unknown as RosettaExpression;
      }
      // '**' and '//' fall through here with no Rune equivalent.
      throw new OutOfSubset(`operator '${op}' is not supported`, node);
    }

    // tree-sitter always parses a leading `-` before a numeric literal as a
    // `unary_operator` wrapping an `integer`/`float` node — same shape as
    // TS's `unary_expression` (confirmed via planning spike, same field
    // names: `operator`, `argument`). Every other unary shape (negating an
    // identifier/call/attribute, unary `+`, etc.) has no Rune equivalent.
    case 'unary_operator': {
      const operator = field(node, 'operator');
      const argument = field(node, 'argument');
      if (operator.text !== '-' || argument.type !== 'integer') {
        throw new OutOfSubset(
          "'unary_operator' is not supported (only negative numeric literals have a Rune equivalent)",
          node
        );
      }
      return numberNodeToRosetta('-' + argument.text, node);
    }

    // No Rune equivalent (Global Constraint 2) — Rune has no unary "not" $type.
    case 'not_operator':
      throw new OutOfSubset("'not' is not supported (Rune has no unary boolean-negation equivalent)", node);

    // Plain '.' access has no propagation semantics — only the getattr(...)
    // call form below is accepted (Global Constraint 3).
    case 'attribute':
      throw new OutOfSubset('attribute access must use getattr(x, "field", None) — plain . has no Rune equivalent', node);

    // Only the 3-arg getattr(receiver, "field", None) form is accepted, as
    // the Python projection of RosettaFeatureCall's optional propagation
    // (Global Constraint 3). The 2-arg form (no default) raises
    // AttributeError instead of propagating None — not equivalent, refused.
    case 'call': {
      const fn = field(node, 'function');
      const args = field(node, 'arguments');
      if (fn.type !== 'identifier' || fn.text !== 'getattr' || args.namedChildCount !== 3) {
        throw new OutOfSubset('only getattr(x, "field", None) calls are supported', node);
      }
      const receiverNode = args.namedChild(0)!;
      const fieldNode = args.namedChild(1)!;
      const defaultNode = args.namedChild(2)!;
      if (fieldNode.type !== 'string' || defaultNode.type !== 'none') {
        throw new OutOfSubset('only getattr(x, "field", None) calls are supported', node);
      }
      const featureLiteral = stringNodeToRosetta(fieldNode) as unknown as { value: string };
      return {
        $type: 'RosettaFeatureCall',
        receiver: toRosetta(receiverNode),
        feature: { $refText: featureLiteral.value }
      } as unknown as RosettaExpression;
    }

    case 'identifier':
      return {
        $type: 'RosettaSymbolReference',
        explicitArguments: false,
        rawArgs: [],
        symbol: { $refText: node.text }
      } as unknown as RosettaExpression;

    // Verify these exact type strings via Step 1's spike before relying on them.
    case 'true':
    case 'false':
      return { $type: 'RosettaBooleanLiteral', value: node.type === 'true' } as unknown as RosettaExpression;

    case 'integer':
    case 'float':
      return numberNodeToRosetta(node.text, node);

    case 'string':
      return stringNodeToRosetta(node);

    default:
      throw new OutOfSubset(`'${node.type}' is not supported`, node);
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/lens/python/parse-py.test.ts`
Expected: PASS (14/14). If the `true`/`false` node type strings or the `string` field-access approach from Step 1's spike differ from what's written above, this is exactly where that will surface — fix the dispatcher to match the REAL node shape, never the test.

- [ ] **Step 6: Commit**

```bash
git add packages/codegen/src/lens/python/parse-py.ts packages/codegen/test/lens/python/parse-py.test.ts
git commit -m "feat(codegen/lens): parse-py — Python text to RosettaExpression parse-back"
```

---

### Task 4: Round-trip fixed-point tests + real-corpus sweep (both directions, from day one)

**Files:**
- Create: `packages/codegen/test/lens/python/roundtrip.test.ts`
- Create: `packages/codegen/test/lens/python/python-corpus-sweep.test.ts`

**Interfaces:**
- Consumes: `renderPy`, `parsePy` (Tasks 2-3); `parseExpression`, `renderExpression` (unchanged, from Phase 1/2).

Phase 2's own history is the reason this task exists as written: Phase 1 shipped without a real-corpus sweep, and Phase 2's Task 1 found 9 real correctness bugs in already-merged code the FIRST time the lens was tested against `.resources/` instead of hand-curated fixtures. This task builds BOTH the hand-curated fixed-point suite (mirroring Phase 1's Task 4 exactly) AND the real-corpus sweep (mirroring Phase 2's Task 1) in the same task, so any Python-specific gap the hand-curated corpus misses gets caught before this code ships, not audited in afterward.

- [ ] **Step 1: Write the hand-curated fixed-point + refusal corpus test**

```typescript
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parseExpression } from '@rune-langium/core';
import { renderExpression } from '@rune-langium/codegen/rosetta';
import { renderPy } from '../../../src/lens/python/render-py.js';
import { parsePy } from '../../../src/lens/python/parse-py.js';
import { treesEquivalent } from '../../../../codegen/test/emit/rosetta/expression-tree-equivalence.js';

const IN_SUBSET_CORPUS = [
  'value >= 0',
  'currency exists',
  'currency absent',
  'trade -> quantity',
  'trade -> quantity -> amount',
  '(a + b) * c',
  '"USD"',
  '3.5',
  'True',
  'quantity > 0 and price exists',
  'value = 0',
  'value <> 0'
];

describe('lens/python: Rune -> Python -> Rune fixed point', () => {
  for (const rune of IN_SUBSET_CORPUS) {
    it(`round-trips: ${rune}`, async () => {
      const p1 = parseExpression(rune);
      expect(p1.hasErrors, `must parse: ${rune}`).toBe(false);

      const py = renderPy(p1.value);
      expect(py, `must be in S: ${rune}`).not.toBeNull();

      const back = await parsePy(py!);
      expect(back.ok, `Python must parse back: ${py}`).toBe(true);
      if (!back.ok) return;

      const rune2 = renderExpression(back.node);
      const p2 = parseExpression(rune2);
      expect(p2.hasErrors, `re-rendered Rune must reparse: ${rune2}`).toBe(false);
      expect(
        treesEquivalent(p1.value, p2.value),
        `round-tripped tree must be structurally equivalent: ${rune} -> ${py} -> ${rune2}`
      ).toBe(true);
    });
  }
});

describe('lens/python: Python -> Rune -> Python fixed point (write-back direction)', () => {
  const PY_CORPUS = [
    'value >= 0',
    'currency is not None',
    'currency is None',
    'a and (b or c)',
    'getattr(trade, "quantity", None)',
    'getattr(getattr(trade, "quantity", None), "amount", None)'
  ];
  for (const py of PY_CORPUS) {
    it(`round-trips: ${py}`, async () => {
      const parsed = await parsePy(py);
      expect(parsed.ok, `must parse: ${py}`).toBe(true);
      if (!parsed.ok) return;

      const py2 = renderPy(parsed.node);
      expect(py2, `must render back: ${py}`).not.toBeNull();
      expect(py2).toBe(py);
    });
  }
});

describe('lens/python: refusal corpus', () => {
  const REFUSALS: Array<{ py: string; kind: 'syntax-error' | 'out-of-subset' }> = [
    { py: 'value >=', kind: 'syntax-error' },
    { py: 'value.toFixed(2)', kind: 'syntax-error' },
    { py: 'a ** 2', kind: 'out-of-subset' },
    { py: 'a // b', kind: 'out-of-subset' },
    { py: 'not x', kind: 'out-of-subset' },
    { py: 'trade.quantity', kind: 'out-of-subset' },
    { py: 'getattr(trade, "quantity")', kind: 'out-of-subset' },
    { py: 'a < b < c', kind: 'out-of-subset' }
  ];
  for (const { py, kind } of REFUSALS) {
    it(`refuses (${kind}): ${py}`, async () => {
      const r = await parsePy(py);
      expect(r.ok, `must be refused: ${py}`).toBe(false);
      if (!r.ok) expect(r.reason.kind).toBe(kind);
    });
  }
});
```

- [ ] **Step 2: Run to verify it passes**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/lens/python/roundtrip.test.ts`
Expected: PASS (12 + 6 + 8 = 26 tests). If any fixture fails, the bug is in Task 2 or Task 3 — fix there, not by removing the fixture.

- [ ] **Step 3: Write the real-corpus sweep, mirroring `function-body-corpus-sweep.test.ts` exactly**

Read `packages/codegen/test/lens/typescript/function-body-corpus-sweep.test.ts` first (it already has the corrected, dedup-by-holder-type extraction logic from the Phase 2 PR review fix — reuse that exact extraction function, just swap `renderTs`/`parseTs` for `renderPy`/`parsePy`):

```typescript
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Phase 3 (Python lens) — real-corpus classification sweep, mirroring
 * function-body-corpus-sweep.test.ts exactly (same extraction logic,
 * keyed by (holder type, text) to avoid the dedup bug that Phase 2's PR
 * review caught — see that file's own history), swapped to renderPy/parsePy.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import type { AstNode } from 'langium';
import { parse, parseExpression } from '@rune-langium/core';
import { treesEquivalent } from '../../../../codegen/test/emit/rosetta/expression-tree-equivalence.js';
import { renderPy } from '../../src/lens/python/render-py.js';
import { parsePy } from '../../src/lens/python/parse-py.js';

const RESOURCES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../.resources');
const RESOURCES_EXIST = existsSync(RESOURCES_DIR);

function collectRosettaFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectRosettaFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.rosetta')) out.push(full);
  }
  return out;
}

type HolderKind = 'Condition' | 'Operation' | 'ShortcutDeclaration';

interface ExpressionHolder extends AstNode {
  expression?: unknown;
}

function hasExpressionField(node: AstNode): node is ExpressionHolder {
  return node.$type === 'Condition' || node.$type === 'Operation' || node.$type === 'ShortcutDeclaration';
}

async function extractCorpusSnippets(): Promise<{ snippets: Map<string, Set<HolderKind>>; fileCount: number }> {
  const { AstUtils } = await import('langium');
  const files = collectRosettaFiles(RESOURCES_DIR);
  const byText = new Map<string, Set<HolderKind>>();

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const result = await parse(content, pathToFileURL(file).toString());
    if (result.hasErrors) continue;

    for (const node of AstUtils.streamAllContents(result.value as unknown as { $type: string } & object)) {
      if (!hasExpressionField(node)) continue;
      const expr = node.expression as { $cstNode?: { text?: string } } | undefined;
      const text = expr?.$cstNode?.text?.trim();
      if (!text) continue;
      const holder = node.$type as HolderKind;
      const set = byText.get(text) ?? new Set<HolderKind>();
      set.add(holder);
      byText.set(text, set);
    }
  }

  return { snippets: byText, fileCount: files.length };
}

describe.skipIf(!RESOURCES_EXIST)('python-lens corpus sweep (Phase 3, Task 4)', () => {
  it('classifies every real Condition/Operation/ShortcutDeclaration body against subset S for Python', async () => {
    const { snippets, fileCount } = await extractCorpusSnippets();
    expect(fileCount).toBeGreaterThan(100);
    expect(snippets.size).toBeGreaterThan(0);

    const counts: Record<HolderKind, { inS: number; readOnly: number }> = {
      Condition: { inS: 0, readOnly: 0 },
      Operation: { inS: 0, readOnly: 0 },
      ShortcutDeclaration: { inS: 0, readOnly: 0 }
    };
    const unexpectedRefusals: Array<{ snippet: string; holder: HolderKind; reason: string }> = [];

    for (const [text, holders] of snippets) {
      const p1 = parseExpression(text);
      if (p1.hasErrors) continue;

      const py = renderPy(p1.value);
      for (const holder of holders) {
        if (py === null) {
          counts[holder].readOnly++;
          continue;
        }

        const back = await parsePy(py);
        if (!back.ok) {
          unexpectedRefusals.push({ snippet: text, holder, reason: `renderPy succeeded but parsePy refused: ${back.reason.message}` });
          continue;
        }
        if (!treesEquivalent(p1.value, back.node)) {
          unexpectedRefusals.push({ snippet: text, holder, reason: 'round-tripped tree not structurally equivalent' });
          continue;
        }
        counts[holder].inS++;
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      '[python-corpus-sweep] by holder type (in-S round-trips / read-only):\n' +
        `  Condition:            ${counts.Condition.inS} / ${counts.Condition.readOnly}\n` +
        `  Operation:            ${counts.Operation.inS} / ${counts.Operation.readOnly}\n` +
        `  ShortcutDeclaration:  ${counts.ShortcutDeclaration.inS} / ${counts.ShortcutDeclaration.readOnly}`
    );

    if (unexpectedRefusals.length > 0) {
      const lines = [`${unexpectedRefusals.length} unexpected refusal(s):`];
      for (const f of unexpectedRefusals.slice(0, 20)) {
        lines.push(`  [${f.holder}] ${JSON.stringify(f.snippet)}\n  reason: ${f.reason}`);
      }
      expect.fail(lines.join('\n'));
    }
  }, 120_000);
});
```

- [ ] **Step 4: Run and record the numbers**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/lens/python/python-corpus-sweep.test.ts`
Expected: PASS with 0 unexpected refusals. If there ARE unexpected refusals, this is the Phase 2 pattern repeating — do NOT ship with them unresolved: trace each to a root cause (the same way Phase 2's investigation did) and fix `render-py.ts`/`parse-py.ts` before continuing to Task 5. Record the final in-S/read-only counts by holder type — expect them to be in a similar range to Phase 2's TypeScript numbers (Condition ~94/681, Operation ~258/1196, ShortcutDeclaration ~201/451 at time of writing), since subset `S` is unchanged and every type is representable in both languages.

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/test/lens/python/roundtrip.test.ts packages/codegen/test/lens/python/python-corpus-sweep.test.ts
git commit -m "test(codegen/lens): Python lens fixed-point corpus + real-.resources/ sweep"
```

---

### Task 5: Browser-safe `./lens` export subpath extension

**Files:**
- Modify: `packages/codegen/src/lens.ts`
- Modify: `packages/codegen/test/lens/browser-safe.test.ts`

**Interfaces:**
- Produces: `renderPy`, `parsePy` newly exported from `@rune-langium/codegen/lens` (the existing browser-safe subpath), alongside the existing `renderTs`/`parseTs`.

- [ ] **Step 1: Add the exports**

Read the current `packages/codegen/src/lens.ts` first (reproduced in this plan's intro research — it currently exports `LanguageLens`/`LensResult`/`RefusalReason`/`isInSubsetS`/`SUBSET_S_TYPES`/`SubsetSType`/`renderTs`/`parseTs`/`WasmSource`). Add two lines mirroring the existing TS exports exactly:

```typescript
export { renderPy } from './lens/python/render-py.js';
export { parsePy } from './lens/python/parse-py.js';
```

- [ ] **Step 2: Extend the browser-safety guard test**

Read `packages/codegen/test/lens/browser-safe.test.ts` first — it currently allow-lists `ts-grammar-loader.ts` as the one file permitted to reference `node:fs`/`node:module` (both only via dynamic `import()`, per Phase 2's own fix history). Add `py-grammar-loader.ts` to the same `FS_ALLOWED` set, since Task 1 built it with the identical dynamic-import pattern:

```typescript
const FS_ALLOWED = new Set(['ts-grammar-loader.ts', 'py-grammar-loader.ts']);
```

- [ ] **Step 3: Run to verify**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/lens/browser-safe.test.ts`
Expected: PASS (2/2, unchanged count — this test's assertions are file-count-agnostic).

- [ ] **Step 4: Commit**

```bash
git add packages/codegen/src/lens.ts packages/codegen/test/lens/browser-safe.test.ts
git commit -m "feat(codegen/lens): export renderPy/parsePy from the browser-safe ./lens subpath"
```

---

### Task 6: Studio wiring — generalize `LanguageLensEditor` to a 3-way Rune/TypeScript/Python toggle

**Files:**
- Create: `apps/studio/src/lens/py-wasm-asset.ts`
- Modify: `apps/studio/src/components/LanguageLensEditor.tsx`
- Modify: `apps/studio/test/lens/ts-wasm-asset.test.ts` → also create `apps/studio/test/lens/py-wasm-asset.test.ts`
- Modify: `apps/studio/test/components/LanguageLensEditor.test.tsx`

**Interfaces:**
- Consumes: `renderPy`, `parsePy` from `@rune-langium/codegen/lens` (Task 5).
- Produces: `getPyWasmBytes(): Promise<Uint8Array>` — same shape as the existing `getTsWasmBytes`.

Read the current `apps/studio/src/lens/ts-wasm-asset.ts` first (it fetches the TS grammar WASM once via a Vite `?url` asset import, caches the resulting bytes, and clears the cache on fetch rejection so a failed fetch can be retried — a fix from Phase 2's PR #386 review). `py-wasm-asset.ts` mirrors it exactly, fetching `tree-sitter-python.wasm` instead.

The current `LanguageLensEditor.tsx` (read it in full — reproduced in this plan's intro research) hardcodes a `'rune' | 'typescript'` union and imports `renderTs`/`parseTs`/`getTsWasmBytes` directly. Rather than duplicate the whole component for Python (DRY — this repo's own CLAUDE.md states DRY is the #1 core correctness rule), generalize it to a small per-language descriptor table so a THIRD language is a data addition, not a new component.

- [ ] **Step 1: Write `py-wasm-asset.ts`**

```typescript
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Fetches and caches the Python tree-sitter grammar WASM bytes for the
 * browser lens path. Mirrors `ts-wasm-asset.ts` exactly, including the
 * clear-cache-on-rejection fix from the Phase 2 PR review (a failed first
 * fetch must not permanently block retry).
 */
import pyWasmUrl from '@vscode/tree-sitter-wasm/wasm/tree-sitter-python.wasm?url';

let cached: Promise<Uint8Array> | undefined;

export function getPyWasmBytes(): Promise<Uint8Array> {
  cached ??= fetch(pyWasmUrl)
    .then((r) => r.arrayBuffer())
    .then((buf) => new Uint8Array(buf))
    .catch((e) => {
      cached = undefined;
      throw e;
    });
  return cached;
}
```

Verify the `?url` import path matches whatever `ts-wasm-asset.ts` actually uses (read it first — the file may reference the wasm asset via a different relative import mechanism than shown here; match its exact convention rather than assuming).

- [ ] **Step 2: Write the failing test for `py-wasm-asset.ts`**

Read `apps/studio/test/lens/ts-wasm-asset.test.ts` first and mirror its exact test structure (mock `fetch`, assert caching, assert retry-after-rejection) for `py-wasm-asset.ts`.

- [ ] **Step 3: Run to verify it fails, then passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/lens/py-wasm-asset.test.ts`
Expected: FAIL (module not found) → PASS after Step 1's file exists.

- [ ] **Step 4: Generalize `LanguageLensEditor.tsx` to a 3-way toggle**

Replace the hardcoded `'rune' | 'typescript'` union and direct `renderTs`/`parseTs`/`getTsWasmBytes` imports with a small per-language descriptor table:

```tsx
import { renderTs, parseTs, renderPy, parsePy } from '@rune-langium/codegen/lens';
import { getTsWasmBytes } from '../lens/ts-wasm-asset.js';
import { getPyWasmBytes } from '../lens/py-wasm-asset.js';

type Language = 'rune' | 'typescript' | 'python';

interface LensDescriptor {
  label: string;
  render: (node: RosettaExpression) => string | null;
  parse: (text: string, wasmBytes: Uint8Array) => Promise<LensResult>;
  getWasmBytes: () => Promise<Uint8Array>;
}

const LENSES: Record<'typescript' | 'python', LensDescriptor> = {
  typescript: { label: 'TypeScript', render: renderTs, parse: parseTs, getWasmBytes: getTsWasmBytes },
  python: { label: 'Python', render: renderPy, parse: parsePy, getWasmBytes: getPyWasmBytes }
};
```

Thread `language` through the existing `useEffect` (projection recompute), `handleToggle`, and `handleTsBlur` (rename to `handleForeignBlur`, generalized to look up `LENSES[language]` when `language !== 'rune'`) so the SAME logic serves both foreign languages via the descriptor table, rather than duplicating the effect/blur-handler bodies. Add a third `<Button>` for Python next to the existing Rune/TypeScript toggle buttons, following the same `variant={language === X ? 'default' : 'outline'}` pattern already used for the other two.

Keep every existing behavior identical for the `'typescript'` case (this is a refactor, not a behavior change for Phase 1/2's already-shipped path) — verify by re-running the EXISTING `LanguageLensEditor.test.tsx` suite unchanged after this refactor and confirming it still passes with zero modifications to that file's test bodies (only add new Python-specific tests, don't touch the existing TypeScript ones), proving the generalization is behavior-preserving for TypeScript.

- [ ] **Step 5: Add Python-specific tests to `LanguageLensEditor.test.tsx`**

Read the existing test file's conventions first (it already tests toggle, commit, refusal, error-boundary behavior for TypeScript). Add the mirror set for Python: toggling to Python renders the projection, committing valid Python text updates the Rune value, refusal shows an inline error and does not call `onChange`, a WASM-fetch failure shows an error message.

- [ ] **Step 6: Run the full studio suite**

Run: `pnpm --filter @rune-langium/studio run test`
Expected: PASS, no regressions (the existing TypeScript-path tests must all still pass unchanged, proving Step 4's refactor was behavior-preserving).

- [ ] **Step 7: Commit**

```bash
git add apps/studio/src/lens/py-wasm-asset.ts apps/studio/src/components/LanguageLensEditor.tsx apps/studio/test/lens/py-wasm-asset.test.ts apps/studio/test/components/LanguageLensEditor.test.tsx
git commit -m "feat(studio): generalize LanguageLensEditor to a 3-way Rune/TypeScript/Python toggle"
```

---

### Task 7: Close the spec's Phase 3 / User Story 4 open items

**Files:**
- Modify: `docs/superpowers/specs/2026-07-11-expression-language-lens-design.md`
- Modify: `packages/codegen/src/lens/subset.ts` (doc comment only)

**Interfaces:** None — documentation only.

- [ ] **Step 1: Update the spec**

Mark User Story 4's acceptance scenarios as delivered, referencing this plan and the final corpus-sweep numbers from Task 4. Record the `getattr(x, "field", None)` idiom decision and the three refusal decisions (`**`/`//`, `not`, chained comparisons) from this plan's Global Constraints as resolved design, matching how Phase 1's spec records its own resolved decisions.

- [ ] **Step 2: Update `subset.ts`'s doc comment**

Add a short note (matching the existing Phase 2 note's style) that subset `S` now also has a confirmed Python projection via `lens/python/`, with no `$type`-level changes needed — every type's Python idiom is documented in `render-py.ts`'s own per-case comments.

- [ ] **Step 3: Run the full repo suite and type-check**

Run: `pnpm run test && pnpm run type-check`
Expected: PASS, clean, no regressions across every package.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-07-11-expression-language-lens-design.md packages/codegen/src/lens/subset.ts
git commit -m "docs: close Phase 3 (Python lens) open items in the expression-language-lens spec"
```

---

## Self-Review

**Spec coverage:** User Story 4's three acceptance scenarios — (1) same `LanguageLens` interface implemented over the same AST: satisfied by Task 2/3 reusing `language-lens.ts`/`subset.ts` unmodified. (2) Python within `S` commits and round-trips: covered by Task 4's fixed-point corpus and Task 6's studio commit-flow tests. (3) Python outside `S` refuses with canonical Rune unchanged: covered by Task 4's refusal corpus and Task 6's error-boundary tests (mirroring the exact TypeScript pattern already proven in Phase 1).

**Placeholder scan:** Task 3's Step 1 spike and Step 4's "verify before assuming" notes for `true`/`false` node types and `string` field access are explicit, actionable verification steps with a concrete script to run — not vague "handle appropriately" language. This mirrors Phase 1's own established pattern (its `parenthesized_expression` case was corrected during planning after a real-parse check, and its `parse-ts.ts` docstring explicitly states node names were "confirmed against a real parse... not assumed").

**Type consistency:** `LensResult`, `RefusalReason`, `WasmSource`, `RosettaExpression` are consumed identically to their Phase 1/2 (merged, unmodified) definitions throughout every task. `renderPy`/`parsePy` match `renderTs`/`parseTs`'s exact signatures. No new shared types introduced — `LensDescriptor` (Task 6) is a studio-local UI type, not a codegen-layer type, and does not need to match anything cross-package.
